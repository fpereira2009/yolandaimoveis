import assert from 'node:assert/strict';
import { configureTestAuth, makeToken } from './helpers/access-fixture.mjs';
import { authenticate } from '../functions/_shared/access-auth.js';

const env = configureTestAuth({});
const token = makeToken({}, { kid: 'force-uncached-jwks-diagnostic' });
const request = new Request('https://dev.yolanda-site.pages.dev/app/', {
  headers: { 'Cf-Access-Jwt-Assertion': token },
});
const originalFetch = globalThis.fetch;
const originalError = console.error;
const cases = [
  { stage: 'FETCH_FAILED_OR_REDIRECT_BLOCKED', fetch: async () => { throw new Error('simulated failure'); } },
  { stage: 'HTTP_NON_OK', status: 429, fetch: async () => new Response('blocked', { status: 429 }) },
  { stage: 'INVALID_JSON', fetch: async () => new Response('<html>not json</html>') },
  { stage: 'KEYS_MISSING', fetch: async () => new Response(JSON.stringify({ unexpected: true })) },
];
let passed = 0;
try {
  for (const test of cases) {
    const logs = [];
    globalThis.fetch = test.fetch;
    console.error = (...args) => logs.push(args);
    await assert.rejects(() => authenticate(request, env), error => error?.status === 503);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], '[access-jwks]');
    assert.equal(logs[0][1], 'JWKS_UNAVAILABLE');
    assert.equal(logs[0][2].stage, test.stage);
    if (test.status) assert.equal(logs[0][2].httpStatus, test.status);
    assert.deepEqual(Object.keys(logs[0][2]).sort(), test.status ? ['httpStatus','stage'] : ['stage']);
    passed++;
  }
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
}
console.log(`PASSOU: ${passed} cenários de falha JWKS, sem exposição de dados sensíveis.`);
