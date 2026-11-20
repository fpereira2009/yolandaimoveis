// Integração local (sem Cloudflare remota): D1 SQLite real + mock de R2 + Functions.
// node --experimental-sqlite tests/r2-media.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequest as main } from '../functions/api/[[route]].js';
import { onRequest as media } from '../functions/api/media/[[path]].js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(':memory:');
for (const name of fs.readdirSync(path.join(root, 'migrations')).filter(n => n.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));
}
db.exec('PRAGMA foreign_keys = ON');
class Query {
  constructor(sql, params = []) { this.sql = sql; this.params = params; }
  bind(...params) { return new Query(this.sql, params); }
  async first() { return db.prepare(this.sql).get(...this.params) || null; }
  async all() { return { results: db.prepare(this.sql).all(...this.params) }; }
  async run() { const r = db.prepare(this.sql).run(...this.params); return { meta:{changes:r.changes} }; }
}
const DB = {
  prepare(sql) { return new Query(sql); },
  async batch(queries) {
    const out = [];
    db.exec('BEGIN');
    try {
      for (const q of queries) {
        const stmt = db.prepare(q.sql);
        if (stmt.columns().length) out.push({ results:stmt.all(...q.params) });
        else { const x = stmt.run(...q.params); out.push({results:[], meta:{changes:x.changes}}); }
      }
      db.exec('COMMIT'); return out;
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  },
};
const bucket = new Map();
const R2 = {
  async put(key, bytes, opts) {
    bucket.set(key, { body:bytes, httpMetadata:opts.httpMetadata, httpEtag:'"test-etag"' });
  },
  async get(key) { return bucket.get(key) || null; },
  async delete(key) { bucket.delete(key); },
};
const env = {DB, MEDIA_BUCKET:R2, MEDIA_ENV:'preview', DEV_BYPASS:'1'};
let tests = 0;
const check = (test, message) => { assert.ok(test, message); tests++; };
async function call(handler, method, pathname, data = null, expected = 200, opts = {}) {
  const body = opts.binary ? data : data == null ? undefined : JSON.stringify(data);
  const headers = (body || (handler === main && method !== 'GET')) ? { 'Content-Type':opts.binary ? 'image/webp' : 'application/json', ...(opts.headers || {}) } : (opts.headers || {});
  const request = new Request(`https://preview.example.test/api/${pathname}`, {method, body, headers});
  const params = handler === main ? {route:pathname.split('/')} : {path:pathname.replace(/^media\//,'').split('/')};
  const response = await handler({request, env:opts.env || env, params});
  const result = (response.headers.get('content-type') || '').includes('json') ? await response.json() : response;
  assert.equal(response.status, expected, `${method} ${pathname}: ${JSON.stringify(result)}`);
  tests++;
  return result;
}
await call(main,'POST','properties',{title:'Apartamento proibido',purpose:'Comprar',neighborhood:'Centro',photo_url:'https://example.org/photo.jpg'},400);
const p = await call(main,'POST','properties',{title:'Apartamento de teste R2', purpose:'Comprar', neighborhood:'Manejo', price:490000,
  description:'## Diferenciais\n\n**Ambientes amplos**\n\n- 3 quartos\n- Varanda'},201);
check(p.code === 'YTI-0001','código imóvel');
check(p.photo_url === '', 'preview não aceita URL de imagem externa');
check(!('legacy_photo_url' in p), 'API preview não expõe campo legado');
check(p.description.includes('**Ambientes amplos**'), 'descrição formatada preservada');
check(p.images.length === 0,'sem fotos inicialmente');
const tinyWebp = Uint8Array.from([82,73,70,70,20,0,0,0,87,69,66,80,86,80,56,32,0,0,0,0]);
const created = [];
for (let i=0;i<10;i++) {
  const r = await call(media,'PUT',`media/properties/${p.code}/images`,tinyWebp,201,{binary:true});
  check(r.images.length === i+1, 'contagem galeria após upload');
  created.push(r.item);
  check(r.item.url.startsWith('/api/media/file/properties/1/'),'URL relativa');
  check(r.item.mimeType === 'image/webp','MIME controlado');
}
check(created[0].cover === true,'primeira imagem capa padrão');
check(created.slice(1).every(i=>!i.cover),'demais sem capa');
check(bucket.size === 10,'dez objetos armazenados');
check(db.prepare('SELECT count(*) AS n FROM property_images').get().n === 10,'dez metadados no D1');
await call(media,'PUT',`media/properties/${p.code}/images`,tinyWebp,409,{binary:true});
check(bucket.size === 10,'limite também protege R2');
await call(media,'PUT',`media/properties/${p.code}/images`,Uint8Array.from([1,2,3]),409,{binary:true});
const mg = await call(media,'GET',`media/properties/${p.code}/images`);
check(mg.images.length === 10, 'listagem autenticada');
await call(media,'PATCH',`media/properties/${p.code}/images/${created[3].id}`,{cover:true});
check(db.prepare('SELECT count(*) AS n FROM property_images WHERE is_cover=1').get().n === 1,'uma capa por imóvel');
check(db.prepare('SELECT id FROM property_images WHERE is_cover=1').get().id === created[3].id,'capa escolhida');
const all = await call(main,'GET','properties');
check(all.items[0].photo_url === created[3].url,'API interna aponta capa R2');
check(!('legacy_photo_url' in all.items[0]), 'sem campo legado no preview');
check(all.items[0].images.length === 10,'API CRM retorna galeria');
const pub = await call(main,'GET','public/properties');
check(pub.items[0].foto_url === created[3].url,'API vitrine aponta capa R2');
check(pub.items[0].images[0].id === created[3].id,'galeria pública tem capa primeiro');
const file = await call(media,'GET',created[3].url.replace('/api/',''));
check((await file.arrayBuffer()).byteLength === tinyWebp.byteLength,'stream arquivo público');
check(file.headers.get('cache-control').includes('public'),'cache estático');
await call(media,'DELETE',`media/properties/${p.code}/images/${created[3].id}`);
check(bucket.size === 9,'objeto R2 excluído');
check(db.prepare('SELECT count(*) AS n FROM property_images').get().n === 9,'registro D1 excluído');
check(db.prepare('SELECT count(*) AS n FROM property_images WHERE is_cover=1').get().n === 1,'capa realocada');
await call(media,'GET',created[3].url.replace('/api/',''),null,404);
await call(media,'PUT',`media/properties/${p.code}/images`,Uint8Array.from([1,2,3]),415,{binary:true});
check(bucket.size === 9,'upload inválido não armazenado');
const wrongOrigin = await call(media,'PATCH',`media/properties/${p.code}/images/${created[4].id}`,{cover:true},403,{headers:{Origin:'https://evil.example'}});
check(!!wrongOrigin.error,'origem externa bloqueada');
await call(media,'GET',`media/properties/${p.code}/images`,null,401,{env:{ ...env, DEV_BYPASS:'0', ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com', ACCESS_AUD:'test-aud' }});
await call(media,'PUT',`media/properties/${p.code}/images`,tinyWebp,503,{binary:true,env:{...env,MEDIA_ENV:'production'}});
check(db.prepare('PRAGMA foreign_key_check').all().length===0,'FK íntegra');
// Atualização de valor/status não apaga galeria.
const patch = await call(main,'PATCH',`properties/${p.code}`,{price:420000});
check(patch.images.length===9,'PATCH existente preserva imagens');
check(patch.price===420000,'PATCH mantém dados do imóvel');
// Exclui o imóvel por operação existente: soft-delete + metadados D1 + objetos R2.
const removed = await call(main,'DELETE',`properties/${p.code}`);
check(removed.imagesRemoved===9,'exclusão limpa imagens vinculadas');
check(bucket.size===0,'R2 sem imagens órfãs após exclusão');
check(db.prepare('SELECT count(*) AS n FROM property_images').get().n===0,'D1 sem metadados órfãos');
check(!!db.prepare('SELECT deleted_at FROM properties WHERE id=1').get().deleted_at,'exclusão lógica preservada');
check((await call(main,'GET','public/properties')).items.length===0,'imóvel excluído fora da vitrine');
// A leitura dos links antigos fica exclusiva do ambiente de produção.
const legacy = await call(main,'POST','properties',{title:'Casa de teste legada',purpose:'Comprar',neighborhood:'Centro'},201);
db.prepare('UPDATE properties SET photo_url=? WHERE id=?').run('https://x.example.org/a.jpg',2);
const previewPublic = await call(main,'GET','public/properties');
check(previewPublic.items[0].foto_url==='', 'preview não utiliza links legados');
check(previewPublic.items[0].images.length===0, 'sem galeria nova');
const prodPublic = await call(main,'GET','public/properties',null,200,{env:{...env,MEDIA_ENV:'production'}});
check(prodPublic.items[0].foto_url==='https://x.example.org/a.jpg','produção conserva URLs anteriores');
await call(main,'PATCH',`properties/${legacy.code}`,{photo_url:'https://x.example.org/alterada.jpg'},400);
const imported = await call(main,'POST','properties/import',{rows:[{title:'CSV com URL de foto',purpose:'Comprar',neighborhood:'Centro',photo_url:'https://x.example.org/a.jpg'}]});
check(imported.skipped.length===1, 'importação de URL também bloqueada no preview');
check(legacy.code==='YTI-0002','sequência códigos');
// Falha temporária R2: exclusão marca imóvel removido, preserva dados para retry e limpa depois.
const tmp = await call(main,'POST','properties',{title:'Imóvel falha transitória',purpose:'Comprar',neighborhood:'Centro'},201);
const tmpPhoto = await call(media,'PUT',`media/properties/${tmp.code}/images`,tinyWebp,201,{binary:true});
const oldDelete = R2.delete;
let failing = true;
R2.delete = async key => { if (failing) throw Error('Falha R2 simulada'); return oldDelete(key); };
await call(main,'DELETE',`properties/${tmp.code}`,null,503);
check(!!db.prepare('SELECT deleted_at FROM properties WHERE id=?').get(3).deleted_at,'falha R2 mantém soft delete');
check(db.prepare('SELECT count(*) AS n FROM property_images WHERE property_id=?').get(3).n===1,'metadado preservado para retry');
check(bucket.size===1,'objeto existe até retry');
failing = false;
await call(main,'DELETE',`properties/${tmp.code}`);
check(bucket.size===0,'retry apaga objeto');
check(db.prepare('SELECT count(*) AS n FROM property_images WHERE property_id=?').get(3).n===0,'retry apaga metadado');
R2.delete = oldDelete;
// Corrida de upload com exclusão: INSERT condicional evita objeto órfão.
const race = await call(main,'POST','properties',{title:'Imóvel disputa upload',purpose:'Comprar',neighborhood:'Centro'},201);
const originalPut = R2.put;
R2.put = async (...args) => {
  await originalPut(...args);
  db.prepare('UPDATE properties SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(),4);
};
await call(media,'PUT',`media/properties/${race.code}/images`,tinyWebp,409,{binary:true});
check(bucket.size===0,'compensação R2 em corrida de exclusão');
check(db.prepare('SELECT count(*) AS n FROM property_images WHERE property_id=4').get().n===0,'sem metadado após corrida');
R2.put = originalPut;
// Guardião do banco (independente da API) impede a 11ª foto.
const now=new Date().toISOString();
for(let i=0;i<10;i++) db.prepare('INSERT INTO property_images (property_id,object_key,content_type,size_bytes,position,is_cover,created_at) VALUES (?,?,?,?,?,?,?)').run(2,`test-${String(i).padStart(10,'0')}`,'image/jpeg',100,i,i===0?1:0,now);
assert.throws(()=>db.prepare('INSERT INTO property_images (property_id,object_key,content_type,size_bytes,position,created_at) VALUES (?,?,?,?,?,?)').run(2,'test-999999999','image/jpeg',100,10,now),/Limite de 10 fotos/);
tests++;
// Cada HTML permanece com handlers e os controles novos.
const crm=fs.readFileSync(path.join(root,'public/app/index.html'),'utf8');
const site=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for(const token of ['id="prop-files"','id="prop-gallery-editor"','selectPropertyPhotos(event)','optimizePropertyPhoto(file)','sendPropertyImage(code, blob)','setPropertyCover(type, id)','removePropertyImage(id)','onsubmit="handleSaveProperty(event)"']) check(crm.includes(token),`CRM mantém ${token}`);
for(const token of ['window.movePropertyGallery = movePropertyGallery','id="property-gallery-swipe"','function movePropertyGallery(step)','property-gallery-counter','touchstart','touchend','movePropertyGallery(-1)','movePropertyGallery(1)']) check(site.includes(token),`vitrine mantém ${token}`);
check(!crm.includes('id="prop-photo"'), 'entrada URL removida do CRM');
check(!crm.includes('previewPropPhoto()'), 'pré-visualização legada removida');
check(!crm.includes("photo_url: g('prop-photo')"), 'payload CRM usa somente R2');
check(!crm.includes("col(r, ['foto_url', 'foto', 'imagem'])"), 'importação CSV sem URL');
for(const token of ['id="prop-description-editor"','pastePropertyDescription(event)','formatPropertyDescription(command)','syncPropertyDescription()']) check(crm.includes(token),`Editor: ${token}`);
for(const token of ['function togglePropertyZoom(clientX, clientY)', 'function attachPropertyImageGestures(area)', 'resetPropertyZoom()', 'YolandaDescription.toHtml(prop.descricao)', 'touchmove']) check(site.includes(token),`Site 4.3.1: ${token}`);
const moduleText = fs.readFileSync(path.join(root,'public/js/property-description.js'),'utf8');
const context = {globalThis:{}};
vm.runInNewContext(moduleText, context);
const render = context.globalThis.YolandaDescription.toHtml;
const good = render('## Destaques\n\n**Piscina**\n\n- Jardim\n- Varanda\n\n1. Visite\n2. Negocie');
check(good.includes('<h4>Destaques</h4>'),'título renderizado');
check(good.includes('<strong>Piscina</strong>'),'negrito renderizado');
check(good.includes('<ul><li>Jardim</li><li>Varanda</li></ul>'),'lista com marcadores');
check(good.includes('<ol><li>Visite</li><li>Negocie</li></ol>'),'lista numerada');
check(render('<script>alert(1)</script>').includes('&lt;script&gt;'),'HTML ativo escapado');
check(!render('<img src=x>').includes('<img'), 'tags img não são interpretadas');
for(const file of [crm,site]) {
  const scripts=[...file.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
  for(const script of scripts) new vm.Script(script);
  tests++;
}
console.log(`PASSOU: ${tests} verificações de mídia R2/galeria, CRUD, limite 10, auth, preview e compatibilidade.`);
