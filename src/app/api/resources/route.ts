import { requireEmployee, authErrorResponse } from "@/modules/auth/access";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { hubHttpError, hubJson } from "@/modules/knowledge-hub/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    try { await requireEmployee(request); } catch (error) { return authErrorResponse(error); }
    if (!isKnowledgeHubEnabled()) return hubJson({ error: "知识服务尚未启用。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const query = new URL(request.url).searchParams;
    return hubJson(await getKnowledgeHub().search({ query: query.get("q") ?? "", sort: query.get("sort") ?? "relevance", type: query.get("type") || undefined, offset: Number(query.get("offset") ?? 0), limit: Number(query.get("limit") ?? 20), includeInactive: false }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return hubHttpError(error); }
}
