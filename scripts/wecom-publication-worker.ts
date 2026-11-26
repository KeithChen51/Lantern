import { getPublicationChannelInfo, publicationEnabled } from '../src/modules/wecom-publications/configuration';
import { runPublicationCycle } from '../src/modules/wecom-publications/runner';
import { runWorker } from './intranet/publication-worker-runtime.mjs';
import { prisma } from '../src/infrastructure/db/client';

async function runDueDeliveries() {
  const results = await Promise.allSettled([runPublicationCycle(), runPublicationCycle()]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.some(result => result.status === 'fulfilled' && result.value);
}

async function main() {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) throw new Error('Unsupported worker arguments.');
  // Imports also verify that the bundled entry can resolve its Prisma client.
  if (publicationEnabled() && getPublicationChannelInfo().length === 0) throw new Error('Configure a publication channel before enabling the worker.');
  if (process.argv[2] === '--check') {
    console.log('Publication worker entry is available.');
    return;
  }
  await runWorker({ runCycle: runDueDeliveries, enabled: publicationEnabled });
}

main().catch(() => { console.error('Publication worker stopped. Check private configuration and task records.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
