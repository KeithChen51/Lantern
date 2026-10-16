import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function packageOperations({ root = process.cwd(), env = process.env, platform = process.platform, arch = process.arch } = {}) {
  if (platform !== 'linux' || arch !== 'x64') throw new Error('Package operations only from the Linux x64 CI install.');
  // Jenkins verifies the checkout on its host. The slim builder contains no Git.
  const revision = env.BUILD_REVISION;
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision)) throw new Error('BUILD_REVISION must be the verified full 40-character Git SHA from Jenkins.');
  const read = relative => readFile(path.join(root, relative), 'utf8');
  const appPackage = JSON.parse(await read('package.json'));
  const prisma = JSON.parse(await read('node_modules/prisma/package.json'));
  const client = JSON.parse(await read('node_modules/@prisma/client/package.json'));
  if (prisma.version !== '6.19.3' || client.version !== prisma.version) throw new Error('Operations require the installed Prisma 6.19.3 pair.');
  if (!/^\d+\.\d+\.\d+$/.test(appPackage.version)) throw new Error('Invalid application version.');
  const output = path.join(root, 'release/intranet-operations');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await build({ entryPoints: [path.join(root, 'scripts/intranet/operations.mjs')], outfile: path.join(output, 'operations.cjs'), bundle: true, platform: 'node', target: 'node24', format: 'cjs' });
  // Bundle the actual app validator; operations must not drift into a second
  // implementation or require a runtime TypeScript/npm installation.
  await build({ entryPoints: [path.join(root, 'scripts/check-access-config.ts')], outfile: path.join(output, 'check-access-config.cjs'), bundle: true, platform: 'node', target: 'node24', format: 'cjs' });
  const allowed = source => !['.git', '.cache', '.npmrc'].includes(path.basename(source)) && !path.basename(source).startsWith('.env') && !path.basename(source).endsWith('.log');
  // Copy installed Linux tools, not the repository/source workspace. No npm at runtime.
  for (const relative of ['node_modules', 'prisma/schema.prisma', 'prisma/migrations', 'release/knowledge-cli', 'deploy/system']) {
    const destination = relative === 'release/knowledge-cli' ? 'knowledge-cli' : relative === 'deploy/system' ? 'system' : relative;
    await cp(path.join(root, relative), path.join(output, destination), { recursive: true, filter: allowed });
  }
  await mkdir(path.join(output, 'engines'));
  const offline = JSON.parse(await read('deploy/offline/manifest.json'));
  if (!/^[a-f0-9]{40}$/.test(offline.prismaEngineCommit)) throw new Error('Invalid offline engine commit.');
  const compressed = await readFile(path.join(root, `deploy/offline/engines/all_commits/${offline.prismaEngineCommit}/debian-openssl-3.0.x/schema-engine.gz`));
  await writeFile(path.join(output, 'engines/schema-engine'), gunzipSync(compressed));
  await chmod(path.join(output, 'engines/schema-engine'), 0o755);
  await writeFile(path.join(output, 'package.json'), JSON.stringify({ name: 'lighthouse-operations', version: appPackage.version, private: true }) + '\n');
  await writeFile(path.join(output, 'build-manifest.json'), JSON.stringify({ schemaVersion: 1, revision, version: appPackage.version, platform, arch, prismaVersion: prisma.version, prismaEngineCommit: offline.prismaEngineCommit }, null, 2) + '\n');
  console.log(`Prepared trusted operations image context: ${appPackage.version} ${revision}`);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await packageOperations();
