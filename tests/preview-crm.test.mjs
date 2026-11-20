// Teste local de integração para Pages Functions + schema REAL das migrations D1.
// Executar: node --experimental-sqlite tests/preview-crm.test.mjs
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
const env = { DB, DEV_BYPASS: '1' };
let checks = 0;
async function api(method, target, body, expected = 200) {
  const request = new Request(`https://preview.example.test/api${target}`, {
    method, headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
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
const html = fs.readFileSync(path.join(root, 'public/app/index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/g)?.at(-1)?.replace(/^<script>/, '').replace(/<\/script>$/, '');
assert.ok(script, 'script inline do CRM não encontrado');
new vm.Script(script, { filename: 'public/app/index.html' });
assert.ok(html.includes('oninput="onLeadPropertyInput()"'));
assert.ok(html.includes('const kanbanStages = STAGES;'));
checks += 3;

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

// Seleção de um imóvel com status Reservado por outro lead continua proibida.
const l4 = await lead('Cliente Teste Quatro', c.code, 'Proposta Enviada');
checkProp(c.code, 'Reservado');
await api('PATCH', `/leads/${l2.id}`, { link_mode: 'internal', property_code: c.code }, 409);

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

assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
checks++;
console.log(`PASSOU: ${checks} verificações. Migrations ${migs.join(', ')}; reservas, disputas, troca, exclusão, reabertura, legado, CRC e sintaxe da UI.`);
