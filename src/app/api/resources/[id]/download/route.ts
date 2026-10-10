import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { hubHttpError } from "@/modules/knowledge-hub/http";
import { knowledgeDownload } from "@/modules/knowledge-hub/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isKnowledgeHubEnabled()) return Response.json({ error: "知识服务尚未启用。" }, { status: 503 });
  try {
    const { id } = await context.params;
    const version = new URL(request.url).searchParams.get("version") || undefined;
    return await knowledgeDownload(await getKnowledgeHub().get(id, version));
  } catch (error) { return hubHttpError(error); }
}
