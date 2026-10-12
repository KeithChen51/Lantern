// Exercises the real DSH runtime against a deterministic local model endpoint.
// No company credentials or documents are used.
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { runDshTurn } from "../src/lib/hermit/dsh-runtime";
import { createHermitAgentTools } from "../src/lib/hermit/agent-tools";

import { createAnswerSources } from "../src/lib/hermit/answer-sources";
import { KnowledgeHub } from "../src/modules/knowledge-hub/service";
import { MemoryHubStore } from "../src/modules/knowledge-hub/test-store";

async function main() {
const hub = new KnowledgeHub(new MemoryHubStore());
const version = await hub.import({ id: "smoke-guide", type: "document", title: "服务指引", source: "smoke", markdown: "保持透明沟通。", validity: "effective" });
await hub.publish(version.resourceId, version.versionId);
const sources = createAnswerSources({ hub });
const sequence = [
  { name: "knowledge_search", arguments: JSON.stringify({ query: "服务" }) },
  { name: "knowledge_read", arguments: JSON.stringify({ resourceId: version.resourceId, versionId: version.versionId }) },
  { name: "knowledge_cite", arguments: JSON.stringify({ resourceId: version.resourceId, versionId: version.versionId, startLine: 1, endLine: 1 }) },
  { name: "knowledge_recommend", arguments: JSON.stringify({ resourceId: version.resourceId, versionId: version.versionId, reason: "了解沟通依据。" }) },
];
let requests = 0; let toolCalls = 0; let text = "";
let cancelling = false; const controller = new AbortController();
const model = createServer(async (req, res) => {
  let body = ""; for await (const chunk of req) body += chunk;
  if (cancelling) { controller.abort(); return; }
  assert.equal(req.headers["x-hermit-smoke"], "checked");
  const input = JSON.parse(body);
  const names = input.tools.map((tool: { function: { name: string } }) => tool.function.name);
  assert.deepEqual([...names].sort(), Object.keys(tools).sort());
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const selected = sequence[requests++];
  if (selected) toolCalls++;
  const delta = selected
    ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${requests}`, type: "function", function: selected }] }
    : { role: "assistant", content: "已通过 DSH 查询灯塔知识。[[cite:1]]" };
  res.write(`data: ${JSON.stringify({ id: "smoke", object: "chat.completion.chunk", created: 1, model: "hermit-smoke", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: "smoke", object: "chat.completion.chunk", created: 1, model: "hermit-smoke", choices: [{ index: 0, delta: {}, finish_reason: selected ? "tool_calls" : "stop" }] })}\n\n`);
  res.end("data: [DONE]\n\n");
});
await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
const address = model.address(); assert(address && typeof address !== "string");
// Use the production schemas (including bounds, patterns and optional offsets),
// so the smoke test catches incompatibility with DSH's parameter DSL.
const tools = createHermitAgentTools({
  hub, additionalTools: sources.tools,
  attachments: [], onDocument: sources.recordRead, signal: controller.signal,
});
try {
  await runDshTurn({ prompt: "请查阅知识后回答。", system: "你是路引，请调用 knowledge_search 再回答。", model: "hermit-smoke",
    provider: { apiKey: "local-smoke-only", baseURL: `http://127.0.0.1:${address.port}/v1`, apiMode: "chat", headers: { "x-hermit-smoke": "checked" } },
    tools,
    signal: AbortSignal.timeout(90000), onText: chunk => { text += chunk; },
  });
  assert.equal(toolCalls, 4); assert.equal(text, "已通过 DSH 查询灯塔知识。[[cite:1]]");
  const finalized = await sources.finalize(text);
  assert.equal(finalized.citations.length, 1);
  assert.equal(finalized.recommendations.length, 1);
  assert.equal(sources.snapshot("complete").reads.length, 1);
  assert(finalized.text.includes("[1](#hermit-citation-1)"));
    cancelling = true;
  const started = Date.now();
  await assert.rejects(runDshTurn({ prompt: "cancel", system: "test", model: "hermit-smoke",
    provider: { apiKey: "local-smoke-only", baseURL: `http://127.0.0.1:${address.port}/v1`, apiMode: "chat", headers: {} },
    tools,
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), onText: () => { throw new Error("unexpected text after cancellation"); },
  }));
  assert(controller.signal.aborted);
  assert(Date.now() - started < 15000);
  console.log(JSON.stringify({ realDshRuntime: true, modelRequests: requests, toolCalls, streamedText: text, cancellation: "passed" }));
} finally { model.closeAllConnections(); model.close(); }

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
