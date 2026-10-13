import { requireEmployee, authErrorResponse } from "@/modules/auth/access";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { hubHttpError, hubJson } from "@/modules/knowledge-hub/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    try { await requireEmployee(request); } catch (error) { return authErrorResponse(error); }
    if (!isKnowledgeHubEnabled()) return hubJson({ error: "知识服务尚未启用。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const { id } = await context.params;
    const query = new URL(request.url).searchParams;
    const resource = await getKnowledgeHub().get(id, query.get("version") || undefined);
    const headers = { "Cache-Control": "no-store", "X-Resource-Version": resource.version.id };
    if (query.get("format") === "md") return new Response(resource.version.markdown, { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${resource.id}.md"` } });
    const { files, ...version } = resource.version;
    return hubJson({ ...resource, version: { ...version, files: files.map(({ path, mediaType, checksum }) => ({ path, mediaType, checksum })) } }, { headers });
  } catch (error) { return hubHttpError(error); }
}
