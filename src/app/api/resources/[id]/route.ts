import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { hubHttpError } from "@/modules/knowledge-hub/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isKnowledgeHubEnabled()) return Response.json({ error: "知识服务尚未启用。" }, { status: 503 });
  try {
    const { id } = await context.params;
    const query = new URL(request.url).searchParams;
    const resource = await getKnowledgeHub().get(id, query.get("version") || undefined);
    const headers = { "Cache-Control": "no-store", "X-Resource-Version": resource.version.id };
    if (query.get("format") === "md") return new Response(resource.version.markdown, { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${resource.id}.md"` } });
    return Response.json(resource, { headers });
  } catch (error) { return hubHttpError(error); }
}
