import { assertDatabaseConfigured, adminJsonError, requireAdminPortalFromHeaders } from "../../_admin";
import { createKnowledgeManager, knowledgeManagerErrorResponse } from "@/modules/knowledge-hub/manager";
import { HubError } from "@/modules/knowledge-hub/service";
import { AppError } from "@/shared/errors";

export const dynamic = "force-dynamic";

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new AppError("bad_request", "请求地址不正确。", 400);
  }
  if (origin !== requestOrigin) throw new AppError("forbidden", "写操作必须来自同源页面。", 403);
}

function errorResponse(error: unknown) {
  return knowledgeManagerErrorResponse(error) ?? adminJsonError(error);
}

export async function GET(request: Request) {
  try {
    requireAdminPortalFromHeaders(request.headers);
    assertDatabaseConfigured();
    return Response.json(await createKnowledgeManager().list(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAdminPortalFromHeaders(request.headers);
    assertDatabaseConfigured();
    assertSameOrigin(request);
    const body = await request.json().catch(() => { throw new HubError("invalid", "请求正文必须是有效 JSON。"); });
    return Response.json(await createKnowledgeManager().apply(body));
  } catch (error) {
    return errorResponse(error);
  }
}
