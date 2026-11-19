/**
 * API do Funil & CRC — Yolanda Transações Imobiliárias
 * Todas as rotas /api/public/* são abertas (com validação e rate-limit);
 * todas as demais /api/* exigem JWT válido do Cloudflare Access (validado no _middleware.js).
 */

const STAGES = ['Novo Contato', 'Em Atendimento', 'Visita Agendada', 'Proposta / Negociação', 'Fechado / Ganho', 'Perdido'];
const MODALITIES = ['Compra', 'Aluguel', 'Venda'];
const MODALITIES_BY_CATEGORY = {
  Interessado: ['Compra', 'Aluguel'],
  'Captação': ['Venda', 'Aluguel'],
};
const PROP_PURPOSES = ['Comprar', 'Alugar'];
const PROP_STATUS = ['Disponível', 'Reservado', 'Vendido', 'Alugado', 'Inativo'];
const CLIENT_PROFILES = ['Comprador', 'Locatário', 'Proprietário', 'Investidor'];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function nowISO() {
  return new Date().toISOString();
}

function todayBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function tomorrowBR() {
  return new Date(Date.now() - 3 * 3600 * 1000 + 86400 * 1000).toISOString().slice(0, 10);
}

function cleanStr(v, max = 500) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function cleanPhone(v) {
  const digits = String(v == null ? '' : v).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return digits.startsWith('55') ? digits : '55' + digits;
}

function validateCategoryModality(category, modality) {
  const allowed = MODALITIES_BY_CATEGORY[category];
  if (!allowed) return 'Categoria inválida.';
  if (!allowed.includes(modality)) {
    return category === 'Captação'
      ? 'Para Captação, a modalidade deve ser Venda ou Aluguel.'
      : 'Para Interessado, a modalidade deve ser Compra ou Aluguel.';
  }
  return null;
}

async function readJson(request, maxBytes = 65536) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'Payload muito grande.');
  const raw = await request.text();
  if (raw.length > maxBytes) throw new HttpError(413, 'Payload muito grande.');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function rateLimit(env, key, maxHits, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').bind(key).first();
  if (!row || row.reset_at <= now) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)')
      .bind(key, now + windowSec).run();
    return true;
  }
  if (row.count >= maxHits) return false;
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}

function propPublic(row) {
  return {
    codigo: row.code,
    finalidade: row.purpose,
    tipo: row.type,
    titulo: row.title,
    bairro: row.neighborhood,
    cidade: row.city,
    valor: row.price,
    area_m2: row.area_m2,
    quartos: row.bedrooms,
    banheiros: row.bathrooms,
    vagas: row.parking,
    destaque: row.highlight,
    foto_url: row.photo_url,
    descricao: row.description,
    status: row.status,
  };
}

// ==================== ENDPOINTS PÚBLICOS ====================

async function publicProperties(env) {
  const rows = (await env.DB.prepare("SELECT * FROM properties WHERE deleted_at IS NULL AND status IN ('Disponível','Reservado') ORDER BY id DESC").all()).results;
  const neighborhoods = (await env.DB.prepare("SELECT DISTINCT TRIM(neighborhood) AS neighborhood FROM properties WHERE deleted_at IS NULL AND status = 'Disponível' AND TRIM(neighborhood) != '' ORDER BY neighborhood COLLATE NOCASE ASC").all()).results
    .map((r) => r.neighborhood);
  return json({ items: rows.map(propPublic), neighborhoods }, 200, { 'Cache-Control': 'public, max-age=60' });
}

async function publicContact(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await rateLimit(env, 'contact:' + ip, 8, 600))) {
    return json({ error: 'Muitas solicitações. Tente novamente em alguns minutos.' }, 429);
  }
  const body = await readJson(request, 8192);
  if (cleanStr(body.website, 50)) return json({ ok: true });

  const kind = cleanStr(body.kind, 30);
  const name = cleanStr(body.name, 120);
  const phone = cleanPhone(body.phone);
  if (name.length < 2) return json({ error: 'Informe seu nome.' }, 400);
  if (!phone) return json({ error: 'Informe um WhatsApp válido com DDD.' }, 400);

  const now = nowISO();
  const isOwner = kind === 'proprietario';
  const category = isOwner ? 'Captação' : 'Interessado';
  const rawPurpose = cleanStr(body.purpose, 40);
  const modality = isOwner
    ? (rawPurpose.includes('Locação') && !rawPurpose.includes('Venda') ? 'Aluguel' : 'Venda')
    : (rawPurpose === 'Alugar' ? 'Aluguel' : 'Compra');
  const code = cleanStr(body.property_code, 30);
  let propLabel = cleanStr(body.what, 180) || 'Imóvel em Resende e Região';
  let value = 0;

  if (code) {
    const prop = await env.DB.prepare('SELECT code, title, neighborhood, price, purpose FROM properties WHERE code = ? AND deleted_at IS NULL').bind(code).first();
    if (prop) {
      propLabel = `${prop.code} - ${prop.title} (${prop.neighborhood})`;
      value = prop.price;
    }
  }

  const noteText = isOwner
    ? `Captação pelo site (${cleanStr(body.purpose, 40)}): ${propLabel}. ${cleanStr(body.message, 600)}`.trim()
    : `Interesse registrado pelo site${code ? ' no imóvel ' + code : ''}. ${cleanStr(body.message, 600)}`.trim();

  const leadId = 'lead-' + crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO leads (id, name, phone, source, category, modality, stage, property, value, followup_date, created_at, updated_at)
      VALUES (?, ?, ?, 'Site Yolanda', ?, ?, 'Novo Contato', ?, ?, ?, ?, ?)`).bind(
      leadId, name, phone, category, modality, propLabel, value, todayBR(), now, now
    ),
    env.DB.prepare('INSERT INTO lead_notes (lead_id, text, created_at) VALUES (?, ?, ?)').bind(leadId, noteText, now),
    env.DB.prepare(`INSERT INTO clients (id, name, phone, profile, modality, regions, budget, notes, last_contact, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'A definir', ?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET updated_at = excluded.updated_at, last_contact = excluded.last_contact`).bind(
      'cli-' + crypto.randomUUID(), name, phone, isOwner ? 'Proprietário' : (modality === 'Aluguel' ? 'Locatário' : 'Comprador'),
      modality, propLabel, noteText, todayBR(), now, now
    ),
  ]);

  return json({ ok: true, id: leadId }, 201);
}

// ==================== ENDPOINTS AUTENTICADOS (CRC) ====================

async function listLeads(env) {
  const leads = (await env.DB.prepare('SELECT * FROM leads WHERE deleted_at IS NULL ORDER BY updated_at DESC').all()).results;
  const notes = (await env.DB.prepare('SELECT id, lead_id, text, created_at FROM lead_notes ORDER BY id DESC').all()).results;
  const byLead = new Map();
  for (const n of notes) {
    if (!byLead.has(n.lead_id)) byLead.set(n.lead_id, []);
    byLead.get(n.lead_id).push({ id: n.id, date: n.created_at.slice(0, 10), text: n.text });
  }
  return json({ items: leads.map((l) => ({ ...l, notes: byLead.get(l.id) || [] })) });
}

async function createLead(request, env) {
  const b = await readJson(request);
  const name = cleanStr(b.name, 120);
  const phone = cleanPhone(b.phone);
  if (name.length < 2) throw new HttpError(400, 'Nome obrigatório.');
  if (!phone) throw new HttpError(400, 'WhatsApp inválido.');

  const category = b.category === 'Captação' ? 'Captação' : 'Interessado';
  const defaultModality = category === 'Captação' ? 'Venda' : 'Compra';
  const modality = b.modality ? cleanStr(b.modality, 20) : defaultModality;
  const catModErr = validateCategoryModality(category, modality);
  if (catModErr) throw new HttpError(400, catModErr);

  const stage = STAGES.includes(b.stage) ? b.stage : 'Novo Contato';
  const source = cleanStr(b.source, 60) || 'WhatsApp Direto';
  const property = cleanStr(b.property, 200) || 'A definir';
  const value = Math.max(0, Math.round(Number(b.value) || 0));
  const followup = /^\d{4}-\d{2}-\d{2}$/.test(b.followup_date || '') ? b.followup_date : tomorrowBR();
  const note = cleanStr(b.note, 1000) || 'Lead cadastrado no funil.';
  const now = nowISO();
  const id = 'lead-' + crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO leads (id, name, phone, source, category, modality, stage, property, value, followup_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, name, phone, source, category, modality, stage, property, value, followup, now, now
    ),
    env.DB.prepare('INSERT INTO lead_notes (lead_id, text, created_at) VALUES (?, ?, ?)').bind(id, note, now),
    env.DB.prepare(`INSERT INTO clients (id, name, phone, profile, modality, regions, budget, notes, last_contact, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET updated_at = excluded.updated_at`).bind(
      'cli-' + crypto.randomUUID(), name, phone,
      category === 'Captação' ? 'Proprietário' : (modality === 'Aluguel' ? 'Locatário' : 'Comprador'),
      modality, property, value ? 'R$ ' + value.toLocaleString('pt-BR') : 'A definir', note, todayBR(), now, now
    ),
  ]);
  return json({ ok: true, id }, 201);
}

async function patchLead(id, request, env) {
  const existing = await env.DB.prepare('SELECT id, category, modality FROM leads WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!existing) throw new HttpError(404, 'Lead não encontrado.');
  const b = await readJson(request);
  const fields = [];
  const vals = [];

  const targetCategory = b.category !== undefined ? (b.category === 'Captação' ? 'Captação' : 'Interessado') : (existing.category || 'Interessado');
  let targetModality = b.modality !== undefined ? cleanStr(b.modality, 20) : existing.modality;

  if (b.category !== undefined && b.modality === undefined) {
    const allowed = MODALITIES_BY_CATEGORY[targetCategory] || ['Compra', 'Aluguel'];
    if (!allowed.includes(targetModality)) {
      targetModality = allowed[0];
    }
  }

  const catModErr = validateCategoryModality(targetCategory, targetModality);
  if (catModErr) throw new HttpError(400, catModErr);

  if (b.name !== undefined) { const v = cleanStr(b.name, 120); if (v.length < 2) throw new HttpError(400, 'Nome inválido.'); fields.push('name = ?'); vals.push(v); }
  if (b.phone !== undefined) { const v = cleanPhone(b.phone); if (!v) throw new HttpError(400, 'Telefone inválido.'); fields.push('phone = ?'); vals.push(v); }
  if (b.source !== undefined) { fields.push('source = ?'); vals.push(cleanStr(b.source, 60)); }
  if (b.category !== undefined) { fields.push('category = ?'); vals.push(targetCategory); }
  if (b.modality !== undefined || targetModality !== existing.modality) {
    fields.push('modality = ?');
    vals.push(targetModality);
  }
  if (b.stage !== undefined) { if (!STAGES.includes(b.stage)) throw new HttpError(400, 'Estágio inválido.'); fields.push('stage = ?'); vals.push(b.stage); }
  if (b.property !== undefined) { fields.push('property = ?'); vals.push(cleanStr(b.property, 200)); }
  if (b.value !== undefined) { fields.push('value = ?'); vals.push(Math.max(0, Math.round(Number(b.value) || 0))); }
  if (b.followup_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.followup_date)) throw new HttpError(400, 'Data inválida.');
    fields.push('followup_date = ?'); vals.push(b.followup_date);
  }
  if (!fields.length) return json({ ok: true });
  fields.push('updated_at = ?'); vals.push(nowISO(), id);
  await env.DB.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

async function addLeadNote(id, request, env) {
  const existing = await env.DB.prepare('SELECT id FROM leads WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!existing) throw new HttpError(404, 'Lead não encontrado.');
  const b = await readJson(request);
  const text = cleanStr(b.text, 1000);
  if (!text) throw new HttpError(400, 'Anotação vazia.');
  const now = nowISO();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO lead_notes (lead_id, text, created_at) VALUES (?, ?, ?)').bind(id, text, now),
    env.DB.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(now, id),
  ]);
  return json({ ok: true }, 201);
}

async function deleteLead(id, env) {
  await env.DB.prepare('UPDATE leads SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(nowISO(), nowISO(), id).run();
  return json({ ok: true });
}

async function listClients(env) {
  const rows = (await env.DB.prepare('SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY updated_at DESC').all()).results;
  return json({ items: rows });
}

async function createClient(request, env) {
  const b = await readJson(request);
  const name = cleanStr(b.name, 120);
  const phone = cleanPhone(b.phone);
  if (name.length < 2) throw new HttpError(400, 'Nome obrigatório.');
  if (!phone) throw new HttpError(400, 'Telefone inválido.');
  const profile = CLIENT_PROFILES.includes(b.profile) ? b.profile : 'Comprador';
  const modality = MODALITIES.includes(b.modality) ? b.modality : 'Compra';
  const now = nowISO();
  const id = 'cli-' + crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO clients (id, name, phone, profile, modality, birthday, regions, budget, notes, last_contact, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, name, phone, profile, modality, cleanStr(b.birthday, 10) || '-',
    cleanStr(b.regions, 200), cleanStr(b.budget, 80) || 'A definir', cleanStr(b.notes, 1000), todayBR(), now, now
  ).run();
  return json({ ok: true, id }, 201);
}

async function patchClient(id, request, env) {
  const b = await readJson(request);
  const fields = [];
  const vals = [];
  if (b.name !== undefined) { const v = cleanStr(b.name, 120); if (v.length < 2) throw new HttpError(400, 'Nome inválido.'); fields.push('name = ?'); vals.push(v); }
  if (b.phone !== undefined) { const v = cleanPhone(b.phone); if (!v) throw new HttpError(400, 'Telefone inválido.'); fields.push('phone = ?'); vals.push(v); }
  if (b.profile !== undefined && CLIENT_PROFILES.includes(b.profile)) { fields.push('profile = ?'); vals.push(b.profile); }
  if (b.modality !== undefined && MODALITIES.includes(b.modality)) { fields.push('modality = ?'); vals.push(b.modality); }
  if (b.birthday !== undefined) { fields.push('birthday = ?'); vals.push(cleanStr(b.birthday, 10) || '-'); }
  if (b.regions !== undefined) { fields.push('regions = ?'); vals.push(cleanStr(b.regions, 200)); }
  if (b.budget !== undefined) { fields.push('budget = ?'); vals.push(cleanStr(b.budget, 80)); }
  if (b.notes !== undefined) { fields.push('notes = ?'); vals.push(cleanStr(b.notes, 1000)); }
  if (b.last_contact !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(b.last_contact)) { fields.push('last_contact = ?'); vals.push(b.last_contact); }
  if (!fields.length) return json({ ok: true });
  fields.push('updated_at = ?'); vals.push(nowISO(), id);
  await env.DB.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).bind(...vals).run();
  return json({ ok: true });
}

async function deleteClient(id, env) {
  await env.DB.prepare('UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(nowISO(), nowISO(), id).run();
  return json({ ok: true });
}

async function listProperties(env) {
  const rows = (await env.DB.prepare('SELECT * FROM properties WHERE deleted_at IS NULL ORDER BY id DESC').all()).results;
  return json({ items: rows });
}

async function nextPropertyCode(env) {
  const row = await env.DB.prepare("SELECT code FROM properties WHERE code GLOB 'YTI-[0-9]*' ORDER BY CAST(SUBSTR(code, 5) AS INTEGER) DESC LIMIT 1").first();
  const n = row ? (parseInt(row.code.slice(4), 10) || 0) + 1 : 1;
  return 'YTI-' + String(n).padStart(4, '0');
}

function validPhotoUrl(v) {
  const s = cleanStr(v, 500);
  if (!s) return '';
  if (s.startsWith('/img/')) return s;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? s : '';
  } catch { return ''; }
}

async function createProperty(request, env) {
  const b = await readJson(request);
  const title = cleanStr(b.title, 180);
  const neighborhood = cleanStr(b.neighborhood, 100);
  if (title.length < 3) throw new HttpError(400, 'Título obrigatório.');
  if (!neighborhood) throw new HttpError(400, 'Bairro obrigatório.');
  const rawCode = cleanStr(b.code, 20).toUpperCase();
  const code = /^[A-Z0-9-]{3,20}$/.test(rawCode) ? rawCode : await nextPropertyCode(env);
  const purpose = PROP_PURPOSES.includes(b.purpose) ? b.purpose : 'Comprar';
  const status = PROP_STATUS.includes(b.status) ? b.status : 'Disponível';
  const now = nowISO();

  await env.DB.prepare(`INSERT INTO properties
    (code, purpose, type, title, neighborhood, city, price, area_m2, bedrooms, bathrooms, parking, highlight, photo_url, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    code, purpose, cleanStr(b.type, 50) || 'Casa', title, neighborhood,
    cleanStr(b.city, 80) || 'Resende',
    Math.max(0, Math.round(Number(b.price) || 0)),
    Math.max(0, Math.round(Number(b.area_m2) || 0)),
    Math.max(0, Math.round(Number(b.bedrooms) || 0)),
    Math.max(0, Math.round(Number(b.bathrooms) || 0)),
    Math.max(0, Math.round(Number(b.parking) || 0)),
    cleanStr(b.highlight, 60), validPhotoUrl(b.photo_url), cleanStr(b.description, 2000),
    status, now, now
  ).run();
  return json({ ok: true, code }, 201);
}

async function patchProperty(code, request, env) {
  const b = await readJson(request);
  const fields = [];
  const vals = [];
  if (b.purpose !== undefined && PROP_PURPOSES.includes(b.purpose)) { fields.push('purpose = ?'); vals.push(b.purpose); }
  if (b.type !== undefined) { fields.push('type = ?'); vals.push(cleanStr(b.type, 50)); }
  if (b.title !== undefined) { const v = cleanStr(b.title, 180); if (v.length < 3) throw new HttpError(400, 'Título inválido.'); fields.push('title = ?'); vals.push(v); }
  if (b.neighborhood !== undefined) { fields.push('neighborhood = ?'); vals.push(cleanStr(b.neighborhood, 100)); }
  if (b.city !== undefined) { fields.push('city = ?'); vals.push(cleanStr(b.city, 80)); }
  for (const numCol of ['price', 'area_m2', 'bedrooms', 'bathrooms', 'parking']) {
    if (b[numCol] !== undefined) { fields.push(`${numCol} = ?`); vals.push(Math.max(0, Math.round(Number(b[numCol]) || 0))); }
  }
  if (b.highlight !== undefined) { fields.push('highlight = ?'); vals.push(cleanStr(b.highlight, 60)); }
  if (b.photo_url !== undefined) { fields.push('photo_url = ?'); vals.push(validPhotoUrl(b.photo_url)); }
  if (b.description !== undefined) { fields.push('description = ?'); vals.push(cleanStr(b.description, 2000)); }
  if (b.status !== undefined) {
    if (!PROP_STATUS.includes(b.status)) throw new HttpError(400, 'Status inválido.');
    fields.push('status = ?'); vals.push(b.status);
  }
  if (!fields.length) return json({ ok: true });
  fields.push('updated_at = ?'); vals.push(nowISO(), code);
  await env.DB.prepare(`UPDATE properties SET ${fields.join(', ')} WHERE code = ? AND deleted_at IS NULL`).bind(...vals).run();
  return json({ ok: true });
}

async function deleteProperty(code, env) {
  await env.DB.prepare('UPDATE properties SET deleted_at = ?, updated_at = ? WHERE code = ?').bind(nowISO(), nowISO(), code).run();
  return json({ ok: true });
}

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function uploadImage(request, env) {
  if (!env.IMAGES) throw new HttpError(503, 'Armazenamento de imagens não configurado.');
  const mime = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[mime];
  if (!ext) throw new HttpError(400, 'Envie uma imagem JPG, PNG ou WebP.');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) throw new HttpError(400, 'Imagem deve ter até 8 MB.');
  const key = `properties/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' } });
  return json({ ok: true, url: '/img/' + key }, 201);
}

// ==================== ROTEADOR ====================

export async function onRequest(context) {
  const { request, env, data } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  try {
    if (path === '/api/public/properties' && method === 'GET') return await publicProperties(env);
    if (path === '/api/public/contact' && method === 'POST') return await publicContact(request, env);

    if (!data?.user?.email) return json({ error: 'Não autenticado.' }, 401);

    if (path === '/api/me' && method === 'GET') return json({ user: data.user });

    if (path === '/api/leads' && method === 'GET') return await listLeads(env);
    if (path === '/api/leads' && method === 'POST') return await createLead(request, env);
    let m = path.match(/^\/api\/leads\/([^/]+)$/);
    if (m && method === 'PATCH') return await patchLead(decodeURIComponent(m[1]), request, env);
    if (m && method === 'DELETE') return await deleteLead(decodeURIComponent(m[1]), env);
    m = path.match(/^\/api\/leads\/([^/]+)\/notes$/);
    if (m && method === 'POST') return await addLeadNote(decodeURIComponent(m[1]), request, env);

    if (path === '/api/clients' && method === 'GET') return await listClients(env);
    if (path === '/api/clients' && method === 'POST') return await createClient(request, env);
    m = path.match(/^\/api\/clients\/([^/]+)$/);
    if (m && method === 'PATCH') return await patchClient(decodeURIComponent(m[1]), request, env);
    if (m && method === 'DELETE') return await deleteClient(decodeURIComponent(m[1]), env);

    if (path === '/api/properties' && method === 'GET') return await listProperties(env);
    if (path === '/api/properties' && method === 'POST') return await createProperty(request, env);
    m = path.match(/^\/api\/properties\/([^/]+)$/);
    if (m && method === 'PATCH') return await patchProperty(decodeURIComponent(m[1]), request, env);
    if (m && method === 'DELETE') return await deleteProperty(decodeURIComponent(m[1]), env);

    if (path === '/api/images' && method === 'POST') return await uploadImage(request, env);

    return json({ error: 'Rota não encontrada.' }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error('API error:', err);
    return json({ error: 'Erro interno.' }, 500);
  }
}