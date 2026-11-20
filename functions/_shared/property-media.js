// Utilitários de galeria: apenas recursos preview. Não consulta a tabela nova em produção.
export const mediaEnabled = (env) => env?.MEDIA_ENV === 'preview' && !!env?.MEDIA_BUCKET && !!env?.DB;
export const mediaPath = (key, env) => {
  const base = String(env?.MEDIA_PUBLIC_BASE_URL || '').trim();
  return /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(base)
    ? base.replace(/\/+$/, '') + '/' + key
    : `/api/media/file/${key}`;
};
export const parsePropertyCode = (value) => {
  const s = String(value || '');
  const match = /^YTI-(\d{4,})$/.exec(s);
  const id = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return id;
};
export function serializeImage(row, env) {
  return {
    id: row.id, url: mediaPath(row.object_key, env),
    cover: !!row.is_cover, position: row.position,
    mimeType: row.content_type, sizeBytes: row.size_bytes,
  };
}
export async function propertyImageRows(env, propertyId) {
  if (!mediaEnabled(env)) return [];
  return (await env.DB.prepare(
    'SELECT * FROM property_images WHERE property_id = ? ORDER BY is_cover DESC, position ASC, id ASC'
  ).bind(propertyId).all()).results;
}
export async function propertyImageMap(env) {
  const result = new Map();
  if (!mediaEnabled(env)) return result;
  const rows = (await env.DB.prepare(
    'SELECT * FROM property_images ORDER BY property_id, is_cover DESC, position ASC, id ASC'
  ).all()).results;
  for (const row of rows) {
    if (!result.has(row.property_id)) result.set(row.property_id, []);
    result.get(row.property_id).push(serializeImage(row, env));
  }
  return result;
}
export function withGallery(property, list = [], env) {
  const images = list.map((r) => r && r.url ? r : serializeImage(r, env));
  const coverUrl = images.length ? images[0].url : (env?.MEDIA_ENV === 'preview' ? '' : (property.photo_url || property.foto_url || ''));
  return {
    ...property,
    ...(Object.hasOwn(property, 'foto_url') ? { foto_url: coverUrl } : { photo_url: coverUrl }),
    images,
    coverImageId: images.length ? images[0].id : null,
  };
}
// Se uma remoção no R2 falhar, a exclusão no D1 é interrompida e pode ser reexecutada.
// R2 e D1 não suportam transação distribuída: documentamos e testamos o retry idempotente.
export async function deletePhysicalImages(env, rows) {
  if (!mediaEnabled(env)) return;
  for (const row of rows) await env.MEDIA_BUCKET.delete(row.object_key);
}
