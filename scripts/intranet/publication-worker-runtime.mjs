import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DEFAULT_HEARTBEAT_FILE = '/tmp/lighthouse-wecom-worker.json';

export async function replaceHeartbeatFile(temporary, destination, renameFile = rename) {
  for (let attempt = 0; ; attempt++) {
    try { await renameFile(temporary, destination); return; }
    catch (error) {
      if (attempt >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      // Windows probes may briefly retain a read handle across atomic replace.
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

export async function runWorker({
  runCycle,
  enabled,
  heartbeatFile = DEFAULT_HEARTBEAT_FILE,
  signals = process,
  heartbeatMs = 10_000,
  pollMs = 5_000,
  onError = () => process.stderr.write('Publication worker cycle failed. See task records for delivery status.\n'),
}) {
  let stopping = false;
  let state = 'idle';
  let wake;
  let heartbeatError;
  const stop = () => { stopping = true; state = 'stopping'; wake?.(); };
  const heartbeat = async () => {
    await mkdir(dirname(heartbeatFile), { recursive: true });
    const temporary = `${heartbeatFile}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ pid: process.pid, state, heartbeatAt: new Date().toISOString() }), { mode: 0o600 });
    await replaceHeartbeatFile(temporary, heartbeatFile);
  };
  const wait = () => new Promise(resolve => {
    const timer = setTimeout(() => { wake = undefined; resolve(); }, pollMs);
    wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
    if (stopping) wake();
  });
  signals.on('SIGINT', stop);
  signals.on('SIGTERM', stop);
  await heartbeat();
  // Serial writes avoid a health probe reading a half-written heartbeat.
  let heartbeatWrite = Promise.resolve();
  const timer = setInterval(() => {
    heartbeatWrite = heartbeatWrite.then(heartbeat).catch(() => { heartbeatError = true; stop(); });
  }, heartbeatMs);
  try {
    while (!stopping) {
      let worked = false;
      state = enabled() ? 'working' : 'disabled';
      if (state === 'working') {
        try { worked = await runCycle(); }
        catch { onError(); }
      }
      if (stopping) break;
      state = enabled() ? 'idle' : 'disabled';
      if (!worked) await wait();
    }
  } finally {
    clearInterval(timer);
    signals.off('SIGINT', stop);
    signals.off('SIGTERM', stop);
    await heartbeatWrite;
    state = 'stopped';
    await heartbeat();
  }
  if (heartbeatError) throw new Error('Publication worker heartbeat is unavailable.');
}
