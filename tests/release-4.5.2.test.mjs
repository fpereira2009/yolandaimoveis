// Regressões específicas da 4.5.2: máscara telefônica e layout / filtros CRC.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
let checks = 0;
const check = (condition, name) => { assert.ok(condition, name); checks++; };
const eq = (a, b, name) => { assert.equal(a, b, name); checks++; };

// As máscaras são instaladas em delegation: valem para formulários criados dinamicamente.
const handlers = {};
const doc = {
  activeElement: null,
  addEventListener(type, callback) { handlers[type] = callback; }
};
const win = {};
vm.runInNewContext(read('public/js/crm-input-masks.js'), { document: doc, window: win, Event: class { constructor(name) { this.type = name; } } });
const mask = win.YolandaMasks;
eq(mask.formatPhone('24999999999'), '(24) 99999-9999', 'celular 9 dígitos');
eq(mask.formatPhone('5524999999999'), '(24) 99999-9999', 'número com DDI 55');
eq(mask.formatPhone('(24) 99999-9999'), '(24) 99999-9999', 'máscara idempotente');
eq(mask.formatPhone('2433334444'), '(24) 3333-4444', 'fixo 8 dígitos');
eq(mask.formatPhone('24'), '(24', 'digitação parcial DDD');
eq(mask.formatPhone('24999'), '(24) 999', 'digitação parcial local');
eq(mask.formatPhone('2499999'), '(24) 9999-9', 'hífen progressivo 8 dígitos');
eq(mask.formatPhone(''), '', 'campo vazio');
eq(mask.formatPhone('249999999999999'), '(24) 99999-9999', 'limite DDD + 9 dígitos');
eq(mask.formatMoney('1250000'), '1.250.000', 'moeda com milhar');
eq(mask.formatMoney('1.250.000'), '1.250.000', 'moeda idempotente');
eq(mask.formatMoney('0001250000'), '1.250.000', 'zeros à esquerda');
eq(mask.digitsOnly('1.250.000'), '1250000', 'valor limpo para API');

function input(id, value, caret = value.length) {
  return { id, value, selectionStart: caret, selectionEnd: caret,
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
    dispatchEvent() { this.events = (this.events || 0) + 1; } };
}
for (const id of ['lead-phone', 'crc-phone', 'interest-phone', 'owner-phone']) {
  const el = input(id, '24999999999'); doc.activeElement = el; handlers.input({ target: el });
  eq(el.value, '(24) 99999-9999', `máscara no formulário ${id}`);
}
const curr = input('lead-value', '1.250.000'); doc.activeElement = curr; handlers.input({ target: curr });
eq(curr.value, '1.250.000', 'máscara monetária campo existente');
const partial = input('lead-phone', '24999999999', 5); doc.activeElement = partial; handlers.input({ target: partial });
eq(partial.value, '(24) 99999-9999', 'máscara após edição no meio');
check(partial.selectionStart >= 0 && partial.selectionStart <= partial.value.length, 'cursor válido após máscara');
for (const [id, value, caret] of [
  ['lead-phone', '(24) 99999-9999', 11],
  ['lead-value', '1.250.000', 2],
]) {
  const field = input(id, value, caret); doc.activeElement = field;
  let prevented = false;
  handlers.keydown({key:'Backspace',target:field,preventDefault(){prevented=true;}});
  check(prevented, `${id}: Backspace sobre separador não travou`);
  check(mask.digitsOnly(field.value).length < mask.digitsOnly(value).length, `${id}: Backspace remove um dígito`);
}
const deleted = input('lead-phone', '(24) 99999-9999', 4); doc.activeElement = deleted;
let prevented = false;
handlers.keydown({key:'Delete',target:deleted,preventDefault(){prevented=true;}});
check(prevented && mask.digitsOnly(deleted.value).length === 10, 'Delete sobre separador remove dígito');

// API do lead já normaliza o valor de forma explícita ANTES de transmitir ao D1.
const values = { 'lead-edit-id':'LD-0001', 'lead-name':'Teste', 'lead-phone':'(24) 99999-9999',
  'lead-modality':'Compra', 'lead-category':'Interessado', 'lead-stage':'Qualificação',
  'lead-temp':'Morno', 'lead-value':'1.250.000', 'lead-note':'', 'lead-followup-date':''};
const ctx = {document:{getElementById(id){return {value:values[id] ?? ''};}}};
vm.runInNewContext(read('public/js/crm-lead-detail.js'), ctx);
eq(ctx.leadBody().value, '1250000', 'payload limpo do valor para D1');
check(read('functions/_shared/api/leads.js').includes('.bind('), 'D1 permanece utilizando prepared statements bind');

// Localização dos controles: 5 filtros principais na primeira linha, 4 grupos na segunda.
const html = read('public/app/index.html');
const filterStart = html.indexOf('<!-- Linha 1: busca e filtros principais');
const row2Start = html.indexOf('<!-- Linha 2: grupos de relacionamento');
const filterEnd = html.indexOf('id="crc-cards-grid"');
check(filterStart > 0 && row2Start > filterStart && filterEnd > row2Start, 'duas linhas explícitas CRC');
const topRow = html.slice(filterStart, row2Start);
const bottomRow = html.slice(row2Start, filterEnd);
for (const value of ['Todos','Compra','Venda','Aluguel','Follow-up']) {
  check(topRow.includes(`data-crc="${value}"`), `principal ${value} na primeira linha`);
  check(!bottomRow.includes(`data-crc="${value}"`), `principal ${value} fora da segunda`);
}
for (const value of ['recent','inactive_recent','inactive_old','Aniversariante']) {
  check(bottomRow.includes(`data-crc="${value}"`), `bucket ${value} na segunda linha`);
  check(!topRow.includes(`data-crc="${value}"`), `bucket ${value} fora da primeira`);
}
check(bottomRow.includes('grid-cols-2 lg:grid-cols-4'), '2 colunas mobile e 4 em desktop');
check(!html.includes('id="crc-followup-start"') && !html.includes('id="crc-followup-end"'), 'campos de período removidos');
check(!read('public/js/crm-clients.js').includes('clearCrcFollowupDates'), 'handler sem botão retirado');

// Os filtros preservam as classes de responsividade ao trocar a seleção.
function button(id, isGroup) {
  const classes = new Set(isGroup ? ['crc-filter-btn', 'w-full', 'min-h-[46px]', 'text-center', 'bg-sand', 'font-semibold'] : ['crc-filter-btn','shrink-0','bg-sand','font-semibold']);
  return { dataset:{crc:id}, classList:{ add(...items){items.forEach(x=>classes.add(x));},remove(...items){items.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);} },
    attrs:{}, setAttribute(k,v){this.attrs[k]=v} };
}
const ids = ['Todos','Compra','Venda','Aluguel','Follow-up','recent','inactive_recent','inactive_old','Aniversariante'];
const buttons = ids.map((id,i)=>button(id,i>=5));
const search = {value:''};
const grid = {innerHTML:''};
const clients = [
  {id:'C1',name:'Cliente Recente',regions:'Centro',preferences:'Casa',modality:'Compra',birthdayMonth:false,pendingFollowup:false,lastContactAt:'2026-11-10T12:00:00Z',lastInteraction:'',nextAction:'',budget:'',phone:'24999999999'},
  {id:'C2',name:'Cliente Inativo Recente',regions:'Centro',preferences:'Casa',modality:'Compra',birthdayMonth:false,pendingFollowup:false,lastContactAt:'2026-09-10T12:00:00Z',lastInteraction:'',nextAction:'',budget:'',phone:'24999999999'},
  {id:'C3',name:'Cliente Antigo Aniversariante',regions:'Manejo',preferences:'Casa',modality:'Venda',birthdayMonth:true,pendingFollowup:false,lastContactAt:'2024-01-10T12:00:00Z',lastInteraction:'',nextAction:'',budget:'',phone:'24999999999'}
];
const crcCtx = {
  Date,console, activeCrcFilter:'Todos',crcClients:clients,
  addDaysBR(delta){const d = new Date('2026-11-21T15:00:00Z'); d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)},
  todayBR(){return '2026-11-21'},
  document:{querySelectorAll(){return buttons},getElementById(id){return id === 'crc-search' ? search : id === 'crc-cards-grid' ? grid : null;}},
  findLeadsForClient(){return []}, clientNextFollowup(){return null}, sortClientsByFollowup(list){return list},
  getModalityBadge(){return ''}, esc(v){return String(v ?? '')}, normPhone(v){return String(v).replace(/\D/g,'')},
  lucide:{createIcons(){}}, dmyBR(v){return v}
};
vm.runInNewContext(read('public/js/crm-clients.js'), crcCtx);
crcCtx.setCrcFilter('inactive_recent');
check(grid.innerHTML.includes('Cliente Inativo Recente') && !grid.innerHTML.includes('Cliente Recente</h4>'), 'bucket +30 dias sem fuga do recente');
check(buttons[6].classList.contains('w-full') && buttons[6].classList.contains('bg-moss'), 'grupo selecionado mantém layout');
eq(buttons[6].attrs['aria-pressed'],'true','estado acessível do botão');
crcCtx.setCrcFilter('inactive_old');
check(grid.innerHTML.includes('Cliente Antigo Aniversariante') && !grid.innerHTML.includes('Cliente Inativo Recente'), 'bucket +1 ano');
check(!buttons[6].classList.contains('bg-moss') && buttons[6].classList.contains('w-full'), 'não selecionado mantém layout');
crcCtx.setCrcFilter('Aniversariante');
check(grid.innerHTML.includes('Cliente Antigo Aniversariante') && !grid.innerHTML.includes('Cliente Recente</h4>'), 'aniversariantes');
crcCtx.setCrcFilter('Todos');
check(grid.innerHTML.includes('Cliente Recente') && grid.innerHTML.includes('Cliente Inativo Recente') && grid.innerHTML.includes('Cliente Antigo Aniversariante'), 'todos os clientes sem período de data');
check(buttons[0].attrs['aria-pressed']==='true' && buttons[8].attrs['aria-pressed']==='false', 'seleção única entre duas linhas');
check(read('wrangler.toml').includes('yolanda-crm-dev') && read('wrangler.toml').includes('yolanda-imoveis-dev'), 'separação dos ambientes preservada');
check(read('functions/_shared/access-auth.js').includes("redirect: 'manual'"), 'correção JWT mantida');
check(JSON.parse(read('package.json')).version==='4.8.0', 'versão declarada 4.5.2');
check(read('public/index.html').includes('?v=4.5.3') && html.includes('?v=4.5.3'), 'atualização dos recursos JS sem cache antigo');
console.log(`PASSOU: ${checks} verificações específicas da versão 4.5.2.`);
