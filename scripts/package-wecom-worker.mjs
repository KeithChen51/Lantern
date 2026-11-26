import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function packagePublicationWorker(root = process.cwd()) {
  await build({
    entryPoints: {
      'wecom-publication-worker': path.join(root, 'scripts/wecom-publication-worker.ts'),
      'publication-worker-health': path.join(root, 'scripts/intranet/publication-worker-health.mjs'),
    },
    outdir: path.join(root, '.next/standalone/scripts'),
    outExtension: { '.js': '.cjs' },
    bundle: true, platform: 'node', target: 'node20', format: 'cjs',
    external: ['@prisma/client'],
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packagePublicationWorker().catch(() => { console.error('Publication worker packaging failed.'); process.exitCode = 1; });
}
