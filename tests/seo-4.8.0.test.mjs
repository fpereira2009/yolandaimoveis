import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeHtml} from '../functions/_shared/property-seo.js';
import {onRequest} from '../functions/_middleware.js';
const p={id:1,type:'Casa',title:'CASA',description:'LINDA CASA 😍',purpose:'Alugar',neighborhood:'Manejo',city:'Resende - RJ',bedrooms:1,bathrooms:1,parking:0,area_m2:80,price:1500,status:'Disponível'};
const html=makeHtml(p,[],'https://dev.yolanda-site.pages.dev/imoveis/teste');
const meta=html.match(/<meta name="description" content="([^"]+)"/)[1];
assert.match(meta,/1 quarto\b/);assert.match(meta,/1 banheiro\b/);assert.match(meta,/0 vagas/);assert.doesNotMatch(meta,/1 quartos|1 banheiros|😍/);
const schemas=[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(x=>JSON.parse(x[1]));
assert.equal(schemas[0].description,meta);assert.equal(schemas[0].offers.businessFunction,'http://purl.org/goodrelations/v1#LeaseOut');assert.equal(schemas[0].offers.priceSpecification.unitText,'MONTH');assert.equal(schemas[0].mainEntity.floorSize.value,80);assert.equal(schemas[1].itemListElement.length,2);
const sale=makeHtml({...p,purpose:'Comprar',bedrooms:0,bathrooms:0,area_m2:0},[],'https://dev.yolanda-site.pages.dev/');assert.match(sale,/#Sell/);assert.doesNotMatch(sale.match(/<meta name="description" content="([^"]+)"/)[1],/0 quartos|0 banheiros|0 m²/);
const home=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.match(home,/<head>[\s\S]*?application\/ld\+json/);assert.match(home,/rel="canonical"/);assert.match(home,/property="og:image"/);assert.ok(fs.existsSync(new URL('../public/404.html',import.meta.url)));
const response=await onRequest({request:new Request('https://dev.yolanda-site.pages.dev/'),env:{MEDIA_ENV:'preview'},next:async()=>new Response('home')});assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');
console.log('SEO 4.8.0: metadados, schema, home e noindex aprovados; HTTP 404 estático requer Pages.');

for (const [parking, expected] of [[0,'0 vagas'],[1,'1 vaga'],[2,'2 vagas'],['0','0 vagas'],[null,null],[undefined,null],['',null],[-1,null]]) {
  const page=makeHtml({...p,parking},[],'https://dev.yolanda-site.pages.dev/');
  const description=page.match(/<meta name="description" content="([^"]+)"/)[1];
  if(expected) assert.ok(description.includes(expected)); else assert.doesNotMatch(description,/\d+ vagas?/);
  const schema=JSON.parse(page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema.description,description);
  assert.ok(page.includes(`property="og:description" content="${description}"`));
}
