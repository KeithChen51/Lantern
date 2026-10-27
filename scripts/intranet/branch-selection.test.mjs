import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const jenkins = readFileSync(new URL('../../Jenkinsfile', import.meta.url), 'utf8');
function block(name) {
  const start = `# BEGIN ${name}`;
  const end = `# END ${name}`;
  assert.equal(jenkins.split(start).length, 2, `${name}: unique start marker`);
  assert.equal(jenkins.split(end).length, 2, `${name}: unique end marker`);
  return jenkins.split(start)[1].split(end)[0].split('\n').slice(1).join('\n');
}
const selection = block('BUILD BRANCH SELECTION');
const guard = block('CHECKOUT GUARD');
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const envKeys = [
  'LIGHTHOUSE_BUILD_BRANCH', 'GIT_BRANCH', 'BRANCH_NAME', 'GIT_LOCAL_BRANCH',
  'GIT_BUILD_REF', 'CCI_TRIGGER_METHOD', 'MR_RESOURCE_ID', 'MR_SOURCE_BRANCH',
  'MR_TARGET_BRANCH', 'CHANGE_ID', 'GIT_TAG', 'TAG_NAME',
];
const cleanEnv = { ...process.env };
for (const key of envKeys) delete cleanEnv[key];
function run(env, script = selection, cwd) {
  return spawnSync(bash, ['-c', `set -eu\n${script}`], {
    cwd, encoding: 'utf8', env: { ...cleanEnv, ...env }, timeout: 15_000,
  });
}
function succeeds(env, expected) {
  const result = run(env);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.equal(result.stdout.trim(), expected);
}
function refuses(env, message) {
  const result = run(env);
  assert.equal(result.status, 1, result.stderr || String(result.error));
  assert.equal(result.stdout, '', 'must not emit a publish branch on failure');
  assert.match(result.stderr, message);
}

test('auto follows dev/master pushes and manual branch selection before checkout', () => {
  for (const branch of ['dev', 'master']) {
    for (const prefix of ['', 'origin/', 'refs/heads/', 'refs/remotes/origin/']) {
      succeeds({ CCI_TRIGGER_METHOD: 'PUSH', GIT_BRANCH: prefix + branch, GIT_BUILD_REF: 'a'.repeat(40) }, branch);
    }
    for (const requested of ['', 'auto']) {
      succeeds({ LIGHTHOUSE_BUILD_BRANCH: requested, CCI_TRIGGER_METHOD: 'MANUAL', GIT_BRANCH: branch }, branch);
    }
    succeeds({ BRANCH_NAME: branch }, branch);
    succeeds({ GIT_LOCAL_BRANCH: branch }, branch);
    succeeds({ GIT_BRANCH: `origin/${branch}`, BRANCH_NAME: branch, GIT_LOCAL_BRANCH: branch }, branch);
  }
});

test('explicit branch remains available for existing plans and manual overrides', () => {
  for (const branch of ['dev', 'master']) {
    succeeds({ LIGHTHOUSE_BUILD_BRANCH: branch }, branch);
    succeeds({ LIGHTHOUSE_BUILD_BRANCH: branch, GIT_BRANCH: 'a'.repeat(40), GIT_BUILD_REF: 'b'.repeat(40) }, branch);
    succeeds({ LIGHTHOUSE_BUILD_BRANCH: branch, CCI_TRIGGER_METHOD: 'MANUAL', GIT_BRANCH: branch === 'dev' ? 'master' : 'dev' }, branch);
  }
});

test('auto never guesses from absent, unsupported or conflicting branch metadata', () => {
  refuses({}, /Missing trigger branch/);
  refuses({ GIT_BUILD_REF: 'a'.repeat(40) }, /Missing trigger branch/);
  for (const branch of ['main', 'feature/master', 'upstream/master', 'refs/heads/feature/dev', 'a'.repeat(40), 'HEAD']) {
    refuses({ GIT_BRANCH: branch }, /Automatic build requires/);
  }
  refuses({ GIT_BRANCH: 'dev', BRANCH_NAME: 'master' }, /Conflicting trigger branch/);
  refuses({ GIT_BRANCH: 'master', GIT_LOCAL_BRANCH: 'dev' }, /Conflicting trigger branch/);
  refuses({ LIGHTHOUSE_BUILD_BRANCH: 'main', GIT_BRANCH: 'master' }, /must be auto, dev or master/);
});

test('merge requests and tags cannot publish even with an explicit master override', () => {
  const events = [
    { CCI_TRIGGER_METHOD: 'MR' },
    { MR_RESOURCE_ID: '407' },
    { MR_SOURCE_BRANCH: 'dev', MR_TARGET_BRANCH: 'master' },
    { CHANGE_ID: '407' },
    { GIT_TAG: 'master' },
    { TAG_NAME: 'dev' },
    { GIT_BUILD_REF: 'refs/merge-requests/407/merge' },
    { GIT_BRANCH: 'refs/pull/407/merge' },
    { BRANCH_NAME: 'refs/tags/master' },
    { GIT_LOCAL_BRANCH: 'refs/tags/dev' },
  ];
  for (const event of events) {
    for (const requested of ['auto', 'master']) {
      refuses({ LIGHTHOUSE_BUILD_BRANCH: requested, GIT_BRANCH: 'dev', ...event }, /[Mm]erge-request|Tag builds/);
    }
  }
});

test('resolved master must still match fetched origin/master; shared commits do not select the branch', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lighthouse-auto-branch-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const script = `LIGHTHOUSE_BUILD_BRANCH=$(\n${selection}\n)\nexport LIGHTHOUSE_BUILD_BRANCH\n${guard}\nprintf 'branch=%s\\n' "$LIGHTHOUSE_BUILD_BRANCH"`;
  try {
    git('init', '-b', 'dev');
    git('-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid', 'commit', '--allow-empty', '-m', 'dev');
    const dev = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/dev', dev);
    git('switch', '-c', 'master');
    git('-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid', 'commit', '--allow-empty', '-m', 'master');
    const master = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/master', master);
    const event = { GIT_BRANCH: 'master', GIT_BUILD_REF: master, BUILD_NUMBER: '51' };
    const good = run(event, script, root);
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /branch=master/);
    git('checkout', '--detach', dev);
    const wrongCheckout = run(event, script, root);
    assert.equal(wrongCheckout.status, 1, wrongCheckout.stderr);
    assert.match(wrongCheckout.stdout, /HEAD differs from fetched origin\/master/);
    git('update-ref', 'refs/remotes/origin/master', dev);
    const sharedCommit = run({ ...event, GIT_BUILD_REF: dev }, script, root);
    assert.equal(sharedCommit.status, 0, sharedCommit.stderr);
    assert.match(sharedCommit.stdout, /branch=master/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
