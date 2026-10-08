import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { createHermitAgentTools } from "./agent-tools";
import type { HermitProviderSettings } from "./model-provider";

type AgentTools = ReturnType<typeof createHermitAgentTools>;
type Harness = { run(prompt: string): Promise<{ finalResponse: string }>; close(): Promise<void> };
type Sdk = { DeepSeekHarness: new (options: Record<string, unknown>) => Harness };
const nativeImport = new Function("url", "return import(url)") as (url: string) => Promise<Sdk>;
let activeRuns = 0;
export { DSH_SUPPORTED_VERSION, verifyDshInstallation } from "./dsh-installation";
import { verifyDshInstallation } from "./dsh-installation";

/** One isolated runtime per request: no client-selected session, cwd or profile. */
export async function runDshTurn(input: {
  prompt: string; system: string; provider: HermitProviderSettings; model: string;
  tools: AgentTools; signal: AbortSignal; onText: (text: string) => void;
}) {
  if (activeRuns >= 2) throw new Error("路引当前正在处理较多请求，请稍后再试。");
  activeRuns++;
  let home: string | undefined; let harness: Harness | undefined;
  const lifetime = new AbortController();
  const signal = AbortSignal.any([input.signal, lifetime.signal, AbortSignal.timeout(180_000)]);
  const token = randomBytes(32).toString("hex");
  let streamed = false;
  let toolsReady = false;
  let calls = 0;
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.headers.authorization !== `Bearer ${token}` || signal.aborted) { res.writeHead(403).end(); return; }
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 64_000) throw new Error("Tool request too large"); chunks.push(Buffer.from(chunk)); }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (req.url === "/ready") {
        const ready = z.object({ tools: z.array(z.string()).length(3) }).strict().parse(value);
        if ([...ready.tools].sort().join(",") !== "attachment_read,knowledge_read,knowledge_search") throw new Error("Incomplete tools");
        toolsReady = true;
        res.writeHead(200, { "Content-Type": "application/json" }).end("{}"); return;
      }
      if (req.url === "/text") {
        const data = z.object({ text: z.string().max(32_000) }).strict().parse(value);
        streamed = true; input.onText(data.text);
        res.writeHead(200, { "Content-Type": "application/json" }).end("{}"); return;
      }
      if (req.url !== "/tool" || ++calls > 20) throw new Error("Tool limit reached");
      const data = z.object({ name: z.enum(["knowledge_search", "knowledge_read", "attachment_read"]), arguments: z.unknown() }).strict().parse(value);
      const result = await input.tools[data.name].execute(data.arguments);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch { if (!res.headersSent) res.writeHead(400); res.end(JSON.stringify({ error: "无法读取所请求的参考资料。" })); }
  });
  const abort = () => { void harness?.close().catch(() => undefined); };
  try {
    signal.throwIfAborted();
    const endpoint = new URL(input.provider.baseURL);
    if (endpoint.username || endpoint.password || !["http:", "https:"].includes(endpoint.protocol)) throw new Error("模型网关地址必须是不含账号密码的 HTTP(S) URL。");
    const installation = await verifyDshInstallation();
    home = await mkdtemp(path.join(tmpdir(), "lantern-dsh-"));
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Bridge unavailable");
    const plugin = path.join(home, "hermit-plugin.mjs");
    await writeFile(plugin, await readFile(path.join(process.cwd(), "scripts/hermit-dsh-plugin.mjs")));
    const toolSpecs = Object.entries(input.tools).map(([name, tool]) => {
      const schema = z.toJSONSchema(tool.schema, { io: "input" }) as { properties: Record<string, Record<string, unknown>>; required?: string[] };
      // DSH's property DSL accepts only a subset of JSON Schema and rejects
      // required:false, pattern and min/max keywords. Keep strict validation
      // at the bridge in the original Zod schemas; advertise supported scalars.
      return { name, description: tool.description, parameters: Object.fromEntries(Object.entries(schema.properties).map(([key, spec]) => {
        if (!["string", "integer", "number", "boolean"].includes(String(spec.type))) throw new Error("Unsupported Hermit tool parameter");
        const scalar = Object.fromEntries(Object.entries(spec).filter(([field]) => ["type", "description", "default", "enum", "const"].includes(field)));
        return [key, { ...scalar, ...(schema.required?.includes(key) ? { required: true } : {}) }];
      })) };
    });
    const patch = path.join(home, "hermit.patch.yml");
    // JSON is a YAML subset; model secrets are only injected through child env.
    const patches = [
      ...["persistent-bash", "persistent-pwsh", "terminal-bash", "terminal-pwsh", "pty", "llm-deepseek"].map(id => ({ id, disabled: true })),
      { id: "tools", config: { mode: "native" } },
      { insert: [
        { id: "hermit-provider", name: pathToFileURL(installation.providerPath).href, config: { providers: { "lantern-gateway": {
          apiKeyEnv: "HERMIT_MODEL_KEY", api: input.provider.apiMode === "responses" ? "openai-responses" : "openai-completions",
          baseURL: input.provider.baseURL, models: [{ id: input.model, name: input.model, contextWindow: 32768 }], retryPolicy: { mode: "normal", maxRetries: 0 },
        } } } },
        { id: "hermit-tools", name: pathToFileURL(plugin).href, config: { bridge: `http://127.0.0.1:${address.port}`, toolsModule: pathToFileURL(installation.toolsPath).href, tools: toolSpecs } },
      ] },
    ];
    // Non-standard gateway headers require the provider patch to resolve the
    // env at launch rather than persisting credentials in a temporary file.
    let patchText = JSON.stringify(patches, null, 2);
    if (Object.keys(input.provider.headers).length) {
      const route = patches[patches.length - 1] as { insert: Array<{ config: unknown }> };
      const providerConfig = route.insert[0].config as { providers: Record<string, Record<string, unknown>> };
      providerConfig.providers["lantern-gateway"].headers = "__HERMIT_HEADERS__";
      patchText = JSON.stringify(patches, null, 2).replace('"__HERMIT_HEADERS__"', '!!js JSON.parse(process.env.HERMIT_MODEL_HEADERS)');
    }
    await writeFile(patch, patchText, { mode: 0o600 });
    const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? "production" };
    for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, { HERMIT_MODEL_KEY: input.provider.apiKey, HERMIT_MODEL_HEADERS: JSON.stringify(input.provider.headers), HERMIT_BRIDGE_TOKEN: token, DSH_SYSTEM_PROMPT: input.system });
    const sdk = await nativeImport(pathToFileURL(installation.sdkPath).href);
    harness = new sdk.DeepSeekHarness({ dshBin: installation.bin, profile: "sdk-minimal", patches: [patch], dshHome: home, cwd: home, processCwd: home,
      env, provider: "lantern-gateway", model: input.model, maxTokens: 4096, requestTimeoutMs: 170_000, initializeTimeoutMs: 30_000 });
    signal.addEventListener("abort", abort, { once: true }); signal.throwIfAborted();
    const result = await harness.run(input.prompt); signal.throwIfAborted();
    if (!toolsReady) throw new Error("路引资料工具未能初始化，请联系维护人员。");
    if (!streamed && result.finalResponse) input.onText(result.finalResponse);
    if (!streamed && !result.finalResponse.trim()) throw new Error("路引未能完成回答，请重试。");
    return result;
  } finally {
    lifetime.abort(); signal.removeEventListener("abort", abort);
    try {
      await harness?.close();
    } finally {
      server.closeAllConnections();
      try {
        if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
        if (home && path.dirname(path.resolve(home)) === path.resolve(tmpdir()) && path.basename(home).startsWith("lantern-dsh-")) await rm(home, { recursive: true, force: true });
      } finally { activeRuns--; }
    }
  }
}
