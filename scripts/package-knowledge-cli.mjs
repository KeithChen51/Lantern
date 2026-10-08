import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const output = path.join(root, 'release', 'knowledge-cli');
await mkdir(output, {recursive:true});
await build({entryPoints:{import:'scripts/knowledge-import-existing.ts',hub:'scripts/knowledge-hub.ts'},outdir:output,outExtension:{'.js':'.cjs'},bundle:true,platform:'node',target:'node24',format:'cjs',external:['@prisma/client'],banner:{js:'process.chdir(__dirname);'}});
for (const relative of ['docs/brand','docs/content/action-canwu-cases/2026-06-final/source','src/lib/hermit/knowledge']) {
  await cp(path.join(root,relative),path.join(output,relative),{recursive:true,filter:source=>!source.endsWith('knowledge-vectors.json')});
}
console.log('Prepared standalone knowledge import and read CLI.');
