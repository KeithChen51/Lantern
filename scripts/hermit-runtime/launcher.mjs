#!/usr/bin/env node

/**
 * Private carrier launcher for Lantern's Hermit DSH runtime.
 *
 * The public DSH CLI resolves profiles and package-manager state. This carrier
 * owns one already-materialized sdk-minimal tree, so it only parses the
 * profile/patch handoff used by @deepseek-ai/dsh-sdk-client and boots that
 * fixed tree directly.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  boot,
  installFailLoud,
  loadOverlayPatches,
  PluginPackages,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url))
const ROOT_CONFIG = join(RUNTIME_ROOT, 'cordis.yml')
const BASE_PATCH = join(RUNTIME_ROOT, 'runtime-base.patch.json')
const BARE_MODULE_BASE_URL = pathToFileURL(`${RUNTIME_ROOT}${process.platform === 'win32' ? '\\' : '/'}`).href
const NAME = 'hermit-runtime'
const PROFILE = 'sdk-minimal'
const SHUTDOWN_TIMEOUT_MS = 5_000

function createAppReady() {
  let ready = false
  const listeners = new Set()
  return {
    service: {
      onReady(listener) {
        if (ready) {
          listener()
          return () => {}
        }
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    commit() {
      if (ready) return
      ready = true
      for (const listener of [...listeners]) listener()
      listeners.clear()
    },
  }
}

function createProcessShutdown(dispose) {
  let pending
  let timeout
  let completed = false
  let forceExited = false

  const clearExitTimeout = () => {
    if (timeout !== undefined) clearTimeout(timeout)
  }
  const forceExitOnce = (code) => {
    if (forceExited) return
    forceExited = true
    clearExitTimeout()
    process.exit(code)
  }
  const completeOnce = (code) => {
    if (completed || forceExited) return
    completed = true
    clearExitTimeout()
    process.exitCode = code
  }
  const start = (code, forceAfterDispose) => {
    if (pending !== undefined) return pending
    timeout = setTimeout(() => forceExitOnce(code), SHUTDOWN_TIMEOUT_MS)
    pending = Promise.resolve().then(dispose).then(
      () => {
        if (forceAfterDispose) forceExitOnce(code)
        else completeOnce(code)
      },
      () => forceExitOnce(code),
    )
    return pending
  }
  return {
    shutdown(code) {
      return start(code, false)
    },
    interrupt(code) {
      if (pending !== undefined) {
        forceExitOnce(code)
        return
      }
      void start(code, true)
    },
  }
}

function parseLauncherArgs(argv) {
  let profile = PROFILE
  const patches = []
  const appArgs = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile') {
      profile = argv[++index]
      if (profile === undefined) throw new Error('missing value for --profile')
      continue
    }
    if (arg === '--patch') {
      const patch = argv[++index]
      if (patch === undefined) throw new Error('missing value for --patch')
      patches.push(resolve(process.cwd(), patch))
      continue
    }
    if (arg === '--') {
      appArgs.push(...argv.slice(index + 1))
      break
    }
    appArgs.push(arg)
  }
  if (profile !== PROFILE) {
    throw new Error(`unsupported profile ${JSON.stringify(profile)}; this carrier only serves ${PROFILE}`)
  }
  return { appArgs, patches }
}

function loadBasePatch() {
  // Read once here so an accidentally incomplete carrier fails before a
  // Cordis context is created and never emits a partial JSON-RPC service.
  JSON.parse(readFileSync(BASE_PATCH, 'utf8'))
  return loadOverlayPatches(NAME, BASE_PATCH)
}

const app = { current: undefined }
let disposal
const dispose = () => disposal ??= (async () => {
  await app.current?.fiber.dispose()
})()
const shutdown = createProcessShutdown(dispose)
const appReady = createAppReady()
const signalShutdown = new AbortController()
const interrupt = (code) => {
  signalShutdown.abort()
  shutdown.interrupt(code)
}
process.on('SIGTERM', () => interrupt(0))
process.on('SIGINT', () => interrupt(130))
const uninstallFailLoud = installFailLoud(NAME, process, dispose)

try {
  const { appArgs, patches: overlayFiles } = parseLauncherArgs(process.argv.slice(2))
  const patches = loadBasePatch()
  for (const patchFile of overlayFiles) patches.push(...loadOverlayPatches(NAME, patchFile))
  const ctx = await boot(
    NAME,
    ROOT_CONFIG,
    patches,
    async (hostCtx) => {
      app.current = hostCtx
      // No runtime resolution interception is needed: every carrier package
      // is physically present below this output root.
      await hostCtx.plugin(PluginPackages)
      provideCmdline(hostCtx, {
        args: appArgs,
        exit: (code) => { void shutdown.shutdown(code) },
        ready: appReady.service,
      })
    },
    BARE_MODULE_BASE_URL,
  )
  app.current = ctx
  // boot() already awaited Loader settlement and startup auditing. The
  // explicit state check keeps EOF-before-readiness from becoming a success.
  if (!signalShutdown.signal.aborted && ctx.fiber.state === 2 && ctx.get('loader') !== undefined) {
    appReady.commit()
  }
} catch (error) {
  const cleanupTimeout = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS)
  try {
    await dispose()
  } catch (cleanupError) {
    error = new AggregateError([error, cleanupError], `${NAME}: startup and cleanup failed`)
  } finally {
    clearTimeout(cleanupTimeout)
  }
  uninstallFailLoud()
  process.stderr.write(`${NAME}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}
