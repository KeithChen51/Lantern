import { type NextRequest } from "next/server";
import { authErrorResponse, assertSameOrigin, assertWebMutation, getAccessService, readAccessCookie, requireEmployee, requireKnowledgeClient } from "./access";
import { readAccessConfig } from "./access-config";
import { hashToken } from "./access-crypto";
import { AccessError, OAuthError } from "./access-types";

export const NO_STORE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: NO_STORE }); }
export function empty(): Response { return new Response(null, { status: 204, headers: NO_STORE }); }
function redirect(path: string): Response {
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: new URL(path, readAccessConfig().origin).href } });
}
function isForm(request: Request): boolean { return request.headers.get("content-type")?.split(";")[0] === "application/x-www-form-urlencoded"; }
export async function body(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type")?.split(";")[0];
  if (type !== "application/json" && type !== "application/x-www-form-urlencoded") throw new AccessError("请求格式无效。", 400);
  if (Number(request.headers.get("content-length") || 0) > 16_384 || !request.body) throw new AccessError("请求过大或为空。", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 16_384) throw new AccessError("请求过大。", 400);
      chunks.push(item.value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (type === "application/x-www-form-urlencoded") {
      const params = new URLSearchParams(text);
      for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new AccessError("请求参数重复。", 400);
      return Object.fromEntries(params);
    }
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccessError("请求格式无效。", 400);
    return value as Record<string, unknown>;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AccessError) throw error;
    throw new AccessError("请求格式无效。", 400);
  } finally { reader.releaseLock(); }
}
function textField(input: Record<string, unknown>, name: string, max = 200): string {
  const value = input[name];
  if (typeof value !== "string" || !value || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new AccessError("请求参数无效。", 400);
  return value;
}
export function setCookie(response: Response, name: string, value: string, maxAge: number): void {
  const secure = readAccessConfig().secureCookies ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure}`);
}
function sessionResponse(sessionToken: string, returnTo: string, nativeForm: boolean): Response {
  const config = readAccessConfig();
  const response = nativeForm ? redirect(returnTo) : json({ redirectUrl: returnTo });
  setCookie(response, config.sessionCookie, sessionToken, config.sessionAbsoluteMs / 1000);
  setCookie(response, config.pendingCookie, "", 0);
  setCookie(response, config.transactionCookie, "", 0);
  return response;
}
function requiredCookie(request: Request, name: string): string {
  const value = readAccessCookie(request.headers, name);
  if (!value) throw new AccessError("登录流程已失效，请重新开始。", 401);
  return value;
}
async function mutation(request: Request, input?: Record<string, unknown>) {
  const principal = await requireEmployee(request);
  if (isForm(request)) {
    const headers = new Headers(request.headers);
    headers.set("x-csrf-token", textField(input ?? await body(request), "csrfToken"));
    assertWebMutation(new Request(request.url, { method: "POST", headers }), principal);
  } else assertWebMutation(request, principal);
  return principal;
}
// Do not trust arbitrary X-Forwarded-For headers. An ingress can impose finer
// per-address quotas; this shared bucket is deliberately global and bounded.
const publicRateKey = () => hashToken("lighthouse-public-device-issuance");
export function route(handler: (request: NextRequest) => Promise<Response>, protocol = false) {
  return async (request: NextRequest): Promise<Response> => {
    try { return await handler(request); } catch (error) {
      if (error instanceof OAuthError) return json({ error: error.error }, error.status);
      if (protocol) return json({ error: error instanceof AccessError && error.status < 500 ? "invalid_request" : "temporarily_unavailable" }, error instanceof AccessError && error.status < 500 ? 400 : 503);
      if (isForm(request)) {
        const status = error instanceof AccessError ? error.status : 503;
        const message = status === 403 ? "操作凭据已失效，请重新登录后重试。" : status === 401 ? "登录已失效，请重新登录。" : "暂时无法完成操作，请稍后重试。";
        return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>灯塔 · 登录</title><body><main><h1>暂时无法完成操作</h1><p>${message}</p><a href="/login">返回登录</a></main></body></html>`, {
          status, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" },
        });
      }
      return authErrorResponse(error);
    }
  };
}
export const start = route(async request => {
  assertSameOrigin(request.headers);
  const input = await body(request);
  const result = await getAccessService().startLogin(typeof input.returnTo === "string" ? input.returnTo : "/");
  const response = isForm(request) ? redirect(result.redirectUrl) : json({ redirectUrl: result.redirectUrl });
  setCookie(response, readAccessConfig().transactionCookie, result.cookie, result.cookie ? readAccessConfig().transactionMs / 1000 : 0);
  return response;
});
export const callback = async (request: NextRequest): Promise<Response> => {
  try {
  const config = readAccessConfig(), params = new URL(request.url).searchParams;
  if (params.getAll(config.tokenParam).length !== 1 || params.getAll(config.stateParam).length > 1) throw new AccessError("登录回调无效。", 400);
  const result = await getAccessService().callback({ token: params.get(config.tokenParam) || "", state: params.get(config.stateParam) ?? undefined, cookie: readAccessCookie(request.headers, config.transactionCookie) });
  if (result.kind === "session") return sessionResponse(result.sessionToken, result.returnTo, true);
  const response = redirect("/auth/confirm");
  setCookie(response, config.pendingCookie, result.pendingToken, config.transactionMs / 1000);
  setCookie(response, config.transactionCookie, "", 0);
  return response;
  } catch {
    // Clear bearer material from the browser address even on failure.
    try { return redirect("/login?error=callback"); }
    catch { return new Response(null, { status: 303, headers: { ...NO_STORE, Location: "/login?error=unavailable" } }); }
  }
};
// Navigation entry for OA/middle-platform cards; no bearer credential accepted.
export const iamStart = route(async request => {
  const config = readAccessConfig();
  if (config.mode !== "iam") throw new AccessError("IAM authentication is disabled", 401);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(name => name !== "returnTo") || params.getAll("returnTo").length > 1) throw new AccessError("登录参数无效。", 400);
  const result = await getAccessService().startLogin(params.get("returnTo") ?? "/");
  const response = redirect(result.redirectUrl);
  setCookie(response, config.transactionCookie, result.cookie, config.transactionMs / 1000);
  return response;
});
export const iamCallback = async (request: NextRequest): Promise<Response> => {
  try {
    const config = readAccessConfig(), params = new URL(request.url).searchParams;
    if (config.mode !== "iam" || params.has("error") || params.getAll("code").length !== 1 || params.getAll("state").length !== 1) throw new AccessError("登录回调无效。", 400);
    const result = await getAccessService().iamCallback({ code: params.get("code") || "", state: params.get("state") || "", cookie: readAccessCookie(request.headers, config.transactionCookie) });
    return sessionResponse(result.sessionToken, result.returnTo, true);
  } catch {
    try {
      const response = redirect("/login?error=callback");
      setCookie(response, readAccessConfig().transactionCookie, "", 0);
      return response;
    } catch { return new Response(null, { status: 303, headers: { ...NO_STORE, Location: "/login?error=unavailable" } }); }
  }
};
export const pending = route(async request => json(await getAccessService().pending(requiredCookie(request, readAccessConfig().pendingCookie))));
export const confirm = route(async request => {
  assertSameOrigin(request.headers);
  const input = await body(request);
  const result = await getAccessService().confirmPending(requiredCookie(request, readAccessConfig().pendingCookie), textField(input, "csrfToken"));
  return sessionResponse(result.sessionToken, result.returnTo, isForm(request));
});
export const me = route(async request => {
  const principal = await requireEmployee(request);
  return json({ user: { id: principal.userId, account: principal.account, displayName: principal.displayName, organization: principal.organization }, capabilities: principal.capabilities, csrfToken: principal.csrfToken, expiresAt: principal.expiresAt });
});
export function logout(all: boolean) { return route(async request => {
  const principal = await mutation(request);
  await getAccessService().logout(principal, all);
  const config = readAccessConfig();
  const response = isForm(request) ? redirect(config.mode === "iam" ? "/login?loggedOut=1" : "/login") : empty();
  for (const cookie of [config.sessionCookie, config.transactionCookie, config.pendingCookie]) setCookie(response, cookie, "", 0);
  return response;
}); }
export const clients = route(async request => json({ items: await getAccessService().listClients(await requireEmployee(request)) }));
export async function revokeClient(request: Request, id: string): Promise<Response> {
  try { await getAccessService().revokeClient(await mutation(request), id); return empty(); } catch (error) { return authErrorResponse(error); }
}
export const deviceAuthorize = route(async request => {
  const input = await body(request);
  return json(await getAccessService().authorizeDevice({ clientId: textField(input, "client_id"), scope: textField(input, "scope"), name: input.device_name === undefined ? undefined : textField(input, "device_name", 100), rateKey: publicRateKey() }));
}, true);
export const deviceRequest = route(async request => {
  const principal = await requireEmployee(request);
  const params = new URL(request.url).searchParams;
  if (params.getAll("user_code").length !== 1) throw new AccessError("设备代码无效。", 400);
  return json(await getAccessService().deviceRequest(principal, params.get("user_code") || "", hashToken(principal.userId)));
});
export const deviceDecision = route(async request => {
  const input = await body(request), principal = await mutation(request, input);
  if (input.approve !== true && input.approve !== false && !(isForm(request) && ["true", "false"].includes(String(input.approve)))) throw new AccessError("授权操作无效。", 400);
  await getAccessService().decideDevice(principal, textField(input, "userCode", 32), input.approve === true || input.approve === "true", hashToken(principal.userId));
  return isForm(request) ? redirect("/auth/device?completed=1") : empty();
});
export const token = async (request: NextRequest): Promise<Response> => {
  try {
    if (!isForm(request)) throw new OAuthError("invalid_request");
    const input = await body(request), service = getAccessService();
    const clientId = textField(input, "client_id");
    if (input.grant_type === "urn:ietf:params:oauth:grant-type:device_code") return json(await service.exchangeDevice(textField(input, "device_code"), clientId));
    if (input.grant_type === "refresh_token") return json(await service.refresh(textField(input, "refresh_token"), clientId));
    throw new OAuthError("unsupported_grant_type");
  } catch (error) {
    if (error instanceof OAuthError) return json({ error: error.error }, error.status);
    return json({ error: error instanceof AccessError && error.status < 500 ? "invalid_request" : "temporarily_unavailable" }, error instanceof AccessError && error.status < 500 ? 400 : 503);
  }
};
export const clientMe = route(async request => {
  const principal = await requireKnowledgeClient(request);
  return json({ user: { id: principal.userId, account: principal.account, displayName: principal.displayName }, scope: "knowledge:read", expiresAt: principal.expiresAt });
});
export const clientRevoke = route(async request => {
  const principal = await requireKnowledgeClient(request);
  await getAccessService().revokeClient(principal, principal.credentialId);
  return empty();
});
