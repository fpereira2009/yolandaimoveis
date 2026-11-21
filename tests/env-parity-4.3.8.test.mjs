// Homologação local: mesma lógica de negócios, dois D1 e dois R2 fisicamente separados.
// node --experimental-sqlite tests/env-parity-4.3.8.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequest as api } from '../functions/api/[[route]].js';
import { onRequest as media } from '../functions/api/media/[[path]].js';
import { mediaEnabled } from '../functions/_shared/property-media.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrations = fs.readdirSync(path.join(root, 'migrations')).filter(x => x.endsWith('.sql')).sort();
let verified = 0;
const eq = (actual, expected, note) => { assert.equal(actual, expected, note); verified++; };
const ok = (condition, note) => { assert.ok(condition, note); verified++; };

function newEnvironment(name) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of migrations) sqlite.exec(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
  class Bound {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Bound(this.sql, args); }
    async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
    async all() { return {results: sqlite.prepare(this.sql).all(...this.args)}; }
    async run() { const {changes} = sqlite.prepare(this.sql).run(...this.args); return {meta:{changes}}; }
  }
  const DB = {
    prepare(sql) { return new Bound(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const stmt = sqlite.prepare(statement.sql);
          if (stmt.columns().length) return {results: stmt.all(...statement.args)};
          const x = stmt.run(...statement.args);
          return {results:[],meta:{changes:x.changes}};
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (err) { sqlite.exec('ROLLBACK'); throw err; }
    },
  };
  const objects = new Map();
  const MEDIA_BUCKET = {
    async put(key, data, options) { objects.set(key, {body: data, httpMetadata: options.httpMetadata, httpEtag:'"test-etag"'}); },
    async get(key) { return objects.get(key) || null; },
    async delete(key) { objects.delete(key); },
  };
  // Bypass existe apenas no fixture local; no remoto, exigir Cloudflare Access.
  return {name, sqlite, objects, env:{MEDIA_ENV:name, DB, MEDIA_BUCKET, DEV_BYPASS:'1'}};
}
const fixtures = [newEnvironment('preview'), newEnvironment('production')];
const [preview, production] = fixtures;
ok(preview.env.DB !== production.env.DB, 'bindings DB independentes');
ok(preview.env.MEDIA_BUCKET !== production.env.MEDIA_BUCKET, 'bindings R2 independentes');

async function request(fixture, method, route, body, expected = 200, binary = false, overrides = {}) {
  const isMedia = route.startsWith('/media/');
  const handler = isMedia ? media : api;
  const headers = method === 'GET' ? {} : {'Content-Type':binary?'image/webp':'application/json'};
  const req = new Request(`https://${fixture.name}.example.test/api${route}`, {
    method, headers, body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
  });
  const params = isMedia ? {path:route.slice('/media/'.length).split('/')} : {route:route.slice(1).split('/')};
  const response = await handler({request:req,env:{...fixture.env,...overrides},params});
  const value = (response.headers.get('content-type')||'').includes('application/json') ? await response.json() : response;
  eq(response.status, expected, `${fixture.name}: ${method} ${route}; ${JSON.stringify(value?.error||'')}`);
  return value;
}
let phoneCounter = 0;
async function createProperty(fixture, title) {
  return request(fixture, 'POST', '/properties', {title,purpose:'Comprar',neighborhood:'Centro',status:'Disponível',price:300000},201);
}
async function createLead(fixture, property, stage, name) {
  return request(fixture,'POST','/leads',{
    name, phone:String(24990000000 + (++phoneCounter)), category:'Interessado', modality:'Compra',
    stage, temp:'Morno', property:`${property.code} - ${property.title}`,
    link_mode:'internal',property_code:property.code,followup_at:'2099-12-20',
  },201);
}
function propertyRow(fixture, code) { return fixture.sqlite.prepare('SELECT * FROM properties WHERE id=?').get(Number(code.slice(4))); }
function leadRow(fixture, code) { return fixture.sqlite.prepare('SELECT * FROM leads WHERE id=?').get(Number(code.slice(3))-100); }
function count(fixture, table) { return fixture.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n; }
const tinyWebp = Uint8Array.from([82,73,70,70,20,0,0,0,87,69,66,80,86,80,56,32,0,0,0,0]);

// Um anúncio de ID igual em cada banco é um registro distinto, assim como seus arquivos.
const homes = [];
for (const fixture of fixtures) {
  eq(mediaEnabled(fixture.env), true, `${fixture.name}: R2 pronto`);
  const diag = await request(fixture,'GET','/diagnostics/disputes');
  eq(diag.disputeRulesEnabled,true, 'disputa ativa nos dois');
  eq(diag.mediaEnabled,true, 'mídia ativa nos dois');
  eq(diag.mediaEnv,fixture.name, 'diagnóstico do ambiente');
  await request(fixture,'POST','/properties',{title:'URL bloqueada',purpose:'Comprar',neighborhood:'Centro',photo_url:'https://example.com/photo.jpg'},400);
  const home = await createProperty(fixture,`${fixture.name} - Casa`);
  homes.push(home);
  eq(home.photo_url,'','sem capa legada');
  ok(!Object.hasOwn(home,'legacy_photo_url'),'campo legado não exposto');
  const lead1 = await createLead(fixture,home,'Proposta Enviada',`Vencedor ${fixture.name}`);
  const lead2 = await createLead(fixture,home,'Documentação/Crédito',`Concorrente ${fixture.name}`);
  eq(propertyRow(fixture,home.code).status,'Reservado','reserva com dois leads');
  fixture.competition = {lead1,lead2};
}
eq(homes[0].code,homes[1].code,'IDs iguais não significam banco compartilhado');
eq(count(preview,'properties'),1,'Preview tem apenas seu imóvel');
eq(count(production,'properties'),1,'Production tem apenas seu imóvel');

const uploadPreview = await request(preview,'PUT',`/media/properties/${homes[0].code}/images`,tinyWebp,201,true);
eq(preview.objects.size,1,'objeto armazenado somente no R2 Preview');
eq(production.objects.size,0,'R2 Production permanece vazio');
const publicProdBefore = await request(production,'GET','/public/properties');
eq(publicProdBefore.items[0].foto_url,'','produção sem foto própria não usa imagem alheia');
const uploadProd = await request(production,'PUT',`/media/properties/${homes[1].code}/images`,tinyWebp,201,true);
eq(production.objects.size,1,'objeto armazenado no R2 Production');
eq(preview.objects.size,1,'upload Production não modifica R2 Preview');
const mediaPreview = await request(preview,'GET','/public/properties');
const mediaProd = await request(production,'GET','/public/properties');
eq(mediaPreview.items[0].foto_url,uploadPreview.item.url,'capa Preview retorna seu objeto');
eq(mediaProd.items[0].foto_url,uploadProd.item.url,'capa Production retorna seu objeto');
assert.notEqual(mediaPreview.items[0].foto_url, mediaProd.items[0].foto_url, 'as chaves de objeto são diferentes'); verified++;

for (const fixture of fixtures) {
  const {lead1,lead2} = fixture.competition;
  const won = await request(fixture,'POST',`/leads/${lead1.id}/close`,{result:'Ganho',note:'Contrato assinado e registrado.'});
  eq(won.disputeResolution.enabled,true,'resolução ativa');
  eq(won.disputeResolution.competitorsRequalified,1,'requalifica concorrente');
  eq(propertyRow(fixture,homes[fixtures.indexOf(fixture)].code).status,'Vendido','fecha imóvel');
  eq(leadRow(fixture,lead2.id).stage,'Qualificação','concorrente volta à Qualificação');
  eq(leadRow(fixture,lead2.id).property_id,null,'concorrente perde associação');
  eq(leadRow(fixture,lead2.id).followup_at,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),'follow-up hoje');
  eq(fixture.sqlite.prepare('PRAGMA foreign_key_check').all().length,0,'chaves estrangeiras íntegras');
}
// Fechamento Perdido não altera outro lead ativo em nenhuma das duas bases.
for (const fixture of fixtures) {
  const home = await createProperty(fixture,`${fixture.name} - disputa perdida`);
  const a = await createLead(fixture,home,'Proposta Enviada',`Perdedor ${fixture.name}`);
  const b = await createLead(fixture,home,'Documentação/Crédito',`Ativo ${fixture.name}`);
  const snapshot = leadRow(fixture,b.id);
  await request(fixture,'POST',`/leads/${a.id}/close`,{result:'Perdido',note:'Cliente desistiu do negócio.'});
  eq(propertyRow(fixture,home.code).status,'Reservado','outro lead mantém reserva');
  eq(leadRow(fixture,b.id).property_id,snapshot.property_id,'Perdido não desvincula outro');
  eq(leadRow(fixture,b.id).stage,snapshot.stage,'Perdido não muda etapa de outro');
}
// Falha fechada: sem MEDIA_ENV ou sem bucket não excluir metadados deixando fotos órfãs.
for (const fixture of fixtures) {
  const propCode = homes[fixtures.indexOf(fixture)].code;
  await request(fixture,'GET',`/media/properties/${propCode}/images`,undefined,503,false,{MEDIA_ENV:undefined});
  await request(fixture,'GET',`/media/properties/${propCode}/images`,undefined,503,false,{MEDIA_BUCKET:undefined});
  await request(fixture,'DELETE',`/properties/${propCode}`,undefined,503,false,{MEDIA_BUCKET:undefined});
  eq(propertyRow(fixture,propCode).deleted_at,null,'exclusão bloqueada preserva imóvel');
}
// Sem cópias cruzadas no cadastro e nos objetos.
eq(count(preview,'properties'),2,'Preview mantém duas propriedades');
eq(count(production,'properties'),2,'Production mantém duas propriedades');
eq(preview.objects.size,1,'Preview mantém seu objeto');
eq(production.objects.size,1,'Production mantém seu objeto');
console.log(`PASSOU: ${verified} verificações de paridade Preview/Production com D1 e R2 isolados.`);
