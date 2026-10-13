import { hubJson } from "@/modules/knowledge-hub/http";
import { requireKnowledgeAdmin } from "@/modules/auth/access";
import { assertKnowledgeManagerStorage } from "@/modules/knowledge-hub/manager-storage";
import { adminJsonError } from "../../../../_admin";
import { getKnowledgeHub } from "@/modules/knowledge-hub/runtime";
import { createKnowledgeManager, knowledgeManagerErrorResponse } from "@/modules/knowledge-hub/manager";
import { knowledgeDownload } from "@/modules/knowledge-hub/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    try { await requireKnowledgeAdmin(request); } catch (error) { return adminJsonError(error); }
    assertKnowledgeManagerStorage();
    const { id } = await context.params;
    const versionId = new URL(request.url).searchParams.get("version") || await createKnowledgeManager().latestVersionId(id);
    if (!versionId) return hubJson({ error: "资源没有可下载的版本。" }, { status: 404 });
    const resource = await getKnowledgeHub().get(id, versionId, true);
    return knowledgeDownload(resource);
  } catch (error) { return knowledgeManagerErrorResponse(error) ?? adminJsonError(error); }
}
