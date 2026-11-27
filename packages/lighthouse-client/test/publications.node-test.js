import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Transport, ClientError, SCOPE, PUBLISH_SCOPE } from '../src/transport.js';
import { LighthouseClient } from '../src/client.js';
import { MemoryStore, SecureStore, FileLock, credentialKey } from '../src/credentials.js';
import { readPublicationInput, publicationRequest } from '../src/publications.js';
import { runCli } from '../src/cli.js';
import { createMcpServer, PUBLISH_TOOL_NAMES } from '../src/mcp.js';

const origin = 'https://lighthouse.example';
const temp = () => mkdtemp(join(tmpdir(), 'lighthouse-publish-test-'));
const requestId = '20d5f182-84bf-40dd-b6c8-c1f5ee97488b';
const credential = scope => ({ origin, clientId: 'lighthouse-cli', scope, accessToken: `access-${scope}`, refreshToken: `refresh-${scope}`, expiresAt: Date.now() + 200000, grantExpiresAt: Date.now() + 1000000 });
const schedule = () => ({ draftId: 'draft1', scheduledAt: '2030-01-01T09:00:00+08:00', requestId, targets: [{ channel: 'group', audience: { kind: 'members', ids: ['member1'] } }, { channel: 'auto', audience: { kind: 'departments', ids: ['2'] } }] });
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('publishing grants, encrypted credentials and lock keys stay isolated from knowledge', async () => {
  const store = new MemoryStore();
  await store.set(origin, credential(SCOPE));
  await store.set(origin, credential(PUBLISH_SCOPE), PUBLISH_SCOPE);
  assert.notEqual(credentialKey(origin), credentialKey(origin, PUBLISH_SCOPE));
  assert.equal((await store.get(origin)).scope, SCOPE);
  assert.equal((await store.get(origin, PUBLISH_SCOPE)).scope, PUBLISH_SCOPE);
  await assert.rejects(store.set(origin, credential(PUBLISH_SCOPE)), { code: 'invalid_credential' });
  const client = new LighthouseClient(origin, { store, scope: PUBLISH_SCOPE, lock: new FileLock({ directory: await temp() }), transport: { request: async (path, options) => {
    if (path === '/api/client/v1/me') return { scope: PUBLISH_SCOPE };
    assert.equal(path, '/api/client/v1/auth/revoke');
    assert.equal(options.token, `access-${PUBLISH_SCOPE}`);
    return null;
  } } });
  assert.equal((await client.status()).identity.scope, PUBLISH_SCOPE);
  assert.deepEqual(await client.logout(), { authenticated: false, revoked: true });
  assert.equal(await store.get(origin, PUBLISH_SCOPE), null);
  assert.ok(await store.get(origin));
  const lockScopes = [];
  const scopeClient = new LighthouseClient(origin, { scope: PUBLISH_SCOPE, store, lock: { run: async (_origin, callback, scope) => { lockScopes.push(scope); return callback(); } } });
  await scopeClient.logout();
  assert.deepEqual(lockScopes, [PUBLISH_SCOPE]);
  const directory = await temp();
  const secure = new SecureStore({ directory, platform: 'win32', runner: async (_command, _args, input) => {
    const payload = JSON.parse(input);
    return payload.operation === 'encrypt' ? Buffer.from(payload.value).toString('base64') : Buffer.from(payload.value, 'base64').toString();
  } });
  await secure.set(origin, credential(SCOPE));
  await secure.set(origin, credential(PUBLISH_SCOPE), PUBLISH_SCOPE);
  assert.ok(await readFile(join(directory, `${credentialKey(origin)}.dpapi`)));
  assert.equal((await secure.get(origin, PUBLISH_SCOPE)).scope, PUBLISH_SCOPE);
});

test('device login requests publication scope and rejects a token for a different scope', async () => {
  let clock = 0;
  const store = new MemoryStore();
  const client = new LighthouseClient(origin, { scope: PUBLISH_SCOPE, store, lock: new FileLock({ directory: await temp() }), now: () => clock, sleep: async ms => { clock += ms; }, transport: { request: async (path, options) => {
    if (path.endsWith('/authorize')) {
      assert.equal(options.form.scope, PUBLISH_SCOPE);
      return { device_code: 'device', user_code: 'CODE', verification_uri: `${origin}/auth/device`, expires_in: 30, interval: 1 };
    }
    return { access_token: 'access', refresh_token: 'refresh', token_type: 'Bearer', scope: PUBLISH_SCOPE, expires_in: 300 };
  } } });
  assert.equal((await client.login()).scope, PUBLISH_SCOPE);
  assert.equal((await store.get(origin, PUBLISH_SCOPE)).scope, PUBLISH_SCOPE);
  assert.equal(await store.get(origin), null);
  assert.throws(() => client.credential({ access_token: 'a', refresh_token: 'r', token_type: 'Bearer', scope: SCOPE, expires_in: 300 }, 1000000), { code: 'invalid_token_response' });
  await assert.rejects(client.knowledge('get', { resourceId: 'r1' }), { code: 'invalid_scope' });
  await assert.rejects(new LighthouseClient(origin).publication('schedule', schedule()), { code: 'invalid_scope' });
});

test('multipart upload and task endpoints use fixed methods, bearer authentication and source channel', async () => {
  const calls = [];
  const transport = new Transport(origin, { fetch: async (url, options) => { calls.push({ url, options }); return json({ task: { id: 'task1' } }); } });
  const form = new FormData();
  form.append('title', 'Title'); form.append('digest', 'Summary');
  form.append('html', new Blob(['<p>Hello</p>'], { type: 'text/html' }), 'body.html');
  form.append('cover', new Blob([png], { type: 'image/png' }), 'cover.png');
  await transport.request('/api/admin/wecom-publications/drafts', { method: 'POST', token: 'test', multipart: form, clientChannel: 'cli' });
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.headers['Content-Type'], undefined);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test');
  assert.equal(calls[0].options.headers['X-Lighthouse-Client'], 'cli');
  await transport.request('/api/admin/wecom-publications/tasks', { method: 'POST', json: schedule(), clientChannel: 'mcp' });
  assert.deepEqual(JSON.parse(calls[1].options.body), schedule());
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
  await transport.request('/api/admin/wecom-publications/tasks');
  await transport.request('/api/admin/wecom-publications/tasks/task1');
  await transport.request('/api/admin/wecom-publications/tasks/task1/retry', { method: 'POST', json: { channel: 'group', requestId } });
  for (const [path, options] of [
    ['/api/admin/wecom-publications/tasks/task1', { method: 'POST' }],
    ['/api/admin/wecom-publications/tasks/task1/retry', {}],
    ['/api/admin/wecom-publications/tasks/..', {}],
    ['/api/admin/wecom-publications/drafts', {}],
    ['/api/admin/wecom-publications/credentials', {}],
    ['/api/auth/token', { method: 'POST', multipart: form }],
  ]) await assert.rejects(transport.request(path, options), ClientError);
  const hugeForm = new FormData(); hugeForm.append('file', new Blob([Buffer.alloc(32 * 1024 * 1024)]), 'large');
  await assert.rejects(transport.request('/api/admin/wecom-publications/drafts', { method: 'POST', multipart: hugeForm }), { code: 'request_too_large' });
});

test('publication validation keeps application audiences distinct and requires a caller idempotency key', () => {
  const valid = schedule();
  assert.deepEqual(publicationRequest('schedule', valid).options.json, valid);
  assert.equal(publicationRequest('status', { taskId: 'task1' }).path, '/api/admin/wecom-publications/tasks/task1');
  assert.equal(publicationRequest('retry', { taskId: 'task1', channel: 'auto', requestId }).options.json.channel, 'auto');
  for (const invalid of [
    { ...valid, requestId: undefined },
    { ...valid, scheduledAt: '2030-01-01T09:00:00' },
    { ...valid, scheduledAt: '2030-02-30T09:00:00+08:00' },
    { ...valid, accessToken: 'injected' },
    { ...valid, targets: [{ channel: 'group', audience: { kind: 'members', ids: ['@all'] } }] },
    { ...valid, targets: [{ channel: 'group', audience: { kind: 'all', ids: ['member1'] } }] },
    { ...valid, targets: [{ channel: 'auto', audience: null }] },
    { ...valid, targets: [valid.targets[0], valid.targets[0]] },
  ]) assert.throws(() => publicationRequest('schedule', invalid), ClientError);
  assert.throws(() => publicationRequest('status', { taskId: '../auth' }), { code: 'invalid_identifier' });
});

test('draft manifests read explicit paths relative to their own file and reject oversized or mismatched files', async () => {
  const directory = await temp();
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'article.html'), '<p>__WECOM_BODY_IMAGE__</p>');
  await writeFile(join(directory, 'assets', 'cover.png'), png);
  await writeFile(join(directory, 'assets', 'body.png'), png);
  const path = join(directory, 'draft.json');
  const manifest = { title: 'Title', digest: 'Summary', html: 'article.html', cover: 'assets/cover.png', images: ['assets/body.png'] };
  await writeFile(path, JSON.stringify(manifest));
  const form = await readPublicationInput('draft', path);
  assert.equal(form.get('cover').name, 'cover.png');
  assert.equal(form.get('images').type, 'image/png');
  assert.equal(await form.get('html').text(), '<p>__WECOM_BODY_IMAGE__</p>');
  await writeFile(join(directory, 'article.html'), 'x'.repeat(666 * 1024 + 1));
  await assert.rejects(readPublicationInput('draft', path), { code: 'invalid_file_size' });
  await writeFile(join(directory, 'article.html'), '<p>Body</p>');
  await writeFile(join(directory, 'assets', 'cover.png'), 'not a png');
  await assert.rejects(readPublicationInput('draft', path), { code: 'invalid_image' });
  await writeFile(path, JSON.stringify({ ...manifest, images: Array(11).fill('assets/body.png') }));
  await assert.rejects(readPublicationInput('draft', path), { code: 'invalid_publication_input' });
});

test('CLI publication commands select dedicated scope and preserve JSON task identifiers', async () => {
  const directory = await temp();
  const path = join(directory, 'schedule.json'); await writeFile(path, JSON.stringify(schedule()));
  const calls = []; let out = '';
  const options = { directory, stdout: { write: text => { out += text; } }, createClient: (_origin, config) => {
    assert.equal(config.scope, PUBLISH_SCOPE);
    return { publication: async (operation, input) => { calls.push({ operation, input }); return { task: { id: 'task1' } }; }, status: async () => ({ authenticated: true }), logout: async () => ({ revoked: true }) };
  } };
  await runCli(['--server', origin, 'publish', 'schedule', '--input', path], options);
  assert.deepEqual(JSON.parse(out), { task: { id: 'task1' } });
  assert.deepEqual(calls[0], { operation: 'schedule', input: schedule() });
  await runCli(['--server', origin, 'publish', 'status', '--task-id', 'task1'], options);
  assert.deepEqual(calls.at(-1), { operation: 'status', input: { taskId: 'task1' } });
  await runCli(['--server', origin, 'auth', 'status', '--scope', PUBLISH_SCOPE], options);
  await assert.rejects(runCli(['--server', origin, 'publish', 'list', '--scope', SCOPE], options), { code: 'invalid_scope' });
  await assert.rejects(runCli(['--server', origin, 'knowledge', 'browse', '--scope', PUBLISH_SCOPE], options), { code: 'invalid_scope' });
});

test('publication MCP opt-in exposes schedule and status, preserves task ID and rejects extra arguments', async () => {
  const calls = [];
  const server = createMcpServer({ scope: PUBLISH_SCOPE, publication: async (operation, input) => { calls.push({ operation, input }); return { task: { id: 'task1', deliveries: [] } }; } });
  const client = new Client({ name: 'publishing-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name), PUBLISH_TOOL_NAMES);
    assert.equal(tools.tools.find(tool => tool.name === 'wecom_schedule').annotations.readOnlyHint, false);
    assert.equal(tools.tools.find(tool => tool.name === 'wecom_status').annotations.readOnlyHint, true);
    assert.equal((await client.callTool({ name: 'wecom_schedule', arguments: { ...schedule(), token: 'injected' } })).isError, true);
    assert.equal((await client.callTool({ name: 'knowledge_get', arguments: { resourceId: 'r1' } })).isError, true);
    assert.equal(calls.length, 0);
    const result = await client.callTool({ name: 'wecom_schedule', arguments: schedule() });
    assert.equal(JSON.parse(result.content[0].text).task.id, 'task1');
    await client.callTool({ name: 'wecom_status', arguments: { taskId: 'task1' } });
    assert.deepEqual(calls.at(-1), { operation: 'status', input: { taskId: 'task1' } });
  } finally { await client.close(); await server.close(); }
});
