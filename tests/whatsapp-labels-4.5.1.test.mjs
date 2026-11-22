import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const vitrine = read('public/js/vitrine-app.js');
const home = read('public/index.html');
const crm = read('public/app/index.html');
const clients = read('public/js/crm-clients.js');
const funnel = read('public/js/crm-funnel.js');
const detail = read('public/js/crm-lead-detail.js');
// Restoration of original visible labels.
check(home.includes('<span class="hidden sm:inline">WhatsApp</span>'), 'header text');
check(home.includes('<span>Falar diretamente no WhatsApp</span>'), 'profile text');
check(home.includes('<span>Enviar pelo WhatsApp</span>'), 'owner submission text');
check(home.includes('<span class="hidden sm:inline">Falar com Iêda</span>'), 'floating text');
check(vitrine.includes("'<span>Tenho Interesse</span>'"), 'property card interest text');
check(vitrine.includes("'<span>Enviar e chamar no WhatsApp</span>'"), 'property detail submission text');
check(clients.includes('<span>WhatsApp</span>'), 'client card text');
check(funnel.includes('<span>WhatsApp</span>'), 'lead card text');
check(detail.includes('<span>Chamar no WhatsApp</span>'), 'lead detail text');
// Retain all functionality from prior release.
check(vitrine.includes('openCardInterestWhatsApp(event,'), 'card direct WhatsApp handler');
check(vitrine.includes('event.preventDefault()') && vitrine.includes('event.stopPropagation()'), 'prevent opening the property modal');
check(vitrine.includes('propertyDeepLink(prop)'), 'shareable property deep link');
check(vitrine.includes('property_code: codigo'), 'lead-to-property association');
for (const [name,code] of [['clients',clients],['funnel',funnel],['detail',detail]]) {
 check(code.includes('href="tel:+${esc(normPhone('), `${name} mobile phone link`);
 check(code.includes('aria-label='), `${name} accessible WhatsApp action`);
}
check(home.includes('?v=4.5.3') && crm.includes('?v=4.5.3'), 'cache-busting release version');
check(JSON.parse(read('package.json')).version === '4.5.3', 'package version');
check(JSON.parse(read('package-lock.json')).version === '4.5.3', 'lockfile version');
check(read('functions/_shared/access-auth.js').includes("redirect: 'manual'"), 'JWT JWKS fix retained');
const wrangler = read('wrangler.toml');
check(wrangler.includes('database_name = "yolanda-crm-dev"') && wrangler.includes('database_name = "yolanda-crm"'), 'D1 environments separate');
check(wrangler.includes('bucket_name = "yolanda-imoveis-dev"') && wrangler.includes('bucket_name = "yolanda-imoveis-prod"'), 'R2 environments separate');
check(read('CHANGELOG.md').includes('## [4.5.1]'), 'changelog updated');
console.log(`PASSOU: ${checks} verificações específicas de restauração dos botões WhatsApp na 4.5.1.`);
