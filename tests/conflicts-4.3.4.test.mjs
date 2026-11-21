// Homologação local 4.3.4: fechamento Ganho/Perdido e concorrência de leads.
// Executar: node --experimental-sqlite tests/conflicts-4.3.4.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { onRequest } from '../functions/api/[[route]].js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(':memory:');
for (const name of fs.readdirSync(path.join(root, 'migrations')).filter(n => n.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));
}
db.exec('PRAGMA foreign_keys = ON');
class Bound {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Bound(this.sql, args); }
  async first() { return db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  async run() { const { changes } = db.prepare(this.sql).run(...this.args); return { meta: { changes } }; }
}
const DB = {
  prepare(sql) { return new Bound(sql); },
  async batch(queries) {
    db.exec('BEGIN');
    try {
      const out = queries.map(q => {
        const stmt = db.prepare(q.sql);
        if (stmt.columns().length) return { results: stmt.all(...q.args) };
        const { changes } = stmt.run(...q.args);
        return { results: [], meta: { changes } };
      });
      db.exec('COMMIT');
      return out;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, DEV_BYPASS: '1', MEDIA_ENV: 'preview' };
let checks = 0, sequence = 0;
const leadId = code => Number(code.replace('LD-', '')) - 100;
const propId = code => Number(code.replace('YTI-', ''));
const todayBR = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
async function call(method, url, body, status = 200) {
  const req = new Request(`https://preview.example.test/api${url}`, {
    method, headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await onRequest({ request: req, env, params: { route: url.slice(1).split('/') } });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${url}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
async function makeProperty(title, purpose = 'Comprar') {
  return call('POST', '/properties', { title, purpose, price: 400000, neighborhood: 'Centro' }, 201);
}
async function makeLead(name, property, stage = 'Qualificação', modality = 'Compra') {
  return call('POST', '/leads', {
    name, phone: String(24990000000 + (++sequence)), modality, category: 'Interessado', stage,
    value: 250000, property: `${property.code} - ${property.title}`,
    link_mode: 'internal', property_code: property.code,
    followup_at: '2099-05-20',
  }, 201);
}
const rawLead = code => db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId(code));
const rawProp = code => db.prepare('SELECT * FROM properties WHERE id = ?').get(propId(code));
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };

// Diagnóstico ajuda a confirmar qual Function responde no Preview publicado.
const diagnostic = await call('GET', '/diagnostics/disputes');
eq(diagnostic.apiVersion, '4.3.4-revisao-1');
eq(diagnostic.mediaEnv, 'preview');
eq(diagnostic.disputeRulesEnabled, true);
eq(diagnostic.dbBindingAvailable, true);

// Cenário 1: venda ganha por um dentre quatro associados (um já Perdido).
const sale = await makeProperty('Casa de conflito 4.3.4');
const winner = await makeLead('Lead vencedor', sale, 'Documentação/Crédito');
const competitorProposal = await makeLead('Lead concorrente proposta', sale, 'Proposta Enviada');
const competitorQualifying = await makeLead('Lead concorrente qualificação', sale, 'Qualificação');
const previouslyLost = await makeLead('Lead perdido anterior', sale, 'Proposta Enviada');
await call('POST', `/leads/${previouslyLost.id}/close`, { result: 'Perdido', note: 'Sem interesse no negócio.' });
eq(rawProp(sale.code).status, 'Reservado');
const previousLostBefore = rawLead(previouslyLost.id);
const won = await call('POST', `/leads/${winner.id}/close`, { result: 'Ganho', note: 'Escritura assinada.' });
eq(won.closeResult, 'Ganho');
eq(won.disputeResolution.competitorsRequalified, 2, 'API confirma requalificação de dois concorrentes');
eq(rawProp(sale.code).status, 'Vendido');
for (const competitor of [competitorProposal, competitorQualifying]) {
  const row = rawLead(competitor.id);
  eq(row.stage, 'Qualificação', 'Outro lead deve retornar para Qualificação');
  eq(row.property_id, null, 'Associação interna removida');
  eq(row.property, '', 'Texto da associação removido');
  eq(row.external_property, 0, 'Indicador externo limpo');
  eq(row.external_property_ref, '', 'Referência externa limpa');
  eq(row.followup_at, todayBR(), 'Follow-up ajustado para hoje em São Paulo');
  eq(row.close_result, null, 'Outros leads continuam ativos sem resultado de fechamento');
  const history = db.prepare("SELECT text FROM lead_events WHERE lead_id = ? AND kind = 'etapa' ORDER BY id DESC LIMIT 1")
    .get(leadId(competitor.id));
  ok(history?.text.includes(winner.id) && history.text.includes(sale.code), 'Histórico de conflito registrado');
}
const lostAfter = rawLead(previouslyLost.id);
eq(lostAfter.stage, 'Fechado', 'Lead anteriormente perdido não é reaberto');
eq(lostAfter.close_result, 'Perdido');
eq(lostAfter.property_id, previousLostBefore.property_id, 'Preserva histórico do perdido');
eq(lostAfter.followup_at, null);
const published = await call('GET', '/leads');
for (const competitor of [competitorProposal, competitorQualifying]) {
  const found = published.items.find(l => l.id === competitor.id);
  eq(found.stage, 'Qualificação');
  eq(found.propertyId, null);
  eq(found.followupAt, todayBR());
}
const loserDetail = published.items.find(l => l.id === previouslyLost.id);
eq(loserDetail.closeResult, 'Perdido');

// Cenário 2: Perdido não altera outros e preserva reserva com outro lead ativo,
// inclusive se o outro ainda estiver em Qualificação.
const loseScenario = await makeProperty('Casa reservada e outros ativos');
const losingLead = await makeLead('Lead que perde', loseScenario, 'Proposta Enviada');
const qualifyingLead = await makeLead('Lead ainda qualificando', loseScenario, 'Qualificação');
const otherBefore = rawLead(qualifyingLead.id);
await call('POST', `/leads/${losingLead.id}/close`, { result: 'Perdido', note: 'Proposta recusada.' });
eq(rawProp(loseScenario.code).status, 'Reservado');
const otherAfter = rawLead(qualifyingLead.id);
for (const col of ['stage','property_id','property','followup_at','updated_at']) {
  eq(otherAfter[col], otherBefore[col], `Perdido não altera ${col} de outros leads`);
}

// Cenário 3: ao perder o ÚLTIMO interessado ativo, libera normalmente.
await call('POST', `/leads/${qualifyingLead.id}/close`, { result: 'Perdido', note: 'Desistiu da compra.' });
eq(rawProp(loseScenario.code).status, 'Disponível');

// Cenário 4: no aluguel o vencedor converte para Alugado e requalifica outro.
const rent = await makeProperty('Apartamento alugado com concorrência', 'Alugar');
const rentWinner = await makeLead('Locatário vencedor', rent, 'Documentação/Crédito', 'Aluguel');
const rentOther = await makeLead('Locatário concorrente', rent, 'Proposta Enviada', 'Aluguel');
await call('POST', `/leads/${rentWinner.id}/close`, { result: 'Ganho', note: 'Contrato assinado.' });
eq(rawProp(rent.code).status, 'Alugado');
eq(rawLead(rentOther.id).stage, 'Qualificação');
eq(rawLead(rentOther.id).property_id, null);
eq(rawLead(rentOther.id).followup_at, todayBR());

// Cenário 5: se não há concorrentes, mantém a mesma rotina de fechamento.
const sole = await makeProperty('Casa sem concorrência');
const soleWinner = await makeLead('Comprador único', sole, 'Proposta Enviada');
await call('POST', `/leads/${soleWinner.id}/close`, { result: 'Ganho', note: 'Fechou sem concorrentes.' });
eq(rawProp(sole.code).status, 'Vendido');

// Cenário 6: falha na transação não deixa meio fechamento nem desvinculação parcial.
const atomicProp = await makeProperty('Casa para teste de rollback');
const atomicWinner = await makeLead('Cliente de rollback A', atomicProp, 'Proposta Enviada');
const atomicOther = await makeLead('Cliente de rollback B', atomicProp, 'Documentação/Crédito');
const regularBatch = DB.batch;
const originalError = console.error;
try {
  DB.batch = async stmts => regularBatch([...stmts, DB.prepare('INSERT INTO tabela_inexistente VALUES (1)')]);
  console.error = () => {}; // erro simulado é intencional
  await call('POST', `/leads/${atomicWinner.id}/close`, { result: 'Ganho', note: 'Deve falhar para rollback.' }, 500);
} finally {
  DB.batch = regularBatch;
  console.error = originalError;
}
eq(rawProp(atomicProp.code).status, 'Reservado', 'Rollback do status do imóvel');
eq(rawLead(atomicWinner.id).stage, 'Proposta Enviada', 'Rollback do fechamento do vencedor');
eq(rawLead(atomicOther.id).stage, 'Documentação/Crédito', 'Rollback da etapa do concorrente');
eq(rawLead(atomicOther.id).property_id, propId(atomicProp.code), 'Rollback da associação do concorrente');
eq(rawLead(atomicOther.id).followup_at, '2099-05-20', 'Rollback do follow-up');
const autoEvents = db.prepare("SELECT COUNT(*) AS n FROM lead_events WHERE lead_id = ? AND text LIKE '%desvinculado após fechamento como Ganho%'")
  .get(leadId(atomicOther.id)).n;
eq(autoEvents, 0, 'Rollback dos eventos de auditoria');

// Cenário adicional: o binding MEDIA_ENV pode estar ausente em Preview Git.
// Antes desta revisão, um 'Ganho' fechava o vencedor sem tocar os concorrentes.
const oldEnvironment = env.MEDIA_ENV;
delete env.MEDIA_ENV;
const noBindingDiagnosis = await call('GET', '/diagnostics/disputes');
eq(noBindingDiagnosis.mediaEnv, null);
eq(noBindingDiagnosis.disputeRulesEnabled, true);
const noBinding = await makeProperty('Sem MEDIA_ENV no Pages Preview');
const noBindingWinner = await makeLead('Ganhador sem MEDIA_ENV', noBinding, 'Documentação/Crédito');
const noBindingOther = await makeLead('Concorrente sem MEDIA_ENV', noBinding, 'Proposta Enviada');
const noBindingResult = await call('POST', `/leads/${noBindingWinner.id}/close`, { result: 'Ganho', note: 'Assinado sem variável MEDIA_ENV.' });
eq(noBindingResult.disputeResolution.version, '4.3.4-revisao-1');
eq(noBindingResult.disputeResolution.enabled, true, 'Sem MEDIA_ENV ativa a lógica no pacote Preview');
eq(noBindingResult.disputeResolution.competitorsRequalified, 1, 'Resposta da API informa quantos concorrentes foram corrigidos');
eq(rawLead(noBindingOther.id).stage, 'Qualificação');
eq(rawLead(noBindingOther.id).property_id, null);
eq(rawLead(noBindingOther.id).followup_at, todayBR());
eq(rawProp(noBinding.code).status, 'Vendido');
// Se uma transação terminou, não aceitar um segundo Ganho no imóvel já vendido.
const prior = rawLead(noBindingOther.id);
await call('PATCH', `/leads/${noBindingOther.id}`, { property: `${noBinding.code} - ${noBinding.title}`, stage: 'Proposta Enviada' });
// A atualização textual não gera associação interna: validar resposta explícita.
eq(rawLead(noBindingOther.id).property_id, null);
await call('POST', `/leads/${noBindingOther.id}/close`, { result: 'Ganho', note: 'Sem vínculo interno.' });
// Testar associação histórica impedida de ganhar uma segunda vez.
const historic = await makeProperty('Segundo Ganho impedido');
const historicA = await makeLead('Primeiro Ganhador', historic, 'Proposta Enviada');
const historicB = await makeLead('Segundo Ganhador', historic, 'Proposta Enviada');
await call('POST', `/leads/${historicA.id}/close`, { result: 'Ganho', note: 'Primeiro fechamento concluído.' });
// O lead B foi desvinculado. Simular vínculo legado ainda pendente de uma
// negociação anterior para provar que a API recusa fechamento duplo.
db.prepare("UPDATE leads SET property_id = ?, stage = 'Proposta Enviada' WHERE id = ?")
  .run(propId(historic.code), leadId(historicB.id));
await call('POST', `/leads/${historicB.id}/close`, { result: 'Ganho', note: 'Não deve fechar duplicado.' }, 409);
eq(rawLead(historicB.id).stage, 'Proposta Enviada');
env.MEDIA_ENV = oldEnvironment;

// Segurança do escopo: production mantém regras anteriores até homologação e promoção.
env.MEDIA_ENV = 'production';
const prodDiagnosis = await call('GET', '/diagnostics/disputes');
eq(prodDiagnosis.disputeRulesEnabled, false, 'Produção explicitamente desativada');
const isolated = await makeProperty('Casa com regra antiga em produção');
const prodWinner = await makeLead('Lead vencedor antigo', isolated, 'Proposta Enviada');
const prodOther = await makeLead('Lead concorrente antigo', isolated, 'Qualificação');
await call('POST', `/leads/${prodWinner.id}/close`, { result: 'Ganho', note: 'Regra antiga isolada.' });
eq(rawProp(isolated.code).status, 'Vendido');
eq(rawLead(prodOther.id).stage, 'Qualificação');
eq(rawLead(prodOther.id).property_id, propId(isolated.code), 'Nova regra não deve rodar em produção');

// Verificações estáticas do front-end: contador ignora Perdido e depois do
// fechamento um reload integral atualiza os concorrentes em todos os quadros.
const html = fs.readFileSync(path.join(root, 'public/app/index.html'), 'utf8');
const inlineScript = html.match(/<script>\s*([\s\S]*?)<\/script>/g)?.at(-1)?.replace(/^<script>/, '').replace(/<\/script>$/, '');
new vm.Script(inlineScript, { filename: 'public/app/index.html' }); checks++;
ok(html.includes("l.closeResult !== 'Perdido' && l.category !== 'Captação'"), 'Badge não contabiliza Perdido');
ok(html.includes("l.closeResult !== 'Perdido' && (l.stage === 'Proposta Enviada'"), 'KPI propostas não contabiliza Perdido');
ok(/async function submitCloseLead[\s\S]*?await loadAll\(\);[\s\S]*?openLeadDetail/.test(html), 'Recarrega todos os leads após fechamento');
eq(db.prepare('PRAGMA foreign_key_check').all().length, 0);
console.log(`PASSOU: ${checks} verificações 4.3.4 (Ganho, Perdido, vínculos, disputa, histórico, hoje, produção isolada, UI).`);
