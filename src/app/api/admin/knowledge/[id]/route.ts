import { assertDatabaseConfigured, adminJsonError, requireAdminPortalFromHeaders } from "../../../_admin";
import { getKnowledgeHub } from "@/modules/knowledge-hub/runtime";
import { createKnowledgeManager, knowledgeManagerErrorResponse } from "@/modules/knowledge-hub/manager";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  return knowledgeManagerErrorResponse(error) ?? adminJsonError(error);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    requireAdminPortalFromHeaders(request.headers);
    assertDatabaseConfigured();
    const { id } = await context.params;
    const latestVersionId = await createKnowledgeManager().latestVersionId(id);
    if (!latestVersionId) return Response.json({ error: "资源没有可预览的版本。", code: "not_found" }, { status: 404 });
    return Response.json(await getKnowledgeHub().get(id, latestVersionId, true), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
