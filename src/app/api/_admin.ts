import { headers } from "next/headers";
import { authRepository } from "@/modules/auth";
import { isAdminPortalCookieHeaderAuthorized } from "@/modules/admin";
import { createTenantService, tenantRepository } from "@/modules/tenant";
import type { WorkshopUser } from "@/modules/workshop";
import { AppError, toErrorResponse } from "@/shared/errors";

const tenantService = createTenantService(tenantRepository);

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

export async function getAdminPortalWorkshopAdminFromHeaders(requestHeaders: Headers): Promise<WorkshopUser | null> {
  if (!isAdminPortalCookieHeaderAuthorized(readCookieHeader(requestHeaders))) {
    return null;
  }

  assertDatabaseConfigured();
  const user = await authRepository.findDemoHighestAdmin();
  if (!user) {
    throw new AppError("unauthorized", "Highest-admin user is not seeded.", 401);
  }
  const scope = await tenantService.getUserOrgScope(user.id);
  return {
    id: user.id,
    displayName: user.displayName,
    role: "highest_admin",
    scope,
  };
}

export async function requireAdminPortalUser() {
  assertDatabaseConfigured();
  const requestHeaders = await requireAdminPortal();
  const portalUser = await getAdminPortalWorkshopAdminFromHeaders(requestHeaders);
  if (!portalUser) {
    throw new AppError("forbidden", "请输入管理密码后再访问后台。", 403);
  }
  return portalUser;
}

export function adminJsonError(error: unknown) {
  const response = toErrorResponse(error);
  return Response.json(response.body, { status: response.status });
}
