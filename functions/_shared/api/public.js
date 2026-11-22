import {HttpError,json,nowIso,todayBR,str,normPhone,oneOf,parseId,propCode} from './common.js';
import {propPublic} from './serialization.js';
import {propertyImageMap} from '../property-media.js';
import {ensureClient,openLeadFor,addEvent,insertLead} from './leads.js';
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
    const p = code ? await env.DB.prepare("SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL").bind(parseId(code, 0, 'YTI')).first() : null;
    if (!p) throw new HttpError(400, 'Imóvel não encontrado.');
    const m = p.purpose === 'Alugar' ? 'Aluguel' : 'Compra';
    v = { category: 'Interessado', modality: m, clientModality: m,
      regions: p.neighborhood, property: `${propCode(p.id)} - ${p.title}`.slice(0, 200), value: p.price, temp: 'Quente',
      // Contato de imóvel disponível já entra vinculado; a reserva só virá
      // quando o corretor avançar o lead para Proposta ou Documentação.
      // Ambos os status publicados aceitam interesse; vincular não reserva o imóvel.
      propertyId: p.id,
      note: `Interesse pelo site em ${propCode(p.id)} - ${p.title}.${msg ? ' Mensagem: ' + msg : ''}` };
  }
  const { row: client } = await ensureClient(env, { name, phone, modality: v.clientModality, regions: v.regions, source: 'Site', lastInteraction: 'Hoje • Contato pelo site' });
  // Interesse em outro imóvel gera atendimento próprio; o vínculo em negociação
  // no lead anterior não é sobrescrito. Repetições no mesmo imóvel apenas geram nota.
  const open = v.category === 'Interessado'
    ? await env.DB.prepare(`SELECT id FROM leads WHERE phone = ? AND modality = ?
        AND category = 'Interessado' AND property_id = ? AND stage != 'Fechado'
        AND deleted_at IS NULL LIMIT 1`).bind(phone, v.modality, v.propertyId).first()
    : await openLeadFor(env, phone, v.modality, v.category);
  if (open) await addEvent(env, open.id, 'nota', 'Novo contato pelo site. ' + v.note);
  else await insertLead(env, { name, phone, modality: v.modality, stage: 'Novo Lead', temp: v.temp, property: v.property, value: v.value, followup: todayBR(), clientId: client.id, source: 'Site', category: v.category, propertyId: v.propertyId ?? null, note: v.note });
  return json({ ok: true }, 201);
}


export {publicProperties,publicContact};
