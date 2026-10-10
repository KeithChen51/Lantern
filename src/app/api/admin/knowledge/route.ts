import { assertDatabaseConfigured, adminJsonError, requireAdminPortalFromHeaders } from "../../_admin";
import { createKnowledgeManager, knowledgeManagerErrorResponse } from "@/modules/knowledge-hub/manager";
import { HubError } from "@/modules/knowledge-hub/service";
import { AppError } from "@/shared/errors";

export const dynamic = "force-dynamic";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new AppError("forbidden", "写操作必须来自同源页面。", 403);
  }
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    throw new AppError("forbidden", "写操作必须来自同源页面。", 403);
  }

  let requestHost = request.headers.get("host")?.trim();
  if (!requestHost) {
    try {
      requestHost = new URL(request.url).host;
    } catch {
      throw new AppError("bad_request", "请求地址不正确。", 400);
    }
  }
  if (!requestHost || parsedOrigin.host.toLowerCase() !== requestHost.toLowerCase()) {
    throw new AppError("forbidden", "写操作必须来自同源页面。", 403);
  }
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
