import { ZodError } from "zod";
import { HubError } from "./service";
export function hubHttpError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "查询参数不正确。" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (error instanceof HubError) return Response.json({ error: error.message }, { status: error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400, headers: { "Cache-Control": "no-store" } });
  console.error("[Knowledge hub] Request failed", error instanceof Error ? error.name : "Unknown error");
  return Response.json({ error: "知识服务暂时不可用，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

export function hubJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers); headers.set("Cache-Control", "no-store");
  return Response.json(value, { ...init, headers });
}

export async function boundedKnowledgeJson(request: Request) {
  const max = 64_000;
  if (Number(request.headers.get("content-length")) > max) throw new HubError("invalid", "请求正文过大。");
  const reader = request.body?.getReader();
  if (!reader) throw new HubError("invalid", "请求正文必须是有效 JSON。");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new HubError("invalid", "请求正文过大。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HubError("invalid", "请求正文必须是有效 JSON。"); }
}
