import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { runOperations } from './operations.mjs';

const repo = process.cwd();
const revision = 'a'.repeat(40);
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'lighthouse-operations-'));
  const json = (name, value) => { const file = path.join(root, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)); };
  json('build-manifest.json', { revision, version: '1.1.3', platform: 'linux', arch: 'x64', prismaVersion: '6.19.3', prismaEngineCommit: revision });
  json('package.json', { version: '1.1.3' });
  json('node_modules/prisma/package.json', { version: '6.19.3' });
  json('node_modules/@prisma/client/package.json', { version: '6.19.3' });
  json('prisma/migrations/migration_lock.toml', {});
  const env = { DATABASE_URL: 'mysql://private:secret@host/database', PRISMA_SCHEMA_ENGINE_BINARY: path.join(root, 'engines/schema-engine'), PRISMA_QUERY_ENGINE_LIBRARY: path.join(root, 'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node') };
  const calls = [];
  const run = (file, args, options) => { calls.push({ file, args, options }); return { status: 0, stdout: args.includes('--dry-run') ? JSON.stringify({ mode: 'dry-run', resources: 22, inventory: Array.from({ length: 22 }, (_, i) => ({ id: `resource-${i}` })) }) : `version ${revision}\n` }; };
  return { root, env, calls, run, json, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('default/help and unknown/extra arguments cannot start a database tool', () => {
  let calls = 0;
  const options = { root: repo, run: () => { calls++; }, write: () => {} };
  assert.equal(runOperations([], options), 0);
  assert.equal(runOperations(['help'], options), 0);
  assert.equal(runOperations(['db:setup'], options), 2);
  assert.equal(runOperations(['initialize', '--force'], options), 2);
  assert.equal(calls, 0);
});

test('each mutation command has a distinct fixed entrypoint; migrate never imports or seeds', () => {
  const f = fixture();
  try {
    runOperations(['migrate'], f);
    assert.deepEqual(f.calls[0].args.slice(1), ['migrate', 'deploy', '--schema', path.join(f.root, 'prisma/schema.prisma')]);
    runOperations(['inventory'], f);
    assert.deepEqual(f.calls[1].args, [path.join(f.root, 'knowledge-cli/initialize.cjs'), '--dry-run']);
    runOperations(['initialize'], f);
    assert.deepEqual(f.calls[2].args, [path.join(f.root, 'knowledge-cli/initialize.cjs'), '--apply']);
    assert.throws(() => runOperations(['migrate'], { ...f, env: { DATABASE_URL: 'postgres://secret' } }), /MySQL/);
    assert.equal(f.calls.length, 3);
  } finally { f.cleanup(); }
});

test('offline verify loads native engine, checks version and previews with an unusable database URL', () => {
  const f = fixture();
  try {
    let engine;
    let output = '';
    assert.equal(runOperations(['verify'], { ...f, platform: 'linux', arch: 'x64', requireModule: file => { engine = file; return { version: () => ({ commit: revision }) }; }, write: text => { output += text; } }), 0);
    assert.equal(engine, f.env.PRISMA_QUERY_ENGINE_LIBRARY);
    assert.deepEqual(f.calls[0].args, ['--version']);
    assert.deepEqual(f.calls[1].args.slice(1), ['--version']);
    assert.deepEqual(f.calls[2].args.slice(1), ['--dry-run']);
    assert.equal(f.calls[2].options.env.DATABASE_URL, 'mysql://verify:verify@127.0.0.1:1/verify_only');
    assert.match(output, /22 resources/);
    assert.doesNotMatch(output, /secret/);
    f.json('node_modules/@prisma/client/package.json', { version: '6.19.2' });
    assert.throws(() => runOperations(['verify'], { ...f, platform: 'linux', arch: 'x64' }), /version mismatch/);
  } finally { f.cleanup(); }
});

test('tool failures stop the command and do not expose captured credentials', () => {
  const f = fixture();
  try {
    assert.throws(() => runOperations(['initialize'], { ...f, run: () => ({ status: 7, stderr: 'mysql://secret' }) }), /tool failed \(7\)/);
  } finally { f.cleanup(); }
});

test('real packaged inventory is preview-only with 22 approved resources and complete Skills', () => {
  const packed = spawnSync(process.execPath, ['scripts/package-knowledge-cli.mjs'], { cwd: repo, encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const preview = spawnSync(process.execPath, ['release/knowledge-cli/initialize.cjs', '--dry-run'], { cwd: repo, encoding: 'utf8', env: { ...process.env, KNOWLEDGE_HUB_DRIVER: 'sqlite', DATABASE_URL: 'invalid-do-not-connect' } });
  assert.equal(preview.status, 0, preview.stderr);
  const result = JSON.parse(preview.stdout);
  assert.equal(result.resources, 22);
  assert.equal(result.inventory.filter(item => item.type === 'case' && item.visibility === 'internal').length, 18);
  assert.equal(result.inventory.filter(item => item.type === 'document').length, 2);
  assert.deepEqual(result.inventory.filter(item => item.type === 'skill').map(item => item.id).sort(), ['case-insight', 'lantern-knowledge-standardize']);
  assert.equal(result.inventory.find(item => item.id === 'case-insight').files.length, 11);
  assert(!result.inventory.some(item => ['brand-guide', 'knowledge-heart-values'].includes(item.id)));
});

test('pipeline checkout guard accepts only the configured fetched dev/master tip, independent of triggers', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lighthouse-checkout-'));
  const git = (...args) => { const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  const jenkins = readFileSync(path.join(repo, 'Jenkinsfile'), 'utf8');
  const guard = 'set -eu\n' + jenkins.split('# BEGIN CHECKOUT GUARD')[1].split('# END CHECKOUT GUARD')[0].split('\n').slice(1).join('\n');
  const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
  const check = (branch, trigger, buildNumber = '25') => spawnSync(bash, ['-c', guard], { cwd: root, encoding: 'utf8', env: { ...process.env, LIGHTHOUSE_BUILD_BRANCH: branch, GIT_BUILD_REF: trigger, BUILD_NUMBER: buildNumber } });
  try {
    git('init', '-b', 'dev'); git('config', 'user.email', 'build-test@example.invalid'); git('config', 'user.name', 'Build Test');
    writeFileSync(path.join(root, 'fixture.txt'), 'dev'); git('add', '.'); git('commit', '-m', 'dev');
    const dev = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/dev', dev);
    git('switch', '-c', 'master'); writeFileSync(path.join(root, 'fixture.txt'), 'master'); git('add', '.'); git('commit', '-m', 'master');
    const master = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/master', master);
    assert.equal(check('master', 'refs/merge-requests/374/head').status, 0);
    assert.equal(check('dev', dev).status, 1);
    git('switch', 'dev');
    assert.equal(check('dev', master).status, 0);
    assert.equal(check('master', 'dev').status, 1);
    assert.equal(check('main', dev).status, 1);
    for (const value of ['', '0', '-1', '01', '1.2', '1;rm', 'abc']) assert.equal(check('dev', dev, value).status, 1);
    assert.equal(check('dev', dev, '123456').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pipeline fails closed for existing or uncertain batch tags and publishes only explicit absence', () => {
  const jenkins = readFileSync(path.join(repo, 'Jenkinsfile'), 'utf8');
  const publish = 'publish_immutable() {' + jenkins.split('publish_immutable() {')[1].split('publish_immutable "$IMAGE_REPO:$IMAGE_TAG"')[0];
  const fakeDocker = `
    docker() {
      case "$1" in
        manifest)
          case "$SCENARIO" in
            absent) printf 'no such manifest: %s' "$3" >&2; return 1 ;;
            existing) printf '{"schemaVersion":2}'; return 0 ;;
            wrong_tag) printf 'no such manifest: other.invalid/app:old' >&2; return 1 ;;
            unauthorized) printf 'unauthorized: authentication required' >&2; return 1 ;;
            transport) printf 'connection refused' >&2; return 1 ;;
            unsupported) printf 'docker: manifest is not a docker command' >&2; return 1 ;;
          esac ;;
        push) printf '%s\\n' "$1" ;;
        *) return 9 ;;
      esac
    }
  `;
  const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
  const check = scenario => spawnSync(bash, ['-c', `set -eu\n${fakeDocker}\n${publish}\npublish_immutable example.invalid/app:dev-abc-25`], { encoding: 'utf8', env: { ...process.env, SCENARIO: scenario } });
  const absent = check('absent');
  assert.equal(absent.status, 0, absent.stderr);
  assert.match(absent.stdout, /push/);
  for (const scenario of ['existing', 'wrong_tag', 'unauthorized', 'transport', 'unsupported']) {
    const conflict = check(scenario);
    assert.equal(conflict.status, 1, conflict.stderr);
    assert.match(conflict.stdout, /Refusing|refusing/);
    assert.doesNotMatch(conflict.stdout, /(?:^|\n)push(?:\n|$)/);
  }
});

test('operations packaging completes with no Git on PATH and requires the host-verified full SHA', async () => {
  const { packageOperations } = await import('../package-intranet-operations.mjs');
  const root = mkdtempSync(path.join(tmpdir(), 'lighthouse-package-'));
  const put = (name, value) => { const file = path.join(root, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, value); };
  try {
    for (const invalid of [undefined, '', 'abc123', 'A'.repeat(40), `${revision}\n`]) {
      await assert.rejects(packageOperations({ root, platform: 'linux', arch: 'x64', env: { BUILD_REVISION: invalid } }), /BUILD_REVISION/);
    }
    put('package.json', JSON.stringify({ version: '1.1.3' }));
    for (const name of ['prisma', '@prisma/client']) put(`node_modules/${name}/package.json`, JSON.stringify({ version: '6.19.3' }));
    put('node_modules/.env.private', 'not-for-distribution');
    put('prisma/schema.prisma', 'datasource db { provider = "mysql" }');
    put('prisma/migrations/migration_lock.toml', 'provider = "mysql"');
    put('release/knowledge-cli/initialize.cjs', 'console.log("preview")');
    put('deploy/system/bin/openssl', 'test fixture');
    put('scripts/intranet/operations.mjs', 'console.log("help")');
    put('deploy/offline/manifest.json', JSON.stringify({ prismaEngineCommit: revision }));
    put(`deploy/offline/engines/all_commits/${revision}/debian-openssl-3.0.x/schema-engine.gz`, gzipSync('schema engine fixture'));
    const source = `const {packageOperations}=await import(${JSON.stringify(pathToFileURL(path.join(repo, 'scripts/package-intranet-operations.mjs')).href)});await packageOperations({root:process.argv[1],platform:'linux',arch:'x64'});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source, root], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '', BUILD_REVISION: revision } });
    assert.equal(result.status, 0, result.stderr);
    const output = path.join(root, 'release/intranet-operations');
    assert.equal(JSON.parse(readFileSync(path.join(output, 'build-manifest.json'), 'utf8')).revision, revision);
    assert.equal(readFileSync(path.join(output, 'engines/schema-engine'), 'utf8'), 'schema engine fixture');
    assert.throws(() => readFileSync(path.join(output, 'node_modules/.env.private')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
