import { readFile } from 'node:fs/promises';
import { DEFAULT_HEARTBEAT_FILE } from './publication-worker-runtime.mjs';

export async function workerHealthy(file = DEFAULT_HEARTBEAT_FILE, now = Date.now()) {
  try {
    const heartbeat = JSON.parse(await readFile(file, 'utf8'));
    const age = now - Date.parse(heartbeat.heartbeatAt);
    return Number.isFinite(age) && age >= 0 && age < 45_000 && ['idle', 'working', 'disabled'].includes(heartbeat.state);
  } catch { return false; }
}

if (process.argv[1]?.endsWith('publication-worker-health.mjs') || process.argv[1]?.endsWith('publication-worker-health.cjs')) {
  workerHealthy().then(healthy => { process.exitCode = healthy ? 0 : 1; });
}
