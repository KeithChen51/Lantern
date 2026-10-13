import { requireKnowledgeClient, authErrorResponse } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";
import { createRuntimeKnowledgeIndexReader, knowledgeFileId } from "./index-reader";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "./runtime";
import { HubError } from "./service";
import { hubHttpError } from "./http";
import { knowledgeDownload } from "./download";
import { z } from "zod";

export type ClientResourceOperation = "search" | "browse" | "get" | "outline" | "read" | "files" | "files/read" | "download";
const windows = new Map<string, { start: number; count: number }>();
function rateLimit(id: string) {
  const now = Date.now();
  if (windows.size >= 10_000) for (const [key, value] of windows) if (now - value.start >= 60_000) windows.delete(key);
  let window = windows.get(id);
  if (!window || now - window.start >= 60_000) {
    if (!window && windows.size >= 10_000) throw new AppError("forbidden", "知识请求繁忙，请稍后重试。", 429);
    window = { start: now, count: 0 }; windows.set(id, window);
  }
  if (++window.count > 120) throw new AppError("forbidden", "知识请求过于频繁，请稍后重试。", 429);
}
const numericKeys = new Set(["offset", "limit", "sectionOffset", "sectionLimit", "fileOffset", "fileLimit", "startLine", "lineCount"]);
function queryInput(request: Request) {
  const values: Record<string, unknown> = Object.create(null);
  for (const [key, value] of new URL(request.url).searchParams) {
    if (key === "resourceId") throw new HubError("invalid", "资源 ID 必须来自请求路径。 ");
    if (Object.hasOwn(values, key)) throw new HubError("invalid", "查询参数不能重复。");
    values[key] = numericKeys.has(key) ? (value.trim() ? Number(value) : NaN) : value;
  }
  return values;
}
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/);
const getQuery = z.object({ versionId: id.optional() }).strict();
const downloadQuery = z.object({ versionId: id, fileId: z.union([z.literal("package"), z.literal("markdown"), z.string().regex(/^[a-f0-9]{64}$/)]) }).strict();

/** Bearer-only knowledge transport. Authentication precedes URL parsing, storage and binary work. */
export async function clientResourceGet(request: Request, operation: ClientResourceOperation, context?: { params: Promise<{ id: string }> }) {
  let principal;
  try { principal = await requireKnowledgeClient(request); rateLimit(principal.credentialId); }
  catch (error) { return authErrorResponse(error); }
  try {
    if (!isKnowledgeHubEnabled()) return Response.json({ error: "知识服务尚未启用。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const input = queryInput(request);
    const resourceId = context ? id.parse((await context.params).id) : undefined;
    const hub = getKnowledgeHub();
    const reader = createRuntimeKnowledgeIndexReader(hub);
    let result: unknown;
    switch (operation) {
      case "search": result = await reader.search(input); break;
      case "browse": result = await reader.browse(input); break;
      case "get": result = await reader.get(resourceId!, getQuery.parse(input).versionId); break;
      case "outline": result = await reader.outline({ ...input, resourceId }); break;
      case "read": result = await reader.read({ ...input, resourceId }); break;
      case "files": result = await reader.skillFiles({ ...input, resourceId }); break;
      case "files/read": result = await reader.skillRead({ ...input, resourceId }); break;
      case "download": {
        const query = downloadQuery.parse(input);
        const resource = await hub.get(resourceId!, query.versionId);
        if (query.fileId === "package") return knowledgeDownload(resource);
        if (query.fileId === "markdown") return new Response(resource.version.markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${resource.id}.md"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Resource-Version": resource.version.id } });
        const file = resource.version.files.find(file => knowledgeFileId(file.path) === query.fileId);
        if (!file) throw new HubError("not_found", "附件不存在。");
        return new Response(Buffer.from(file.contentBase64, "base64"), { headers: {
          "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.path.split("/").at(-1)!)}`,
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Resource-Version": resource.version.id,
        } });
      }
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return hubHttpError(error); }
}
