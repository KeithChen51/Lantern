import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
const base = new URL(process.argv[2] || 'http://127.0.0.1:4318');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Smoke checks are restricted to a local test server.');
const checks = [];
async function check(path, status, options = {}) {
  const response = await fetch(new URL(path, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, path);
  const text = await response.text();
  if (![200, 303].includes(status)) assert.ok(!text.includes('胖东来'), path);
  checks.push({ path, status }); return { response, text };
}
const login = await check('/login', 200);
assert.ok(login.text.includes('员工登录'));
assert.ok(login.response.headers.get('content-security-policy')?.includes("script-src 'none'"));
const home = await check('/', 303);
assert.equal(new URL(home.response.headers.get('location')).pathname, '/login');
await check('/heart', 303);
await check('/auth/device?user_code=ABCDEF123456', 303);
await check('/admin/knowledge', 303);
// Next 16 strips flight headers and _rsc before invoking proxy. The resulting
// redirect must still deny data and point only to the configured login page.
const rsc = await check('/heart?_rsc=fixture', 303, { headers: { RSC: '1' } });
assert.equal(new URL(rsc.response.headers.get('location')).pathname, '/login');
assert.ok(!rsc.text.includes('胖东来'));
const data = await check('/_next/data/fixture/heart.json', 303);
assert.equal(new URL(data.response.headers.get('location')).pathname, '/login');
assert.ok(!data.text.includes('胖东来'));
await check('/api/resources', 401);
await check('/api/client/v1/resources', 401);
await check('/api/chat', 401, { method: 'POST', body: '{}' });
await check('/api/hermit/attachments', 401, { method: 'POST', body: '{}' });
await check('/api/admin/knowledge', 401, { method: 'POST', body: '{}' });
await check('/api/admin/session', 410, { method: 'POST', body: '{}' });
await check('/api/preview-identity', 410);
await check('/api/feedback', 410, { method: 'POST', body: '{}' });
await check('/api/health/live', 200);
await check('/api/health/ready', 503); // fixture deliberately has no reachable DB
const callback = await check('/auth/portal/callback?token=synthetic&state=invalid', 303);
assert.ok(!callback.response.headers.get('location').includes('token='));
const chunks = await readdir('.next/static/chunks');
for (const chunk of chunks.filter(file => file.endsWith('.js'))) await check('/_next/static/chunks/' + chunk, 401);
const css = chunks.find(file => file.endsWith('.css'));
if (css) await check('/_next/static/chunks/' + css, 200);
await check('/nav-lighthouse-transparent.png', 200);
console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
