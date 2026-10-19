import { prisma } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
import { readAccessConfig } from "./access-config";
import { readSiteAccessConfig } from "./site-access-config";
import { GuestAccessService } from "./guest-access-service";
import { equalSecret, hashToken } from "./access-crypto";
import { AccessService } from "./access-service";
import { PrismaAccessStore } from "./access-store";
import { AccessError, type Principal } from "./access-types";
import { HttpPortalAdapter } from "./portal";
import { IamIdentityClient } from "./iam";

export type { Capability, Principal } from "./access-types";
export { AccessError } from "./access-types";
function denyGuestEmployeeAccess(): void {
  if (process.env.AUTH_MODE === "guest") throw new AccessError("访客模式不提供员工权限。", 403);
}
export function getGuestAccessService(): GuestAccessService {
  const config = readSiteAccessConfig();
  if (config.mode !== "guest") throw new AccessError("访客访问未启用。", 403);
  return new GuestAccessService(config, new PrismaAccessStore(prisma));
}
export async function requireSiteVisitor(request: Request | Headers): Promise<Principal> {
  const config = readSiteAccessConfig();
  if (config.mode !== "guest") return requireEmployee(request);
  const token = readAccessCookie(requestHeaders(request), config.sessionCookie);
  if (!token) throw new AccessError("访客会话已失效，请刷新页面。", 401);
  return getGuestAccessService().webPrincipal(token);
}
export async function enforceGuestRequestLimit(principal: Principal, action: "chat" | "attachment"): Promise<void> {
  if (principal.kind === "guest") await getGuestAccessService().enforceRequestLimit(principal, action);
}
export function getAccessService(): AccessService {
  denyGuestEmployeeAccess();
  const config = readAccessConfig();
  if (config.mode === "iam" && config.iam) {
    const iam = new IamIdentityClient(config.iam);
    return new AccessService(config, {
      identity: token => iam.identity(token), exchange: code => iam.exchange(code),
      authorizationUrl: (uri, state) => iam.authorizationUrl(uri, state),
      // IAM authorization is read transactionally from the synchronized directory.
      roles: async () => { throw new AccessError("IAM directory authorization is required", 503); },
    }, new PrismaAccessStore(prisma));
  }
  return new AccessService(config, new HttpPortalAdapter(config), new PrismaAccessStore(prisma));
}
export async function getPendingLogin(headers: Headers) {
  const token = readAccessCookie(headers, readAccessConfig().pendingCookie);
  if (!token) throw new AccessError("登录确认已失效，请重新开始。", 401);
  return getAccessService().pending(token);
}
export async function getDeviceRequest(headers: Headers, userCode: string) {
  const principal = await requireEmployee(headers);
  return getAccessService().deviceRequest(principal, userCode, hashToken(principal.userId));
}
export function readAccessCookie(headers: Headers, name: string): string | undefined {
  const found = (headers.get("cookie") || "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  if (found.length !== 1) return undefined;
  const token = found[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{32,160}$/.test(token) ? token : undefined;
}
function requestHeaders(request: Request | Headers): Headers { return request instanceof Headers ? request : request.headers; }
export async function requireEmployee(request: Request | Headers): Promise<Principal> {
  denyGuestEmployeeAccess();
  const config = readAccessConfig();
  const token = readAccessCookie(requestHeaders(request), config.sessionCookie);
  if (!token) throw new AccessError("请先使用员工账号登录。", 401);
  return getAccessService().webPrincipal(token);
}
export async function requireKnowledgeAdmin(request: Request | Headers, options?: { write?: boolean }): Promise<Principal> {
  denyGuestEmployeeAccess();
  const token = readAccessCookie(requestHeaders(request), readAccessConfig().sessionCookie);
  if (!token) throw new AccessError("请先使用员工账号登录。", 401);
  const principal = await getAccessService().webPrincipal(token, { adminWrite: options?.write });
  if (!principal.capabilities.includes("knowledge:manage")) throw new AccessError("当前账号没有知识管理权限。", 403);
  if (options?.write) assertMutationHeaders(requestHeaders(request), principal);
  return principal;
}
export async function requireKnowledgeClient(request: Request): Promise<Principal> {
  denyGuestEmployeeAccess();
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer [A-Za-z0-9_-]{32,160}$/.test(authorization)) throw new AccessError("请先通过 lighthouse auth login 授权。", 401);
  return getAccessService().clientPrincipal(authorization.slice(7));
}
export function assertSameOrigin(headers: Headers): void {
  const config = readSiteAccessConfig();
  if (headers.get("origin") !== config.origin || headers.get("sec-fetch-site") === "cross-site") throw new AccessError("请求来源不受信任。", 403);
}
function assertMutationHeaders(headers: Headers, principal: Principal): void {
  assertSameOrigin(headers);
  const supplied = headers.get("x-csrf-token");
  if (principal.channel !== "web" || !principal.csrfToken || !supplied || !equalSecret(supplied, principal.csrfToken)) throw new AccessError("操作凭据已失效，请刷新后重试。", 403);
}
export function assertWebMutation(request: Request, principal: Principal): void { assertMutationHeaders(request.headers, principal); }
export function authErrorResponse(error: unknown): Response {
  const status = error instanceof AppError ? error.status : 503;
  const message = error instanceof AppError ? error.message : "登录服务暂时不可用，请稍后重试。";
  return Response.json({ error: { code: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "access_unavailable", message } }, {
    status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="lighthouse"' } : {}) },
  });
}
