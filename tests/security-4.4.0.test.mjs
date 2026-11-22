// Testes negativos de AppSec: API Access JWT, middleware, entrada JSON, CSRF, isolamento de recursos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureTestAuth, authHeaders, makeToken } from './helpers/access-fixture.mjs';
import { authenticate } from '../functions/_shared/access-auth.js';
import { verifyWriteOrigin, readJson } from '../functions/_shared/request-guards.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { onRequest as api } from '../functions/api/[[route]].js';
import { onRequest as alias } from '../functions/api/%5B%5Broute%5D%5D.js';
const env = configureTestAuth({MEDIA_ENV:'preview', DEV_BYPASS:'1'});
let verified=0;
const pass = (condition, message) => { assert.ok(condition,message); verified++; };
async function rejectsStatus(action, status) {
  await assert.rejects(action, e=>e.status===status); verified++;
}
const makeRequest = (headers = {}, url='https://dev.yolanda-site.pages.dev/app/') => new Request(url, {headers});
pass(await authenticate(makeRequest(authHeaders()), env)==='tester@example.com','JWT RS256 válido');
await rejectsStatus(()=>authenticate(makeRequest(),env),401);
await rejectsStatus(()=>authenticate(makeRequest({'Cf-Access-Jwt-Assertion':'abc.def.ghi'}),env),401);
await rejectsStatus(()=>authenticate(makeRequest({'Cf-Access-Jwt-Assertion':makeToken({}, {alg:'none'})}),env),401);
await rejectsStatus(()=>authenticate(makeRequest({'Cf-Access-Jwt-Assertion':makeToken({aud:['invalid']})}),env),401);
await rejectsStatus(()=>authenticate(makeRequest({'Cf-Access-Jwt-Assertion':makeToken({exp:Math.floor(Date.now()/1000)-10})}),env),401);
await rejectsStatus(()=>authenticate(makeRequest({'Cf-Access-Jwt-Assertion':makeToken({nbf:Math.floor(Date.now()/1000)+600})}),env),401);
const signed = makeToken(); const tampered = signed.split('.');
tampered[1] = Buffer.from(JSON.stringify({iss:'https://test.cloudflareaccess.com',aud:['test-audience-yolanda'],exp:Math.floor(Date.now()/1000)+3600,email:'attacker@example.com'})).toString('base64url');
await rejectsStatus(()=>authenticate(makeRequest({'Cf-Access-Jwt-Assertion':tampered.join('.')}),env),401);
await rejectsStatus(()=>authenticate(makeRequest(authHeaders()),{...env,ACCESS_TEAM_DOMAIN:'evil.example'}),503);
// DEV_BYPASS=1 não desliga mais a autenticação, mesmo num teste com HTTPS e host conhecido.
await rejectsStatus(()=>authenticate(makeRequest(),{...env,DEV_BYPASS:'1'}),401);

const site = 'https://dev.yolanda-site.pages.dev/api/leads';
verifyWriteOrigin(new Request(site,{headers:{Origin:'https://dev.yolanda-site.pages.dev'}})); verified++;
verifyWriteOrigin(new Request(site)); verified++;
await rejectsStatus(async()=>verifyWriteOrigin(new Request(site,{headers:{Origin:'https://attacker.example'}})),403);
await rejectsStatus(async()=>verifyWriteOrigin(new Request(site,{headers:{'Sec-Fetch-Site':'cross-site'}})),403);
await rejectsStatus(async()=>readJson(new Request(site,{method:'POST',body:'{}',headers:{'Content-Type':'text/plain'}})),415);
await rejectsStatus(async()=>readJson(new Request(site,{method:'POST',body:JSON.stringify({big:'a'.repeat(200)}),headers:{'Content-Type':'application/json'}}),100),413);
await rejectsStatus(async()=>readJson(new Request(site,{method:'POST',body:'[]',headers:{'Content-Type':'application/json'}})),400);
await rejectsStatus(async()=>readJson(new Request(site,{method:'POST',body:'{',headers:{'Content-Type':'application/json'}})),400);
pass((await readJson(new Request(site,{method:'POST',body:'{"ok":true}',headers:{'Content-Type':'application/json'}}))).ok,'JSON válido');

const protectedAsset = (headers={}, host='dev.yolanda-site.pages.dev', route='/app/')=>({
 request:new Request(`https://${host}${route}`,{headers}),env,
 next:async()=>new Response('conteúdo protegido',{status:200}),
});
let r=await middleware(protectedAsset());pass(r.status===401,'Preview /app bloqueado sem JWT');
r=await middleware(protectedAsset(authHeaders()));pass(r.status===200,'Preview autorizado');
pass(r.headers.get('cache-control')?.includes('no-store'),'CRM com no-store');
r=await middleware(protectedAsset(authHeaders(),'yolanda-site.pages.dev'));
pass(r.status===404,'/app proibido na vitrine produção');
const crcCtx=protectedAsset(authHeaders(),'crc.yolandaimoveis.com.br','/');
crcCtx.env={...env,ASSETS:{fetch:async()=>new Response('painel')}};
r=await middleware(crcCtx);pass(r.status===200,'CRC autenticado pode abrir app em /');
// As duas rotas existentes continuam disponíveis e protegidas.
for(const handler of [api,alias]) {
  const x=await handler({request:new Request('https://preview.example.test/api/leads'),env,params:{route:['leads']}});
  pass(x.status===401,'API sem JWT negada');
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wrangler=fs.readFileSync(path.join(root,'wrangler.toml'),'utf8');
pass(wrangler.includes('database_name = "yolanda-crm-dev"') && wrangler.includes('database_name = "yolanda-crm"'), 'D1 separados');
pass(wrangler.includes('bucket_name = "yolanda-imoveis-dev"') && wrangler.includes('bucket_name = "yolanda-imoveis-prod"'), 'R2 separados');
pass(!fs.existsSync(path.join(root,'public/app/Microsoft.Services.Store.winmd')),'binário público não usado removido');
pass(!fs.readFileSync(path.join(root,'functions/_middleware.js'),'utf8').includes('DEV_BYPASS'),'middleware sem bypass');
pass(!fs.readFileSync(path.join(root,'functions/api/media/[[path]].js'),'utf8').includes("env.DEV_BYPASS"),'mídia sem bypass');
console.log(`PASSOU: ${verified} verificações negativas de segurança 4.4.0.`);
