import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { hubHttpError } from "@/modules/knowledge-hub/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!isKnowledgeHubEnabled()) return Response.json({ error: "知识服务尚未启用。" }, { status: 503 });
  const query = new URL(request.url).searchParams;
  try {
    return Response.json(await getKnowledgeHub().search({ query: query.get("q") ?? "", sort: query.get("sort") ?? "relevance", type: query.get("type") || undefined, offset: Number(query.get("offset") ?? 0), limit: Number(query.get("limit") ?? 20), includeInactive: query.get("includeInactive") === "true" }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return hubHttpError(error); }
}
