// Apenas testes locais: JWT RS256 real e JWKS falso interceptado no processo Node.
// Nenhum bypass ou chave de teste é incluído nas Pages Functions publicadas.
import { generateKeyPairSync, createSign } from 'node:crypto';
const DOMAIN = 'test.cloudflareaccess.com';
const AUD = 'test-audience-yolanda';
const KID = 'test-rsa-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
Object.assign(jwk, { kid: KID, alg: 'RS256', use: 'sig' });
const beforeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === `https://${DOMAIN}/cdn-cgi/access/certs`)
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
  return beforeFetch(input, init);
};
const b64 = data => Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)).toString('base64url');
function makeToken(payloadChange = {}, headerChange = {}) {
  const now = Math.floor(Date.now()/1000);
  const part1 = b64({ typ: 'JWT', alg: 'RS256', kid: KID, ...headerChange });
  const part2 = b64({ iss: `https://${DOMAIN}`, aud: [AUD], iat: now, exp: now+3600, email: 'tester@example.com', ...payloadChange });
  const sign = createSign('RSA-SHA256');
  sign.update(`${part1}.${part2}`); sign.end();
  return `${part1}.${part2}.${sign.sign(privateKey).toString('base64url')}`;
}
export function configureTestAuth(env) {
  delete env.DEV_BYPASS;
  env.ACCESS_TEAM_DOMAIN = DOMAIN;
  env.ACCESS_AUD = AUD;
  return env;
}
export const authHeaders = () => ({ 'Cf-Access-Jwt-Assertion': makeToken() });
export { makeToken, DOMAIN, AUD };
