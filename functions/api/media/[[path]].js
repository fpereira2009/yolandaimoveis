// Rotas dedicadas ao R2 (Preview e Production): API binária separada do CRUD.
// GET /api/media/file/properties/:id/:uuid.webp          (público)
// GET|PUT /api/media/properties/:code/images             (CRC / Access)
// PATCH|DELETE /api/media/properties/:code/images/:id    (CRC / Access)
import { mediaEnabled, mediaPath, parsePropertyCode, propertyImageRows, serializeImage } from '../../_shared/property-media.js';
import { authenticate } from '../../_shared/access-auth.js';
import { verifyWriteOrigin, readJson } from '../../_shared/request-guards.js';
import { HttpError } from '../../_shared/api/common.js';

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 7 * 1024 * 1024;
const IMAGE_CACHE = 'public, max-age=31536000, immutable';
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function existingProperty(env, code) {
  const id = parsePropertyCode(code);
  if (!id) throw new ApiError(404, 'Imóvel não encontrado.');
  const row = await env.DB.prepare('SELECT id FROM properties WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!row) throw new ApiError(404, 'Imóvel não encontrado.');
  return id;
}
function checkMime(mime, data) {
  const b = new Uint8Array(data);
  // O MIME declarado precisa ser compatível com a estrutura real do arquivo.
  if (mime === 'image/webp' && b.length >= 20 &&
      String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...b.slice(8, 12)) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...b.slice(12, 16)))) {
    const riffSize = (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0;
    const chunkSize = (b[16] | (b[17] << 8) | (b[18] << 16) | (b[19] << 24)) >>> 0;
    if (riffSize + 8 === b.length && chunkSize > 0 && 20 + chunkSize <= b.length) return 'webp';
  }
  if (mime === 'image/jpeg' && b.length >= 12 && b[0] === 255 && b[1] === 216 && b[2] === 255 &&
      b[b.length - 2] === 255 && b[b.length - 1] === 217) return 'jpg';
  throw new ApiError(415, 'Envie uma imagem JPEG ou WebP válida.');
}
async function boundedRead(request, maxBytes = MAX_BYTES) {
  const size = Number(request.headers.get('Content-Length') || 0);
  if (size > maxBytes) throw new ApiError(413, 'Upload de imagem excede o limite permitido.');
  if (!request.body) throw new ApiError(400, 'Arquivo não recebido.');
  const reader = request.body.getReader();
  const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new ApiError(413, 'Upload de imagem excede o limite permitido.'); }
    chunks.push(value);
  }
  if (!total) throw new ApiError(400, 'Arquivo vazio.');
  const data = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data;
}
// Validação de chave rígida; miniatura nunca é publicada sem a foto principal no D1.
function parseImageKey(key) {
  const match = /^properties\/(\d+)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(-thumb)?\.(webp|jpg)$/.exec(key);
  if (!match) throw new ApiError(404, 'Imagem não encontrada.');
  return { thumb: !!match[3] };
}
async function publicObject(env, key, method, request) {
  const {thumb} = parseImageKey(key);
  // Consulta com prepared statement impede acesso a thumbnails soltas no R2.
  let metadata = await env.DB.prepare(`SELECT p.deleted_at, p.status FROM property_images i
    JOIN properties p ON p.id=i.property_id
    WHERE ${thumb ? 'i.thumb_key' : 'i.object_key'} = ? LIMIT 1`).bind(key).first();
  // Fotos antigas continuam acessíveis por alias durante a migração.
  // Nunca cria acesso público adicional a imóveis inativos.
  if (!metadata && !thumb) {
    metadata = await env.DB.prepare(`SELECT p.deleted_at, p.status FROM image_url_aliases a
      JOIN property_images i ON i.id=a.image_id
      JOIN properties p ON p.id=i.property_id WHERE a.old_key=? LIMIT 1`).bind(key).first();
  }
  if (!metadata) throw new ApiError(404, 'Imagem não encontrada.');
  const publicImage = !metadata.deleted_at && ['Disponível', 'Reservado'].includes(metadata.status);
  if (!publicImage) {
    try { await authenticate(request, env); }
    catch { throw new ApiError(404, 'Imagem não encontrada.'); }
  }
  const object = method === 'HEAD' ? await env.MEDIA_BUCKET.head(key) : await env.MEDIA_BUCKET.get(key);
  if (!object) throw new ApiError(404, 'Imagem não encontrada.');
  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType || (key.endsWith('.webp') ? 'image/webp' : 'image/jpeg'),
    'Cache-Control': publicImage ? IMAGE_CACHE : 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'ETag': object.httpEtag,
  });
  return new Response(method === 'HEAD' ? null : object.body, {headers});
}
async function parseUploadedImage(request) {
  const mime = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  // Compatibilidade com o upload binário das versões anteriores.
  if (mime !== 'multipart/form-data') {
    const full = await boundedRead(request);
    const ext = checkMime(mime, full);
    return {full, thumb: null, mainMime: mime, ext, dims: null};
  }
  // Leitura limitada antes de decodificar FormData: evita body sem Content-Length ilimitado.
  const payload = await boundedRead(request, MAX_MULTIPART_BYTES);
  const form = await new Response(payload, {headers:{'Content-Type': request.headers.get('Content-Type')}}).formData();
  const main = form.get('main'); const small = form.get('thumb');
  if (!(main instanceof Blob) || !(small instanceof Blob)) throw new ApiError(400, 'Fotos principal e miniatura obrigatórias.');
  const accepted = new Set(['image/jpeg', 'image/webp']);
  if (!accepted.has(main.type) || !accepted.has(small.type) || main.type !== small.type)
    throw new ApiError(415, 'Envie principal e miniatura no mesmo formato JPEG ou WebP.');
  if (main.size > MAX_BYTES || small.size > 2*1024*1024) throw new ApiError(413, 'Imagem otimizada muito grande.');
  const full = new Uint8Array(await main.arrayBuffer());
  const thumb = new Uint8Array(await small.arrayBuffer());
  const ext = checkMime(main.type, full); checkMime(small.type, thumb);
  const w = Number(form.get('width')), h = Number(form.get('height'));
  const tw = Number(form.get('thumbWidth')), th = Number(form.get('thumbHeight'));
  if (![w,h,tw,th].every(n=>Number.isSafeInteger(n) && n>0 && n<=1600) ||
      Math.abs((w/h)-(tw/th)) > 0.025 || tw>w || th>h) throw new ApiError(400, 'Dimensões inválidas.');
  // Dims são declarações do cliente; para validação criptográfica de pixels seria necessário decoder servidor.
  return {full, thumb, mainMime:main.type, ext, dims:{w,h,tw,th}};
}
async function upload(env, propertyId, request) {
  const images = await propertyImageRows(env, propertyId);
  if (images.length >= 10) throw new ApiError(409, 'Limite de 10 fotos por imóvel.');
  const {full, thumb, mainMime, ext, dims} = await parseUploadedImage(request);
  const uuid = crypto.randomUUID();
  const key = `properties/${propertyId}/${uuid}.${ext}`;
  const thumbKey = thumb ? `properties/${propertyId}/${uuid}-thumb.${ext}` : null;
  const options = {httpMetadata:{contentType:mainMime, cacheControl:IMAGE_CACHE},customMetadata:{propertyId:String(propertyId)}};
  let wroteMain = false, wroteThumb = false;
  try {
    await env.MEDIA_BUCKET.put(key, full, options);
    wroteMain = true;
    if (thumbKey) {
      await env.MEDIA_BUCKET.put(thumbKey, thumb, {
        httpMetadata:{contentType:mainMime, cacheControl:IMAGE_CACHE},
        customMetadata:{propertyId:String(propertyId),variant:'thumbnail'}
      });
      wroteThumb = true;
    }
    const result = await env.DB.prepare(
      `INSERT INTO property_images (property_id, object_key, content_type, size_bytes, position,
         is_cover, created_at, thumb_key, width, height, thumb_width, thumb_height)
       SELECT p.id,?,?,?,?,?,?,?,?,?,?,? FROM properties p
       WHERE p.id = ? AND p.deleted_at IS NULL RETURNING *`
    ).bind(key, mainMime, full.byteLength,
      images.length ? Math.max(...images.map(i=>i.position))+1 : 0,
      images.length ? 0 : 1, new Date().toISOString(),thumbKey,
      dims?.w||null,dims?.h||null,dims?.tw||null,dims?.th||null,
      propertyId).first();
    if (!result) throw new ApiError(409, 'Imóvel excluído durante o upload.');
    return json({item:serializeImage(result,env), images:(await propertyImageRows(env,propertyId)).map(r=>serializeImage(r,env))},201);
  } catch(error) {
    // Compensação por falha R2 ou D1. IDs novos e imutáveis evitam sobrescrita acidental.
    if (wroteThumb) try { await env.MEDIA_BUCKET.delete(thumbKey); } catch(e) { console.error('[media] THUMB_CLEANUP_FAILED'); }
    if (wroteMain) try { await env.MEDIA_BUCKET.delete(key); } catch(e) { console.error('[media] MAIN_CLEANUP_FAILED'); }
    if (error instanceof ApiError) throw error;
    if (/Limite de 10 fotos|UNIQUE/.test(String(error.message))) throw new ApiError(409,'Galeria alterada por outra operação. Atualize a tela.');
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
  // Evita thumbnail órfã; se R2 falhar, D1 ainda conserva a referência para retry.
  if (image.thumb_key) await env.MEDIA_BUCKET.delete(image.thumb_key);
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
    if (!mediaEnabled(env)) throw new ApiError(503, 'Galeria R2 indisponível. Confira MEDIA_ENV, DB e MEDIA_BUCKET.');
    const parts = [].concat(params.path || []);
    const method = request.method;
    if (parts[0] === 'file' && (method === 'GET' || method === 'HEAD')) {
      return await publicObject(env, parts.slice(1).join('/'), method, request);
    }
    await authenticate(request, env);
    if (method !== 'GET') verifyWriteOrigin(request);
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
        const body = await readJson(request, 2048);
        if (body.cover !== true) throw new ApiError(400, 'Informe cover: true.');
        return await setCover(env, propertyId, imageId);
      }
    }
    throw new ApiError(405, 'Método não permitido.');
  } catch (e) {
    if (e instanceof ApiError || e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('Erro media', e);
    return json({ error: 'Erro interno ao processar a imagem.' }, 500);
  }
}
