import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { Transport, ClientError, validateOrigin, SCOPE } from '../src/transport.js';
import { LighthouseClient, versionUri, parseVersionUri, writeDownload, openVerification } from '../src/client.js';
import { SecureStore, MemoryStore, FileLock, credentialKey, runProcess } from '../src/credentials.js';
import { runCli, parseArguments } from '../src/cli.js';
import { createMcpServer, TOOL_NAMES } from '../src/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const origin = 'https://knowledge.example';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const tokenResponse = { access_token: 'access-secret', refresh_token: 'refresh-secret', token_type: 'Bearer', scope: SCOPE, expires_in: 300 };
const credential = (overrides = {}) => ({ origin, clientId: 'lighthouse-cli', scope: SCOPE, accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: 0, grantExpiresAt: Date.now() + 10000000, ...overrides });
const temp = () => mkdtemp(join(tmpdir(), 'lighthouse-test-'));
test('HTTPS origin binding, TLS and endpoint method restrictions', async () => {
  for (const bad of ['http://knowledge.example', `${origin}/path`, 'https://user:pass@knowledge.example', `${origin}?token=secret`, `${origin}#x`]) assert.throws(() => validateOrigin(bad));
  assert.equal(validateOrigin('https://KNOWLEDGE.example:443'), origin);
  const transport = new Transport(origin, { fetch: () => { throw Error('must not fetch'); } });
  for (const path of ['/api/chat', '/api/admin/resources', '/api/client/v1/resources/../me']) await assert.rejects(transport.request(path), { code: 'invalid_endpoint' });
  await assert.rejects(transport.request('/api/client/v1/resources', { method: 'POST' }), { code: 'invalid_endpoint' });
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED; process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try { assert.throws(() => validateOrigin(origin), { code: 'unsafe_tls' }); } finally { if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous; }
});
test('transport rejects redirects, malformed/oversized responses and times out even noncooperative fetch', async () => {
  const redirect = new Transport(origin, { fetch: async (_, options) => { assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit'); return new Response('', { status: 302, headers: { location: 'https://evil.example' } }); } });
  await assert.rejects(redirect.request('/api/client/v1/me'), { code: 'redirect_rejected' });
  await assert.rejects(new Transport(origin, { fetch: async () => new Response('not json') }).request('/api/client/v1/me'), { code: 'invalid_response' });
  await assert.rejects(new Transport(origin, { maxBytes: 10, fetch: async () => json({ big: 'x'.repeat(20) }) }).request('/api/client/v1/me'), { code: 'response_too_large' });
  await assert.rejects(new Transport(origin, { timeoutMs: 10, fetch: () => new Promise(() => {}) }).request('/api/client/v1/me'), { code: 'request_timeout' });
  await assert.rejects(new Transport(origin, { timeoutMs: 10, fetch: async () => new Response(new ReadableStream({ start() {} })) }).request('/api/client/v1/me'), { code: 'request_timeout' });
  await assert.rejects(new Transport(origin, { fetch: async () => json({ error: 'invalid_grant', error_description: 'refresh-secret' }, 400) }).request('/api/auth/token', { method: 'POST' }), error => error.code === 'invalid_grant' && !error.message.includes('secret'));
});
test('binary downloads accept 3 MiB, reject over 16 MiB, and retain 2 MiB JSON/error bounds', async () => {
  const path = '/api/client/v1/resources/r1/download'; const threeMiB = Buffer.alloc(3 * 1024 * 1024, 42);
  const downloaded = await new Transport(origin, { fetch: async () => new Response(threeMiB) }).request(path, { binary: true }); assert.equal(downloaded.length, threeMiB.length);
  await assert.rejects(new Transport(origin, { fetch: async () => new Response(Buffer.alloc(16 * 1024 * 1024 + 1)) }).request(path, { binary: true }), { code: 'response_too_large' });
  await assert.rejects(new Transport(origin, { fetch: async () => new Response('', { headers: { 'content-length': String(16 * 1024 * 1024 + 1) } }) }).request(path, { binary: true }), { code: 'response_too_large' });
  const bigJson = { payload: 'x'.repeat(2 * 1024 * 1024) };
  await assert.rejects(new Transport(origin, { fetch: async () => json(bigJson) }).request('/api/client/v1/me'), { code: 'response_too_large' });
  await assert.rejects(new Transport(origin, { fetch: async () => json(bigJson, 400) }).request(path, { binary: true }), { code: 'response_too_large' });
});
test('device login handles pending and slow_down without leaking token; stores only exact scope', async () => {
  const directory = await temp(); const store = new MemoryStore(); let now = 1000; const waits = []; let polls = 0; const requests = [];
  const transport = new Transport(origin, { fetch: async (url, options) => {
    const form = Object.fromEntries(options.body); requests.push({ path: url.pathname, form });
    if (url.pathname.endsWith('authorize')) return json({ device_code: 'device-secret', user_code: 'ABCD-EFGH', verification_uri: `${origin}/auth/device`, expires_in: 60, interval: 1 });
    polls++; if (polls === 1) return json({ error: 'authorization_pending' }, 400); if (polls === 2) return json({ error: 'slow_down' }, 400); return json(tokenResponse);
  } });
  const client = new LighthouseClient(origin, { transport, store, lock: new FileLock({ directory }), now: () => now, sleep: async ms => { waits.push(ms); now += ms; } });
  let shown; const result = await client.login({ onVerification: info => { shown = info; } });
  assert.equal(shown.userCode, 'ABCD-EFGH'); assert.deepEqual(waits, [1000, 1000, 6000]); assert.equal(result.scope, SCOPE); assert.ok(!JSON.stringify(result).includes('secret'));
  assert.deepEqual(requests[0].form, { client_id: 'lighthouse-cli', scope: SCOPE, device_name: 'lighthouse' });
  assert.equal(requests[1].form.grant_type, 'urn:ietf:params:oauth:grant-type:device_code'); assert.equal((await store.get(origin)).grantExpiresAt, now + 28800000);
  assert.throws(() => client.credential({ ...tokenResponse, scope: 'knowledge:manage' }, now + 100000), { code: 'invalid_token_response' });
  assert.throws(() => client.credential({ ...tokenResponse, expires_in: 301 }, now + 100000), { code: 'invalid_token_response' });
});
test('device denial, expiry and malicious verification URLs fail closed', async () => {
  for (const errorCode of ['access_denied', 'expired_token']) {
    let now = 0; const client = new LighthouseClient(origin, { transport: { request: async path => path.endsWith('authorize') ? { device_code: 'd', user_code: 'CODE', verification_uri: `${origin}/auth/device`, expires_in: 20, interval: 1 } : Promise.reject(new ClientError(errorCode)) }, now: () => now, sleep: async ms => { now += ms; } });
    await assert.rejects(client.login(), { code: errorCode });
  }
  const client = new LighthouseClient(origin);
  for (const url of ['https://evil.example/login', 'http://knowledge.example/login', 'https://user:password@knowledge.example/']) assert.throws(() => client.verificationUrl(url));
});
test('cross-client concurrent refresh re-reads under shared file lock and rotates once', async () => {
  const directory = await temp(); const store = new MemoryStore(); await store.set(origin, credential()); let refreshes = 0;
  const transport = { request: async (path, options) => { assert.equal(path, '/api/auth/token'); assert.equal(options.form.refresh_token, 'old-refresh'); refreshes++; await new Promise(resolve => setTimeout(resolve, 30)); return tokenResponse; } };
  const clients = [0, 1, 2].map(() => new LighthouseClient(origin, { transport, store, lock: new FileLock({ directory, intervalMs: 5 }) }));
  assert.deepEqual(await Promise.all(clients.map(client => client.accessToken())), ['access-secret', 'access-secret', 'access-secret']); assert.equal(refreshes, 1);
  assert.equal((await store.get(origin)).refreshToken, 'refresh-secret');
});
test('file lock also excludes a different Node process', async () => {
  const directory = await temp(); const lock = new FileLock({ directory });
  const moduleUrl = new URL('../src/credentials.js', import.meta.url).href;
  let childResult;
  await lock.run(origin, async () => {
    const code = `import {FileLock} from ${JSON.stringify(moduleUrl)}; const lock=new FileLock({directory:${JSON.stringify(directory)},timeoutMs:30,intervalMs:5}); try {await lock.run(${JSON.stringify(origin)},()=>{});process.exit(2)} catch(e) {process.stdout.write(e.code);process.exit(e.code==='credential_lock_timeout'?0:1)}`;
    childResult = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['--input-type=module', '-e', code], { shell: false, windowsHide: true }); let out = ''; child.stdout.on('data', chunk => { out += chunk; }); child.on('error', reject); child.on('close', exitCode => resolve({ out, exitCode })); });
  });
  assert.deepEqual(childResult, { out: 'credential_lock_timeout', exitCode: 0 });
  await lock.run(origin, () => {});
});
test('abandoned locks bound waiting; invalid credentials and refresh replay do not fallback', async () => {
  const directory = await temp(); await writeFile(join(directory, `${credentialKey(origin)}.lock`), JSON.stringify({ pid: 9999999, createdAt: 0 }));
  await assert.rejects(new FileLock({ directory, timeoutMs: 10, intervalMs: 3 }).run(origin, () => {}), { code: 'credential_lock_timeout' });
  const store = new MemoryStore(); await store.set(origin, credential()); const client = new LighthouseClient(origin, { store, lock: new FileLock({ directory: await temp() }), transport: { request: async () => { throw new ClientError('invalid_grant'); } } });
  await assert.rejects(client.accessToken(), { code: 'invalid_grant' }); assert.equal(await store.get(origin), null);
  await assert.rejects(client.accessToken(), { code: 'login_required' });
  await assert.rejects(store.set('https://other.example', credential()), { code: 'invalid_credential' });
});
test('status verifies server identity; logout rotates expired access then revokes before clearing', async () => {
  const directory = await temp(); const store = new MemoryStore(); await store.set(origin, credential()); const calls = [];
  const client = new LighthouseClient(origin, { store, lock: new FileLock({ directory }), transport: { request: async (path, options) => { calls.push({ path, options }); if (path === '/api/auth/token') return tokenResponse; if (path.endsWith('/me')) return { user: { id: 'employee-test' }, scope: SCOPE }; return null; } } });
  const status = await client.status(); assert.equal(status.identity.user.id, 'employee-test');
  const logout = await client.logout(); assert.deepEqual(logout, { authenticated: false, revoked: true }); assert.equal(calls.at(-1).path, '/api/client/v1/auth/revoke'); assert.equal(calls.at(-1).options.token, 'access-secret'); assert.equal(await store.get(origin), null);
  await store.set(origin, credential({ expiresAt: Date.now() + 200000 })); client.transport = { request: async () => { throw new ClientError('network_error'); } };
  await assert.rejects(client.logout(), { code: 'network_error' }); assert.ok(await store.get(origin));
});
test('logout clears already revoked refresh grants while preserving credentials on outage', async () => {
  const store = new MemoryStore(); await store.set(origin, credential());
  const client = new LighthouseClient(origin, { store, lock: new FileLock({ directory: await temp() }), transport: { request: async () => { throw new ClientError('invalid_grant'); } } });
  assert.deepEqual(await client.logout(), { authenticated: false, revoked: true, alreadyRevoked: true }); assert.equal(await store.get(origin), null);
  await store.set(origin, credential()); client.transport = { request: async () => { throw new ClientError('http_503'); } };
  await assert.rejects(client.logout(), { code: 'http_503' }); assert.ok(await store.get(origin));
});
test('DPAPI uses static argv and stdin; ciphertext atomic file; secure backend failures never write plaintext', async () => {
  const directory = await temp(); const calls = [];
  const runner = async (command, args, input) => { calls.push({ command, args, input }); const payload = JSON.parse(input); return payload.operation === 'encrypt' ? Buffer.from(`encrypted:${payload.value}`).toString('base64') : Buffer.from(payload.value, 'base64').toString().slice(10); };
  const store = new SecureStore({ directory, platform: 'win32', runner }); const value = credential(); await store.set(origin, value);
  const disk = await readFile(join(directory, `${credentialKey(origin)}.dpapi`), 'utf8'); assert.ok(!disk.includes('old-refresh')); assert.deepEqual(await store.get(origin), value);
  assert.ok(calls.every(call => !JSON.stringify(call.args).includes('old-refresh'))); assert.ok(calls[0].input.includes('old-refresh'));
  const failing = new SecureStore({ directory: await temp(), platform: 'win32', runner: async () => { throw new ClientError('secure_backend_unavailable'); } });
  await assert.rejects(failing.set(origin, value), { code: 'secure_backend_unavailable' });
  await assert.rejects(new SecureStore({ directory: await temp(), platform: 'unsupported' }).set(origin, value), { code: 'secure_backend_unavailable' });
});
test('Windows DPAPI synthetic credential round trip through actual OS helper', { skip: process.platform !== 'win32' }, async () => {
  const store = new SecureStore({ directory: await temp() }); const value = credential();
  await store.set(origin, value); assert.deepEqual(await store.get(origin), value);
  await store.delete(origin); assert.equal(await store.get(origin), null);
});
test('Keychain/Secret Service payloads use stdin and unavailable runner errors are sanitized', async () => {
  for (const platform of ['darwin', 'linux']) {
    const calls = []; const store = new SecureStore({ directory: await temp(), platform, runner: async (...args) => { calls.push(args); return ''; } });
    await store.set(origin, credential()); assert.ok(calls[0][2].includes('old-refresh')); assert.ok(!JSON.stringify(calls[0].slice(0, 2)).includes('old-refresh'));
  }
  await assert.rejects(runProcess('lighthouse-missing-test-program', [], 'secret'), error => error.code === 'secure_backend_unavailable' && !error.message.includes('secret'));
});
test('knowledge routes preserve exact version/citations and exclude maintenance', async () => {
  const store = new MemoryStore(); await store.set(origin, credential({ expiresAt: Date.now() + 200000 })); const calls = [];
  const transport = { request: async (path, options) => { calls.push({ path, options }); return { versionId: 'v1', citation: { resourceUri: versionUri('r1', 'v1') } }; } };
  const client = new LighthouseClient(origin, { store, transport, lock: new FileLock({ directory: await temp() }) });
  const result = await client.knowledge('read', { resourceId: 'r1', versionId: 'v1', startLine: 2, lineCount: 3 });
  assert.equal(result.citation.resourceUri, 'lighthouse://resources/r1/versions/v1'); assert.equal(calls[0].path, '/api/client/v1/resources/r1/read'); assert.deepEqual(calls[0].options.query, { versionId: 'v1', startLine: 2, lineCount: 3 });
  await client.knowledge('file_read', { resourceId: 'r1', versionId: 'v1', path: 'policy.md', offset: 0 }); assert.equal(calls[1].path, '/api/client/v1/resources/r1/files/read');
  for (const operation of ['ask', 'publish', 'history', 'import', 'preview', 'interactions']) await assert.rejects(client.knowledge(operation), { code: 'unknown_operation' });
  await assert.rejects(client.knowledge('get', { resourceId: '../auth' }), { code: 'invalid_identifier' });
  await assert.rejects(client.knowledge('search', { query: 'x', tags: 'y' }), { code: 'invalid_arguments' });
  await assert.rejects(client.knowledge('read', { resourceId: 'r1', lineCount: 121 }), { code: 'invalid_arguments' });
  await assert.rejects(client.knowledge('get', { resourceId: 'r'.repeat(121) }), { code: 'invalid_identifier' });
  await assert.rejects(client.knowledge('search', { query: 'q'.repeat(501) }), { code: 'invalid_arguments' });
  await assert.rejects(client.knowledge('file_read', { resourceId: 'r1', path: 'p'.repeat(241) }), { code: 'invalid_arguments' });
  await client.knowledge('get', { resourceId: 'r'.repeat(120) });
  await client.knowledge('search', { query: 'q'.repeat(500) });
  await client.knowledge('file_read', { resourceId: 'r1', path: 'p'.repeat(240) });
});
test('download selects only discovered opaque file IDs or package/markdown with exact version', async () => {
  const directory = await temp(); const store = new MemoryStore(); await store.set(origin, credential({ expiresAt: Date.now() + 200000 })); const calls = [];
  const bytes = Buffer.alloc(3 * 1024 * 1024, 42); const transport = new Transport(origin, { fetch: async (url, options) => { calls.push({ query: Object.fromEntries(url.searchParams), options }); return new Response(bytes); } });
  const client = new LighthouseClient(origin, { store, transport, lock: new FileLock({ directory }) });
  for (const fileId of ['a'.repeat(64), 'package', 'markdown']) {
    const output = join(directory, `${fileId}.download`); const result = await client.download({ resourceId: 'r1', versionId: 'v1', fileId }, output);
    assert.equal(result.bytes, bytes.length); assert.equal((await readFile(output)).length, bytes.length); assert.deepEqual(calls.at(-1).query, { versionId: 'v1', fileId });
  }
  for (const fileId of ['policy.md', 'folder/policy.md', 'A'.repeat(64), 'a'.repeat(63)]) await assert.rejects(client.download({ resourceId: 'r1', versionId: 'v1', fileId }, join(directory, 'unused')), { code: 'invalid_arguments' });
  await assert.rejects(client.download({ resourceId: 'r1', fileId: 'package' }, join(directory, 'unused')), { code: 'invalid_arguments' }); assert.equal(calls.length, 3);
});
test('download exclusively creates explicitly chosen path and rejects reserved/symlink/overwrite targets', async () => {
  const directory = await temp(); const path = join(directory, 'file.txt'); assert.equal(await writeDownload(path, Buffer.from('data')), path); assert.equal(await readFile(path, 'utf8'), 'data');
  await assert.rejects(writeDownload(path, Buffer.from('overwrite')), { code: 'EEXIST' });
  for (const filename of ['CON.txt', 'NUL', 'data:stream', 'end.']) await assert.rejects(writeDownload(join(directory, filename), Buffer.from('x')), { code: 'unsafe_output_path' });
  const real = join(directory, 'real'); await mkdir(real); const linked = join(directory, 'link'); await symlink(real, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(writeDownload(join(linked, 'x'), Buffer.from('x')), { code: 'unsafe_output_path' });
});
test('CLI stdout stays JSON and browser opener never uses shell interpolation', async () => {
  let out = ''; let err = ''; const directory = await temp();
  await runCli(['--server', origin, 'auth', 'login'], { directory, stdout: { write: value => { out += value; } }, stderr: { write: value => { err += value; } }, createClient: () => ({ login: async options => { await options.onVerification({ verificationUri: `${origin}/auth/device`, userCode: 'ABCD' }); return { authenticated: true }; } }) });
  assert.deepEqual(JSON.parse(out), { authenticated: true }); assert.ok(err.includes('ABCD')); assert.ok(!out.includes('ABCD')); assert.deepEqual(JSON.parse(await readFile(join(directory, 'profile.json'), 'utf8')), { server: origin });
  assert.deepEqual(parseArguments(['knowledge', 'ask']).words, ['knowledge', 'ask']);
  await assert.rejects(runCli(['--server', origin, 'knowledge', 'ask']), { code: 'unknown_command' });
  let spawned;
  await openVerification(`${origin}/auth/device?code=ABCD%26echo`, { platform: 'win32', spawnProcess: (command, args, options) => { spawned = { command, args, options }; const child = new EventEmitter(); queueMicrotask(() => child.emit('exit', 0)); return child; } });
  assert.equal(spawned.options.shell, false); assert.equal(spawned.args.length, 2); assert.ok(spawned.args[1].includes('%26echo'));
});
test('MCP protocol exposes seven readonly tools, rejects unlisted/extra arguments and pins versions', async () => {
  const calls = []; const server = createMcpServer({ knowledge: async (operation, args) => { calls.push({ operation, args }); return { versionId: args.versionId ?? 'v1', citation: { resourceUri: versionUri(args.resourceId ?? 'r1', args.versionId ?? 'v1') } }; } });
  const client = new Client({ name: 'test', version: '1' }); const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
  try {
    const tools = await client.listTools(); assert.deepEqual(tools.tools.map(tool => tool.name), TOOL_NAMES); assert.ok(tools.tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
    for (const name of ['ask', 'knowledge_publish', 'knowledge_import', 'knowledge_preview', 'knowledge_history', 'knowledge_interactions']) { const result = await client.callTool({ name, arguments: {} }); assert.equal(result.isError, true); }
    const extra = await client.callTool({ name: 'knowledge_get', arguments: { resourceId: 'r1', accessToken: 'secret' } }); assert.equal(extra.isError, true); assert.equal(calls.length, 0);
    for (const request of [{ name: 'knowledge_search', arguments: { query: 'q'.repeat(501) } }, { name: 'knowledge_get', arguments: { resourceId: 'r'.repeat(121) } }, { name: 'knowledge_file_read', arguments: { resourceId: 'r1', path: 'p'.repeat(241) } }]) assert.equal((await client.callTool(request)).isError, true);
    assert.equal(calls.length, 0);
    const get = await client.callTool({ name: 'knowledge_get', arguments: { resourceId: 'r1', versionId: 'v1' } }); assert.equal(JSON.parse(get.content[0].text).versionId, 'v1');
    const uri = versionUri('r1', 'v1'); const resource = await client.readResource({ uri }); assert.equal(resource.contents[0].uri, uri); assert.deepEqual(calls.at(-1), { operation: 'read', args: { resourceId: 'r1', versionId: 'v1' } });
    assert.deepEqual(parseVersionUri(uri), { resourceId: 'r1', versionId: 'v1' });
  } finally { await client.close(); await server.close(); }
});
test('actual CLI stdio MCP handshake has no stdout diagnostics', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/cli.js', import.meta.url)), '--server', origin, '--ephemeral', 'mcp', 'serve'], stderr: 'pipe' });
  const client = new Client({ name: 'stdio-test', version: '1' });
  try { await client.connect(transport); const tools = await client.listTools(); assert.deepEqual(tools.tools.map(tool => tool.name), TOOL_NAMES); const unlisted = await client.callTool({ name: 'ask', arguments: {} }); assert.equal(unlisted.isError, true); }
  finally { await client.close(); }
});
