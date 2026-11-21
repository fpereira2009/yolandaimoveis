import { STAGES, CLIENT_MODALITIES, LEAD_MODALITIES_BY_CATEGORY, TEMPS, CATEGORIES, PURPOSES, PSTATUS, CLOSE_RESULTS, LINK_STAGES, HOLDING_STAGES_SQL, HOLDING_STAGES, TZ, CODE_PREFIX, HttpError, json, nowIso, dayFmt, todayBR, addDays, dmy, followupView, eventDate, leadCode, clientCode, propCode, parseId, str, oneOf, validateLeadModality, intIn, normPhone, money, dateOrNull, isUnique } from './common.js';
import {leadOut,clientOut,CLIENTS_SQL,propOut,propPublic,LEAD_SELECT,LEAD_ORDER,loadLeadRow,loadLead} from './serialization.js';
// ---------- Imóvel associado ao lead: reserva / liberação / venda-locação ----------
const reserveStmt = (env, propId, t) => env.DB.prepare(
  "UPDATE properties SET status = 'Reservado', updated_at = ? WHERE id = ? AND status = 'Disponível' AND deleted_at IS NULL").bind(t, propId);
// Deve ser executado APÓS a atualização do lead no mesmo DB.batch.
// A decisão de liberar é tomada dentro da transação, considerando TODOS os outros
// titulares ativos da reserva, e nunca altera Vendido/Alugado/Inativo.
const releaseStmt = (env, propId, t) => env.DB.prepare(
  `UPDATE properties SET status = 'Disponível', updated_at = ?
   WHERE id = ? AND status = 'Reservado' AND deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM leads o
       WHERE o.property_id = properties.id AND o.deleted_at IS NULL
         AND o.category = 'Interessado' AND o.stage IN ${HOLDING_STAGES_SQL}
     )`).bind(t, propId);
const closeWonStmt = (env, propId, t) => env.DB.prepare(
  `UPDATE properties SET status = CASE purpose WHEN 'Alugar' THEN 'Alugado' ELSE 'Vendido' END, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL AND status IN ('Disponível','Reservado')`).bind(t, propId);
// 4.3.4: fechamento Perdido só libera a reserva quando não há MAIS NENHUM
// interessado ativo associado. A transição normal de etapas continua usando
// releaseStmt (que considera apenas as etapas que efetivamente reservam).
const releaseAfterLossStmt = (env, propId, t) => env.DB.prepare(
  `UPDATE properties SET status = 'Disponível', updated_at = ?
   WHERE id = ? AND status = 'Reservado' AND deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM leads o WHERE o.property_id = properties.id
         AND o.deleted_at IS NULL AND o.category = 'Interessado' AND o.stage != 'Fechado'
     )`).bind(t, propId);
// Registro de auditoria ANTES da requalificação, na mesma transação do fechamento.
const competingLeadEventStmt = (env, propId, winnerId, t) => env.DB.prepare(
  `INSERT INTO lead_events (lead_id, kind, text, created_at)
   SELECT l.id, 'etapa', 'Etapa alterada automaticamente de "' || l.stage || '" para "Qualificação". '
     || 'Imóvel ' || ? || ' desvinculado após fechamento como Ganho do lead ' || ?
     || '. Próximo follow-up: hoje.', ?
   FROM leads l WHERE l.property_id = ? AND l.id != ?
     AND l.deleted_at IS NULL AND l.stage != 'Fechado'`).bind(propCode(propId), leadCode(winnerId), t, propId, winnerId);
// Reseta vínculo interno e texto de imóvel/região; mantém dados pessoais, valor
// e histórico de outros interessados. Aplicar após competirLeadEventStmt.
const requalifyCompetingLeadsStmt = (env, propId, winnerId, t, today) => env.DB.prepare(
  `UPDATE leads SET stage = 'Qualificação', property_id = NULL, property = '',
      external_property = 0, external_property_ref = '', followup_at = ?, updated_at = ?
   WHERE property_id = ? AND id != ? AND deleted_at IS NULL AND stage != 'Fechado'`
).bind(today, t, propId, winnerId);
const eventStmt = (env, leadId, kind, text, t) =>
  env.DB.prepare('INSERT INTO lead_events (lead_id, kind, text, created_at) VALUES (?,?,?,?)').bind(leadId, kind, String(text).slice(0, 1000), t);

// Interpreta o bloco de associação do corpo da requisição (link_mode: none | internal | external).
async function parseLink(env, b, cur, nextStage, nextCategory) {
  if (b.link_mode === undefined) return null;
  const mode = oneOf(b.link_mode, ['none', 'internal', 'external'], 'associação de imóvel');
  if (nextStage === 'Fechado') {
    if (mode === 'none' && cur && !cur.property_id && !cur.external_property) return null;
    throw new HttpError(400, 'Lead fechado: a associação de imóvel não pode ser alterada.');
  }
  if (mode === 'none') return { propertyId: null, external: 0, ref: '', prop: null };
  if (nextCategory === 'Captação') throw new HttpError(400, 'Leads de Captação não podem ser associados a imóveis do portfólio.');
  if (!LINK_STAGES.includes(nextStage)) throw new HttpError(400, 'Etapa inválida para associação de imóvel.');
  if (mode === 'external') {
    return { propertyId: null, external: 1, ref: str(b.external_ref, 'imobiliária parceira / link', { min: 2, max: 300, required: true }), prop: null };
  }
  const prop = await env.DB.prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').bind(parseId(b.property_code, 0, 'YTI')).first();
  if (!prop) throw new HttpError(404, 'Imóvel não encontrado.');
  // 4.3.3: um imóvel Reservado pode receber outros interessados enquanto
  // houver ao menos um lead associado ainda ativo (não Fechado/excluído).
  // Imóveis Vendido/Alugado/Inativo seguem bloqueados para novos vínculos.
  if (prop.id !== (cur && cur.property_id)) {
    let canAssociate = prop.status === 'Disponível';
    if (!canAssociate && prop.status === 'Reservado') {
      const active = await env.DB.prepare(
        `SELECT 1 FROM leads WHERE property_id = ? AND deleted_at IS NULL
           AND category = 'Interessado' AND stage != 'Fechado' LIMIT 1`
      ).bind(prop.id).first();
      canAssociate = !!active;
    }
    if (!canAssociate) throw new HttpError(409,
      `O imóvel ${propCode(prop.id)} não aceita novas associações (status atual: ${prop.status}).`);
  }
  return { propertyId: prop.id, external: 0, ref: '', prop };
}

// ---------- Núcleo da integração lead <-> cliente ----------
async function ensureClient(env, v) {
  const found = await env.DB.prepare('SELECT * FROM clients WHERE phone = ? AND deleted_at IS NULL').bind(v.phone).first();
  if (found) return { row: found, created: false };
  const t = nowIso();
  try {
    const row = await env.DB.prepare('INSERT INTO clients (name, phone, modality, regions, budget, preferences, next_action, birthday_month, pending_followup, last_interaction, source, created_at, updated_at, last_contact_at) VALUES (?,?,?,?,?,?,?,0,1,?,?,?,?,?) RETURNING *')
      .bind(v.name, v.phone, v.modality, v.regions || 'A definir', v.budget || 'A definir', v.preferences || '', v.nextAction || '',
        v.lastInteraction || 'Hoje • Cadastro inicial', v.source, t, t, t).first();
    return { row, created: true };
  } catch (e) {
    if (!isUnique(e)) throw e;
    return { row: await env.DB.prepare('SELECT * FROM clients WHERE phone = ? AND deleted_at IS NULL').bind(v.phone).first(), created: false };
  }
}

async function insertLead(env, v) {
  if (v.category === 'Captação' && (v.propertyId || v.external)) {
    throw new HttpError(400, 'Leads de Captação não podem ter imóvel associado.');
  }
  const t = nowIso();
  const res = await env.DB.batch([
    env.DB.prepare('INSERT INTO leads (name, phone, modality, stage, temp, property, value, followup_at, client_id, source, category, created_at, updated_at, closed_at, property_id, external_property, external_property_ref) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(v.name, v.phone, v.modality, v.stage, v.temp, v.property, v.value, v.followup, v.clientId, v.source, v.category || 'Interessado', t, t, v.stage === 'Fechado' ? t : null,
        v.propertyId ?? null, v.external ? 1 : 0, v.extRef || ''),
    env.DB.prepare('SELECT last_insert_rowid() AS id'),
    env.DB.prepare("INSERT INTO lead_events (lead_id, kind, text, created_at) VALUES (last_insert_rowid(), 'criado', ?, ?)").bind(String(v.note).slice(0, 1000), t),
    ...(v.clientId ? [env.DB.prepare('UPDATE clients SET last_contact_at = ? WHERE id = ?').bind(t, v.clientId)] : []),
    ...(v.reserve && v.propertyId ? [reserveStmt(env, v.propertyId, t)] : []),
  ]);
  return res[1].results[0].id;
}
const openLeadFor = (env, phone, modality, category = 'Interessado') =>
  env.DB.prepare("SELECT id FROM leads WHERE phone = ? AND modality = ? AND category = ? AND stage != 'Fechado' AND deleted_at IS NULL LIMIT 1").bind(phone, modality, category).first();

async function addEvent(env, leadId, kind, text) {
  const t = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(t, leadId),
    env.DB.prepare('INSERT INTO lead_events (lead_id, kind, text, created_at) VALUES (?,?,?,?)').bind(leadId, kind, text.slice(0, 1000), t),
    ...(kind === 'nota' ? [env.DB.prepare(
      'UPDATE clients SET last_contact_at = ? WHERE id = (SELECT client_id FROM leads WHERE id = ?)').bind(t, leadId)] : []),
  ]);
}

// ---------- Leads ----------
async function listLeads(env) {
  const rows = (await env.DB.prepare(`${LEAD_SELECT} WHERE l.deleted_at IS NULL ${LEAD_ORDER}`).all()).results;
  const evs = (await env.DB.prepare('SELECT lead_id, text, created_at FROM lead_events WHERE lead_id IN (SELECT id FROM leads WHERE deleted_at IS NULL) ORDER BY created_at DESC, id DESC').all()).results;
  const by = new Map();
  for (const e of evs) (by.get(e.lead_id) || by.set(e.lead_id, []).get(e.lead_id)).push(e);
  return { items: rows.map((r) => leadOut(r, by.get(r.id) || [])) };
}

async function createLead(env, b) {
  const category = oneOf(b.category || 'Interessado', CATEGORIES, 'categoria');
  const modality = validateLeadModality(category, b.modality);
  const stage = oneOf(b.stage || 'Novo Lead', STAGES, 'etapa');
  if (stage === 'Fechado') throw new HttpError(400, 'Para fechar um lead use a rotina de Fechamento (resultado + observação).');
  const v = {
    name: str(b.name, 'nome', { min: 2, max: 120, required: true }), phone: normPhone(b.phone),
    modality, stage,
    temp: oneOf(b.temp || 'Morno', TEMPS, 'temperatura'), property: str(b.property, 'imóvel', { max: 200 }),
    value: money(b.value ?? 0), followup: dateOrNull(b.followup_at), source: 'Painel',
    category,
    note: str(b.note, 'nota', { max: 1000 }) || 'Lead cadastrado pelo painel.',
  };
  if (!b.force) {
    const dup = await openLeadFor(env, v.phone, v.modality, v.category);
    if (dup) throw new HttpError(409, `Já existe um lead em aberto com este telefone (${leadCode(dup.id)}).`, { duplicateOf: leadCode(dup.id) });
  }
  // Valida a associação ANTES de criar uma ficha de cliente, para não deixar
  // cadastros órfãos se o imóvel informado estiver indisponível.
  const link = await parseLink(env, b, null, v.stage, v.category);
  const { row: client, created } = await ensureClient(env, {
    name: v.name, phone: v.phone, modality: v.modality,
    regions: v.property, source: 'Lead', lastInteraction: 'Hoje • Lead criado no funil',
  });
  v.clientId = client.id;
  if (link && (link.propertyId || link.external)) {
    v.propertyId = link.propertyId; v.external = link.external; v.extRef = link.ref;
    if (link.prop) {
      v.note += ` Imóvel associado: ${propCode(link.prop.id)} - ${link.prop.title}.`;
      if (HOLDING_STAGES.includes(v.stage) && link.prop.status === 'Disponível') {
        v.reserve = true;
        v.note += ` Imóvel reservado automaticamente (${v.stage}).`;
      }
    } else v.note += ` Imóvel de outra imobiliária associado: ${link.ref}.`;
  }
  const id = await insertLead(env, v);
  return { ...(await loadLead(env, id)), clientCreated: created };
}

async function patchLead(env, id, b) {
  const cur = await loadLeadRow(env, id);
  const t = nowIso();
  const sets = [], vals = [], events = [], extra = [], propStmts = [];
  const set = (col, val) => { sets.push(`${col} = ?`); vals.push(val); };
  let nextStage = cur.stage;
  if (b.stage !== undefined && b.stage !== cur.stage) {
    oneOf(b.stage, STAGES, 'etapa');
    if (b.stage === 'Fechado') throw new HttpError(400, 'Para fechar um lead use a rotina de Fechamento (resultado + observação).');
    nextStage = b.stage;
    set('stage', b.stage); set('closed_at', null);
    if (cur.stage === 'Fechado') { set('close_result', null); set('close_note', null); }
    if (b.followup_at === undefined) set('followup_at', addDays(todayBR(), 1));
    events.push(['etapa', `Etapa alterada de "${cur.stage}" para "${b.stage}".`]);
  }
  const nextCategory = b.category !== undefined ? oneOf(b.category, CATEGORIES, 'categoria') : cur.category;
  const nextModality = b.modality !== undefined ? b.modality : cur.modality;
  validateLeadModality(nextCategory, nextModality);

  if (nextModality !== cur.modality) {
    set('modality', nextModality);
    events.push(['modalidade', `Modalidade alterada para "${nextModality}".`]);
  }
  if (b.temp !== undefined && b.temp !== cur.temp) {
    oneOf(b.temp, TEMPS, 'temperatura'); set('temp', b.temp);
    events.push(['temperatura', `Temperatura alterada para "${b.temp}".`]);
  }
  if (nextCategory !== cur.category) {
    set('category', nextCategory);
    events.push(['nota', `Categoria alterada para "${nextCategory}".`]);
  }
  if (b.followup_at !== undefined) {
    const f = dateOrNull(b.followup_at);
    if (f !== cur.followup_at) { set('followup_at', f); events.push(['followup', f ? `Próximo follow-up: ${dmy(f)}.` : 'Follow-up removido.']); }
  }
  if (b.property !== undefined && String(b.property).trim() !== cur.property) {
    set('property', str(b.property, 'imóvel', { max: 200 })); events.push(['nota', 'Imóvel de interesse atualizado.']);
  }
  if (b.value !== undefined) set('value', money(b.value));

  // --- imóvel associado + automação de status do imóvel interno ---
  const link = await parseLink(env, b, cur, nextStage, nextCategory);
  let nextPropId = cur.property_id, nextPropStatus = cur.p_status;
  if (link) {
    nextPropId = link.propertyId; nextPropStatus = link.prop ? link.prop.status : null;
    const sameInternal = link.propertyId === cur.property_id;
    const sameExternal = !!link.external === !!cur.external_property && link.ref === cur.external_property_ref;
    if (!sameInternal) set('property_id', link.propertyId);
    if (!!link.external !== !!cur.external_property) set('external_property', link.external ? 1 : 0);
    if (link.ref !== cur.external_property_ref) set('external_property_ref', link.ref);
    if (!sameInternal || !sameExternal) {
      events.push(['nota', link.prop ? `Imóvel associado: ${propCode(link.prop.id)} - ${link.prop.title}.`
        : link.external ? `Imóvel de outra imobiliária associado: ${link.ref}.` : 'Associação de imóvel removida.']);
    }
  } else if ((nextCategory === 'Captação' || (nextStage !== 'Fechado' && !LINK_STAGES.includes(nextStage))) && (cur.property_id || cur.external_property)) {
    nextPropId = null;
    nextPropStatus = null;
    if (cur.property_id !== null) set('property_id', null);
    if (cur.external_property) set('external_property', 0);
    if (cur.external_property_ref) set('external_property_ref', '');
    events.push(['nota', 'Associação de imóvel removida automaticamente devido à alteração de categoria/etapa.']);
  }

  const wasHolding = HOLDING_STAGES.includes(cur.stage);
  const isHolding = HOLDING_STAGES.includes(nextStage);

  // A liberação ocorre após mudar a associação/etapa, na MESMA transação.
  // Não usamos contagem antecipada: outro lead pode manter o imóvel reservado.
  if (cur.property_id && wasHolding &&
      (cur.property_id !== nextPropId || !isHolding || nextCategory === 'Captação')) {
    propStmts.push(releaseStmt(env, cur.property_id, t));
    events.push(['nota', `Reserva do imóvel ${propCode(cur.property_id)} reavaliada após alteração do lead.`]);
  }

  if (nextCategory === 'Interessado' && nextPropId && isHolding && nextPropStatus === 'Disponível') {
    propStmts.push(reserveStmt(env, nextPropId, t));
    events.push(['nota', `Reserva do imóvel ${propCode(nextPropId)} solicitada automaticamente (${nextStage}).`]);
  }

  const newName = b.name !== undefined ? str(b.name, 'nome', { min: 2, max: 120, required: true }) : cur.name;
  const newPhone = b.phone !== undefined ? normPhone(b.phone) : cur.phone;
  if (newName !== cur.name || newPhone !== cur.phone) {
    if (cur.client_id) {
      if (newPhone !== cur.phone) {
        const dup = await env.DB.prepare('SELECT id FROM clients WHERE phone = ? AND id != ? AND deleted_at IS NULL').bind(newPhone, cur.client_id).first();
        if (dup) throw new HttpError(409, 'Já existe um cliente com este telefone no CRC.');
      }
      extra.push(env.DB.prepare('UPDATE clients SET name = ?, phone = ?, updated_at = ? WHERE id = ?').bind(newName, newPhone, t, cur.client_id));
      extra.push(env.DB.prepare('UPDATE leads SET name = ?, phone = ? WHERE client_id = ? AND id != ?').bind(newName, newPhone, cur.client_id, id));
    }
    set('name', newName); set('phone', newPhone);
  }
  if (!sets.length && !propStmts.length) return loadLead(env, id);
  set('updated_at', t);
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id),
      ...extra,
      ...propStmts,
      ...events.map(([k, txt]) => eventStmt(env, id, k, txt, t)),
    ]);
  } catch (e) { if (isUnique(e)) throw new HttpError(409, 'Já existe um cliente com este telefone no CRC.'); throw e; }
  return loadLead(env, id);
}

async function addNote(env, id, b) {
  const text = str(b.text, 'nota', { min: 1, max: 1000, required: true });
  const cur = await env.DB.prepare('SELECT stage, followup_at, client_id FROM leads WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!cur) throw new HttpError(404, 'Lead não encontrado.');
  const followup = b.followup_at !== undefined ? dateOrNull(b.followup_at)
    : cur.stage === 'Fechado' ? cur.followup_at : addDays(todayBR(), 1);
  const t = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE leads SET updated_at = ?, followup_at = ? WHERE id = ?').bind(t, followup, id),
    env.DB.prepare("INSERT INTO lead_events (lead_id, kind, text, created_at) VALUES (?, 'nota', ?, ?)").bind(id, text, t),
    ...(cur.client_id ? [env.DB.prepare('UPDATE clients SET last_contact_at = ? WHERE id = ?').bind(t, cur.client_id)] : []),
  ]);
  return loadLead(env, id);
}

// Regra comercial unificada: nunca usar MEDIA_ENV para ativar/desativar
// disputa entre leads. O ambiente só seleciona bindings de D1 e R2.

async function closeLead(env, id, b) {
  const cur = await loadLeadRow(env, id);
  if (cur.stage === 'Fechado') throw new HttpError(409, 'Este lead já está fechado.');
  const result = oneOf(b.result, CLOSE_RESULTS, 'resultado');
  const note = str(b.note, 'observação do resultado', { min: 3, max: 800, required: true });
  // Um imóvel definitivamente negociado não pode ser ganho de novo por outro lead.
  if (result === 'Ganho' && cur.property_id &&
      ['Vendido', 'Alugado', 'Inativo'].includes(cur.p_status)) {
    throw new HttpError(409, `O imóvel ${propCode(cur.property_id)} já está ${cur.p_status}. Revise a associação antes de fechar como Ganho.`);
  }
  const t = nowIso();
  const stmts = [env.DB.prepare(
    "UPDATE leads SET stage = 'Fechado', closed_at = ?, close_result = ?, close_note = ?, followup_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND stage != 'Fechado'")
    .bind(t, result, note, t, id)];
  const events = [];
  let rivalsUpdateIndex = -1;
  if (cur.property_id && cur.p_status) {
    const code = propCode(cur.property_id);
    if (result === 'Ganho' && cur.category === 'Interessado' && (cur.p_status === 'Disponível' || cur.p_status === 'Reservado')) {
      const novo = cur.p_purpose === 'Alugar' ? 'Alugado' : 'Vendido';
      // Audita e requalifica os outros leads ativos dentro do MESMO D1.batch.
      // O filtro usa property_id, nunca somente a descrição livre do imóvel.
      stmts.push(competingLeadEventStmt(env, cur.property_id, id, t));
      rivalsUpdateIndex = stmts.length;
      stmts.push(requalifyCompetingLeadsStmt(env, cur.property_id, id, t, todayBR()));
      stmts.push(closeWonStmt(env, cur.property_id, t));
      events.push(['nota', `Imóvel ${code} marcado como ${novo} automaticamente.`]);
    } else if ((result === 'Perdido' || cur.category === 'Captação') && cur.p_status === 'Reservado') {
      // Perdido não altera os demais; só libera se não houver interessado ativo.
      stmts.push(releaseAfterLossStmt(env, cur.property_id, t));
      events.push(['nota', `Reserva do imóvel ${code} reavaliada após fechamento perdido.`]);
    }
  }
  events.push(['etapa', `Lead fechado como ${result === 'Ganho' ? 'Ganho (Convertido)' : 'Perdido (Não Convertido)'}. Observação: ${note}`]);
  stmts.push(...events.map(([k, txt]) => eventStmt(env, id, k, txt, t)));
  const batchResult = await env.DB.batch(stmts);
  const lead = await loadLead(env, id);
  // Evidência objetiva da execução real: no Network do navegador é possível
  // ver quantos concorrentes a transação D1 efetivamente requalificou.
  return {
    ...lead,
    disputeResolution: {
      version: '4.5.2' ,
      enabled: true,
      linkedProperty: cur.property_id ? propCode(cur.property_id) : null,
      competitorsRequalified: rivalsUpdateIndex >= 0
        ? Number(batchResult[rivalsUpdateIndex]?.meta?.changes || 0) : 0,
      outcome: result,
    },
  };
}

async function deleteLead(env, id) {
  const cur = await loadLeadRow(env, id);
  const t = nowIso();
  const stmts = [env.DB.prepare('UPDATE leads SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').bind(t, id)];
  if (cur.property_id && cur.p_status === 'Reservado')
    stmts.push(releaseStmt(env, cur.property_id, t));
  await env.DB.batch(stmts);
  return { ok: true };
}

async function softDelete(env, table, id) {
  if (table !== 'clients') throw new HttpError(400, 'Tabela inválida.');
  const r = await env.DB.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(nowIso(), id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Registro não encontrado.');
  return { ok: true };
}


export {ensureClient,insertLead,openLeadFor,addEvent,listLeads,createLead,patchLead,addNote,closeLead,deleteLead,softDelete};
