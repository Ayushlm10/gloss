import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const base = 'http://127.0.0.1:3100';

test('local API rejects untrusted origins and unavailable paid routes', async () => {
  for (const origin of ['https://attacker.invalid', null]) {
    const headers = { 'content-type': 'application/json' };
    if (origin) headers.origin = origin;
    const r = await fetch(`${base}/api/ask`, { method: 'POST', headers, body: '{}' });
    assert.equal(r.status, 403);
    const imported = await fetch(`${base}/api/import`, { method: 'POST', headers, body: '{}' });
    assert.equal(imported.status, 403);
  }
  for (const route of ['/api/speak', '/api/covers', '/api/pdf-careful', '/api/sync', '/api/agent-tokens', '/mcp']) {
    const r = await fetch(`${base}${route}`, { method: 'POST', headers: { origin: base } });
    assert.equal(r.status, 404, route);
  }
  const wrongImportHost = await new Promise((resolve, reject) => { const request = http.request(`${base}/api/import`, { method: 'POST', headers: { Host: 'attacker.invalid', Origin: base } }, (response) => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); request.end('{}'); });
  assert.equal(wrongImportHost, 403);
  const wrongHost = await new Promise((resolve, reject) => { const request = http.request(`${base}/api/key`, { headers: { Host: 'attacker.invalid' } }, (response) => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); request.end(); });
  assert.equal(wrongHost, 403);
  const importAllowed = await fetch(`${base}/api/import`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1/private' }) });
  assert.equal(importAllowed.status, 400);
  const r = await fetch(`${base}/api/key`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).local, true);
});
