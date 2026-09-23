import { headers } from "next/headers";
import { isAdminPortalCookieHeaderAuthorized } from "@/modules/admin";
import { AppError, toErrorResponse } from "@/shared/errors";

function readCookieHeader(requestHeaders: Headers) {
  return requestHeaders.get("cookie");
}

export function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new AppError("bad_request", "数据库尚未配置，暂时无法使用管理后台。", 503);
  }
}

export function requireAdminPortalFromHeaders(requestHeaders: Headers) {
  if (!isAdminPortalCookieHeaderAuthorized(readCookieHeader(requestHeaders))) {
    throw new AppError("forbidden", "请输入管理密码后再访问后台。", 403);
  }
}

export async function requireAdminPortal() {
  const requestHeaders = await headers();
  requireAdminPortalFromHeaders(requestHeaders);
  return requestHeaders;
}

export function adminJsonError(error: unknown) {
  const response = toErrorResponse(error);
  return Response.json(response.body, { status: response.status });
}
