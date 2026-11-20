// Rotas dedicadas ao R2 (preview): API binária separada do CRUD de imóveis/leads.
// GET /api/media/file/properties/:id/:uuid.webp          (público)
// GET|PUT /api/media/properties/:code/images             (CRC / Access)
// PATCH|DELETE /api/media/properties/:code/images/:id    (CRC / Access)
import { mediaEnabled, mediaPath, parsePropertyCode, propertyImageRows, serializeImage } from '../../_shared/property-media.js';

const MAX_BYTES = 6 * 1024 * 1024;
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
let jwksCache = { at: 0, keys: [] };
// Mesmas verificações de JWT Cloudflare Access do roteador legado (sem bypass em preview remoto).
async function authenticate(request, env) {
  if (env.DEV_BYPASS === '1') return 'dev@local';
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new ApiError(503, 'Acesso não configurado no servidor.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new ApiError(401, 'Não autenticado.');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new ApiError(401, 'Token inválido.');
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64u(h)));
    payload = JSON.parse(new TextDecoder().decode(b64u(p)));
  } catch { throw new ApiError(401, 'Token inválido.'); }
  if (Date.now() - jwksCache.at > 3600000 || !jwksCache.keys.some((k) => k.kid === header.kid)) {
    const response = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    if (!response.ok) throw new ApiError(503, 'Falha ao validar acesso.');
    jwksCache = { at: Date.now(), keys: (await response.json()).keys || [] };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new ApiError(401, 'Chave desconhecida.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
  if (!valid || ![].concat(payload.aud || []).includes(env.ACCESS_AUD) || payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || payload.exp * 1000 < Date.now())
    throw new ApiError(401, 'Sessão inválida ou expirada.');
  return payload.email;
}
function verifyOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'Origem não permitida.');
}
async function existingProperty(env, code) {
  const id = parsePropertyCode(code);
  if (!id) throw new ApiError(404, 'Imóvel não encontrado.');
  const row = await env.DB.prepare('SELECT id FROM properties WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!row) throw new ApiError(404, 'Imóvel não encontrado.');
  return id;
}
function checkMime(mime, data) {
  const b = new Uint8Array(data);
  if (mime === 'image/jpeg' && b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
  if (mime === 'image/webp' && b.length >= 12 && [0,1,2,3].map((i) => String.fromCharCode(b[i])).join('') === 'RIFF'
      && [8,9,10,11].map((i) => String.fromCharCode(b[i])).join('') === 'WEBP') return 'webp';
  throw new ApiError(415, 'Envie uma imagem JPEG ou WebP válida.');
}
async function boundedRead(request) {
  const size = Number(request.headers.get('Content-Length') || 0);
  if (size > MAX_BYTES) throw new ApiError(413, 'Imagem maior que 6 MB.');
  if (!request.body) throw new ApiError(400, 'Arquivo não recebido.');
  const reader = request.body.getReader();
  const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new ApiError(413, 'Imagem maior que 6 MB.'); }
    chunks.push(value);
  }
  if (!total) throw new ApiError(400, 'Arquivo vazio.');
  const data = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data;
}
async function publicObject(env, key, method) {
  if (!/^properties\/\d+\/[0-9a-f-]{36}\.(webp|jpg)$/.test(key)) throw new ApiError(404, 'Imagem não encontrada.');
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) throw new ApiError(404, 'Imagem não encontrada.');
  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType || (key.endsWith('.webp') ? 'image/webp' : 'image/jpeg'),
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    'X-Content-Type-Options': 'nosniff',
    'ETag': object.httpEtag,
  });
  return new Response(method === 'HEAD' ? null : object.body, { headers });
}
async function upload(env, propertyId, request) {
  const mime = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const images = await propertyImageRows(env, propertyId);
  if (images.length >= 10) throw new ApiError(409, 'Limite de 10 fotos por imóvel.');
  const data = await boundedRead(request);
  const ext = checkMime(mime, data);
  const key = `properties/${propertyId}/${crypto.randomUUID()}.${ext}`;
  await env.MEDIA_BUCKET.put(key, data, { httpMetadata: { contentType: mime }, customMetadata: { propertyId: String(propertyId) } });
  try {
    // INSERT ... SELECT recusa inserir após exclusão lógica mesmo em corrida de requisições.
    const result = await env.DB.prepare(
      `INSERT INTO property_images (property_id, object_key, content_type, size_bytes, position, is_cover, created_at)
       SELECT p.id,?,?,?,?,?,? FROM properties p WHERE p.id = ? AND p.deleted_at IS NULL RETURNING *`
    ).bind(key, mime, data.byteLength, images.length ? Math.max(...images.map((i) => i.position)) + 1 : 0, images.length ? 0 : 1, new Date().toISOString(), propertyId).first();
    if (!result) throw new ApiError(409, 'Imóvel excluído durante o upload.');
    return json({ item: serializeImage(result, env), images: (await propertyImageRows(env, propertyId)).map(r => serializeImage(r, env)) }, 201);
  } catch (error) {
    try { await env.MEDIA_BUCKET.delete(key); }
    catch (cleanupError) { console.error('R2 compensação de upload falhou', key, cleanupError); }
    if (error instanceof ApiError) throw error;
    if (/Limite de 10 fotos|UNIQUE/.test(String(error.message))) throw new ApiError(409, 'A galeria foi atualizada por outra operação. Atualize a tela e tente novamente.');
    throw error;
  }
}
async function setCover(env, propertyId, imageId) {
  const image = await env.DB.prepare('SELECT id FROM property_images WHERE id = ? AND property_id = ?').bind(imageId, propertyId).first();
  if (!image) throw new ApiError(404, 'Imagem não encontrada.');
  await env.DB.batch([
    env.DB.prepare('UPDATE property_images SET is_cover = 0 WHERE property_id = ? AND is_cover = 1').bind(propertyId),
    env.DB.prepare('UPDATE property_images SET is_cover = 1 WHERE id = ? AND property_id = ?').bind(imageId, propertyId),
  ]);
  return json({ images: (await propertyImageRows(env, propertyId)).map(r => serializeImage(r, env)) });
}
async function removeImage(env, propertyId, imageId) {
  const image = await env.DB.prepare('SELECT * FROM property_images WHERE id = ? AND property_id = ?').bind(imageId, propertyId).first();
  if (!image) throw new ApiError(404, 'Imagem não encontrada.');
  await env.MEDIA_BUCKET.delete(image.object_key);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM property_images WHERE id = ? AND property_id = ?').bind(imageId, propertyId),
    env.DB.prepare(`UPDATE property_images SET is_cover = 1
      WHERE property_id = ? AND id = (SELECT id FROM property_images WHERE property_id = ? ORDER BY position, id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM property_images WHERE property_id = ? AND is_cover = 1)`).bind(propertyId, propertyId, propertyId),
  ]);
  return json({ images: (await propertyImageRows(env, propertyId)).map(r => serializeImage(r, env)) });
}
export async function onRequest({ request, env, params }) {
  try {
    if (!mediaEnabled(env)) throw new ApiError(503, 'Galeria R2 disponível somente em preview configurado.');
    const parts = [].concat(params.path || []);
    const method = request.method;
    if (parts[0] === 'file' && (method === 'GET' || method === 'HEAD')) {
      return await publicObject(env, parts.slice(1).join('/'), method);
    }
    await authenticate(request, env);
    if (method !== 'GET') verifyOrigin(request);
    if (parts[0] !== 'properties' || parts[2] !== 'images' || parts.length > 4) throw new ApiError(404, 'Rota não encontrada.');
    const propertyId = await existingProperty(env, parts[1]);
    if (parts.length === 3) {
      if (method === 'GET') return json({ images: (await propertyImageRows(env, propertyId)).map(r => serializeImage(r, env)) });
      if (method === 'PUT') return await upload(env, propertyId, request);
    } else {
      const imageId = Number(parts[3]);
      if (!Number.isSafeInteger(imageId) || imageId < 1) throw new ApiError(404, 'Imagem não encontrada.');
      if (method === 'DELETE') return await removeImage(env, propertyId, imageId);
      if (method === 'PATCH') {
        if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw new ApiError(415, 'Use application/json.');
        const body = await request.json().catch(() => { throw new ApiError(400, 'JSON inválido.'); });
        if (body.cover !== true) throw new ApiError(400, 'Informe cover: true.');
        return await setCover(env, propertyId, imageId);
      }
    }
    throw new ApiError(405, 'Método não permitido.');
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error('Erro media', e);
    return json({ error: 'Erro interno ao processar a imagem.' }, 500);
  }
}
