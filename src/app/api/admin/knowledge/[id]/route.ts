import { hubJson } from "@/modules/knowledge-hub/http";
import { requireKnowledgeAdmin } from "@/modules/auth/access";
import { assertKnowledgeManagerStorage } from "@/modules/knowledge-hub/manager-storage";
import { assertDatabaseConfigured, adminJsonError } from "../../../_admin";
import { getKnowledgeHub } from "@/modules/knowledge-hub/runtime";
import { createKnowledgeManager, knowledgeManagerErrorResponse } from "@/modules/knowledge-hub/manager";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  return knowledgeManagerErrorResponse(error) ?? adminJsonError(error);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    try { await requireKnowledgeAdmin(request); } catch (error) { return adminJsonError(error); }
    assertKnowledgeManagerStorage();
    assertDatabaseConfigured();
    const { id } = await context.params;
    const requestedVersionId = new URL(request.url).searchParams.get("version")?.trim() || null;
    const versionId = requestedVersionId ?? await createKnowledgeManager().latestVersionId(id);
    if (!versionId) return hubJson({ error: "资源没有可预览的版本。", code: "not_found" }, { status: 404 });
    return hubJson(await getKnowledgeHub().get(id, versionId, true), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
