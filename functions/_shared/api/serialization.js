import {publicDescription} from '../property-seo.js';
import {propertyPath} from '../property-url.js';
import { followupView, eventDate, TZ, leadCode, clientCode, propCode, CODE_PREFIX, todayBR, HttpError } from './common.js';
import {withGallery} from '../property-media.js';
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
  photo_url: r.photo_url, badge: r.badge, status: r.status, description: r.description,
}, images, env);
const propPublic = (r, images = [], env) => withGallery({   // mesmo formato que o site já usava ao ler a planilha
  url: propertyPath(r), codigo: propCode(r.id), titulo: r.title, finalidade: r.purpose, tipo: r.type, bairro: r.neighborhood, cidade: r.city,
  valor: r.price, area_m2: r.area_m2, quartos: r.bedrooms, banheiros: r.bathrooms, vagas: r.parking,
  foto_url: r.photo_url, destaque: r.badge, status: r.status,
  descricao: publicDescription(r),
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


export {leadOut,clientOut,CLIENTS_SQL,propOut,propPublic,LEAD_SELECT,LEAD_ORDER,loadLeadRow,loadLead};
