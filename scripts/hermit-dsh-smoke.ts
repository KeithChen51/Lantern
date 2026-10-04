// Exercises the real DSH runtime against a deterministic local model endpoint.
// No company credentials or documents are used.
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { z } from "zod";
import { runDshTurn } from "../src/lib/hermit/dsh-runtime";

async function main() {
let requests = 0; let toolCalls = 0; let text = "";
let cancelling = false; const controller = new AbortController();
const model = createServer(async (req, res) => {
  let body = ""; for await (const chunk of req) body += chunk;
  if (cancelling) { controller.abort(); return; }
  assert.equal(req.headers["x-hermit-smoke"], "checked");
  const input = JSON.parse(body);
  const names = input.tools.map((tool: { function: { name: string } }) => tool.function.name);
  assert.deepEqual([...names].sort(), ["attachment_read", "knowledge_read", "knowledge_search"]);
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const delta = requests++ === 0
    ? { role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "knowledge_search", arguments: '{"query":"服务"}' } }] }
    : { role: "assistant", content: "已通过 DSH 查询灯塔知识。" };
  res.write(`data: ${JSON.stringify({ id: "smoke", object: "chat.completion.chunk", created: 1, model: "hermit-smoke", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: "smoke", object: "chat.completion.chunk", created: 1, model: "hermit-smoke", choices: [{ index: 0, delta: {}, finish_reason: requests === 1 ? "tool_calls" : "stop" }] })}\n\n`);
  res.end("data: [DONE]\n\n");
});
await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
const address = model.address(); assert(address && typeof address !== "string");
const schema = z.object({ query: z.string() });
const tool = { description: "读取测试知识", schema, execute: async () => { toolCalls++; return { text: "求真" }; } };
try {
  await runDshTurn({ prompt: "请查阅知识后回答。", system: "你是路引，请调用 knowledge_search 再回答。", model: "hermit-smoke",
    provider: { apiKey: "local-smoke-only", baseURL: `http://127.0.0.1:${address.port}/v1`, apiMode: "chat", headers: { "x-hermit-smoke": "checked" } },
    tools: { knowledge_search: tool, knowledge_read: tool, attachment_read: tool } as unknown as Parameters<typeof runDshTurn>[0]["tools"],
    signal: AbortSignal.timeout(90000), onText: chunk => { text += chunk; },
  });
  assert.equal(toolCalls, 1); assert.equal(text, "已通过 DSH 查询灯塔知识。");
    cancelling = true;
  const started = Date.now();
  await assert.rejects(runDshTurn({ prompt: "cancel", system: "test", model: "hermit-smoke",
    provider: { apiKey: "local-smoke-only", baseURL: `http://127.0.0.1:${address.port}/v1`, apiMode: "chat", headers: {} },
    tools: { knowledge_search: tool, knowledge_read: tool, attachment_read: tool } as unknown as Parameters<typeof runDshTurn>[0]["tools"],
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), onText: () => { throw new Error("unexpected text after cancellation"); },
  }));
  assert(controller.signal.aborted);
  assert(Date.now() - started < 15000);
  console.log(JSON.stringify({ realDshRuntime: true, modelRequests: requests, toolCalls, streamedText: text, cancellation: "passed" }));
} finally { model.closeAllConnections(); model.close(); }

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
