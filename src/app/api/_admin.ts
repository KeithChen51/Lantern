import { headers } from "next/headers";
import { requireKnowledgeAdmin, authErrorResponse } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";

export function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) throw new AppError("bad_request", "数据库尚未配置。", 503);
}
// Legacy callers must await this guard. Knowledge administration is the only supported admin capability.
export async function requireAdminPortalFromHeaders(requestHeaders: Headers) {
  return requireKnowledgeAdmin(requestHeaders);
}
export async function requireAdminPortal() {
  const requestHeaders = await headers();
  await requireAdminPortalFromHeaders(requestHeaders);
  return requestHeaders;
}
export function adminJsonError(error: unknown) { return authErrorResponse(error); }
