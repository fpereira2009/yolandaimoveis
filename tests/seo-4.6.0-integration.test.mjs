import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestGet as getProperty } from '../functions/imoveis/[slug].js';
import { onRequestGet as getSitemap } from '../functions/sitemap.xml.js';
import { onRequestGet as getRobots } from '../functions/robots.txt.js';
import { propertyPath, published } from '../functions/_shared/property-url.js';
import { slugFor } from '../functions/_shared/property-seo.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=path.resolve(root,'../yolanda455_base');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let count=0;
const equal=(a,b,msg)=>{assert.equal(a,b,msg);count++};
const ok=(x,msg)=>{assert.ok(x,msg);count++};
const prop={id:1,slug:'casa-3-quartos-manejo-resende-rj-yti-0001',title:'Casa <script>alert(1)</script> no Manejo',type:'Casa',purpose:'Comprar',neighborhood:'Manejo',city:'Resende - RJ',price:1250000,area_m2:200,bedrooms:3,bathrooms:2,parking:1,status:'Disponível',description:'<h4>Casa de família</h4><script>alert(1)</script>',updated_at:'2026-11-22T12:00:00Z'};
const image={id:20,object_key:'properties/1/12345678-1234-4234-a234-1234567890ab.webp',is_cover:1,position:0};
function mockEnv(row=prop, {bad=false,images=[image], envType='preview'}={}) {
 const calls=[];
 const DB={prepare(sql){const call={sql,args:[]};calls.push(call);return {bind(...args){call.args=args;return this}, async first(){if(bad)throw Error('D1 failed');return row},async all(){if(bad)throw Error('D1 failed');return {results:sql.includes('property_images')?images:[row]}}}}};
 return {DB,MEDIA_ENV:envType,MEDIA_BUCKET:{},calls};
}
function ctx(slug,env=mockEnv()) {return {params:{slug},env,request:new Request('https://dev.yolanda-site.pages.dev/imoveis/'+slug)}};
const env=mockEnv();const res=await getProperty(ctx(prop.slug,env));
equal(res.status,200,'SSR ativo retorna HTTP 200');
equal(res.headers.get('X-Robots-Tag'),'noindex, nofollow','preview nunca indexa');
const html=await res.text();
ok(html.includes('<h1')&&html.includes('Casa &lt;script&gt;'),'título HTML inicial escapado');
ok(!html.includes('<script>alert(1)</script>'),'XSS bloqueado');
ok(html.includes('og:image')&&html.includes('og:description')&&html.includes('og:title'),'OG no HTML inicial');
ok(html.includes('rel="canonical"') && html.includes(prop.slug),'canonical usa slug');
ok(html.includes('application/ld+json')&&html.includes('RealEstateListing'),'structured data inicial');
ok(html.includes('1.250.000'),'valor formatado pt-BR');
ok(html.includes('properties/1/12345678-1234-4234-a234-1234567890ab.webp'),'capa R2 da tabela');
ok(html.includes('property_code:PROPERTY_CODE')===false && read('public/js/property-detail-preview.js').includes('property_code:PROPERTY_CODE'),'lead continua associado ao código');
ok(env.calls.length===2&&env.calls.every(c=>c.sql.includes('?')&&c.args[0]===1),'consulta segura com bind D1');
const renamed=await getProperty(ctx('casa-antiga-2-quartos-yt i-yti-0001'.replaceAll(' ',''),mockEnv()));
equal(renamed.status,301,'slug antigo redireciona 301');
ok(renamed.headers.get('Location').endsWith(prop.slug),'301 aponta para canonical');
equal((await getProperty(ctx('sem-id',mockEnv()))).status,404,'sem código 404');
equal((await getProperty(ctx(prop.slug,mockEnv(null)))).status,404,'não publicado 404');
equal((await getProperty(ctx(prop.slug,mockEnv(prop,{bad:true})))).status,503,'falha D1 503 controlado');
const production={MEDIA_ENV:'production',MEDIA_BUCKET:{},DB:{prepare(){throw Error('D1 Production usado!')}}};
equal((await getProperty(ctx(prop.slug,production))).status,404,'SSR 4.6.0 não lê produção');
const xml=await getSitemap({env:mockEnv(),request:new Request('https://dev.yolanda-site.pages.dev/sitemap.xml')});
equal(xml.status,200,'sitemap HTTP 200');
ok((await xml.text()).includes(prop.slug),'sitemap contém URL amigável');
ok((await getRobots({env:mockEnv()}).text()).includes('Disallow: /'),'robots Preview bloqueia');
// Regra central: comercial/terreno por área m2; residencial por quartos.
for(const [row,expected] of [
 [{...prop,id:2,type:'Terreno',bedrooms:0,area_m2:450},'terreno-450m2-manejo-resende-rj-yti-0002'],
 [{...prop,id:3,type:'Comercial',bedrooms:5,area_m2:120},'comercial-120m2-manejo-resende-rj-yti-0003'],
 [{...prop,id:4,type:'Terreno',area_m2:0},'terreno-area-nao-informada-manejo-resende-rj-yti-0004'],
 [{...prop,id:5,type:'Apartamento',bedrooms:1},'apartamento-1-quarto-manejo-resende-rj-yti-0005'],
 [{...prop,id:6,type:'Chácara/Sítio',neighborhood:'São José',city:'Itatiaia - RJ'},'chacara-sitio-3-quartos-sao-jose-itatiaia-rj-yti-0006']
]) equal(slugFor(row),expected,'slug gerado '+expected);
const terrain={...prop,type:'Terreno',bedrooms:0,area_m2:450,slug:'terreno-450m2-manejo-resende-rj-yti-0001'};
const terrainHtml=await(await getProperty(ctx(terrain.slug,mockEnv(terrain)))).text();
ok(terrainHtml.includes('Terreno 450 m²')&&!terrainHtml.includes('Terreno 0 quartos'),'SEO terreno descreve área e não quartos');
const commercial={...prop,type:'Comercial',bedrooms:0,area_m2:120,slug:'comercial-120m2-manejo-resende-rj-yti-0001'};
const commercialHtml=await(await getProperty(ctx(commercial.slug,mockEnv(commercial)))).text();
ok(commercialHtml.includes('Comercial 120 m²')&&!commercialHtml.includes('Comercial 0 quartos'),'SEO comercial descreve área e não quartos');
equal(propertyPath({...prop,slug:commercial.slug}),'/imoveis/'+commercial.slug,'catálogo usa slug D1');
ok(published.includes('Disponível')&&published.includes('Reservado'),'status de publicação preservado');
const routes=JSON.parse(read('public/_routes.json'));
ok(['/imoveis/*','/sitemap.xml','/robots.txt','/api/*','/app/*'].every(x=>routes.include.includes(x)),'rotas originais preservadas e robots SSR');
ok(read('public/js/vitrine-app.js').includes('if (prop.url) return new URL(prop.url'),'vitrine preserva link do catálogo');
ok(read('public/js/vitrine-app.js').includes('data-property-modal-code') && read('public/js/vitrine-app.js').includes('openPropertyModal(code)'), 'links amigáveis abrem modal 4.5.5 no clique normal');
ok(read('public/js/vitrine-app.js').includes('event.metaKey') && read('public/js/vitrine-app.js').includes('event.preventDefault()'), 'atalhos de nova aba preservados e modal intercepta apenas clique normal');
ok(read('public/js/vitrine-app.js').includes('(propertyHistoryEntry || getLinkedPropertyCode())'), 'fechar modal retorna a vitrine mesmo quando historico mudou para slug');
ok(read('public/app/index.html').includes('<select id="prop-type"')&&read('public/app/index.html').includes('crm-properties.js?v=4.5.3-hf1'),'hotfix do dropdown preservado');
// Check exact bytes for high-value hotfix and brand files against extracted user baseline if present.
if(fs.existsSync(baseline)) for(const rel of ['public/index.html','public/app/index.html','public/js/crm-properties.js','functions/_shared/api/properties.js','functions/_shared/api/serialization.js','wrangler.toml','migrations/0009_public_url.sql']) {
 equal(read(rel),fs.readFileSync(path.join(baseline,rel),'utf8'),rel+' preservado byte a byte');
}
console.log(`PASSOU: ${count} verificações SEO/SSR 4.6.0 sobre base 4.5.5.`);
