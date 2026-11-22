// Regressões 4.5.3: valor de imóveis no cadastro e edição, sem alterar contrato D1.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = rel => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
let checks = 0;
function eq(actual, expected, message) { assert.equal(actual, expected, message); checks++; }
function ok(condition, message) { assert.ok(condition, message); checks++; }

const handlers = {};
const elements = new Map();
function element(id) {
    if (!elements.has(id)) {
        const classes = new Set();
        elements.set(id, {
            id, value: '', innerHTML: '', textContent: '', disabled: false,
            selectionStart: 0, selectionEnd: 0,
            classList: {
                add(name) { classes.add(name); },
                remove(name) { classes.delete(name); },
                toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
                contains(name) { return classes.has(name); }
            },
            setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
            dispatchEvent(evt) { if (handlers[evt.type]) handlers[evt.type]({target: this}); }
        });
    }
    return elements.get(id);
}
const document = {
    activeElement: null,
    getElementById: element,
    addEventListener(name, cb) { handlers[name] = cb; }
};
const operations = [];
const sandbox = {
    window: {}, document,
    URL: {revokeObjectURL() {}},
    lucide: {createIcons() {}},
    YolandaDescription: {fromHtml: html => html || '', toHtml: value => value || ''},
    api: async (path, options={}) => {
        operations.push({path, options});
        return {code: path === '/properties' ? 'YTI-0002' : 'YTI-0001'};
    },
    closeModal() {}, showToast() {},
    Event: class { constructor(type) { this.type = type; } }
};
vm.createContext(sandbox);
vm.runInContext(read('public/js/crm-input-masks.js'), sandbox);
vm.runInContext(read('public/js/crm-properties.js'), sandbox);
vm.runInContext('refreshPropertyImageState = async function () {};', sandbox);
const mask = sandbox.window.YolandaMasks;
const html = read('public/app/index.html');
const fieldMarkup = html.match(/<input\b[^>]*\bid="prop-price"[^>]*>/)?.[0] || '';
ok(fieldMarkup.includes('type="text"'), 'input de preço permite pontos de milhar');
ok(fieldMarkup.includes('inputmode="numeric"'), 'teclado numérico mobile');
ok(fieldMarkup.includes('required') && fieldMarkup.includes('maxlength="13"'), 'regras de preenchimento preservadas');
ok(fieldMarkup.includes('pattern="[0-9]{1,3}(\\.[0-9]{3})*"'), 'pattern de formato de milhar');
ok(!fieldMarkup.includes('oninput=') && !fieldMarkup.includes('onclick='), 'eventos antigos não substituídos');

const price = element('prop-price');
for (const [input, expected] of [
    ['150000','150.000'], ['1250000','1.250.000'], ['1.250.000','1.250.000'],
    ['000150000', '150.000'], ['0', '0'], ['', '']
]) {
    price.value = input;
    price.selectionStart = price.selectionEnd = input.length;
    document.activeElement = price;
    handlers.input({target: price});
    eq(price.value, expected, `máscara de imóvel ${input}`);
}
price.value = '1250000'; price.selectionStart = price.selectionEnd = 3;
handlers.input({target: price});
eq(price.value, '1.250.000', 'formatação no meio do valor');
ok(price.selectionStart >= 0 && price.selectionStart < price.value.length, 'cursor lógico preservado durante edição');
price.value = '1.250.000'; price.selectionStart = price.selectionEnd = 2;
let backspacePrevented = false;
handlers.keydown({key:'Backspace',target:price,preventDefault(){backspacePrevented=true;}});
ok(backspacePrevented, 'Backspace sobre ponto interceptado');
eq(mask.digitsOnly(price.value).length, 6, 'Backspace remove apenas um dígito');
price.value = '1.250.000'; price.selectionStart = price.selectionEnd = 1;
let deletePrevented = false;
handlers.keydown({key:'Delete',target:price,preventDefault(){deletePrevented=true;}});
ok(deletePrevented, 'Delete sobre ponto interceptado');
eq(mask.digitsOnly(price.value).length, 6, 'Delete remove apenas um dígito');

element('prop-save-btn').textContent='Salvar';
// Ao abrir o cadastro, o mesmo campo deve iniciar vazio.
sandbox.openNewPropertyModal();
eq(price.value, '', 'novo imóvel: campo inicia vazio');
price.value='150000'; price.selectionStart=price.selectionEnd=price.value.length;
handlers.input({target:price});
eq(price.value, '150.000', 'novo imóvel: valor mascarado antes de salvar');
await sandbox.handleSaveProperty({preventDefault(){}});
const created = operations.find(op => op.path === '/properties');
ok(created && created.options.method === 'POST', 'endpoint de cadastro original mantido');
eq(created.options.body.price, '150000', 'cadastro envia somente dígitos');

// A edição recebe o valor numérico do banco e deve formatar sem mudar o valor persistido.
sandbox.fillPropForm({code: 'YTI-0001', price: 1250000, images: [], description: ''});
eq(price.value, '1.250.000', 'edição exibe preço já formatado');
await sandbox.handleSaveProperty({preventDefault(){}});
const edited = operations.find(op => op.path === '/properties/YTI-0001');
ok(edited && edited.options.method === 'PATCH', 'endpoint de edição original mantido');
eq(edited.options.body.price, '1250000', 'edição envia somente dígitos');

// Servidor continua validando e persistindo por bind(), sem tratar pontos nem decimais.
const properties = read('functions/_shared/api/properties.js');
ok(properties.includes('price: (v) => money(v)'), 'validação numérica do servidor intacta');
ok(properties.includes('.bind('), 'persistência D1 usa statements parametrizados');
ok(read('wrangler.toml').includes('yolanda-crm-dev') && read('wrangler.toml').includes('yolanda-imoveis-dev'), 'bindings Preview preservados');
ok(read('functions/_shared/access-auth.js').includes("redirect: 'manual'"), 'autenticação Cloudflare Access preservada');
eq(JSON.parse(read('package.json')).version, '4.5.3', 'versão atualizada');
ok(html.includes('?v=4.5.3'), 'cache-busting do CRM atualizado');
console.log(`PASSOU: ${checks} verificações específicas da versão 4.5.3.`);
