#!/usr/bin/env node

/**
 * Materialize the private Lantern Hermit DSH runtime carrier.
 *
 * This script reads only already-built package outputs from a DSH checkout. It
 * never installs packages and never writes back to that checkout.
 */

import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DSH_VERSION = '0.2.0-rc.2'
const NODE_ENGINE = '^22.19.0 || >=24.0.0'
const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url))
const LAUNCHER_TEMPLATE = join(SCRIPT_ROOT, 'hermit-runtime', 'launcher.mjs')
const EXPECTED_SOURCE_COMMIT = '639ed015397290b3745d163aafe02ffee4aa3f84'

const SEED_PACKAGES = [
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-cmdline',
  '@deepseek-ai/dsh-sdk-app',
  '@deepseek-ai/dsh-sdk-jsonrpc-server',
  '@deepseek-ai/dsh-sdk-client',
  '@deepseek-ai/dsh-sdk-protocol',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-loop',
  '@deepseek-ai/dsh-invariants',
  '@deepseek-ai/dsh-llm-retry',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-persistence-jsonl',
  '@deepseek-ai/dsh-session-persistence',
  '@deepseek-ai/dsh-session-format',
  '@deepseek-ai/dsh-session-format-catalog',
  '@deepseek-ai/dsh-session-format-v3-to-v4',
  '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-session-title',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-launch-environment',
  '@deepseek-ai/cordis-plugin-group',
  '@deepseek-ai/cordis-plugin-include',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/cordis',
]

const TRIMMED_ROWS = {
  removedEntries: [
    'deepseek-llm-api-extensions',
    'session-log-deepseek',
    'plugin-package-inventory-deepseek',
    'llm-deepseek',
    'sandbox',
    'sandbox-policy',
    'subprocess',
    'pty',
    'terminal-bash',
    'terminal-pwsh',
    'mcp-resources',
    'jobs',
    'persistent-bash',
    'persistent-pwsh',
  ],
  removedManifestDependencies: {
    '@deepseek-ai/dsh-sdk-client': [
      '@deepseek-ai/dsh',
    ],
    '@deepseek-ai/dsh-sdk-app': [
      '@deepseek-ai/dsh-skill-office',
      '@deepseek-ai/dsh-tool-workspace-dependencies',
    ],
  },
  rationale: 'The carrier mounts a fixed native-tools SDK tree and receives provider/tool overlays from Lantern. Disabled shell, PTY, DeepSeek fallback, MCP, jobs, office, workspace, and CLI package-manager rows are outside that tree.',
}

function fail(message) {
  throw new Error(message)
}

function comparablePath(value) {
  const resolved = resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isWithinPath(root, target) {
  const rootKey = comparablePath(root)
  const targetKey = comparablePath(target)
  if (rootKey === targetKey) return true
  const boundary = rootKey.endsWith('/') || rootKey.endsWith('\\') ? rootKey : rootKey + (process.platform === 'win32' ? '\\' : '/')
  return targetKey.startsWith(boundary)
}

function canonicalOutputPath(output) {
  const unresolved = []
  let current = resolve(output)
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) return current
    unresolved.unshift(basename(current))
    current = parent
  }
  return resolve(realpathSync(current), ...unresolved)
}

function parseArgs(argv) {
  let source
  let output
  let platform = process.platform
  let arch = process.arch
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--source') {
      source = argv[++index]
      continue
    }
    if (arg === '--output') {
      output = argv[++index]
      continue
    }
    if (arg === '--platform') {
      platform = argv[++index]
      continue
    }
    if (arg === '--arch') {
      arch = argv[++index]
      continue
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: node scripts/package-hermit-runtime.mjs --source DSH --output DIR [--platform linux] [--arch x64]\n')
      process.exit(0)
    }
    fail('unknown argument ' + JSON.stringify(arg))
  }
  if (!source) fail('--source is required')
  if (!output) fail('--output is required')
  if (!platform || !arch) fail('--platform and --arch must be non-empty')
  return { source: resolve(source), output: resolve(output), platform, arch }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    fail('cannot read JSON ' + file + ': ' + String(error))
  }
}

function packageSegments(name) {
  return name.startsWith('@') ? name.split('/') : [name]
}

function packagePath(root, name) {
  return join(root, 'node_modules', ...packageSegments(name))
}

function compatible(manifest, platform, arch) {
  const os = manifest.os
  const cpu = manifest.cpu
  const osOk = !Array.isArray(os) || os.length === 0 || os.includes(platform) || (platform === 'win32' && os.includes('windows')) || (platform === 'darwin' && os.includes('macos'))
  const cpuOk = !Array.isArray(cpu) || cpu.length === 0 || cpu.includes(arch)
  return osOk && cpuOk
}

function walkWorkspace(dir, packageMap) {
  if (!existsSync(dir)) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'lib' || entry.name === 'dist' || entry.name === 'build') continue
    const current = join(dir, entry.name)
    if (entry.isDirectory()) {
      const manifestFile = join(current, 'package.json')
      if (existsSync(manifestFile)) {
        const manifest = readJson(manifestFile)
        if (typeof manifest.name === 'string' && !packageMap.has(manifest.name)) {
          packageMap.set(manifest.name, current)
        }
        continue
      }
      walkWorkspace(current, packageMap)
    }
  }
}

function findInstalled(name, startDir, platform, arch) {
  let current = startDir
  while (true) {
    const candidateManifest = join(current, 'node_modules', ...packageSegments(name), 'package.json')
    if (existsSync(candidateManifest)) {
      try {
        const candidateDir = realpathSync(dirname(candidateManifest))
        const candidate = readJson(join(candidateDir, 'package.json'))
        if (compatible(candidate, platform, arch)) return candidateDir
      } catch {
        // Continue toward the source root; a broken optional candidate is not
        // allowed to shadow a usable compatible one farther up the tree.
      }
    }
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function resolvePackage(name, fromDir, packageMap, platform, arch, optional) {
  const workspaceDir = packageMap.get(name)
  if (workspaceDir !== undefined) {
    const workspaceManifest = readJson(join(workspaceDir, 'package.json'))
    if (compatible(workspaceManifest, platform, arch)) return realpathSync(workspaceDir)
  }
  const installedDir = findInstalled(name, fromDir, platform, arch)
  if (installedDir !== undefined) return installedDir
  if (optional) return undefined
  fail('missing required package ' + name + ' from ' + fromDir + ' for ' + platform + '/' + arch)
}

function packageDependencies(manifest) {
  const result = new Map()
  const add = (field, optional) => {
    for (const name of Object.keys(manifest[field] ?? {})) {
      const previous = result.get(name)
      result.set(name, {
        optional: previous === undefined ? optional : previous.optional && optional,
      })
    }
  }
  add('dependencies', false)
  add('optionalDependencies', true)
  add('peerDependencies', false)
  for (const [name, metadata] of Object.entries(manifest.peerDependenciesMeta ?? {})) {
    if (metadata && metadata.optional === true && result.has(name)) {
      result.get(name).optional = true
    }
  }
  return result
}

function normalizeWorkspaceDependencies(manifest, sourceDir, packageMap, platform, arch) {
  let rewrites = 0
  for (const [field, optionalField] of [
    ['dependencies', false],
    ['optionalDependencies', true],
    ['peerDependencies', false],
  ]) {
    const dependencies = manifest[field]
    if (!dependencies || typeof dependencies !== 'object') continue
    for (const dependency of Object.keys(dependencies)) {
      const specifier = dependencies[dependency]
      if (typeof specifier !== 'string' || !specifier.startsWith('workspace:')) continue
      const optional = optionalField || manifest.peerDependenciesMeta?.[dependency]?.optional === true
      const dependencyDir = resolvePackage(dependency, sourceDir, packageMap, platform, arch, optional)
      if (dependencyDir === undefined) {
        delete dependencies[dependency]
        if (field === 'peerDependencies' && manifest.peerDependenciesMeta) {
          delete manifest.peerDependenciesMeta[dependency]
        }
        continue
      }
      const dependencyManifest = readJson(join(dependencyDir, 'package.json'))
      if (typeof dependencyManifest.version !== 'string' || dependencyManifest.version.length === 0) {
        fail('workspace dependency has no concrete version for ' + dependency + ' from ' + sourceDir)
      }
      dependencies[dependency] = dependencyManifest.version
      rewrites += 1
    }
  }
  return rewrites
}

function makeRuntimePackageManifest(name, sourceDir, packageMap, platform, arch) {
  const manifest = readJson(join(sourceDir, 'package.json'))
  const result = JSON.parse(JSON.stringify(manifest))
  delete result.devDependencies
  if (name === '@deepseek-ai/dsh-sdk-client') {
    delete result.dependencies?.['@deepseek-ai/dsh']
  }
  if (name === '@deepseek-ai/dsh-sdk-app') {
    delete result.dependencies?.['@deepseek-ai/dsh-skill-office']
    delete result.dependencies?.['@deepseek-ai/dsh-tool-workspace-dependencies']
  }
  const workspaceDependencyRewrites = normalizeWorkspaceDependencies(result, sourceDir, packageMap, platform, arch)
  return { manifest: result, workspaceDependencyRewrites }
}

function entryCandidates(root, entry) {
  const target = entry.startsWith('./') ? entry.slice(2) : entry
  const candidates = [join(root, target)]
  if (!extname(target)) {
    for (const extension of ['.js', '.mjs', '.cjs']) candidates.push(join(root, target + extension))
    for (const extension of ['.js', '.mjs', '.cjs']) candidates.push(join(root, target, 'index' + extension))
  }
  return candidates
}

function builtMainExists(sourceDir, main) {
  return entryCandidates(sourceDir, main).some(candidate => existsSync(candidate))
}

function collectRuntimeExportTargets(value, conditionKeys = [], result = []) {
  if (typeof value === 'string') {
    const normalized = value.replaceAll('\\', '/')
    const condition = conditionKeys.map(key => key.toLowerCase())
    if (
      normalized.startsWith('./') &&
      !normalized.includes('*') &&
      !/\.(?:d\.ts|ts|tsx|map)$/i.test(normalized) &&
      !condition.some(key => key === 'types' || key === 'typings' || key === 'source')
    ) {
      result.push({ target: normalized, condition: conditionKeys.join('.') })
    }
    return result
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRuntimeExportTargets(item, conditionKeys, result)
    return result
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collectRuntimeExportTargets(item, [...conditionKeys, key], result)
    }
  }
  return result
}

function declaredRuntimeAssets(manifest) {
  const assets = new Set()
  const add = value => {
    if (typeof value !== 'string') return
    const normalized = value.replaceAll('\\', '/')
    if (!normalized.startsWith('./') || normalized.includes('*')) return
    if (/\.ya?ml$/i.test(normalized)) assets.add(normalized.slice(2))
  }
  const visit = value => {
    if (typeof value === 'string') {
      add(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item)
    }
  }
  visit(manifest.exports)
  add(manifest['dsh.bundle.patch'])
  return assets
}

function assertDeclaredNativeAssets(name, sourceDir, platform, arch) {
  const prebuildsFile = join(sourceDir, 'prebuilds.json')
  if (!existsSync(prebuildsFile)) return
  const prebuilds = readJson(prebuildsFile)
  for (const binary of prebuilds.binaries ?? []) {
    if (typeof binary.path !== 'string') continue
    const asset = join(sourceDir, binary.path)
    if (!existsSync(asset)) {
      fail('native asset is missing for ' + name + ' on ' + platform + '/' + arch + ': ' + asset)
    }
  }
}

function isForbiddenDirectory(name) {
  return new Set([
    'node_modules',
    '.git',
    'test',
    'tests',
    '__tests__',
    'docs',
    'examples',
    'example',
    'fixtures',
    'coverage',
    'scripts',
    '.history',
    '.cache',
    '.temp',
    'dist-types',
  ]).has(name)
}

function copyableFile(relativePath, requiredAssets = new Set()) {
  const normalized = relativePath.replaceAll('\\', '/')
  const parts = normalized.split('/')
  const file = parts.at(-1) ?? ''
  if (requiredAssets.has(normalized)) return true
  if (file === 'package.json') return true
  if (/^(LICENSE|LICENCE|NOTICE|COPYING)(\.|$)/i.test(file)) return true
  if (/^(tsconfig(?:\..*)?|\.prettier.*|\.jscs.*|component|package-support)\.json$/i.test(file)) return false
  if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.map') || file.endsWith('.d.ts') || file.endsWith('.tsbuildinfo')) return false
  const underRuntimeDirectory = parts.some(part => ['lib', 'dist', 'build', 'bin', 'prebuilds', 'assets', 'resources', 'runtime'].includes(part))
  const extension = extname(file).toLowerCase()
  if (underRuntimeDirectory) return extension === '' || ['.js', '.mjs', '.cjs', '.json', '.node', '.wasm', '.so', '.dylib', '.dll', '.exe', '.bin'].includes(extension)
  return ['.js', '.mjs', '.cjs', '.json', '.node', '.wasm'].includes(extension)
}

function copyRuntimeTree(sourceDir, targetDir, sourceRoot, requiredAssets = new Set()) {
  const visit = (sourcePath, targetPath, relativePath) => {
    const info = lstatSync(sourcePath)
    if (info.isSymbolicLink()) {
      const resolved = realpathSync(sourcePath)
      if (!isWithinPath(sourceRoot, resolved)) {
        fail('source package symlink escapes DSH checkout: ' + sourcePath + ' -> ' + resolved)
      }
      visit(resolved, targetPath, relativePath)
      return
    }
    if (info.isDirectory()) {
      if (relativePath && isForbiddenDirectory(basename(sourcePath))) return
      mkdirSync(targetPath, { recursive: true })
      for (const name of readdirSync(sourcePath)) {
        const childRelative = relativePath ? join(relativePath, name) : name
        if (name === 'node_modules' || isForbiddenDirectory(name)) continue
        visit(join(sourcePath, name), join(targetPath, name), childRelative)
      }
      return
    }
    if (!copyableFile(relativePath, requiredAssets)) return
    mkdirSync(dirname(targetPath), { recursive: true })
    copyFileSync(sourcePath, targetPath)
    chmodSync(targetPath, info.mode & 0o777)
  }
  visit(sourceDir, targetDir, '')
}

function assertStagedRuntimeEntries(staged) {
  const unresolvedSourceExports = []
  const unresolvedKeys = new Set()
  for (const record of staged.values()) {
    if (record.manifest.main && !entryCandidates(record.target, record.manifest.main).some(candidate => existsSync(candidate))) {
      fail('copied main is missing for ' + record.name + ': ' + record.manifest.main)
    }
    const exports = collectRuntimeExportTargets(record.manifest.exports)
    for (const item of exports) {
      const sourceExists = entryCandidates(record.sourceDir, item.target).some(candidate => existsSync(candidate))
      if (!sourceExists) {
        const key = record.name + '\u0000' + item.target
        if (!unresolvedKeys.has(key)) {
          unresolvedKeys.add(key)
          unresolvedSourceExports.push({ name: record.name, target: item.target, condition: item.condition || undefined })
        }
        continue
      }
      if (!entryCandidates(record.target, item.target).some(candidate => existsSync(candidate))) {
        fail('copied runtime export is missing for ' + record.name + ': ' + item.target)
      }
    }
  }
  return unresolvedSourceExports
}

function copyRootComplianceFiles(source, output) {
  const files = ['LICENSE', 'THIRD_PARTY_NOTICES.md']
  for (const name of files) {
    const sourceFile = join(source, name)
    if (!existsSync(sourceFile)) fail('DSH source compliance file is missing: ' + sourceFile)
    const resolvedSourceFile = realpathSync(sourceFile)
    if (!isWithinPath(source, resolvedSourceFile)) {
      fail('DSH source compliance file escapes checkout: ' + sourceFile + ' -> ' + resolvedSourceFile)
    }
    const targetFile = join(output, name)
    copyFileSync(sourceFile, targetFile)
    chmodSync(targetFile, 0o644)
  }
}

function safeRelative(root, target) {
  return relative(root, target).replaceAll('\\', '/')
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function listFiles(root) {
  const result = []
  const visit = (current) => {
    const info = lstatSync(current)
    if (info.isSymbolicLink()) fail('carrier contains symlink: ' + safeRelative(root, current))
    if (info.isDirectory()) {
      for (const name of readdirSync(current)) visit(join(current, name))
      return
    }
    result.push({
      path: safeRelative(root, current),
      bytes: info.size,
      sha256: hashFile(current),
    })
  }
  visit(root)
  return result.filter(item => item.path !== 'runtime-manifest.json').sort((a, b) => a.path.localeCompare(b.path))
}

function writeBasePatch(output) {
  const js = value => ({ __jsExpr: value })
  const rows = [
    { id: 'sdk-app-startup', name: '@deepseek-ai/dsh-sdk-app', config: { profile: 'sdk-minimal' } },
    { id: 'sdk-jsonrpc-server', name: '@deepseek-ai/dsh-sdk-jsonrpc-server', inject: ['sdkAppStartup', 'loader'], config: { maxTokensAsSuccess: false } },
    { id: 'session-projection', name: '@deepseek-ai/dsh-session-projection' },
    { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' },
    { id: 'llm', name: '@deepseek-ai/dsh-llm' },
    { id: 'session', name: '@deepseek-ai/dsh-session' },
    { id: 'session-title', name: '@deepseek-ai/dsh-session-title', config: { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 } },
    { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt', config: {
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      personaPrefix: js("process.env.DSH_SYSTEM_PROMPT ?? 'You are a helpful software engineer assistant.'"),
    } },
    { id: 'tools', name: '@deepseek-ai/dsh-tools', config: { mode: 'native' } },
    { id: 'agent', name: '@deepseek-ai/dsh-agent' },
    { id: 'llm-retry', name: '@deepseek-ai/dsh-llm-retry' },
    { id: 'invariants', name: '@deepseek-ai/dsh-invariants' },
    { id: 'session-invariant', name: '@deepseek-ai/dsh-session/invariant' },
    { id: 'agent-invariant', name: '@deepseek-ai/dsh-agent/invariant' },
    { id: 'scope-invariant', name: '@deepseek-ai/dsh-scope/invariant' },
    { id: 'agent-loop-invariant', name: '@deepseek-ai/dsh-agent-loop/invariant' },
    { id: 'agent-loop', name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
    { id: 'sessions', name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: js("dshHomePath('sessions')"), compression: 'none' } },
  ]
  writeFileSync(join(output, 'runtime-base.patch.json'), JSON.stringify([{ insert: rows }], null, 2) + '\n')
}

function assertNoSymlinks(root) {
  const visit = current => {
    const info = lstatSync(current)
    if (info.isSymbolicLink()) fail('carrier contains symlink: ' + safeRelative(root, current))
    if (info.isDirectory()) for (const name of readdirSync(current)) visit(join(current, name))
  }
  visit(root)
}

function stageRuntime(options) {
  const source = realpathSync(options.source)
  const output = options.output
  const canonicalOutput = canonicalOutputPath(output)
  if (isWithinPath(source, canonicalOutput)) {
    fail('output must be outside the DSH source checkout: ' + output)
  }
  if (!existsSync(join(source, 'package.json'))) fail('DSH source has no package.json: ' + source)
  const sourceManifest = readJson(join(source, 'package.json'))
  if (sourceManifest.version !== DSH_VERSION) fail('DSH source version is ' + JSON.stringify(sourceManifest.version) + ', expected ' + DSH_VERSION)
  if (!existsSync(LAUNCHER_TEMPLATE)) fail('launcher template missing: ' + LAUNCHER_TEMPLATE)
  let sourceCommit
  try {
    sourceCommit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch (error) {
    fail('cannot read DSH source commit: ' + String(error))
  }
  if (sourceCommit !== EXPECTED_SOURCE_COMMIT) fail('DSH source commit is ' + sourceCommit + ', expected ' + EXPECTED_SOURCE_COMMIT)

  if (existsSync(output)) {
    if (!lstatSync(output).isDirectory()) fail('output exists and is not a directory: ' + output)
    if (readdirSync(output).length > 0) fail('refusing to overwrite non-empty output: ' + output)
  } else {
    mkdirSync(output, { recursive: true })
  }
  copyRootComplianceFiles(source, output)

  const packageMap = new Map()
  for (const root of ['packages', 'vendor', 'apps', join('native', 'system', 'packages')]) {
    walkWorkspace(join(source, root), packageMap)
  }
  const rootNodeModules = join(output, 'node_modules')
  mkdirSync(rootNodeModules, { recursive: true })
  const staged = new Map()
  const rootStaged = new Map()

  const chooseTarget = (name, sourceDir, ownerTarget) => {
    const rootTarget = packagePath(output, name)
    const rootExisting = staged.get(resolve(rootTarget))
    if (rootExisting === undefined || rootExisting.sourceDir === sourceDir) return rootTarget
    if (ownerTarget !== undefined) {
      let cursor = ownerTarget
      while (cursor.startsWith(output)) {
        const nested = packagePath(cursor, name)
        const nestedExisting = staged.get(resolve(nested))
        if (nestedExisting === undefined || nestedExisting.sourceDir === sourceDir) return nested
        const parent = dirname(cursor)
        if (parent === cursor || parent === output) break
        cursor = parent
      }
      return packagePath(ownerTarget, name)
    }
    fail('dependency version conflict at runtime root for ' + name)
  }

  const stagePackage = (name, sourceDir, ownerTarget) => {
    sourceDir = realpathSync(sourceDir)
    if (!isWithinPath(source, sourceDir)) {
      fail('resolved package escapes DSH checkout: ' + name + ' -> ' + sourceDir)
    }
    const sourcePackageManifest = readJson(join(sourceDir, 'package.json'))
    if (!compatible(sourcePackageManifest, options.platform, options.arch)) {
      fail('package ' + name + ' is incompatible with ' + options.platform + '/' + options.arch)
    }
    const target = chooseTarget(name, sourceDir, ownerTarget)
    const targetKey = resolve(target)
    const previous = staged.get(targetKey)
    if (previous !== undefined) {
      if (previous.sourceDir !== sourceDir) fail('staging conflict for ' + name + ' at ' + target)
      return previous
    }
    const manifestResult = makeRuntimePackageManifest(name, sourceDir, packageMap, options.platform, options.arch)
    const manifest = manifestResult.manifest
    if (manifest.main && !builtMainExists(sourceDir, manifest.main)) {
      fail('built main is missing for ' + name + ': ' + join(sourceDir, manifest.main))
    }
    assertDeclaredNativeAssets(name, sourceDir, options.platform, options.arch)
    if (existsSync(target)) fail('refusing to overwrite staged path: ' + target)
    mkdirSync(target, { recursive: true })
    copyRuntimeTree(sourceDir, target, source, declaredRuntimeAssets(manifest))
    writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
    const record = { name, sourceDir, target, manifest, workspaceDependencyRewrites: manifestResult.workspaceDependencyRewrites }
    staged.set(targetKey, record)
    if (targetKey === resolve(packagePath(output, name))) rootStaged.set(name, record)
    for (const [dependency, metadata] of packageDependencies(manifest)) {
      const dependencyDir = resolvePackage(dependency, sourceDir, packageMap, options.platform, options.arch, metadata.optional)
      if (dependencyDir === undefined) continue
      stagePackage(dependency, dependencyDir, target)
    }
    return record
  }

  for (const name of SEED_PACKAGES) {
    const sourceDir = resolvePackage(name, source, packageMap, options.platform, options.arch, false)
    stagePackage(name, sourceDir, undefined)
  }

  const unresolvedSourceExports = assertStagedRuntimeEntries(staged)

  const required = [
    'launcher.mjs',
    'cordis.yml',
    'runtime-base.patch.json',
    'node_modules/@deepseek-ai/dsh-sdk-client/lib/index.js',
    'node_modules/@deepseek-ai/dsh-tools/lib/index.js',
    'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js',
  ]
  copyFileSync(LAUNCHER_TEMPLATE, join(output, 'launcher.mjs'))
  chmodSync(join(output, 'launcher.mjs'), 0o755)
  writeFileSync(join(output, 'cordis.yml'), '[]\n')
  writeBasePatch(output)
  for (const item of required) {
    if (!existsSync(join(output, item))) fail('required carrier file missing: ' + item)
  }
  assertNoSymlinks(output)

  const dependencies = {}
  for (const [name, record] of [...rootStaged.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dependencies[name] = record.manifest.version
  }
  const carrierManifest = {
    name: '@lantern/hermit-dsh-runtime',
    private: true,
    version: DSH_VERSION,
    type: 'module',
    engines: { node: NODE_ENGINE },
    dependencies,
  }
  writeFileSync(join(output, 'package.json'), JSON.stringify(carrierManifest, null, 2) + '\n')

  const files = listFiles(output)
  const packages = [...staged.values()]
    .sort((a, b) => safeRelative(output, a.target).localeCompare(safeRelative(output, b.target)))
    .map(record => ({
      name: record.name,
      version: record.manifest.version,
      path: safeRelative(output, record.target),
      license: record.manifest.license ?? null,
    }))
  const licensePackages = packages.map(packageRecord => {
    const prefix = packageRecord.path + '/'
    const licenseFiles = files
      .filter(file => file.path.startsWith(prefix))
      .filter(file => /(?:^|\/)(?:LICENSE|LICENCE|NOTICE|COPYING|PATENTS)(?:\.|$)/i.test(file.path.slice(prefix.length)))
      .map(file => file.path)
    return {
      name: packageRecord.name,
      version: packageRecord.version,
      path: packageRecord.path,
      declaredLicense: packageRecord.license,
      licenseTextFiles: licenseFiles,
      missingLicenseText: licenseFiles.length === 0,
    }
  })
  const runtimeManifestData = {
    format: 1,
    dshVersion: DSH_VERSION,
    nodeEngine: NODE_ENGINE,
    platform: options.platform,
    arch: options.arch,
    sourceCommit,
    entry: 'launcher.mjs',
    basePatch: 'runtime-base.patch.json',
    packageCount: packages.length,
    packages,
    workspaceDependencyRewrites: [...staged.values()].reduce((total, record) => total + record.workspaceDependencyRewrites, 0),
    unresolvedSourceExports,
    licenseInventory: {
      rootFiles: files.filter(file => file.path === 'LICENSE' || file.path === 'THIRD_PARTY_NOTICES.md').map(file => file.path),
      packages: licensePackages,
      missingPackageLicenseText: licensePackages.filter(record => record.missingLicenseText).map(record => ({
        name: record.name,
        version: record.version,
        path: record.path,
        declaredLicense: record.declaredLicense,
      })),
      missingThirdPartyLicenseText: licensePackages.filter(record => record.missingLicenseText && !record.name.startsWith('@deepseek-ai/')).map(record => ({
        name: record.name,
        version: record.version,
        path: record.path,
        declaredLicense: record.declaredLicense,
      })),
    },
    trimmedRows: TRIMMED_ROWS,
    hashInventoryExcludes: ['runtime-manifest.json'],
    files,
  }
  writeFileSync(join(output, 'runtime-manifest.json'), JSON.stringify(runtimeManifestData, null, 2) + '\n')
  assertNoSymlinks(output)
  return { source, output, sourceCommit, packageCount: packages.length, fileCount: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) }
}

try {
  const result = stageRuntime(parseArgs(process.argv.slice(2)))
  process.stdout.write(JSON.stringify(result) + '\n')
} catch (error) {
  process.stderr.write('package-hermit-runtime: ' + (error instanceof Error ? error.stack ?? error.message : String(error)) + '\n')
  process.exitCode = 1
}
