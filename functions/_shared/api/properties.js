import {HttpError,nowIso,propCode,parseId,str,oneOf,intIn,money,PURPOSES,PSTATUS,isUnique,HOLDING_STAGES_SQL} from './common.js';
import {propOut} from './serialization.js';
import {mediaEnabled,propertyImageRows,propertyImageMap,deletePhysicalImages} from '../property-media.js';
// ---------- Imóveis ----------
// Novas fotos entram exclusivamente via upload R2. Links antigos permanecem
// armazenados na coluna legada, mas não são aceitos ou exibidos pela API.
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
async function propValues(b, { defaults = false } = {}) {
  const out = {};
  const src = defaults ? { type: 'Casa', city: 'Resende - RJ', status: 'Disponível', purpose: 'Comprar', ...b } : b;
  for (const [k, fn] of Object.entries(PROP_FIELDS)) if (src[k] !== undefined) out[k] = fn(src[k]);
  if (src.photo_url !== undefined && String(src.photo_url || '').trim())
    throw new HttpError(400, 'Fotos por URL não são aceitas. Utilize o upload R2.');
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
  const vals = await propValues(b);
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
  // Não apagar o registro sem limpar fotos: falhar fechado se o R2/D1 não estiver configurado.
  if (!mediaEnabled(env)) throw new HttpError(503, 'Galeria R2 indisponível. Confira MEDIA_ENV, DB e MEDIA_BUCKET.');
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
    try { created.push(await insertProperty(env, await propValues(rows[i], { defaults: true }))); }
    catch (e) { skipped.push({ row: i + 1, error: e.message }); }
  }
  return { created: created.length, skipped };
}


export {propValues,insertProperty,patchProperty,deletePropertyWithMedia,importProperties};
