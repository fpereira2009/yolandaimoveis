// Testes locais do fallback visual da vitrine (sem navegador nem Cloudflare).
// node tests/vitrine-sem-imagem.test.mjs
import { crmScript, vitrineScript, crmComposite, vitrineComposite, crmHtml, vitrineHtml } from './helpers/source-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { propPublic } from '../functions/_shared/api/serialization.js';
import { makeHtml, propertyFeatures, propertySeoText } from '../functions/_shared/property-seo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = vitrineComposite.replace(/\r\n/g, '\n');
const code = vitrineScript;
const descriptionScript = fs.readFileSync(path.join(root, 'public/js/property-description.js'), 'utf8');
const scriptStart = code.indexOf('        (function () {');
const scriptEnd = code.indexOf('        })();', scriptStart);
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, 'script da vitrine localizado');

const featureSprite = fs.readFileSync(path.join(root, 'public/img/property-features.svg'), 'utf8');
const featureSymbols = [...featureSprite.matchAll(/<symbol id="([^"]+)" viewBox="0 0 24 24">\s*(<path d="[^"]+"\/>)/g)];
assert.deepEqual(featureSymbols.map(([, key]) => key), ['area_m2', 'bedrooms', 'bathrooms', 'parking']);
assert.match(featureSymbols[0][2], /M3 3v18h18L3 3Z M7 12v5h5l-5-5Z/);
assert.doesNotMatch(featureSprite, /<(?:script|foreignObject|image)\b|\bon\w+=|\bhref=/i);
assert.match(vitrineHtml, /href="\/css\/property-features\.css\?v=4\.8\.0"/);

const r2Cover = '/api/media/file/property-1/cover.webp';

function property(foto_url, images = []) {
  return {
    codigo:'YTI-0001', titulo:'Casa de teste', finalidade:'Comprar', tipo:'Casa',
    bairro:'Manejo', cidade:'Resende', valor:530000, descricao:'Teste',
    quartos:3, banheiros:2, vagas:2, area_m2:120,
    foto_url, images,
  };
}

function renderScenario(item, {
  storage = new Map([['yti_catalog_v3', JSON.stringify({items:[item]})]]),
  fetch = async () => { throw new Error('Sem rede'); },
  filters = {},
  analytics,
} = {}) {
  const modalClasses = new Set(['hidden']);
  const nodes = {
    'properties-grid': {innerHTML:''},
    'results-counter': {textContent:''},
    'property-modal': {classList:{
      remove: value => modalClasses.delete(value),
      add: value => modalClasses.add(value),
      contains: value => modalClasses.has(value),
    }},
    'property-modal-content': {innerHTML:''},
    ...filters,
  };
  const context = {
    console,
    setTimeout:() => 1,
    clearTimeout:() => {},
    URL,
    URLSearchParams,
    AbortController,
    fetch,
    Date,
    window: {
      location: {origin:'https://preview.example.test',pathname:'/'},
      localStorage: {getItem:key => storage.get(key) ?? null, setItem:(key, value) => storage.set(key, value)},
      YTIAnalytics: analytics,
    },
    document: {
      readyState:'loading', addEventListener(){},
      body:{style:{}},
      getElementById:id=>nodes[id] || null,
      querySelectorAll:()=>[],
    },
  };
  vm.runInNewContext(descriptionScript, context, {filename:'public/js/property-description.js'});
  context.YolandaDescription = context.window.YolandaDescription;
  vm.runInNewContext(code, context, {filename:'public/index.html'});
  context.window.applyFilters();
  context.window.openPropertyModal(item.codigo);
  return {window:context.window, nodes};
}

function visibleFeatures(html) {
  const opening = html.match(/<div data-property-features class="([^"]+)">/);
  if (!opening) {
    assert.doesNotMatch(html, /data-property-features/, 'Agrupamento inválido');
    return [];
  }
  const featureStart = opening.index + opening[0].length;
  const tilePattern = /<div class="[^"]+"><span class="property-feature-label">([^<]+)<\/span><div title="([^"]+)" aria-hidden="true"><svg\b([^>]+)><use href="\/img\/property-features\.svg#([a-z0-9_]+)"\/><\/svg><span class="property-feature-value [^"]+">((?:[^<]|<wbr>)+?)(?:<span class="property-feature-unit">(m²)<\/span>)?<\/span><\/div><\/div>/gy;
  tilePattern.lastIndex = featureStart;
  const tiles = [];
  let tileEnd = featureStart;
  for (let tile; (tile = tilePattern.exec(html)); ) {
    tileEnd = tilePattern.lastIndex;
    const [, accessible, tooltip, svg, icon, display, unit] = tile;
    const raw = display.replaceAll('<wbr>', '');
    assert.equal(display, raw.replace(/[.,]/g, '$&<wbr>'));
    assert.equal(tooltip, accessible);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.match(svg, /stroke="currentColor"/);
    const value = raw + (unit ?? '');
    if (unit) {
      assert.equal(icon, 'area_m2');
      assert.equal(accessible, 'Área: ' + raw.trimEnd() + ' metros quadrados');
      tiles.push([value, 'Área']);
    } else {
      assert.ok(accessible.startsWith(value + ' '));
      const label = accessible.slice(value.length + 1);
      const icons = {Quarto:'bedrooms', Quartos:'bedrooms', Banheiro:'bathrooms',
        Banheiros:'bathrooms', Vaga:'parking', Vagas:'parking'};
      assert.equal(icon, icons[label]);
      tiles.push([value, label]);
    }
  }
  assert.ok(tiles.length, 'Agrupamento vazio');
  assert.equal(html.slice(tileEnd, tileEnd + 6), '</div>');
  assert.ok(opening[1].includes('grid-cols-' + tiles.length));
  return tiles;
}

for (const [values, expected, metrics] of [
  [{id:7,type:'Terreno',area_m2:300,bedrooms:0,bathrooms:0,parking:0}, [['300 m²','Área'],['0','Vagas']], [300,undefined,undefined,0]],
  [{id:6,type:'Apartamento',area_m2:45,bedrooms:2,bathrooms:1,parking:1}, [['45 m²','Área'],['2','Quartos'],['1','Banheiro'],['1','Vaga']], [45,2,1,1]],
  [{id:8,area_m2:0,bedrooms:4,bathrooms:3,parking:4}, [['4','Quartos'],['3','Banheiros'],['4','Vagas']], [undefined,4,3,4]],
  [{area_m2:'1234,56789',bedrooms:'1',bathrooms:'2',parking:'0'}, [['1.234,56789 m²','Área'],['1','Quarto'],['2','Banheiros'],['0','Vagas']], [1234.56789,1,2,0]],
  [{area_m2:45.25,bedrooms:'0',bathrooms:'0',parking:'2'}, [['45,25 m²','Área'],['2','Vagas']], [45.25,undefined,undefined,2]],
  [{area_m2:'45.25',bedrooms:'01.000',bathrooms:'2,0',parking:'0.000'}, [['45,25 m²','Área'],['1','Quarto'],['2','Banheiros'],['0','Vagas']], [45.25,1,2,0]],
  [{bedrooms:'1.00000000000000001',bathrooms:'2.99999999999999999',parking:'0.' + '0'.repeat(324) + '1'}, [], []],
  [{bedrooms:NaN,bathrooms:Infinity,parking:'9007199254740992.0'}, [], []],
  [{bedrooms:9007199254740992,bathrooms:'-1',parking:'-0.0001'}, [], []],
  [{parking:'9007199254740991.0'}, [['9.007.199.254.740.991','Vagas']], [undefined,undefined,undefined,9007199254740991]],
  [{area_m2:'0',bedrooms:0,bathrooms:0,parking:null}, [], []],
  [{area_m2:null,bedrooms:undefined,bathrooms:'',parking:'  '}, [], []],
  [{area_m2:' ',bedrooms:null,bathrooms:undefined,parking:''}, [], []],
  [{area_m2:-1,bedrooms:-1,bathrooms:1.5,parking:-1}, [], []],
  [{area_m2:'desconhecida',bedrooms:'true',bathrooms:'0x10',parking:'false'}, [], []],
  [{area_m2:Infinity,bedrooms:'inválido',bathrooms:null,parking:undefined}, [], []],
  [{}, [], []],
]) {
  const row = {id:1,type:'Casa',title:'Imóvel sintético',purpose:'Comprar',city:'Resende - RJ',
    neighborhood:'Centro',price:150000,status:'Disponível', ...values};
  row.slug = 'slug-historico-yti-' + String(row.id).padStart(4, '0');
  const item = propPublic(row);
  const {nodes} = renderScenario(item);
  const ssr = makeHtml(row, [], 'https://preview.example.test/');
  for (const html of [nodes['properties-grid'].innerHTML, nodes['property-modal-content'].innerHTML, ssr]) {
    assert.deepEqual(visibleFeatures(html), expected);
  }
  // Os consumidores antigos continuam recebendo os valores públicos originais.
  assert.deepEqual([item.area_m2,item.quartos,item.banheiros,item.vagas],
    [row.area_m2,row.bedrooms,row.bathrooms,row.parking]);
  const {caracteristicas, ...legacy} = item;
  for (const candidate of [legacy, {...item, caracteristicas:null},
    {...item, caracteristicas:[{key:'parking',value:0,label:'Vaga',display:'0'}]}]) {
    const {nodes: fallback} = renderScenario(candidate);
    assert.deepEqual(visibleFeatures(fallback['properties-grid'].innerHTML), expected);
    assert.deepEqual(visibleFeatures(fallback['property-modal-content'].innerHTML), expected);
  }
  const seo = propertySeoText(row).description;
  assert.equal(item.descricao, seo);
  assert.ok(seo.endsWith('Consulte Iêda Holanda CRECI-RJ 112406.'));
  assert.doesNotMatch(seo, /Consulte a Iêda Holanda|Consulte Iêda Holanda,/);
  assert.ok(nodes['property-modal-content'].innerHTML.includes(seo));
  assert.ok(ssr.includes('leading-relaxed">' + seo + '</div>'));
  assert.ok(ssr.includes('<meta name="description" content="' + seo + '">'));
  assert.ok(ssr.includes('property="og:description" content="' + seo + '"'));
  for (const [display, label] of expected) {
    assert.ok(seo.includes(label === 'Área' ? display : display + ' ' + label.toLowerCase()));
  }
  assert.doesNotMatch(seo, /0 quartos|0 banheiros|Consultar|- m²/);
  const listing = JSON.parse(ssr.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const { floorSize, numberOfBedrooms, numberOfBathroomsTotal, additionalProperty } = listing.mainEntity;
  assert.deepEqual([floorSize?.value, numberOfBedrooms, numberOfBathroomsTotal, additionalProperty?.value],
    Array.from({length:4}, (_, i) => metrics[i]));
  assert.equal(listing.description, seo);
  assert.equal(item.url, '/imoveis/' + row.slug);
  assert.equal(listing.url, 'https://preview.example.test' + item.url);
  const custom = 'Descrição personalizada: 0 Quartos e 7 Dormitórios. Consulte a Iêda Holanda, CRECI-RJ 112406.';
  assert.equal(propPublic({...row, description:custom}).descricao, custom);
  assert.ok(renderScenario(propPublic({...row, description:custom})).nodes['property-modal-content'].innerHTML.includes(custom));
  assert.ok(makeHtml({...row, description:custom}, [], 'https://preview.example.test/').includes(custom));
}

// Resposta antiga, como a ainda servida por um cache HTTP, seguida de perda de rede.
const oldItem = property(null);
const oldFeatures = [['120 m²','Área'],['3','Quartos'],['2','Banheiros'],['2','Vagas']];
const snapshot = JSON.stringify({at:123,items:[oldItem]});
const v2 = 'yti_catalog_v2';
const v3 = 'yti_catalog_v3';
const recoveredStorage = new Map([[v2,snapshot],[v3,'JSON corrompido']]);
const recovered = renderScenario(oldItem, {storage:recoveredStorage});
assert.deepEqual(visibleFeatures(recovered.nodes['properties-grid'].innerHTML), oldFeatures);
await recovered.window.loadCatalog(false);
assert.deepEqual(visibleFeatures(recovered.nodes['properties-grid'].innerHTML), oldFeatures);
assert.deepEqual([...recoveredStorage], [[v2,snapshot],[v3,'JSON corrompido']], 'Fallback não regrava nem renova o cache');

const incompatible = renderScenario(oldItem, {storage:new Map([[v3,JSON.stringify({items:[null]})]])});
assert.doesNotMatch(incompatible.nodes['properties-grid'].innerHTML, /data-property-features/);
const emptyCatalog = renderScenario(oldItem, {storage:new Map([[v2,snapshot],[v3,JSON.stringify({items:[]})]])});
assert.doesNotMatch(emptyCatalog.nodes['properties-grid'].innerHTML, /data-property-features/);
const emptyList = renderScenario({...oldItem, caracteristicas:[]});
assert.deepEqual(visibleFeatures(emptyList.nodes['properties-grid'].innerHTML), []);
assert.deepEqual(visibleFeatures(emptyList.nodes['property-modal-content'].innerHTML), []);

const networkStorage = new Map();
let response = {items:[oldItem]};
const network = renderScenario(oldItem, {storage:networkStorage, fetch:async url => {
  assert.equal(url, '/api/public/properties');
  if (!response) throw new Error('Sem rede');
  return {ok:true,json:async () => response};
}});
await network.window.loadCatalog(false);
network.window.openPropertyModal(oldItem.codigo);
assert.deepEqual(visibleFeatures(network.nodes['properties-grid'].innerHTML), oldFeatures);
assert.deepEqual(visibleFeatures(network.nodes['property-modal-content'].innerHTML), oldFeatures);
const saved = networkStorage.get(v3);
assert.deepEqual(JSON.parse(saved).items[0].caracteristicas.map(({display,label}) => [display,label]), oldFeatures);
response = null;
await network.window.loadCatalog(false);
assert.deepEqual(visibleFeatures(network.nodes['properties-grid'].innerHTML), oldFeatures);
assert.equal(networkStorage.get(v3), saved);
response = {items:[{codigo:'inválido',titulo:'Snapshot incompatível'}]};
await network.window.loadCatalog(false);
assert.deepEqual(visibleFeatures(network.nodes['properties-grid'].innerHTML), oldFeatures);
assert.equal(networkStorage.get(v3), saved, 'Resposta incompatível não sobrescreve snapshot válido');

const delayedStorage = new Map([[v2, snapshot]]);
const pendingCatalogRequests = [];
const delayed = renderScenario(oldItem, {
  storage: delayedStorage,
  fetch: () => new Promise(resolve => pendingCatalogRequests.push(resolve)),
});
const olderRequest = delayed.window.loadCatalog(false);
const newerRequest = delayed.window.loadCatalog(false);
const newerItem = {...oldItem, titulo:'Catálogo mais recente'};
pendingCatalogRequests[1]({ok:true, json:async () => ({items:[newerItem]})});
await newerRequest;
const newerSnapshot = delayedStorage.get(v3);
assert.ok(Number.isSafeInteger(JSON.parse(newerSnapshot).at));
assert.match(delayed.nodes['properties-grid'].innerHTML, /Catálogo mais recente/);
pendingCatalogRequests[0]({ok:true, json:async () => ({items:[oldItem]})});
await olderRequest;
assert.match(delayed.nodes['properties-grid'].innerHTML, /Catálogo mais recente/);
assert.deepEqual([...delayedStorage], [[v2, snapshot], [v3, newerSnapshot]],
  'Resposta atrasada não altera o catálogo nem os timestamps dos snapshots');

const malformedFields = [
  {bairro:{toString:false}}, {cidade:[]}, {descricao:{}}, {destaque:[]}, {finalidade:{}},
  {tipo:[]}, {status:{}}, {valor:[]}, {area_m2:{}}, {quartos:[]}, {banheiros:{}},
  {vagas:true}, {foto_url:[]}, {resolved_foto_url:{}}, {coverImageId:{}}, {url:'javascript:execute()'},
  {images:[[]]}, {images:[{}]}, {images:[{url:{}}]},
  {images:[{url:r2Cover, thumbWidth:[]}]}, {images:[{url:r2Cover, thumbUrl:'//evil.example/img'}]},
];
for (const fields of malformedFields) {
  const invalid = {...oldItem, ...fields};
  response = {items:[invalid]};
  await network.window.loadCatalog(false);
  assert.equal(networkStorage.get(v3), saved);
  assert.deepEqual(visibleFeatures(network.nodes['properties-grid'].innerHTML), oldFeatures);
  const fallback = new Map([[v2,snapshot],[v3,JSON.stringify({at:456,items:[invalid]})]]);
  assert.deepEqual(visibleFeatures(renderScenario(oldItem,{storage:fallback}).nodes['properties-grid'].innerHTML), oldFeatures);
  assert.equal(JSON.parse(fallback.get(v2)).at, 123);
}

// Uma exceção após escrever o HTML candidato ainda deve restaurar o catálogo anterior.
const grid = network.nodes['properties-grid'];
let displayed = grid.innerHTML;
let throwOnCandidate = true;
Object.defineProperty(grid, 'innerHTML', {
  get: () => displayed,
  set(value) {
    displayed = value;
    if (throwOnCandidate && value.includes('Candidato de renderização')) {
      throwOnCandidate = false;
      throw new Error('Falha de renderização simulada');
    }
  },
});
response = {items:[{...oldItem,titulo:'Candidato de renderização'}]};
await network.window.loadCatalog(false);
assert.doesNotMatch(grid.innerHTML, /Candidato de renderização/);
assert.equal(networkStorage.get(v3), saved);
network.window.openPropertyModal(oldItem.codigo);
assert.match(network.nodes['property-modal-content'].innerHTML, /Casa de teste/);
assert.deepEqual(visibleFeatures(grid.innerHTML), oldFeatures);

const optionalItem = {codigo:'YTI-0001',titulo:'Campos opcionais',bairro:null,area_m2:null,images:null,url:null};
response = {items:[optionalItem]};
await network.window.loadCatalog(false);
assert.match(grid.innerHTML, /Campos opcionais/);
assert.deepEqual(visibleFeatures(grid.innerHTML), []);
assert.equal(JSON.parse(networkStorage.get(v3)).items[0].bairro, null);
response = {items:[]};
await network.window.loadCatalog(false);
assert.deepEqual(JSON.parse(networkStorage.get(v3)).items, []);
assert.match(grid.innerHTML, /Nenhum imóvel encontrado/);

const injected = renderScenario({...oldItem, finalidade:'<img src=x onerror=trip()>',
  caracteristicas:[{key:'parking',value:0,label:'<img src=x onerror=trip()>',display:'0'}]});
for (const html of [injected.nodes['properties-grid'].innerHTML, injected.nodes['property-modal-content'].innerHTML]) {
  assert.doesNotMatch(html, /<img src=x onerror=trip/);
  assert.match(html, /&lt;img/);
  assert.deepEqual(visibleFeatures(html), oldFeatures);
}

const first = {...oldItem, status:'Disponível', bairro:'Vila', titulo:'Casa de teste'};
const second = {...oldItem, status:'Disponível', bairro:'Centro', codigo:'YTI-0002', titulo:'Apartamento Alfa'};
const filterNodes = {
  'filter-location': {value:'Todos', innerHTML:''},
  'filter-search': {value:''},
  'filter-bedrooms': {value:'0'},
};
const events = [];
const filtered = renderScenario(first, {
  filters:filterNodes,
  fetch:async () => ({ok:true,json:async () => ({items:[first,second]})}),
  analytics:{track:(event, item, origin, payload) => events.push({event,item,origin,payload})},
});
await filtered.window.loadCatalog(false);
assert.ok(filterNodes['filter-location'].innerHTML.indexOf('>Centro<') < filterNodes['filter-location'].innerHTML.indexOf('>Vila<'));
assert.ok(filtered.nodes['properties-grid'].innerHTML.indexOf(first.titulo) < filtered.nodes['properties-grid'].innerHTML.indexOf(second.titulo));
filterNodes['filter-location'].value = 'Centro';
filterNodes['filter-search'].value = 'Alfa';
filterNodes['filter-bedrooms'].value = '3';
filtered.window.applyFilters('property_filter');
assert.match(filtered.nodes['properties-grid'].innerHTML, /Apartamento Alfa/);
assert.doesNotMatch(filtered.nodes['properties-grid'].innerHTML, /Casa de teste/);
assert.equal(events.at(-1).event, 'property_filter');
assert.equal(events.at(-1).payload.count, 1);
assert.equal(events.at(-1).payload.searchUsed, true);

const numericCases = [
  [1234,'1.234 m²','1.234'], [1234.56,'1.234,56 m²'], [1.234,'1,234 m²'],
  ['1234','1.234 m²','1.234'], ['1234.56','1.234,56 m²'], ['1234,56','1.234,56 m²'],
  ['1.0','1 m²','1'], ['2,0','2 m²','2'], ['0.125','0,125 m²'], ['1234.567','1.234,567 m²'],
  ...['1.234','1,234','1.000','1,000','12.345','123,456','1.234,56','1,234.56'].map(raw => [raw]),
  ['1.00000000000000001','1 m²'], ['0.'+'0'.repeat(324)+'1'], [0.5,'0,5 m²'],
  [Number.MAX_SAFE_INTEGER,'9.007.199.254.740.991 m²','9.007.199.254.740.991'],
  [Number.MAX_SAFE_INTEGER + 1,'9.007.199.254.740.992 m²'],
  ['9007199254740992','9.007.199.254.740.992 m²'],
  [0,undefined,'0'], ['0',undefined,'0'], [null], [undefined], [true], [''], [-1],
  ['9007199254740991.0','9.007.199.254.740.991 m²','9.007.199.254.740.991'],
  ['1e3'], ['1.234.567'], ['R$ 12'], ['12 m²'], [NaN], [Infinity], [{}], [[]],
];
for (const [raw, area, count] of numericCases) {
  const model = {area_m2:raw,bedrooms:raw,bathrooms:raw,parking:raw};
  const singular = count === '1';
  const expected = [
    ...(area ? [[area,'Área']] : []),
    ...(count && count !== '0' ? [[count,singular?'Quarto':'Quartos'],[count,singular?'Banheiro':'Banheiros']] : []),
    ...(count ? [[count,singular?'Vaga':'Vagas']] : []),
  ];
  assert.deepEqual(propertyFeatures(model).map(({display,label}) => [display,label]), expected, String(raw));
  // Arrays, objetos, booleanos e números não finitos são estruturalmente incompatíveis.
  const scalar = raw == null || typeof raw === 'string' || Number.isFinite(raw);
  const legacy = {...oldItem,area_m2:raw,quartos:raw,banheiros:raw,vagas:raw};
  const item = propPublic({id:1,type:'Casa',title:'Matriz',purpose:'Comprar', ...model});
  assert.deepEqual(item.caracteristicas.map(({display,label}) => [display,label]), expected);
  const ssr = makeHtml({id:1,type:'Casa',title:'Matriz',purpose:'Comprar', ...model}, [], 'https://preview.example.test/');
  assert.deepEqual(visibleFeatures(ssr), expected);
  if (scalar) {
    const {nodes} = renderScenario(legacy);
    assert.deepEqual(visibleFeatures(nodes['properties-grid'].innerHTML), expected);
    assert.deepEqual(visibleFeatures(nodes['property-modal-content'].innerHTML), expected);
  }
}

const modalDescription = descricao => {
  const {nodes} = renderScenario({...property(null), descricao});
  return nodes['property-modal-content'].innerHTML.match(
    /class="property-description [^"]+">([\s\S]*?)<\/div>/
  )[1];
};
assert.equal(
  modalDescription('<p class="legado">Sala &amp; cozinha <strong>integradas</strong><br><em>Clara</em></p><ul><li><u>Varanda</u></li></ul>'),
  '<p>Sala &amp; cozinha <strong>integradas</strong><br><em>Clara</em></p><ul><li><u>Varanda</u></li></ul>'
);
assert.equal(modalDescription('## Casa\n\nSala **ampla**\n\n- Varanda'),
  '<h4>Casa</h4><p>Sala <strong>ampla</strong></p><ul><li>Varanda</li></ul>');
const hostileDescription = modalDescription(
  '<p onmouseover="trip()" title="a > b"><strong onfocus=trip()>Sala</strong>' +
  '<a href="javascript:trip()">link</a><img src=x onerror=trip()>' +
  '<svg onload=trip()></svg><script>trip()</script>&lt;img src=x onerror=trip()&gt;</p>'
);
assert.match(hostileDescription, /^<p><strong>Sala<\/strong>/);
assert.doesNotMatch(hostileDescription, /<(?:script|img|svg|a)\b|<[^>]+\bon\w+=/i);
assert.match(hostileDescription, /&lt;img src=x onerror=trip\(\)&gt;/);
assert.match(modalDescription('<img src=x onerror=trip()>'), /^<p>&lt;img/);

const stalePhoto = property('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop', []);
stalePhoto.resolved_foto_url = stalePhoto.foto_url;
const oldCache = renderScenario(stalePhoto);
assert.doesNotMatch(oldCache.nodes['properties-grid'].innerHTML, /<img\b/, 'cache antigo não restaura imagem genérica');
assert.match(oldCache.nodes['properties-grid'].innerHTML, /Imagem não disponível/, 'cache antigo é convertido em texto');

// Regressão 4.3.3: URLs legadas reais (mesmo válidas) não substituem o R2.
for (const legacyUrl of [
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900',
  'https://i.ibb.co/JwZLR6c2/casa.png',
  'https://exemplo.com/imovel-sem-upload.jpg',
]) {
  const legacy = property(legacyUrl, []);
  legacy.resolved_foto_url = legacyUrl; // cenário de cache anterior
  const rendered = renderScenario(legacy);
  assert.match(rendered.nodes['properties-grid'].innerHTML, /Imagem não disponível/);
  assert.doesNotMatch(rendered.nodes['properties-grid'].innerHTML, /<img\b/);
  assert.match(rendered.nodes['property-modal-content'].innerHTML, /Imagem não disponível/);
  assert.doesNotMatch(rendered.nodes['property-modal-content'].innerHTML.split('<div class="p-5 sm:p-7 space-y-5">')[0], /id="modal-property-img"/);
}

const withoutPhoto = renderScenario(property('', []));
const card = withoutPhoto.nodes['properties-grid'].innerHTML;
const modal = withoutPhoto.nodes['property-modal-content'].innerHTML;
const mediaSegment = modal.split('<div class="p-5 sm:p-7 space-y-5">')[0];
assert.match(card, /Imagem não disponível/, 'card exibe texto');
assert.match(card, /data-lucide="image-off"/, 'card sem fotos usa ícone dentro da identidade visual');
assert.doesNotMatch(card, /<img\b/, 'card sem foto não gera elemento img');
assert.match(mediaSegment, /Imagem não disponível/, 'modal exibe texto');
assert.doesNotMatch(mediaSegment, /id="modal-property-img"/, 'modal sem foto não gera elemento img');
assert.doesNotMatch(mediaSegment, /property-gallery-counter/, 'modal sem foto não mostra contador enganoso');

const withPhoto = renderScenario(property(r2Cover, [
  {url:r2Cover,cover:true}, {url:'/api/media/file/property-1/02.webp',cover:false},
]));
assert.match(withPhoto.nodes['properties-grid'].innerHTML, /src="\/api\/media\/file\/property-1\/cover.webp"/, 'card exibe capa R2');
const oldAndR2 = property('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9', [{url:r2Cover,cover:true}]);
const newPreferred = renderScenario(oldAndR2);
assert.match(newPreferred.nodes['properties-grid'].innerHTML, /src="\/api\/media\/file\/property-1\/cover.webp"/, 'capa R2 ganha de qualquer URL legada');
assert.doesNotMatch(newPreferred.nodes['properties-grid'].innerHTML, /src="https:\/\/images\.unsplash\.com/, 'nenhuma foto genérica no anúncio');
const gallery = withPhoto.nodes['property-modal-content'].innerHTML;
assert.match(gallery, /id="modal-property-img"/, 'modal com imagem preserva img');
assert.match(gallery, /movePropertyGallery\(-1\)/, 'seta anterior preservada');
assert.match(gallery, /movePropertyGallery\(1\)/, 'seta seguinte preservada');
assert.match(gallery, /1 \/ 2/, 'contador preservado');
assert.match(gallery, /data-image-unavailable="1"[^>]+style="display:none"/, 'mensagem inicialmente oculta quando a imagem existe');

const fallback = {style:{display:'none'}};
const image = {dataset:{},style:{},closest(){return {querySelector(){return fallback}}}};
withPhoto.window.handlePropertyImgError(image);
assert.equal(image.style.display, 'none', 'imagem quebrada não é exibida');
assert.equal(fallback.style.display, 'flex', 'erro mostra apenas mensagem');
assert.doesNotMatch(html, /images\.unsplash\.com\/photo-1600585154340/, 'sem imagem arquitetônica genérica');
assert.doesNotMatch(html, /const RESOLVING_PLACEHOLDER|src=\"https:\/\/placehold\.co\/900x560/, 'sem placeholder externo da propriedade');

console.log('PASSOU: vitrine 4.3.3 (sem URL legada, sem foto genérica, mensagem, capa R2, carrossel e erro de imagem).');
