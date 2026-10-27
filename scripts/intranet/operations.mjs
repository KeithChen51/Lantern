import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isReleaseVersion } from '../release-version.mjs';

const commands = ['verify', 'migrate', 'inventory', 'initialize'];
const usage = 'Usage: operations <verify|migrate|inventory|initialize>\nInventory is read-only; initialize imports only into an empty migrated database.\n';

/** The trusted server image has no implicit database operation. */
export function runOperations(args, options = {}) {
  const root = options.root ?? path.dirname(path.resolve(process.argv[1]));
  const env = options.env ?? process.env;
  const run = options.run ?? spawnSync;
  const write = options.write ?? (text => process.stdout.write(text));
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  if (!args.length || ['--help', '-h', 'help'].includes(args[0])) { write(usage); return 0; }
  if (args.length !== 1 || !commands.includes(args[0])) { write(usage); return 2; }
  const command = args[0];
  const invoke = (file, argv, capture = false, childEnv = env) => {
    const result = run(file, argv, { cwd: root, env: childEnv, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
    if (result.error || result.signal || result.status !== 0) throw new Error(`${command}: tool failed (${result.status ?? result.signal ?? 'start error'}).`);
    return result.stdout ?? '';
  };
  const initialize = path.join(root, 'knowledge-cli', 'initialize.cjs');
  if (command === 'inventory') { invoke(process.execPath, [initialize, '--dry-run']); return 0; }
  if (command === 'initialize') { invoke(process.execPath, [initialize, '--apply']); return 0; }
  if (command === 'migrate') {
    if (!env.DATABASE_URL?.startsWith('mysql://')) throw new Error('migrate requires a MySQL DATABASE_URL.');
    invoke(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(root, 'prisma/schema.prisma')]);
    return 0;
  }
  const json = name => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
  const manifest = json('build-manifest.json');
  if (platform !== 'linux' || arch !== 'x64' || manifest.platform !== platform || manifest.arch !== arch) throw new Error('Operations require Linux x64.');
  if (!/^[a-f0-9]{40}$/.test(manifest.revision) || !isReleaseVersion(manifest.version)) throw new Error('Invalid image source/version manifest.');
  if (json('package.json').version !== manifest.version) throw new Error('Application version mismatch.');
  const prisma = json('node_modules/prisma/package.json');
  if (prisma.version !== '6.19.3' || json('node_modules/@prisma/client/package.json').version !== prisma.version || manifest.prismaVersion !== prisma.version) throw new Error('Prisma version mismatch.');
  if (!existsSync(path.join(root, 'prisma/migrations/migration_lock.toml'))) throw new Error('Missing migrations.');
  const queryEngine = path.join(root, 'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node');
  const schemaEngine = path.join(root, 'engines/schema-engine');
  if (!/^[a-f0-9]{40}$/.test(manifest.prismaEngineCommit)) throw new Error('Invalid offline engine provenance.');
  if (env.PRISMA_SCHEMA_ENGINE_BINARY !== schemaEngine || env.PRISMA_QUERY_ENGINE_LIBRARY !== queryEngine) throw new Error('Offline engine environment mismatch.');
  // Native module load and schema executable startup detect ABI/OpenSSL failures offline.
  const query = (options.requireModule ?? createRequire(path.join(root, 'package.json')))(queryEngine);
  if (query.version().commit !== manifest.prismaEngineCommit) throw new Error('Query engine commit mismatch.');
  if (!invoke(schemaEngine, ['--version'], true).includes(manifest.prismaEngineCommit)) throw new Error('Schema engine commit mismatch.');
  const offlineEnv = { ...env, DATABASE_URL: 'mysql://verify:verify@127.0.0.1:1/verify_only' };
  invoke(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), '--version'], true, offlineEnv);
  const inventory = JSON.parse(invoke(process.execPath, [initialize, '--dry-run'], true, offlineEnv));
  if (inventory.mode !== 'dry-run' || inventory.resources !== 22 || inventory.inventory.length !== 22 || new Set(inventory.inventory.map(item => item.id)).size !== 22) throw new Error('Initial inventory mismatch.');
  write(`Operations verified: ${manifest.version} ${manifest.revision}; Prisma ${prisma.version}; 22 resources.\n`);
  return 0;
}

if (['operations.mjs', 'operations.cjs'].includes(path.basename(process.argv[1] ?? ''))) {
  try { process.exitCode = runOperations(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Operation failed.'); process.exitCode = 1; }
}
