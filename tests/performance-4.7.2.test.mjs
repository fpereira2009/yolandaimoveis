// Testes sem dependências externas para a Yolanda 4.7.2.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = fs.readFileSync(path.join(ROOT, 'public/js/lucide-vitrine-472.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const vitrine = fs.readFileSync(path.join(ROOT, 'public/js/vitrine-app.js'), 'utf8');
const iconNames = [...new Set([...html.matchAll(/data-lucide=["']([^"']+)/g),
  ...vitrine.matchAll(/data-lucide=["']([^"']+)/g)].map(x => x[1]))];

class FakeEl {
  constructor(tag, attrs = {}) {
    this.tagName = tag;
    this.map = new Map(Object.entries(attrs));
    this.children = [];
  }
  get attributes() { return [...this.map].map(([name, value]) => ({name, value})); }
  getAttribute(key) { return this.map.get(key) ?? null; }
  setAttribute(key, value) { this.map.set(key, String(value)); }
  appendChild(el) { this.children.push(el); }
  replaceWith(el) { if (!this.replace) throw new Error('replacement context missing'); this.replace(el); }
}

function fakeDOM(initial) {
  const nodes = [];
  const events = new Map();
  function append(el) {
    const pos = nodes.length;
    el.replace = value => { nodes[pos] = value; };
    nodes.push(el);
  }
  initial.forEach(append);
  const document = {
    readyState: 'loading',
    querySelectorAll: () => nodes.filter(el => el.getAttribute('data-lucide') !== null),
    createElementNS: (_ns, tag) => new FakeEl(tag),
    addEventListener: (event, fn) => events.set(event, fn),
  };
  const window = {document};
  vm.runInNewContext(bundle, {window}, {filename:'lucide-vitrine-472.js'});
  return {window, events, nodes, append};
}

test('subconjunto inclui todos os ícones estáticos e dinâmicos da homepage', () => {
  assert.ok(iconNames.length >= 15, 'esperados os ícones da homepage e da galeria');
  for (const name of iconNames) {
    assert.ok(bundle.includes(`'${name}':`), `ícone faltando: ${name}`);
  }
  assert.ok(!bundle.includes('unpkg.com'));
  assert.ok(Buffer.byteLength(bundle) < 25000, 'renderer muito grande');
});

test('converte ícones mantendo classes, IDs e acessibilidade', () => {
  const original = new FakeEl('i', {'data-lucide':'refresh-cw', 'class':'w-3.5 h-3.5 text-terracotta', 'id':'sync-icon', 'aria-hidden':'true'});
  const s = fakeDOM([original]);
  assert.equal(typeof s.window.lucide.createIcons, 'function');
  assert.equal(s.nodes[0].tagName, 'i');
  s.events.get('DOMContentLoaded')();
  assert.equal(s.nodes[0].tagName, 'svg');
  assert.match(s.nodes[0].getAttribute('class'), /w-3\.5 h-3\.5.*lucide-refresh-cw/);
  assert.equal(s.nodes[0].getAttribute('id'), 'sync-icon');
  assert.equal(s.nodes[0].getAttribute('aria-hidden'), 'true');
  assert.equal(s.nodes[0].getAttribute('viewBox'), '0 0 24 24');
  assert.ok(s.nodes[0].children.length >= 1);
  s.window.lucide.createIcons();
  assert.equal(s.nodes[0].tagName, 'svg', 'idempotência');
});

test('renderização dinâmica para cards, modal e fallback sem foto', () => {
  const s = fakeDOM([]);
  s.events.get('DOMContentLoaded')();
  for (const name of ['message-circle','share-2','chevron-left','chevron-right','x','image-off','map-pin']) {
    s.append(new FakeEl('i', {'data-lucide':name, 'class':'w-5 h-5'}));
  }
  s.window.lucide.createIcons();
  assert.equal(s.nodes.filter(n=>n.tagName==='svg').length,7);
  s.append(new FakeEl('i', {'data-lucide':'icone-nao-mapeado'}));
  s.window.lucide.createIcons();
  assert.equal(s.nodes.at(-1).tagName,'i', 'ícone desconhecido deve permanecer no DOM');
});

test('homepage usa recursos locais e mantém scripts da vitrine', () => {
  assert.match(html, /src="\/js\/lucide-vitrine-472\.js\?v=4\.7\.2" defer/);
  assert.doesNotMatch(html, /unpkg\.com\/lucide|cdn\.tailwindcss\.com/);
  assert.match(html, /href="\/css\/tailwind\.min\.css"/);
  assert.match(html, /href="\/img\/favicon-32\.png"/);
  assert.match(html, /href="\/img\/apple-touch-icon-180\.png"/);
  for (const name of ['property-description','crm-input-masks','vitrine-app']) {
    assert.match(html, new RegExp(`src="/js/${name}\\.js[^"<>]*" defer`));
  }
  assert.match(vitrine, /const BROKER_AVATAR = "\/img\/fotocorretora-480\.webp"/);
  assert.match(vitrine, /responsiveCoverAttributes/);
  assert.match(vitrine, /safeRefreshIcons\(\)/);
});

test('favicons são PNG corretos, pequenos e nas dimensões solicitadas', () => {
  const cases = [['favicon-32.png',32,6000],['apple-touch-icon-180.png',180,35000]];
  for (const [name, size, max] of cases) {
    const png = fs.readFileSync(path.join(ROOT,'public/img',name));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
    assert.ok(png.length < max, `${name} deveria ter menos de ${max} bytes`);
  }
});
