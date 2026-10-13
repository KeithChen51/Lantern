import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Package operations only from the Linux x64 CI install.');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(revision) || (process.env.BUILD_REVISION && process.env.BUILD_REVISION !== revision)) throw new Error('Build revision does not match checkout.');
const appPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = JSON.parse(await readFile('node_modules/prisma/package.json', 'utf8'));
const client = JSON.parse(await readFile('node_modules/@prisma/client/package.json', 'utf8'));
if (prisma.version !== '6.19.3' || client.version !== prisma.version) throw new Error('Operations require the installed Prisma 6.19.3 pair.');
if (!/^\d+\.\d+\.\d+$/.test(appPackage.version)) throw new Error('Invalid application version.');
const output = path.join(root, 'release/intranet-operations');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({ entryPoints: ['scripts/intranet/operations.mjs'], outfile: path.join(output, 'operations.cjs'), bundle: true, platform: 'node', target: 'node24', format: 'cjs' });
const allowed = source => !['.git', '.cache', '.npmrc'].includes(path.basename(source)) && !path.basename(source).startsWith('.env') && !path.basename(source).endsWith('.log');
// Copy installed Linux tools, not the repository/source workspace. No npm at runtime.
for (const relative of ['node_modules', 'prisma/schema.prisma', 'prisma/migrations', 'release/knowledge-cli', 'deploy/system']) {
  const destination = relative === 'release/knowledge-cli' ? 'knowledge-cli' : relative === 'deploy/system' ? 'system' : relative;
  await cp(path.join(root, relative), path.join(output, destination), { recursive: true, filter: allowed });
}
await mkdir(path.join(output, 'engines'));
const offline = JSON.parse(await readFile('deploy/offline/manifest.json', 'utf8'));
if (!/^[a-f0-9]{40}$/.test(offline.prismaEngineCommit)) throw new Error('Invalid offline engine commit.');
const compressed = await readFile(`deploy/offline/engines/all_commits/${offline.prismaEngineCommit}/debian-openssl-3.0.x/schema-engine.gz`);
await writeFile(path.join(output, 'engines/schema-engine'), gunzipSync(compressed));
await chmod(path.join(output, 'engines/schema-engine'), 0o755);
await writeFile(path.join(output, 'package.json'), JSON.stringify({ name: 'lighthouse-operations', version: appPackage.version, private: true }) + '\n');
await writeFile(path.join(output, 'build-manifest.json'), JSON.stringify({ schemaVersion: 1, revision, version: appPackage.version, platform: process.platform, arch: process.arch, prismaVersion: prisma.version, prismaEngineCommit: offline.prismaEngineCommit }, null, 2) + '\n');
console.log(`Prepared trusted operations image context: ${appPackage.version} ${revision}`);
