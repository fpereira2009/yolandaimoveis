// Proteções de entrada compartilhadas por todas as rotas administrativas.
import { HttpError } from './api/common.js';

export function verifyWriteOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if ((origin && origin !== url.origin) || site === 'cross-site') {
    throw new HttpError(403, 'Origem não permitida.');
  }
}

export async function readJson(request, maxBytes = 1024 * 1024) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new HttpError(415, 'Use application/json.');
  }
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'Requisição muito grande.');
  if (!request.body) throw new HttpError(400, 'JSON inválido.');
  const reader = request.body.getReader();
  const pieces = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Requisição muito grande.'); }
    pieces.push(value);
  }
  const data = new Uint8Array(total); let at = 0;
  for (const piece of pieces) { data.set(piece, at); at += piece.byteLength; }
  try {
    const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('body type');
    return json;
  } catch { throw new HttpError(400, 'JSON inválido.'); }
}
