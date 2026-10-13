import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const installation = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("./dsh-installation", () => ({ verifyDshInstallation: installation.verify, DSH_SUPPORTED_VERSION: "test" }));

const nativeImport = (url: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ url);
let fixtureDir: string | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (fixtureDir && path.dirname(fixtureDir) === path.resolve(tmpdir()) && path.basename(fixtureDir).startsWith("hermit-access-test-")) {
    await rm(fixtureDir, { recursive: true, force: true });
  }
  fixtureDir = undefined;
});

describe("DSH employee access bridge", () => {
  it("checks the employee before every native model continuation", async () => {
    const plugin = await nativeImport(new URL("../../../scripts/hermit-dsh-plugin.mjs", import.meta.url).href) as {
      apply(ctx: unknown, config: unknown): Promise<void>;
    };
    let hook: (_options: unknown, next: () => AsyncGenerator<{ type: string; text: string }>) => AsyncGenerator<unknown>;
    const fetcher = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await plugin.apply({
      tools: { guard: vi.fn(), register: vi.fn() },
      on: (_event: string, callback: typeof hook) => { hook = callback; },
    }, { toolsModule: "data:text/javascript,export function defineTool(value){return value}", bridge: "http://127.0.0.1:1234", tools: [] });
    const modelStart = vi.fn();
    async function* next() { modelStart(); yield { type: "text-delta", text: "Allowed" }; }
    for await (const chunk of hook!({}, next)) { expect(chunk).toMatchObject({ text: "Allowed" }); }
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:1234/ready", "http://127.0.0.1:1234/access", "http://127.0.0.1:1234/text",
    ]);
    fetcher.mockImplementation(async () => new Response("", { status: 403 }));
    await expect(async () => { for await (const chunk of hook!({}, next)) { throw new Error(`Unexpected chunk: ${String(chunk)}`); } }).rejects.toThrow("路引参考资料服务暂时不可用");
    expect(modelStart).toHaveBeenCalledOnce();
  });

  it("denies a revoked employee on the real localhost bridge and closes the isolated runtime", async () => {
    // Vitest's VM does not provide a dynamic-import callback to new Function.
    // Preserve the production runtime and adapt only its native import boundary.
    const OriginalFunction = globalThis.Function;
    vi.stubGlobal("Function", function (...args: string[]) {
      return args.length === 2 && args[0] === "url" && args[1] === "return import(url)" ? nativeImport : OriginalFunction(...args);
    });
    vi.resetModules();
    const { runDshTurn } = await import("./dsh-runtime");
    fixtureDir = await mkdtemp(path.join(tmpdir(), "hermit-access-test-"));
    const sdkPath = path.join(fixtureDir, "sdk.mjs");
    await writeFile(sdkPath, `
      import { readFile } from 'node:fs/promises';
      export const observed = { close: 0 };
      export class DeepSeekHarness {
        constructor(options) { this.options = options; observed.home = options.dshHome; }
        async run() {
          const patches = JSON.parse(await readFile(this.options.patches[0], 'utf8'));
          const bridge = patches.at(-1).insert[1].config.bridge;
          const call = (url, body, token = this.options.env.HERMIT_BRIDGE_TOKEN) => fetch(bridge + url, {
            method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify(body),
          });
          observed.foreignStatus = (await call('/access', {}, 'untrusted')).status;
          await call('/ready', {tools: []});
          observed.accessStatus = (await call('/access', {})).status;
          if (observed.accessStatus !== 200) throw new Error('employee access revoked');
          return {finalResponse: 'Should not run'};
        }
        async close() { observed.close++; }
      }
    `);
    installation.verify.mockResolvedValue({ sdkPath, providerPath: sdkPath, toolsPath: sdkPath, bin: "test-only" });
    const assertAccess = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("revoked"));
    const onText = vi.fn();
    await expect(runDshTurn({ model: "test", provider: { baseURL: "http://127.0.0.1:1/v1", apiKey: "fixture-only", apiMode: "chat", headers: {} },
      tools: {}, signal: new AbortController().signal, prompt: "question", system: "system", onText, assertAccess,
    })).rejects.toThrow("employee access revoked");
    const { observed } = await nativeImport(pathToFileURL(sdkPath).href) as { observed: { home: string; close: number; foreignStatus: number; accessStatus: number } };
    expect(observed.foreignStatus).toBe(403);
    expect(observed.accessStatus).toBe(403);
    expect(observed.close).toBeGreaterThan(0);
    expect(onText).not.toHaveBeenCalled();
    await expect(stat(observed.home)).rejects.toMatchObject({ code: "ENOENT" });
    // The copied profile remains the real plugin, not an alternate test path.
    expect(await readFile("scripts/hermit-dsh-plugin.mjs", "utf8")).toContain("call('/access'");
  });
});
