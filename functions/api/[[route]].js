import { mediaEnabled, propertyImageMap, propertyImageRows, withGallery, deletePhysicalImages } from '../_shared/property-media.js';
// API (Cloudflare Pages Functions + D1)
//  Pública (site):  GET /api/public/properties · POST /api/public/contact
//  Restrita (CRC):  /api/leads · /api/clients · /api/properties  (exige Cloudflare Access)
const STAGES = ['Novo Lead', 'Qualificação', 'Visita Agendada', 'Proposta Enviada', 'Documentação/Crédito', 'Fechado'];
const CLIENT_MODALITIES = ['Compra', 'Venda', 'Aluguel'];
const LEAD_MODALITIES_BY_CATEGORY = {
  Interessado: ['Compra', 'Aluguel'],
  Captação: ['Venda', 'Aluguel'],
};
const TEMPS = ['Quente', 'Morno', 'Frio'];
const CATEGORIES = ['Interessado', 'Captação'];   // Captação = proprietário que quer anunciar
const PURPOSES = ['Comprar', 'Alugar'];
const PSTATUS = ['Disponível', 'Reservado', 'Vendido', 'Alugado', 'Inativo'];
const CLOSE_RESULTS = ['Ganho', 'Perdido'];
// O imóvel pode ser vinculado desde Novo Lead; só as etapas HOLDING_STAGES reservam.
const LINK_STAGES = ['Novo Lead', 'Qualificação', 'Visita Agendada', 'Proposta Enviada', 'Documentação/Crédito'];
// Etapas em que o lead "segura" e aciona a reserva do imóvel
const HOLDING_STAGES_SQL = "('Proposta Enviada','Documentação/Crédito')";
const HOLDING_STAGES = ['Proposta Enviada', 'Documentação/Crédito'];
const TZ = 'America/Sao_Paulo';
const CODE_PREFIX = 'YTI-';

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

// ---------- Autenticação: valida o JWT do Cloudflare Access ----------
let jwksCache = { at: 0, keys: [] };
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function authenticate(request, env) {
  if (env.DEV_BYPASS === '1') return 'dev@local';
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new HttpError(503, 'Acesso não configurado no servidor.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new HttpError(401, 'Não autenticado.');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new HttpError(401, 'Token inválido.');
  const header = JSON.parse(new TextDecoder().decode(b64u(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64u(p)));
  if (Date.now() - jwksCache.at > 3600_000 || !jwksCache.keys.some((k) => k.kid === header.kid)) {
    const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    if (!r.ok) throw new HttpError(503, 'Falha ao validar acesso.');
    jwksCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'Chave desconhecida.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
  const aud = [].concat(payload.aud || []);
  if (!ok || !aud.includes(env.ACCESS_AUD) || payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || payload.exp * 1000 < Date.now())
    throw new HttpError(401, 'Sessão inválida ou expirada.');
  return payload.email || 'desconhecido';
}

// ---------- Utilidades ----------
const nowIso = () => new Date().toISOString();
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const todayBR = () => dayFmt.format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dmy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

function followupView(at) {
  if (!at) return { status: 'Em dia', label: 'Sem data' };
  const t = todayBR();
  if (at < t) return { status: 'Atrasado', label: 'Atrasado • ' + dmy(at) };
  if (at === t) return { status: 'Hoje', label: 'Hoje' };
  if (at === addDays(t, 1)) return { status: 'Em dia', label: 'Amanhã' };
  return { status: 'Em dia', label: dmy(at) };
}
const eventDate = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' •');

const leadCode = (id) => 'LD-' + (100 + id);
const clientCode = (id) => 'CRC-' + String(id).padStart(2, '0');
const propCode = (id) => CODE_PREFIX + String(id).padStart(4, '0');
const parseId = (code, offset = 0) => {
  const n = parseInt(String(code).replace(/\D/g, ''), 10) - offset;
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Registro não encontrado.');
  return n;
};

function str(v, field, { min = 0, max = 200, required = false } = {}) {
  const s = String(v ?? '').trim();
  if ((required || s) && (s.length < Math.max(min, 1) || s.length > max)) throw new HttpError(400, `Campo "${field}" inválido (${required || min ? 'obrigatório, ' : ''}até ${max} caracteres).`);
  return s;
}
function oneOf(v, list, field) {
  if (!list.includes(v)) throw new HttpError(400, `Valor inválido em "${field}".`);
  return v;
}
function validateLeadModality(category, modality) {
  const allowed = LEAD_MODALITIES_BY_CATEGORY[category];
  if (!allowed || !allowed.includes(modality)) {
    throw new HttpError(400, `Modalidade "${modality}" inválida para a categoria "${category}". Use: ${(allowed || []).join(' ou ')}.`);
  }
  return modality;
}
function intIn(v, field, max) {
  const n = Number(v === '' || v == null ? 0 : v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, `Valor inválido em "${field}".`);
  return Math.round(n);
}
function normPhone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) throw new HttpError(400, 'Telefone inválido. Use DDD + número, ex.: (24) 99999-9999.');
  return '55' + d;
}
const money = (v) => intIn(v, 'valor', 1e9);
function dateOrNull(v) {
  if (v === null || v === '' || v === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + 'T12:00:00Z'))) throw new HttpError(400, 'Data de follow-up inválida.');
  return v;
}
const isUnique = (e) => String(e && e.message).includes('UNIQUE');

// ---------- Serialização (formato que as telas esperam) ----------
function leadOut(r, events) {
  const f = followupView(r.followup_at);
  const closed = r.stage === 'Fechado';
  return {
    id: leadCode(r.id), name: r.name, phone: r.phone, modality: r.modality, stage: r.stage, temp: r.temp,
    property: r.property, value: r.value, followupAt: r.followup_at, source: r.source, category: r.category,
    clientId: r.client_id ? clientCode(r.client_id) : null,
    propertyId: r.property_id ? propCode(r.property_id) : null,          // imóvel do portfólio interno
    propertyTitle: r.p_title || null, propertyStatus: r.p_status || null, propertyPurpose: r.p_purpose || null,
    externalProperty: !!r.external_property, externalPropertyRef: r.external_property_ref || '',   // imóvel de outra imobiliária
    closeResult: r.close_result || null, closeNote: r.close_note || '', closedAt: r.closed_at || null,
    followupStatus: closed ? 'Em dia' : f.status, followupDate: closed ? 'Concluído' : f.label,
    history: events.map((e) => ({ date: eventDate(e.created_at), text: e.text })),
  };
}
const clientOut = (r) => ({
  id: clientCode(r.id), name: r.name, phone: r.phone, modality: r.modality, regions: r.regions,
  budget: r.budget, preferences: r.preferences, lastInteraction: r.last_interaction, nextAction: r.next_action,
  pendingFollowup: !!r.pending_followup, birthdayMonth: !!r.birthday_month, source: r.source,
  createdAt: r.created_at, updatedAt: r.updated_at,
  lastContactAt: [r.last_contact_at, r.last_lead_contact_at].filter(Boolean).sort().at(-1) || r.created_at,
});
// CRC: ordena pelo follow-up em aberto mais antigo dos leads do cliente; sem follow-up por último
const CLIENTS_SQL = `SELECT c.*,
  (SELECT MIN(l.followup_at) FROM leads l WHERE l.client_id = c.id AND l.deleted_at IS NULL AND l.stage != 'Fechado' AND l.followup_at IS NOT NULL) AS next_followup,
  (SELECT MAX(e.created_at) FROM lead_events e JOIN leads l ON l.id = e.lead_id
   WHERE l.client_id = c.id AND e.kind IN ('criado', 'nota')) AS last_lead_contact_at
  FROM clients c WHERE c.deleted_at IS NULL ORDER BY next_followup IS NULL ASC, next_followup ASC, c.updated_at DESC`;
const propOut = (r, images = [], env) => withGallery({
  id: propCode(r.id), code: propCode(r.id), title: r.title, purpose: r.purpose, type: r.type, neighborhood: r.neighborhood,
  city: r.city, price: r.price, area_m2: r.area_m2, bedrooms: r.bedrooms, bathrooms: r.bathrooms, parking: r.parking,
  photo_url: r.photo_url, ...(env?.MEDIA_ENV === 'preview' ? {} : { legacy_photo_url: r.photo_url }), badge: r.badge, status: r.status, description: r.description,
}, images, env);
const propPublic = (r, images = [], env) => withGallery({   // mesmo formato que o site já usava ao ler a planilha
  codigo: propCode(r.id), titulo: r.title, finalidade: r.purpose, tipo: r.type, bairro: r.neighborhood, cidade: r.city,
  valor: r.price, area_m2: r.area_m2, quartos: r.bedrooms, banheiros: r.bathrooms, vagas: r.parking,
  foto_url: r.photo_url, destaque: r.badge, status: r.status,
  descricao: r.description || 'Imóvel selecionado por Iêda Holanda. Entre em contato para mais informações.',
}, images, env);

// Lead + dados do imóvel interno associado (LEFT JOIN: leads sem imóvel continuam aparecendo)
const LEAD_SELECT = `SELECT l.*, p.title AS p_title, p.status AS p_status, p.purpose AS p_purpose
  FROM leads l LEFT JOIN properties p ON p.id = l.property_id AND p.deleted_at IS NULL`;
// Follow-up mais antigo/atrasado primeiro; sem data por último
const LEAD_ORDER = 'ORDER BY l.followup_at IS NULL ASC, l.followup_at ASC, l.updated_at DESC';

async function loadLeadRow(env, id) {
  const row = await env.DB.prepare(`${LEAD_SELECT} WHERE l.id = ? AND l.deleted_at IS NULL`).bind(id).first();
  if (!row) throw new HttpError(404, 'Lead não encontrado.');
  return row;
}

async function loadLead(env, id) {
  const row = await loadLeadRow(env, id);
  const ev = await env.DB.prepare('SELECT text, created_at FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC, id DESC').bind(id).all();
  return leadOut(row, ev.results);
}

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
  const prop = await env.DB.prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').bind(parseId(b.property_code)).first();
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

// A v4.3.4 era condicionada a MEDIA_ENV === 'preview'. Em Pages Preview o
// binding pode não ter sido sincronizado com o dashboard, e a regra era
// silenciosamente ignorada. O ambiente production permanece explicitamente
// isolado. Uma ausência de MEDIA_ENV é tratada como preview neste pacote
// de homologação (NÃO publicar em produção sem confirmar a variável production).
const disputeRulesEnabled = (env) => String(env.MEDIA_ENV || '').trim().toLowerCase() !== 'production';

async function closeLead(env, id, b) {
  const cur = await loadLeadRow(env, id);
  if (cur.stage === 'Fechado') throw new HttpError(409, 'Este lead já está fechado.');
  const result = oneOf(b.result, CLOSE_RESULTS, 'resultado');
  const note = str(b.note, 'observação do resultado', { min: 3, max: 800, required: true });
  const rulesEnabled = disputeRulesEnabled(env);
  // Um imóvel definitivamente negociado não pode ser ganho de novo por outro lead.
  if (rulesEnabled && result === 'Ganho' && cur.property_id &&
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
      if (rulesEnabled) {
        stmts.push(competingLeadEventStmt(env, cur.property_id, id, t));
        rivalsUpdateIndex = stmts.length;
        stmts.push(requalifyCompetingLeadsStmt(env, cur.property_id, id, t, todayBR()));
      }
      stmts.push(closeWonStmt(env, cur.property_id, t));
      events.push(['nota', `Imóvel ${code} marcado como ${novo} automaticamente.`]);
    } else if ((result === 'Perdido' || cur.category === 'Captação') && cur.p_status === 'Reservado') {
      // Perdido não altera os demais; só libera se nenhum interessado ativo
      // continuar associado. Regras antigas ficam restritas à produção.
      stmts.push(rulesEnabled
        ? releaseAfterLossStmt(env, cur.property_id, t)
        : releaseStmt(env, cur.property_id, t));
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
      version: '4.3.4-revisao-1',
      enabled: rulesEnabled,
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
  const r = await env.DB.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(nowIso(), id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Registro não encontrado.');
  return { ok: true };
}

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

// ---------- Imóveis ----------
async function resolveImage(url) {
  try {
    if (new URL(url).hostname === 'ibb.co') {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
      const m = (await r.text()).match(/<meta property="og:image" content="([^"]+)"/i);
      if (m && /^https:\/\//.test(m[1])) return m[1];
    }
  } catch (e) { /* mantém o link original */ }
  return url;
}
async function photoField(v, resolve = true) {
  const u = String(v ?? '').trim();
  if (!u) return '';
  if (!/^https:\/\/[^\s]+$/i.test(u) || u.length > 500) throw new HttpError(400, 'URL da foto inválida (use um link https de até 500 caracteres).');
  return resolve ? resolveImage(u) : u;
}
const PROP_FIELDS = {
  title: (v) => str(v, 'título', { min: 3, max: 150, required: true }),
  purpose: (v) => oneOf(v, PURPOSES, 'finalidade'),
  type: (v) => str(v, 'tipo', { max: 40 }) || 'Casa',
  neighborhood: (v) => str(v, 'bairro', { max: 80, required: true }),
  city: (v) => str(v, 'cidade', { max: 80 }) || 'Resende - RJ',
  price: (v) => money(v), area_m2: (v) => intIn(v, 'área', 1e7),
  bedrooms: (v) => intIn(v, 'quartos', 99), bathrooms: (v) => intIn(v, 'banheiros', 99), parking: (v) => intIn(v, 'vagas', 99),
  badge: (v) => str(v, 'destaque', { max: 40 }), status: (v) => oneOf(v, PSTATUS, 'status'),
  description: (v) => str(v, 'descrição', { max: 2000 }),
};
async function propValues(b, { resolvePhoto = true, defaults = false, r2Only = false } = {}) {
  const out = {};
  const src = defaults ? { type: 'Casa', city: 'Resende - RJ', status: 'Disponível', purpose: 'Comprar', ...b } : b;
  for (const [k, fn] of Object.entries(PROP_FIELDS)) if (src[k] !== undefined) out[k] = fn(src[k]);
  if (r2Only && src.photo_url !== undefined && String(src.photo_url || '').trim()) throw new HttpError(400, 'Fotos por URL não são aceitas no preview. Utilize o upload R2.');
  if (!r2Only && src.photo_url !== undefined) out.photo_url = await photoField(src.photo_url, resolvePhoto);
  if (defaults && (!out.title || !out.neighborhood)) { PROP_FIELDS.title(src.title); PROP_FIELDS.neighborhood(src.neighborhood); }
  return out;
}
async function insertProperty(env, vals) {
  const t = nowIso(); const cols = Object.keys(vals);
  const row = await env.DB.prepare(`INSERT INTO properties (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?) RETURNING *`)
    .bind(...cols.map((c) => vals[c]), t, t).first();
  return propOut(row, [], env);
}
async function patchProperty(env, id, b) {
  const vals = await propValues(b, { r2Only: env?.MEDIA_ENV === 'preview' });
  // Impede a liberação MANUAL de uma reserva que outro lead ainda mantém.
  // Vendido/Alugado não são revertidos automaticamente; a reversão desses
  // estados finais permanece uma decisão manual do corretor.
  if (vals.status === 'Disponível') {
    const row = await env.DB.prepare('SELECT status FROM properties WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (row?.status === 'Reservado') {
      const holder = await env.DB.prepare(
        `SELECT 1 FROM leads WHERE property_id = ? AND deleted_at IS NULL
         AND category = 'Interessado' AND stage IN ${HOLDING_STAGES_SQL} LIMIT 1`).bind(id).first();
      if (holder) throw new HttpError(409, 'Este imóvel ainda tem leads ativos em negociação. Libere a reserva pelo funil.');
    }
  }
  const cols = Object.keys(vals);
  if (!cols.length) throw new HttpError(400, 'Nada para atualizar.');
  const row = await env.DB.prepare(`UPDATE properties SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING *`)
    .bind(...cols.map((c) => vals[c]), nowIso(), id).first();
  if (!row) throw new HttpError(404, 'Imóvel não encontrado.');
  return propOut(row, await propertyImageRows(env, id), env);
}
// Exclusão lógica primeiro impede uploads concorrentes e retira imediatamente o imóvel
// da vitrine. Exclui em seguida os objetos R2 e os metadados D1; DELETE é idempotente
// para permitir limpeza manual em caso de falha transitória do R2 (sem 2PC entre serviços).
async function deletePropertyWithMedia(env, id) {
  if (!mediaEnabled(env)) return softDelete(env, 'properties', id);
  const row = await env.DB.prepare('SELECT id, deleted_at FROM properties WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Imóvel não encontrado.');
  if (!row.deleted_at) {
    await env.DB.prepare('UPDATE properties SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .bind(nowIso(), nowIso(), id).run();
  }
  const images = await propertyImageRows(env, id);
  try { await deletePhysicalImages(env, images); }
  catch (e) {
    console.error('R2: limpeza pendente para imóvel ' + id, e);
    throw new HttpError(503, 'Imóvel removido do catálogo, mas a limpeza de imagens falhou. Repita a exclusão para concluir.');
  }
  await env.DB.prepare('DELETE FROM property_images WHERE property_id = ?').bind(id).run();
  return { ok: true, imagesRemoved: images.length };
}

async function importProperties(env, b) {
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 200) : [];
  const created = [], skipped = [];
  for (let i = 0; i < rows.length; i++) {
    try { created.push(await insertProperty(env, await propValues(rows[i], { resolvePhoto: false, defaults: true, r2Only: env?.MEDIA_ENV === 'preview' }))); }
    catch (e) { skipped.push({ row: i + 1, error: e.message }); }
  }
  return { created: created.length, skipped };
}

// ---------- Público (site) ----------
async function publicProperties(env) {
  const rows = (await env.DB.prepare("SELECT * FROM properties WHERE deleted_at IS NULL AND status IN ('Disponível','Reservado') ORDER BY id DESC").all()).results;
  const galleries = await propertyImageMap(env);
  return json({ items: rows.map(r => propPublic(r, galleries.get(r.id) || [], env)) }, 200, { 'Cache-Control': 'public, max-age=60' });
}

async function publicContact(env, b) {
  if (b.website) return json({ ok: true });
  const recent = await env.DB.prepare("SELECT count(*) AS n FROM leads WHERE source = 'Site' AND created_at > ?").bind(new Date(Date.now() - 3600_000).toISOString()).first();
  if (recent.n >= 40) throw new HttpError(429, 'Muitas solicitações. Tente novamente em instantes.');
  const name = str(b.name, 'nome', { min: 2, max: 120, required: true });
  const phone = normPhone(b.phone);
  const msg = str(b.message, 'mensagem', { max: 600 });
  let v;
  if (b.kind === 'proprietario') {
    const purpose = oneOf(b.purpose, ['Venda', 'Locação', 'Venda ou Locação'], 'finalidade');
    const what = str(b.what, 'imóvel', { min: 2, max: 200, required: true });
    v = { category: 'Captação', modality: purpose === 'Locação' ? 'Aluguel' : 'Venda', clientModality: purpose === 'Locação' ? 'Aluguel' : 'Venda', regions: what, property: what, value: 0, temp: 'Morno',
      note: `Contato pelo site (anunciar imóvel — ${purpose}): ${what}.${msg ? ' Detalhes: ' + msg : ''}` };
  } else {
    const code = String(b.property_code || '').trim();
    const p = code ? await env.DB.prepare("SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL").bind(parseId(code)).first() : null;
    if (!p) throw new HttpError(400, 'Imóvel não encontrado.');
    const m = p.purpose === 'Alugar' ? 'Aluguel' : 'Compra';
    v = { category: 'Interessado', modality: m, clientModality: m,
      regions: p.neighborhood, property: `${propCode(p.id)} - ${p.title}`.slice(0, 200), value: p.price, temp: 'Quente',
      // Contato de imóvel disponível já entra vinculado; a reserva só virá
      // quando o corretor avançar o lead para Proposta ou Documentação.
      propertyId: p.status === 'Disponível' ? p.id : null,
      note: `Interesse pelo site em ${propCode(p.id)} - ${p.title}.${msg ? ' Mensagem: ' + msg : ''}` };
  }
  const { row: client } = await ensureClient(env, { name, phone, modality: v.clientModality, regions: v.regions, source: 'Site', lastInteraction: 'Hoje • Contato pelo site' });
  const open = await openLeadFor(env, phone, v.modality, v.category);
  if (open) await addEvent(env, open.id, 'nota', 'Novo contato pelo site. ' + v.note);
  else await insertLead(env, { name, phone, modality: v.modality, stage: 'Novo Lead', temp: v.temp, property: v.property, value: v.value, followup: todayBR(), clientId: client.id, source: 'Site', category: v.category, propertyId: v.propertyId ?? null, note: v.note });
  return json({ ok: true }, 201);
}

// ---------- Exportação (CSV com ; e BOM: abre direto no Excel em português) ----------
function csvEsc(v) {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'number') return String(v);
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}
const toCsv = (headers, rows) => '\uFEFF' + [headers, ...rows].map((r) => r.map(csvEsc).join(';')).join('\r\n') + '\r\n';

async function exportCsv(env, base) {
  const q = (sql) => env.DB.prepare(sql).all().then((r) => r.results);
  let headers, rows;
  if (base === 'leads') {
    headers = ['codigo', 'nome', 'telefone', 'categoria', 'modalidade', 'etapa', 'temperatura', 'imovel_interesse', 'valor', 'proximo_followup', 'origem', 'codigo_cliente', 'criado_em', 'atualizado_em', 'fechado_em', 'excluido_em', 'imovel_codigo', 'imovel_externo', 'imovel_externo_ref', 'resultado_fechamento', 'obs_fechamento'];
    rows = (await q('SELECT * FROM leads ORDER BY id')).map((r) => [leadCode(r.id), r.name, r.phone, r.category, r.modality, r.stage, r.temp, r.property, r.value, r.followup_at, r.source, r.client_id ? clientCode(r.client_id) : '', r.created_at, r.updated_at, r.closed_at, r.deleted_at,
      r.property_id ? propCode(r.property_id) : '', r.external_property ? 'Sim' : 'Não', r.external_property_ref, r.close_result, r.close_note]);
  } else if (base === 'clientes') {
    headers = ['codigo', 'nome', 'telefone', 'modalidade', 'regioes_interesse', 'faixa_orcamento', 'preferencias', 'ultima_interacao', 'proxima_acao', 'aniversariante_do_mes', 'follow_up_pendente', 'origem', 'criado_em', 'atualizado_em', 'excluido_em'];
    rows = (await q('SELECT * FROM clients ORDER BY id')).map((r) => [clientCode(r.id), r.name, r.phone, r.modality, r.regions, r.budget, r.preferences, r.last_interaction, r.next_action, r.birthday_month ? 'Sim' : 'Não', r.pending_followup ? 'Sim' : 'Não', r.source, r.created_at, r.updated_at, r.deleted_at]);
  } else if (base === 'imoveis') {
    headers = ['codigo', 'titulo', 'finalidade', 'tipo', 'bairro', 'cidade', 'valor', 'area_m2', 'quartos', 'banheiros', 'vagas', 'foto_url', 'destaque', 'status', 'descricao', 'criado_em', 'atualizado_em', 'excluido_em'];
    rows = (await q('SELECT * FROM properties ORDER BY id')).map((r) => [propCode(r.id), r.title, r.purpose, r.type, r.neighborhood, r.city, r.price, r.area_m2, r.bedrooms, r.bathrooms, r.parking, r.photo_url, r.badge, r.status, r.description, r.created_at, r.updated_at, r.deleted_at]);
  } else if (base === 'historico') {
    headers = ['codigo_lead', 'tipo', 'texto', 'data'];
    rows = (await q('SELECT * FROM lead_events ORDER BY lead_id, created_at, id')).map((r) => [leadCode(r.lead_id), r.kind, r.text, r.created_at]);
  } else throw new HttpError(404, 'Base desconhecida.');
  return new Response(toCsv(headers, rows), { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="yolanda_${base}_${todayBR()}.csv"`,
  } });
}

// ---------- Roteador ----------
export async function onRequest({ request, env, params }) {
  let authed = false;
  try {
    const method = request.method;
    const parts = [].concat(params.route || []);
    if (method !== 'GET') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Origem não permitida.');
      if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw new HttpError(415, 'Use application/json.');
    }
    const body = method === 'GET' || method === 'DELETE' ? {} : await request.json().catch(() => { throw new HttpError(400, 'JSON inválido.'); });

    if (parts[0] === 'public') {
      if (parts[1] === 'properties' && method === 'GET') return await publicProperties(env);
      if (parts[1] === 'contact' && method === 'POST') return await publicContact(env, body);
      throw new HttpError(404, 'Rota não encontrada.');
    }

    await authenticate(request, env);
    authed = true;
    const [res, id, sub] = parts;
    // Diagnóstico autenticado: confira que a API publicada contém a revisão
    // da regra de disputa e que MEDIA_ENV não herdou 'production' no Preview.
    if (res === 'diagnostics' && id === 'disputes' && !sub && method === 'GET') {
      return json({
        apiVersion: '4.3.4-revisao-1',
        mediaEnv: env.MEDIA_ENV || null,
        disputeRulesEnabled: disputeRulesEnabled(env),
        dbBindingAvailable: Boolean(env.DB),
      });
    }
    if (res === 'export' && method === 'GET' && id) return await exportCsv(env, id.replace(/\.csv$/, ''));
    if (res === 'leads') {
      if (!id) { if (method === 'GET') return json(await listLeads(env)); if (method === 'POST') return json(await createLead(env, body), 201); }
      else if (!sub) {
        if (method === 'PATCH') return json(await patchLead(env, parseId(id, 100), body));
        if (method === 'DELETE') return json(await deleteLead(env, parseId(id, 100)));
      } else if (sub === 'notes' && method === 'POST') return json(await addNote(env, parseId(id, 100), body), 201);
      else if (sub === 'close' && method === 'POST') return json(await closeLead(env, parseId(id, 100), body));
    }
    if (res === 'clients') {
      if (!id) {
        if (method === 'GET') return json({ items: (await env.DB.prepare(CLIENTS_SQL).all()).results.map(clientOut) });
        if (method === 'POST') return json(await createClient(env, body), 201);
      } else if (!sub) {
        if (method === 'PATCH') return json(await patchClient(env, parseId(id), body));
        if (method === 'DELETE') return json(await softDelete(env, 'clients', parseId(id)));
      }
    }
    if (res === 'properties') {
      if (!id) {
        if (method === 'GET') {
          const rows = (await env.DB.prepare('SELECT * FROM properties WHERE deleted_at IS NULL ORDER BY id DESC').all()).results;
          const galleries = await propertyImageMap(env);
          return json({ items: rows.map(r => propOut(r, galleries.get(r.id) || [], env)) });
        }
        if (method === 'POST') return json(await insertProperty(env, await propValues(body, { defaults: true, r2Only: env?.MEDIA_ENV === 'preview' })), 201);
      } else if (id === 'import' && method === 'POST') return json(await importProperties(env, body));
      else if (!sub) {
        if (method === 'PATCH') return json(await patchProperty(env, parseId(id), body));
        if (method === 'DELETE') return json(await deletePropertyWithMedia(env, parseId(id)));
      }
    }
    throw new HttpError(404, 'Rota não encontrada.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    if (isUnique(e)) return json({ error: 'Registro duplicado.' }, 409);
    console.error(e);
    return json({ error: authed ? 'Erro interno: ' + String((e && e.message) || e).slice(0, 300) : 'Erro interno.' }, 500);
  }
}
