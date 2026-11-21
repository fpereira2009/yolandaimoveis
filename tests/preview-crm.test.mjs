// Teste local de integração para Pages Functions + schema REAL das migrations D1.
// Executar: node --experimental-sqlite tests/preview-crm.test.mjs
import { configureTestAuth, authHeaders } from './helpers/access-fixture.mjs';
import { crmScript, vitrineScript, crmComposite, vitrineComposite, crmHtml, vitrineHtml } from './helpers/source-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { onRequest } from '../functions/api/[[route]].js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(':memory:');
const migs = fs.readdirSync(path.join(root, 'migrations')).filter(n => n.endsWith('.sql')).sort();
for (const name of migs) db.exec(fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));
db.exec('PRAGMA foreign_keys = ON');
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);

class BoundQuery {
  constructor(sql, params = []) { this.sql = sql; this.params = params; }
  bind(...args) { return new BoundQuery(this.sql, args); }
  stmt() { return db.prepare(this.sql); }
  async first() { return this.stmt().get(...this.params) || null; }
  async all() { return { results: this.stmt().all(...this.params) }; }
  async run() { const r = this.stmt().run(...this.params); return { meta: { changes: r.changes } }; }
}
const DB = {
  prepare(sql) { return new BoundQuery(sql); },
  async batch(queries) {
    const out = [];
    db.exec('BEGIN');
    try {
      for (const query of queries) {
        const stmt = db.prepare(query.sql);
        if (stmt.columns().length) out.push({ results: stmt.all(...query.params) });
        else {
          const meta = stmt.run(...query.params);
          out.push({ results: [], meta: { changes: meta.changes } });
        }
      }
      db.exec('COMMIT');
      return out;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  },
};
const env = configureTestAuth({ DB, MEDIA_ENV: 'preview' });
let checks = 0;
async function api(method, target, body, expected = 200) {
  const request = new Request(`https://preview.example.test/api${target}`, {
    method, headers: { ...authHeaders(), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await onRequest({ request, env, params: { route: target.slice(1).split('/') } });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${target}: ${JSON.stringify(result)}`);
  checks++;
  return result;
}
function checkProp(code, status) {
  const row = db.prepare('SELECT status FROM properties WHERE id = ?').get(Number(code.replace('YTI-', '')));
  assert.equal(row.status, status, `${code}: esperado ${status}, recebido ${row.status}`);
  checks++;
}
async function prop(title, purpose = 'Comprar') {
  return api('POST', '/properties', { title, purpose, neighborhood: 'Centro', price: 500000 }, 201);
}
let n = 0;
async function lead(name, propCode, stage = 'Novo Lead', category = 'Interessado', modality = 'Compra') {
  const b = { name, phone: String(24990000000 + (++n)), modality, stage, category,
    property: propCode || 'Texto livre', value: 500000 };
  if (propCode) Object.assign(b, { link_mode: 'internal', property_code: propCode });
  return api('POST', '/leads', b, 201);
}

// Tests de frontend sem transformar institucional/copy: sintaxe e elementos existentes.
const html = crmComposite;
const script = crmScript;
assert.ok(script, 'script inline do CRM não encontrado');
new vm.Script(script, { filename: 'public/app/index.html' });
assert.ok(html.includes('oninput="commitDatalistEdit(event); onLeadPropertyInput()"'));
assert.ok(html.includes("const kanbanStages = STAGES.filter(stage => stage !== 'Fechado');"));
checks += 3;

// Movimentação: campos em ordem correta, edição sem link/property e PATCH atômico por etapa.
const createForm = html.slice(html.indexOf('id="new-lead-modal"'), html.indexOf('MODAL: FECHAMENTO DE LEAD'));
assert.ok(createForm.indexOf('id="lead-prop-box"') < createForm.indexOf('id="lead-property-field-wrapper"'));
assert.ok(html.indexOf('<!-- Imóvel associado + região: posicionados junto à movimentação do funil -->') < html.indexOf('<span>Encerrar Lead (Ganho ou Perda)</span>'));
assert.equal((html.match(/id="detail-property"/g) || []).length, 1);
checks += 3;

// Executa as funções vanilla em um DOM simulado, sem navegador nem rede externa.
const uiElements = new Map();
function uiEl(id) {
  if (!uiElements.has(id)) {
    const classes = new Set();
    const el = {
      value: '', textContent: '', innerHTML: '', required: false,
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name), toggle: (name, force) => {
          const enable = force === undefined ? !classes.has(name) : !!force;
          if (enable) classes.add(name); else classes.delete(name);
        },
      },
      closest: () => ({ classList: { add() {}, remove() {} } }),
    };
    uiElements.set(id, el);
  }
  return uiElements.get(id);
}
const uiCtx = vm.createContext({
  window: { addEventListener() {} },
  document: { getElementById: uiEl },
  lucide: { createIcons() {} },
  console,
});
new vm.Script(script).runInContext(uiCtx);
const mockLead = { id: 'LD-TEST', name: 'Cliente Teste UI', phone: '5524999999999',
  modality: 'Compra', category: 'Interessado', stage: 'Visita Agendada', temp: 'Morno',
  property: 'Centro', value: 500000, followupAt: '', propertyId: null,
  propertyStatus: null, externalProperty: false, externalPropertyRef: '' };
vm.runInContext(`leads = [${JSON.stringify(mockLead)}]; crmProps = [${JSON.stringify({code:'YTI-0099',title:'Casa UI',status:'Disponível'})}];`, uiCtx);
uiCtx.showToast = () => {};

// Kanban exclui Fechado (Ganho e Perdido) sem esconder o histórico da visão por etapas.
// Contagens e filtros acompanham o modo da visualização, sem persistir alterações no D1.
uiCtx.document.querySelectorAll = () => [];
const wonLeadUI = { ...mockLead, id: 'LD-CLOSED-WON', name: 'Fechado Ganho', stage: 'Fechado', closeResult: 'Ganho' };
const lostLeadUI = { ...mockLead, id: 'LD-CLOSED-LOST', name: 'Fechado Perdido', stage: 'Fechado', closeResult: 'Perdido' };
vm.runInContext(`leads = ${JSON.stringify([mockLead, wonLeadUI, lostLeadUI])}; selectedStage = 'Fechado'; setFunnelMode('kanban')`, uiCtx);
let kanbanHTML = uiEl('kanban-columns-wrapper').innerHTML;
assert.equal((kanbanHTML.match(/<h4 class=\"font-heading font-bold text-moss text-sm\">/g) || []).length, 5);
assert.ok(kanbanHTML.includes('lead-card-LD-TEST'));
assert.equal(kanbanHTML.includes('lead-card-LD-CLOSED-WON'), false);
assert.equal(kanbanHTML.includes('lead-card-LD-CLOSED-LOST'), false);
assert.equal(uiEl('count-cat-todas').textContent, 1);
assert.equal(uiEl('count-funnel-todos').textContent, 1);
checks += 6;

vm.runInContext(`setFunnelMode('tabs')`, uiCtx);
const tabsHTML = uiEl('stage-cards-grid').innerHTML;
assert.ok(tabsHTML.includes('lead-card-LD-CLOSED-WON'));
assert.ok(tabsHTML.includes('lead-card-LD-CLOSED-LOST'));
assert.equal(uiEl('count-cat-todas').textContent, 3);
checks += 3;

vm.runInContext(`leads.find(l => l.id === 'LD-CLOSED-WON').stage = 'Qualificação'; setFunnelMode('kanban')`, uiCtx);
kanbanHTML = uiEl('kanban-columns-wrapper').innerHTML;
assert.ok(kanbanHTML.includes('lead-card-LD-CLOSED-WON'), 'Lead reaberto reaparece no Kanban');
assert.equal(uiEl('count-cat-todas').textContent, 2);
vm.runInContext(`leads.find(l => l.id === 'LD-TEST').stage = 'Fechado'; renderFunnel()`, uiCtx);
kanbanHTML = uiEl('kanban-columns-wrapper').innerHTML;
assert.equal(kanbanHTML.includes('lead-card-LD-TEST'), false, 'Lead fechado desaparece do Kanban');
assert.ok(kanbanHTML.includes('lead-card-LD-CLOSED-WON'));
assert.equal(uiEl('count-cat-todas').textContent, 1);
checks += 5;
vm.runInContext(`leads = [${JSON.stringify(mockLead)}]; selectedStage = 'Novo Lead'; setFunnelMode('tabs')`, uiCtx);

// Refinamento exclusivo do modal de movimentação: hierarquia, eventos e contato mobile.
vm.runInContext('openLeadDetail("LD-TEST")', uiCtx);
const detailHtml = uiEl('lead-detail-content').innerHTML;
const positions = [
  'Imóvel associado ao atendimento',
  'Mover Etapa no Funil (Toque para alterar):',
  'Chamar no WhatsApp',
  'Próximo follow-up:',
  'Registrar Nova Interação / Follow-up:',
  'Histórico de Atendimento:',
  'Encerrar Lead (Ganho ou Perda)',
].map(label => {
  const n = detailHtml.indexOf(label);
  assert.ok(n >= 0, `Bloco ausente no modal: ${label}`);
  checks++;
  return n;
});
for (let i = 1; i < positions.length; i++) {
  assert.ok(positions[i - 1] < positions[i], 'Blocos fora da ordem solicitada');
  checks++;
}
assert.ok(detailHtml.includes('>Associar imóvel</button>'));
assert.equal(detailHtml.includes('Modalidade do Atendimento:'), false);
assert.equal(detailHtml.includes('changeLeadModality('), false);
assert.equal((detailHtml.match(/Chamar no WhatsApp/g) || []).length, 1);
assert.ok(detailHtml.includes('href="tel:+5524999999999"'));
assert.match(detailHtml, /<a href="tel:\+5524999999999"[^>]*class="[^"]*sm:hidden[^"]*"/);
assert.match(detailHtml, /aria-label="Ligar para Cliente Teste UI"/);
assert.ok(detailHtml.includes('data-lucide="phone"'));
assert.ok(detailHtml.includes("onsubmit=\"saveLeadProperty(event, 'LD-TEST')\""));
assert.ok(detailHtml.includes("onclick=\"moveLeadStage('LD-TEST', 'Proposta Enviada')\""));
assert.ok(detailHtml.includes("onchange=\"saveLeadFollowup('LD-TEST', this.value)\""));
assert.ok(detailHtml.includes("onsubmit=\"addLeadNote(event, 'LD-TEST')\""));
checks += 12;
uiEl('lead-edit-id').value = mockLead.id;
uiEl('lead-name').value = mockLead.name;
uiEl('lead-phone').value = mockLead.phone;
uiEl('lead-modality').value = mockLead.modality;
uiEl('lead-category').value = mockLead.category;
uiEl('lead-stage').value = mockLead.stage;
uiEl('lead-temp').value = mockLead.temp;
uiEl('lead-property').value = 'INDEVIDAMENTE MODIFICADO';
uiEl('lead-value').value = mockLead.value;
uiEl('lead-note').value = 'nota';
uiEl('lead-followup-date').value = '';
uiEl('lead-prop-mode').value = 'none';
const editBody = vm.runInContext('leadBody()', uiCtx);
assert.equal('property' in editBody, false, 'Editar Lead não deve modificar imóvel/região');
assert.equal('link_mode' in editBody, false, 'Editar Lead não deve alterar vínculo interno');
vm.runInContext('openEditLead("LD-TEST")', uiCtx);
assert.equal(uiEl('lead-property-field-wrapper').classList.contains('hidden'), true);
assert.equal(uiEl('lead-prop-box').classList.contains('hidden'), true);
assert.equal(uiEl('lead-property').required, false);
checks += 5;

// O datalist oferece os disponíveis, e o texto manual não força associação.
uiEl('detail-property').value = 'YTI-0099 - Casa UI';
uiEl('detail-prop-mode').value = 'none';
uiEl('detail-prop-id').value = '';
uiEl('detail-prop-ext').value = '';
vm.runInContext('onDetailPropertyInput("LD-TEST")', uiCtx);
assert.equal(uiEl('detail-prop-mode').value, 'internal');
assert.equal(uiEl('detail-prop-id').value, 'YTI-0099');
let req = vm.runInContext('detailPropertyPayload(leads[0])', uiCtx);
assert.equal(req.link_mode, 'internal');
assert.equal(req.property_code, 'YTI-0099');
checks += 4;
let sent = null;
uiCtx.api = async (path, opts) => {
  sent = { path, body: opts.body };
  return { ...mockLead, stage: opts.body.stage, propertyId: opts.body.property_code || null, propertyStatus: 'Reservado' };
};
uiCtx.reloadProps = async () => {};
uiCtx.refreshAll = () => {};
uiCtx.openLeadDetail = () => {};
uiCtx.chosenFollowup = () => ({});
await vm.runInContext('moveLeadStage("LD-TEST", "Proposta Enviada")', uiCtx);
assert.equal(sent.path, '/leads/LD-TEST');
assert.equal(sent.body.stage, 'Proposta Enviada');
assert.equal(sent.body.link_mode, 'internal');
assert.equal(sent.body.property_code, 'YTI-0099');
assert.equal(sent.body.property, 'YTI-0099 - Casa UI');
checks += 5;
uiEl('detail-property').value = 'Região informada livremente';
vm.runInContext('onDetailPropertyInput("LD-TEST")', uiCtx);
req = vm.runInContext('detailPropertyPayload(leads[0])', uiCtx);
assert.equal(req.link_mode, 'none');
assert.equal(req.property, 'Região informada livremente');
checks += 2;
vm.runInContext('leads[0].category = "Captação"', uiCtx);
req = vm.runInContext('detailPropertyPayload(leads[0])', uiCtx);
assert.equal('link_mode' in req, false);
checks++;
vm.runInContext('leads[0].stage = "Fechado"', uiCtx);
req = vm.runInContext('detailPropertyPayload(leads[0])', uiCtx);
assert.equal(Object.keys(req).length, 0);
checks++;

// O fechamento não pode usar um imóvel/região alterado mas ainda não salvo.
const warnings = [];
uiCtx.showToast = msg => warnings.push(msg);
vm.runInContext('leads[0].stage = "Visita Agendada"; leads[0].category = "Interessado"', uiCtx);
uiEl('detail-property').value = 'Outro imóvel manual';
uiEl('detail-prop-mode').value = 'none';
uiEl('lead-detail-modal').classList.remove('hidden');
vm.runInContext('openCloseLead("LD-TEST")', uiCtx);
assert.ok(warnings.some(msg => msg.includes('Salve primeiro')));
checks++;

// 4.3.3: opções do CRM incluem Reservado COM negociação ativa, mas não
// Reservado sem interessado ativo nem Vendido/Alugado/Inativo.
vm.runInContext(`crmProps = [
    { code:'YTI-0901', title:'Reservado Vivo', status:'Reservado' },
    { code:'YTI-0902', title:'Reservado Encerrado', status:'Reservado' },
    { code:'YTI-0903', title:'Imóvel Vendido', status:'Vendido' },
    { code:'YTI-0904', title:'Imóvel Disponível', status:'Disponível' }
  ]; leads = [
    { id:'LD-901', propertyId:'YTI-0901', category:'Interessado', stage:'Proposta Enviada' },
    { id:'LD-902', propertyId:'YTI-0902', category:'Interessado', stage:'Fechado' }
  ];`, uiCtx);
uiEl('lead-category').value = 'Interessado';
vm.runInContext('syncPropertyDatalist()', uiCtx);
const openOptions = uiEl('property-options').innerHTML;
assert.ok(openOptions.includes('YTI-0901 - Reservado Vivo'));
assert.ok(openOptions.includes('YTI-0904 - Imóvel Disponível'));
assert.equal(openOptions.includes('YTI-0902'), false);
assert.equal(openOptions.includes('YTI-0903'), false);
checks += 4;
const eligibleReservedUI = vm.runInContext(`isLinkableProperty(crmProps[0])`, uiCtx);
assert.equal(eligibleReservedUI, true); checks++;
vm.runInContext(`leads[0].stage = 'Fechado'; syncPropertyDatalist()`, uiCtx);
assert.equal(uiEl('property-options').innerHTML.includes('YTI-0901'), false);
checks++;
// Repor dados simulados para as verificações posteriores.
vm.runInContext(`leads = [${JSON.stringify(mockLead)}]; crmProps = [${JSON.stringify({code:'YTI-0099',title:'Casa UI',status:'Disponível'})}];`, uiCtx);

// Na API, uma única requisição troca vínculo + etapa, reservando o imóvel no DB.batch.
const combinedProp = await prop('Imóvel Reserva por Movimentação');
const combinedLead = await lead('Lead Reserva por Movimentação', null);
await api('PATCH', `/leads/${combinedLead.id}`, { stage: 'Documentação/Crédito', property: `${combinedProp.code} - ${combinedProp.title}`, link_mode: 'internal', property_code: combinedProp.code });
checkProp(combinedProp.code, 'Reservado');
await api('PATCH', `/leads/${combinedLead.id}`, { stage: 'Qualificação', property: 'Outra região', link_mode: 'none' });
checkProp(combinedProp.code, 'Disponível');

const a = await prop('Casa Teste A');
const b = await prop('Apartamento Teste B', 'Alugar');
const c = await prop('Terreno Teste C');

// 1) Captação bloqueada no back-end; cliente também não foi criado na tentativa.
const before = db.prepare('SELECT COUNT(*) n FROM clients').get().n;
const rejected = { name: 'Captação Teste', phone: '24999999991', modality: 'Venda',
  category: 'Captação', stage: 'Qualificação', property: 'Casa', value: 10,
  link_mode: 'internal', property_code: a.code };
await api('POST', '/leads', rejected, 400);
assert.equal(db.prepare('SELECT COUNT(*) n FROM clients').get().n, before);
checks++;
const owner = await api('POST', '/leads', { ...rejected, link_mode: 'none' }, 201);
assert.equal(owner.propertyId, null);
checks++;

// 2) Dois leads vinculados à mesma unidade ANTES da reserva; avanço direto para Doc.
const l1 = await lead('Cliente Teste Um', a.code);
const l2 = await lead('Cliente Teste Dois', a.code);
checkProp(a.code, 'Disponível');
await api('PATCH', `/leads/${l1.id}`, { stage: 'Documentação/Crédito' });
checkProp(a.code, 'Reservado');
await api('PATCH', `/leads/${l2.id}`, { stage: 'Proposta Enviada' });
checkProp(a.code, 'Reservado');
// Não permite burlar uma reserva viva pelo seletor de status de Imóveis.
await api('PATCH', `/properties/${a.code}`, { status: 'Disponível' }, 409);
checkProp(a.code, 'Reservado');

// 3) Fechamento perdido não libera enquanto outro lead reserva.
await api('POST', `/leads/${l1.id}/close`, { result: 'Perdido', note: 'Não foi concluído.' });
checkProp(a.code, 'Reservado');
await api('PATCH', `/leads/${l2.id}`, { stage: 'Qualificação' });
checkProp(a.code, 'Disponível');
await api('PATCH', `/leads/${l2.id}`, { stage: 'Documentação/Crédito' });
checkProp(a.code, 'Reservado');

// 4) Troca de imóvel e desvinculação, respeitando atomicidade do batch.
await api('PATCH', `/leads/${l2.id}`, { link_mode: 'internal', property_code: b.code });
checkProp(a.code, 'Disponível');
checkProp(b.code, 'Reservado');
await api('PATCH', `/leads/${l2.id}`, { link_mode: 'none' });
checkProp(b.code, 'Disponível');
const l3 = await lead('Cliente Teste Três', b.code, 'Proposta Enviada', 'Interessado', 'Aluguel');
checkProp(b.code, 'Reservado');
await api('DELETE', `/leads/${l3.id}`);
checkProp(b.code, 'Disponível');

// 4.3.3: Imóvel reservado por um lead ativo aceita um segundo/terceiro interessado.
const l4 = await lead('Cliente Teste Quatro', c.code, 'Proposta Enviada');
checkProp(c.code, 'Reservado');
const secondLink = await api('PATCH', `/leads/${l2.id}`, { link_mode: 'internal', property_code: c.code });
assert.equal(secondLink.propertyId, c.code);
checks++;
checkProp(c.code, 'Reservado');
const thirdLink = await lead('Cliente Teste Dez', c.code, 'Qualificação');
assert.equal(thirdLink.propertyId, c.code);
checks++;
// Encerrar uma negociação perdida não libera a reserva mantida pelo outro lead.
await api('POST', `/leads/${l4.id}/close`, { result: 'Perdido', note: 'Cliente desistiu da proposta.' });
checkProp(c.code, 'Reservado');
await api('PATCH', `/leads/${l2.id}`, { stage: 'Qualificação' });
checkProp(c.code, 'Disponível'); // Terceiro interessado ainda em Qualificação não segura reserva.
await api('PATCH', `/leads/${thirdLink.id}`, { stage: 'Documentação/Crédito' });
checkProp(c.code, 'Reservado');
await api('POST', `/leads/${thirdLink.id}/close`, { result: 'Ganho', note: 'Compra fechada com sucesso.' });
checkProp(c.code, 'Vendido');
// Um lead ainda ativo vinculado não deve permitir novas associações a Vendido.
const cannotReassign = await lead('Lead Candidato a Imóvel Vendido', null);
await api('PATCH', `/leads/${cannotReassign.id}`, { link_mode: 'internal', property_code: c.code }, 409);
// Um reservado sem qualquer lead ativo associado também não pode ser selecionado.
const unheld = await prop('Imóvel Reserva Manual Sem Leads');
await api('PATCH', `/properties/${unheld.code}`, { status: 'Reservado' });
await api('PATCH', `/leads/${cannotReassign.id}`, { link_mode: 'internal', property_code: unheld.code }, 409);

// Exclusão de um entre dois titulares: o imóvel deve permanecer Reservado.
const l7 = await lead('Cliente Teste Sete', a.code, 'Qualificação');
const l8 = await lead('Cliente Teste Oito', a.code, 'Qualificação');
await api('PATCH', `/leads/${l7.id}`, { stage: 'Proposta Enviada' });
await api('PATCH', `/leads/${l8.id}`, { stage: 'Documentação/Crédito' });
checkProp(a.code, 'Reservado');
await api('DELETE', `/leads/${l7.id}`);
checkProp(a.code, 'Reservado');
await api('DELETE', `/leads/${l8.id}`);
checkProp(a.code, 'Disponível');

// Um lead pode trocar de categoria, mas nunca conservar vínculo na Captação.
const toCapture = await lead('Cliente Teste Nove', a.code, 'Proposta Enviada');
checkProp(a.code, 'Reservado');
const switched = await api('PATCH', `/leads/${toCapture.id}`, { category: 'Captação', modality: 'Venda', link_mode: 'none' });
assert.equal(switched.propertyId, null);
checks++;
checkProp(a.code, 'Disponível');
await api('PATCH', `/leads/${toCapture.id}`, { link_mode: 'internal', property_code: a.code }, 400);

// Site público preserva o ID interno quando imóvel está disponível.
const siteProp = await prop('Casa do Site Teste');
await api('POST', '/public/contact', { kind: 'interessado', name: 'Contato Publico', phone: '24987775555', property_code: siteProp.code }, 201);
const siteLeads = (await api('GET', '/leads')).items;
const siteLead = siteLeads.find(x => x.name === 'Contato Publico');
assert.equal(siteLead?.propertyId, siteProp.code);
checks++;
await api('PATCH', `/leads/${siteLead.id}`, { stage: 'Documentação/Crédito' });
checkProp(siteProp.code, 'Reservado');

// 5) Ganho em Aluguel = Alugado, reabertura limpa fechamento mas NÃO muda imóvel.
const l5 = await lead('Cliente Teste Cinco', b.code, 'Documentação/Crédito', 'Interessado', 'Aluguel');
checkProp(b.code, 'Reservado');
const won = await api('POST', `/leads/${l5.id}/close`, { result: 'Ganho', note: 'Contrato de locação assinado.' });
assert.equal(won.closeResult, 'Ganho');
checkProp(b.code, 'Alugado');
const reopened = await api('PATCH', `/leads/${l5.id}`, { stage: 'Documentação/Crédito' });
assert.equal(reopened.closeResult, null);
assert.equal(reopened.closeNote, '');
assert.equal(reopened.closedAt, null);
checks += 3;
checkProp(b.code, 'Alugado');
// Alteração manual do corretor (não feita pela reabertura).
await api('PATCH', `/properties/${b.code}`, { status: 'Disponível' });
checkProp(b.code, 'Disponível');

// Ganho em Compra = Vendido e reabertura preserva status.
const l6 = await lead('Cliente Teste Seis', a.code, 'Proposta Enviada');
const sold = await api('POST', `/leads/${l6.id}/close`, { result: 'Ganho', note: 'Venda concluída com sucesso.' });
assert.equal(sold.propertyStatus, 'Vendido'); checks++;
const again = await api('PATCH', `/leads/${l6.id}`, { stage: 'Qualificação' });
assert.equal(again.closeResult, null); checks++;
checkProp(a.code, 'Vendido');

// 6) Legado Fechado com NULL não ganha resultado retroativo.
const t = new Date().toISOString();
const legacy = db.prepare(`INSERT INTO leads (name,phone,modality,stage,temp,property,value,created_at,updated_at,closed_at,category)
  VALUES ('Lead Legado','5524999998899','Compra','Fechado','Morno','Outros',0,?,?,?,'Interessado') RETURNING id,close_result,close_note`).get(t, t, t);
assert.equal(legacy.close_result, null);
assert.equal(legacy.close_note, null);
checks += 2;
const rows = await api('GET', '/leads');
const legacyOut = rows.items.find(x => x.id === 'LD-' + (100 + legacy.id));
assert.equal(legacyOut.closeResult, null);
checks++;

// 7) CRC: data agendada futura NÃO é a data do último contato.
const newClient = (await api('GET', '/clients')).items.find(x => x.name === l1.name);
assert.ok(newClient?.lastContactAt);
checks++;
const oldTime = '2024-01-01T12:00:00.000Z';
db.prepare('UPDATE clients SET last_contact_at = ?, updated_at = ? WHERE id = ?').run(oldTime, oldTime, Number(newClient.id.replace('CRC-', '')));
db.prepare('UPDATE lead_events SET created_at = ? WHERE lead_id = ?').run(oldTime, Number(l1.id.replace('LD-', '')) - 100);
await api('PATCH', `/leads/${l1.id}`, { followup_at: '2099-01-01' });
const clientAfter = (await api('GET', '/clients')).items.find(x => x.id === newClient.id);
assert.equal(clientAfter.lastContactAt, oldTime);
checks++;

// 4.4.0: mesmo telefone, imóveis diferentes e mesmo imóvel novamente.
const interestPropA = await prop('Site 4.4 - Imóvel A');
const interestPropB = await prop('Site 4.4 - Imóvel B');
const fromSite = { kind:'interesse', name:'Cliente Site Duplo', phone:'24989898989', website:'' };
await api('POST','/public/contact',{...fromSite,property_code:interestPropA.code},201);
await api('POST','/public/contact',{...fromSite,property_code:interestPropA.code},201);
await api('POST','/public/contact',{...fromSite,property_code:interestPropB.code},201);
const leadsForPhone = db.prepare("SELECT id,property_id,property FROM leads WHERE phone = ? AND source = 'Site' AND deleted_at IS NULL ORDER BY id").all('5524989898989');
assert.equal(leadsForPhone.length,2,'dois imóveis distintos criam dois atendimentos, sem duplicar o mesmo'); checks++;
assert.deepEqual(leadsForPhone.map(l=>l.property_id),[Number(interestPropA.code.slice(4)),Number(interestPropB.code.slice(4))]); checks++;
assert.equal(db.prepare('SELECT count(*) AS n FROM clients WHERE phone = ? AND deleted_at IS NULL').get('5524989898989').n,1,'mesma ficha de cliente'); checks++;
assert.equal(db.prepare("SELECT count(*) AS n FROM lead_events WHERE lead_id = ? AND kind='nota'").get(leadsForPhone[0].id).n,1,'repetição no mesmo imóvel apenas anota'); checks++;
// Imóvel Reservado continua anunciado e pode receber interessado sem reservar novamente.
await api('PATCH',`/properties/${interestPropB.code}`,{status:'Reservado'});
await api('POST','/public/contact',{...fromSite,phone:'24987776655',property_code:interestPropB.code},201);
assert.equal(db.prepare('SELECT property_id FROM leads WHERE phone = ?').get('5524987776655').property_id,Number(interestPropB.code.slice(4))); checks++;
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
checks++;
console.log(`PASSOU: ${checks} verificações. Migrations ${migs.join(', ')}; reservas, disputas, troca, exclusão, reabertura, legado, CRC e sintaxe da UI.`);
