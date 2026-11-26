// Testes locais do fallback visual da vitrine (sem navegador nem Cloudflare).
// node tests/vitrine-sem-imagem.test.mjs
import { crmScript, vitrineScript, crmComposite, vitrineComposite, crmHtml, vitrineHtml } from './helpers/source-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = vitrineComposite.replace(/\r\n/g, '\n');
const code = vitrineScript;
const scriptStart = code.indexOf('        (function () {');
const scriptEnd = code.indexOf('        })();', scriptStart);
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, 'script da vitrine localizado');

const r2Cover = '/api/media/file/property-1/cover.webp';

function property(foto_url, images = []) {
  return {
    codigo:'YTI-0001', titulo:'Casa de teste', finalidade:'Comprar', tipo:'Casa',
    bairro:'Manejo', cidade:'Resende', valor:530000, descricao:'Teste',
    quartos:3, banheiros:2, vagas:2, area_m2:120,
    foto_url, images,
  };
}

function renderScenario(item) {
  const nodes = {
    'properties-grid': {innerHTML:''},
    'results-counter': {textContent:''},
    'property-modal': {classList:{remove(){}, add(){}}},
    'property-modal-content': {innerHTML:''},
  };
  const context = {
    console,
    setTimeout:() => 1,
    clearTimeout:() => {},
    URL,
    Date,
    window: {
      location: {origin:'https://preview.example.test',pathname:'/'},
      localStorage: {getItem:key => key === 'yti_catalog_v2' ? JSON.stringify({items:[item]}) : null, setItem(){}},
    },
    document: {
      readyState:'loading', addEventListener(){},
      body:{style:{}},
      getElementById:id=>nodes[id] || null,
      querySelectorAll:()=>[],
    },
    YolandaDescription:{toHtml:()=>'<p>Teste</p>'},
  };
  vm.runInNewContext(code, context, {filename:'public/index.html'});
  context.window.applyFilters();
  context.window.openPropertyModal('YTI-0001');
  return {window:context.window, nodes};
}

for (const [parking, display, label] of [
  [0, '0', 'Vagas'], [1, '1', 'Vaga'], [2, '2', 'Vagas'],
  [null, 'Consultar', 'Vagas'], [undefined, 'Consultar', 'Vagas'],
]) {
  const {nodes} = renderScenario({...property(null), vagas:parking});
  assert.ok(nodes['properties-grid'].innerHTML.includes(`>${display}</span><span class="block text-[10px] text-charcoal/65">${label}</span>`));
  assert.ok(nodes['property-modal-content'].innerHTML.includes(`>${display}</span><span class="block text-[11px] text-charcoal/65">${label}</span>`));
}

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
