import { build } from 'esbuild';
import { mkdir, cp, rm, access } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const output = path.join(root, 'release', 'knowledge-cli');
await rm(output, {recursive:true,force:true});
await mkdir(output, {recursive:true});
await build({entryPoints:{import:'scripts/knowledge-import-existing.ts',hub:'scripts/knowledge-hub.ts',initialize:'scripts/knowledge-initialize.ts'},outdir:output,outExtension:{'.js':'.cjs'},bundle:true,platform:'node',target:'node24',format:'cjs',external:['@prisma/client'],banner:{js:'process.chdir(__dirname);'}});
// Support the source-directory rename from #49 without changing stable resource IDs.
const standardize = [];
for (const name of ['lantern-knowledge-standardize','lighthouse-knowledge-standardize']) {
  try { await access(path.join(root,'skills',name,'SKILL.md')); standardize.push(`skills/${name}`); } catch { /* Not present on this source baseline. */ }
}
if (!standardize.length) throw new Error('Missing bundled standardization Skill.');
for (const relative of ['docs/brand','docs/content/action-canwu-cases/2026-06-final/source','src/lib/hermit/knowledge','skills/case-insight',...standardize]) {
  await cp(path.join(root,relative),path.join(output,relative),{recursive:true,filter:source=>!['node_modules','.git','.cache','.npmrc','hub-compat.test.ts','knowledge-vectors.json'].includes(path.basename(source)) && !path.basename(source).startsWith('.env') && !path.basename(source).endsWith('.log')});
}
console.log('Prepared standalone inventory, explicit initialization, import and read CLI.');
