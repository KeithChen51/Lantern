import { requireEmployee, authErrorResponse } from "@/modules/auth/access";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { hubHttpError, hubJson } from "@/modules/knowledge-hub/http";
import { knowledgeDownload } from "@/modules/knowledge-hub/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    try { await requireEmployee(request); } catch (error) { return authErrorResponse(error); }
    if (!isKnowledgeHubEnabled()) return hubJson({ error: "知识服务尚未启用。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const { id } = await context.params;
    const version = new URL(request.url).searchParams.get("version") || undefined;
    return await knowledgeDownload(await getKnowledgeHub().get(id, version));
  } catch (error) { return hubHttpError(error); }
}
