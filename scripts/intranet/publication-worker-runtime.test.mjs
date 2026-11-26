import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorker } from './publication-worker-runtime.mjs';
import { workerHealthy } from './publication-worker-health.mjs';

test('SIGTERM waits for the in-flight cycle and prevents another claim', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publication-worker-'));
  const file = join(root, 'heartbeat.json');
  const signals = new EventEmitter();
  let resolveCycle;
  let claims = 0;
  const cycle = new Promise(resolve => { resolveCycle = resolve; });
  const run = runWorker({
    runCycle: () => { claims++; signals.emit('SIGTERM'); return cycle; },
    enabled: () => true, heartbeatFile: file, signals, pollMs: 1,
  });
  try {
    while (!claims) await new Promise(resolve => setImmediate(resolve));
    assert.equal(await workerHealthy(file), true);
    resolveCycle(true);
    await run;
    assert.equal(claims, 1);
    assert.equal((JSON.parse(await readFile(file, 'utf8'))).state, 'stopped');
    assert.equal(await workerHealthy(file), false);
    assert.equal(signals.listenerCount('SIGTERM'), 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('disabled worker remains responsive without executing a publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publication-worker-'));
  const signals = new EventEmitter();
  const file = join(root, 'heartbeat.json');
  let claims = 0;
  const run = runWorker({ runCycle: async () => { claims++; return false; }, enabled: () => false, heartbeatFile: file, signals, pollMs: 2, heartbeatMs: 2 });
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(claims, 0);
    assert.equal(await workerHealthy(file), true);
    signals.emit('SIGTERM');
    await run;
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('health rejects malformed, stopped, future and stale heartbeats', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publication-worker-'));
  const file = join(root, 'heartbeat.json');
  const now = Date.now();
  try {
    assert.equal(await workerHealthy(file, now), false);
    for (const value of ['{}', '{', JSON.stringify({ state: 'stopped', heartbeatAt: new Date(now).toISOString() }), JSON.stringify({ state: 'working', heartbeatAt: new Date(now + 1).toISOString() }), JSON.stringify({ state: 'idle', heartbeatAt: new Date(now - 45_000).toISOString() })]) {
      await writeFile(file, value);
      assert.equal(await workerHealthy(file, now), false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
