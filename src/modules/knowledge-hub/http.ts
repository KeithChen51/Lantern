import { ZodError } from "zod";
import { HubError } from "./service";
export function hubHttpError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "查询参数不正确。" }, { status: 400 });
  if (error instanceof HubError) return Response.json({ error: error.message }, { status: error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400 });
  console.error("[Knowledge hub] Request failed", error instanceof Error ? error.name : "Unknown error");
  return Response.json({ error: "知识服务暂时不可用，请稍后重试。" }, { status: 503 });
}
