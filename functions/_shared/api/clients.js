import {HttpError,nowIso,todayBR,clientCode,leadCode,str,normPhone,oneOf,dateOrNull,intIn,CLIENT_MODALITIES,isUnique} from './common.js';
import {ensureClient,openLeadFor,insertLead} from './leads.js';
import {clientOut,CLIENTS_SQL} from './serialization.js';
// ---------- CRC (clientes) ----------
async function createClient(env, b) {
  const name = str(b.name, 'nome', { min: 2, max: 120, required: true });
  const phone = normPhone(b.phone);
  const modality = oneOf(b.modality, CLIENT_MODALITIES, 'modalidade');
  const dup = await env.DB.prepare('SELECT id FROM clients WHERE phone = ? AND deleted_at IS NULL').bind(phone).first();
  if (dup) throw new HttpError(409, 'Já existe um cliente com este telefone no CRC.');
  const isVenda = modality === 'Venda';
  const category = isVenda ? 'Captação' : 'Interessado';
  const { row } = await ensureClient(env, {
    name, phone, modality,
    regions: str(b.regions, 'regiões', { max: 200, required: true }), budget: str(b.budget, 'orçamento', { max: 120 }),
    preferences: str(b.preferences, 'preferências', { max: 1000 }), nextAction: str(b.next_action, 'próxima ação', { max: 300 }),
    lastInteraction: 'Hoje • Cadastro inicial no CRC', source: 'Painel',
  });
  if (b.birthday_month) await env.DB.prepare('UPDATE clients SET birthday_month = 1 WHERE id = ?').bind(row.id).run();
  let leadCreated = false;
  if (!(await openLeadFor(env, phone, modality, category))) {
    await insertLead(env, {
      name, phone, modality, stage: 'Novo Lead', temp: 'Morno', property: '', value: 0, followup: null, clientId: row.id,
      category, source: 'CRC', note: 'Lead criado a partir do cadastro no CRC.',
    });
    leadCreated = true;
  }
  const fresh = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(row.id).first();
  return { ...clientOut(fresh), leadCreated };
}

async function patchClient(env, id, b) {
  const cur = await env.DB.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!cur) throw new HttpError(404, 'Cliente não encontrado.');
  const sets = [], vals = [], leadSets = [], leadVals = [];
  const set = (c, v) => { sets.push(`${c} = ?`); vals.push(v); };
  if (b.name !== undefined) { const n = str(b.name, 'nome', { min: 2, max: 120, required: true }); set('name', n); leadSets.push('name = ?'); leadVals.push(n); }
  if (b.phone !== undefined) { const p = normPhone(b.phone); set('phone', p); leadSets.push('phone = ?'); leadVals.push(p); }
  if (b.modality !== undefined) {
    const m = oneOf(b.modality, CLIENT_MODALITIES, 'modalidade');
    set('modality', m);
  }
  if (b.regions !== undefined) set('regions', str(b.regions, 'regiões', { max: 200, required: true }));
  if (b.budget !== undefined) set('budget', str(b.budget, 'orçamento', { max: 120 }) || 'A definir');
  if (b.preferences !== undefined) set('preferences', str(b.preferences, 'preferências', { max: 1000 }));
  if (b.next_action !== undefined) set('next_action', str(b.next_action, 'próxima ação', { max: 300 }));
  if (b.birthday_month !== undefined) set('birthday_month', b.birthday_month ? 1 : 0);
  if (b.contact_done) {
    set('pending_followup', 0);
    set('last_interaction', 'Hoje • Contato de relacionamento realizado');
    set('last_contact_at', nowIso());
  }
  if (!sets.length) throw new HttpError(400, 'Nada para atualizar.');
  set('updated_at', nowIso());
  const stmts = [env.DB.prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id)];
  if (leadSets.length) stmts.push(env.DB.prepare(`UPDATE leads SET ${leadSets.join(', ')} WHERE client_id = ?`).bind(...leadVals, id));
  try { await env.DB.batch(stmts); }
  catch (e) { if (isUnique(e)) throw new HttpError(409, 'Já existe um cliente com este telefone no CRC.'); throw e; }
  return clientOut(await env.DB.prepare(
    `SELECT c.*, (SELECT MAX(e.created_at) FROM lead_events e JOIN leads l ON l.id = e.lead_id
     WHERE l.client_id = c.id AND e.kind IN ('criado', 'nota')) AS last_lead_contact_at
     FROM clients c WHERE c.id = ?`).bind(id).first());
}


export {createClient,patchClient};
