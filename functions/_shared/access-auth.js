// Verificador único dos tokens Cloudflare Access; NUNCA confia em DEV_BYPASS.
import { HttpError } from './api/common.js';

const jwksCache = new Map();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 12000) {
    throw new HttpError(401, 'Token inválido.');
  }
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  } catch {
    throw new HttpError(401, 'Token inválido.');
  }
}

function accessConfig(env) {
  const domain = String(env.ACCESS_TEAM_DOMAIN || '').trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '');
  const aud = String(env.ACCESS_AUD || '').trim();
  // O domínio do time é uma configuração do servidor, nunca do usuário.
  if (!/^[a-z0-9][a-z0-9.-]*\.cloudflareaccess\.com$/.test(domain) || !aud || aud.length > 256) {
    throw new HttpError(503, 'Acesso não configurado no servidor.');
  }
  return { domain, aud };
}

async function loadJwks(domain, kid) {
  let entry = jwksCache.get(domain);
  if (!entry || Date.now() - entry.at > 3600_000 || !entry.keys.some(key => key.kid === kid)) {
    let response;
    try {
      response = await fetch(`https://${domain}/cdn-cgi/access/certs`, { redirect: 'error' });
    } catch { throw new HttpError(503, 'Falha ao validar acesso.'); }
    if (!response.ok) throw new HttpError(503, 'Falha ao validar acesso.');
    let parsed;
    try { parsed = await response.json(); } catch { throw new HttpError(503, 'Falha ao validar acesso.'); }
    if (!Array.isArray(parsed.keys)) throw new HttpError(503, 'Falha ao validar acesso.');
    entry = { at: Date.now(), keys: parsed.keys.filter(k => k.kty === 'RSA' && k.alg !== 'none') };
    if (jwksCache.size >= 16) jwksCache.clear();
    jwksCache.set(domain, entry);
  }
  return entry.keys.find(k => k.kid === kid);
}

export async function authenticate(request, env) {
  const { domain, aud } = accessConfig(env);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw new HttpError(401, 'Não autenticado.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Token inválido.');
  let header, payload;
  try {
    header = JSON.parse(decoder.decode(decodeBase64url(parts[0])));
    payload = JSON.parse(decoder.decode(decodeBase64url(parts[1])));
  } catch { throw new HttpError(401, 'Token inválido.'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256) {
    throw new HttpError(401, 'Token inválido.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== `https://${domain}` || ![].concat(payload.aud || []).includes(aud) ||
      !Number.isFinite(payload.exp) || payload.exp <= now ||
      (payload.nbf != null && (!Number.isFinite(payload.nbf) || payload.nbf > now)) ||
      (payload.iat != null && (!Number.isFinite(payload.iat) || payload.iat > now + 60))) {
    throw new HttpError(401, 'Sessão inválida ou expirada.');
  }
  const jwk = await loadJwks(domain, header.kid);
  if (!jwk) throw new HttpError(401, 'Chave desconhecida.');
  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  } catch { throw new HttpError(401, 'Token inválido.'); }
  if (!valid) throw new HttpError(401, 'Token inválido.');
  if (typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new HttpError(401, 'Identidade do usuário inválida.');
  }
  return payload.email.toLowerCase();
}
