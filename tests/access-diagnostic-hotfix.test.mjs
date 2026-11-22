import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';
const url='https://dev.yolanda-site.pages.dev/app/';
const next=async()=>new Response('OK');
const request=()=>new Request(url);
let out=await onRequest({ request:request(), env:{}, next});
assert.equal(out.status,503);
let data=await out.json();
assert.equal(data.code,'ACCESS_CONFIG_INVALID');
assert.equal(data.error,'Falha na configuração ou validação do Cloudflare Access.');
assert.equal(out.headers.get('Cache-Control'),'no-store, no-cache, must-revalidate, private');
out=await onRequest({ request:request(), env:{ACCESS_AUD:'a'.repeat(64),ACCESS_TEAM_DOMAIN:'yolandaimoveis.cloudflareaccess.com'},next});
assert.equal(out.status,401);
assert.equal((await out.json()).code,'ACCESS_UNAUTHORIZED');
const badTokenHeader={alg:'RS256',kid:'kid1',typ:'JWT'};
const now=Math.floor(Date.now()/1000);
const badTokenPayload={aud:['a'.repeat(64)],iss:'https://yolandaimoveis.cloudflareaccess.com',exp:now+3600,email:'x@example.com'};
const b64=(v)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const jwt=`${b64(badTokenHeader)}.${b64(badTokenPayload)}.AQID`;
const realFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('simulated JWKS network failure')};
try {
  out=await onRequest({request:new Request(url,{headers:{'Cf-Access-Jwt-Assertion':jwt}}),env:{ACCESS_AUD:'a'.repeat(64),ACCESS_TEAM_DOMAIN:'yolandaimoveis.cloudflareaccess.com'},next});
  assert.equal(out.status,503);
  assert.equal((await out.json()).code,'ACCESS_VERIFICATION_UNAVAILABLE');
} finally {globalThis.fetch=realFetch;}
console.log('3 testes do diagnóstico de autenticação: aprovados');
