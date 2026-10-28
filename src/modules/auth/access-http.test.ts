import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AccessError, OAuthError } from "./access-types";
import { generateKeyPairSync } from "node:crypto";
const service = vi.hoisted(() => ({ authorizeDevice: vi.fn(), exchangeDevice: vi.fn(), refresh: vi.fn(), startLogin: vi.fn(), loginReturnTo: vi.fn(), callback: vi.fn(), iamCallback: vi.fn(), confirmPending: vi.fn(), revokeClient: vi.fn(), logout: vi.fn() }));
vi.mock("./access", () => ({
  getAccessService: () => service,
  requireEmployee: vi.fn(async () => ({ userId: "fixture", credentialId: "web", channel: "web", csrfToken: "fixture-csrf" })),
  requireKnowledgeClient: vi.fn(async () => ({ userId: "fixture", credentialId: "client", channel: "cli" })),
  readAccessCookie: (headers: Headers, name: string) => headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1),
  assertSameOrigin: (headers: Headers) => { if (headers.get("origin") !== "https://app.example.invalid") throw new AccessError("origin", 403); },
  assertWebMutation: (request: Request) => { if (request.headers.get("x-csrf-token") !== "fixture-csrf") throw new AccessError("csrf", 403); },
  authErrorResponse: (error: { status?: number }) => Response.json({ error: "access" }, { status: error.status ?? 503, headers: { "cache-control": "no-store" } }),
}));
import { body, callback, confirm, deviceAuthorize, iamCallback, iamStart, logout, start, token } from "./access-http";
const env = {
  AUTH_MODE: "portal", LIGHTHOUSE_ORIGIN: "https://app.example.invalid", PORTAL_API_BASE_URL: "https://portal.example.invalid", PORTAL_LOGIN_URL: "https://portal.example.invalid/login",
  PORTAL_APP_CODE: "lighthouse", PORTAL_APP_SECRET: "synthetic", PORTAL_KNOWLEDGE_ADMIN_ROLE: "knowledge_admin", AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"), PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "true",
};
beforeEach(() => { vi.resetAllMocks(); service.loginReturnTo.mockResolvedValue("/"); for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); });
afterEach(() => { vi.unstubAllEnvs(); });
const form = (path: string, value: Record<string, string>) => new NextRequest(`https://app.example.invalid${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://app.example.invalid" }, body: new URLSearchParams(value) });

describe("device HTTP protocol and native forms stay distinct", () => {
  it.each([["invalid_scope", 400], ["invalid_client", 401], ["slow_down", 429]] as const)("returns OAuth JSON for a form device request: %s", async (error, status) => {
    service.authorizeDevice.mockRejectedValue(new OAuthError(error, status));
    const response = await deviceAuthorize(form("/api/auth/device/authorize", { client_id: "lighthouse-cli", scope: "knowledge:read" }));
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("keeps malformed and unavailable protocol requests JSON", async () => {
    const invalid = await deviceAuthorize(form("/api/auth/device/authorize", { scope: "knowledge:read" }));
    expect(invalid.status).toBe(400); expect(await invalid.json()).toEqual({ error: "invalid_request" });
    service.authorizeDevice.mockRejectedValue(new Error("private failure"));
    const unavailable = await deviceAuthorize(form("/api/auth/device/authorize", { client_id: "lighthouse-cli", scope: "knowledge:read" }));
    expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: "temporarily_unavailable" });
  });
  it.each(["authorization_pending", "slow_down", "access_denied", "expired_token", "invalid_grant"])("preserves token protocol error %s", async error => {
    service.exchangeDevice.mockRejectedValue(new OAuthError(error));
    const response = await token(form("/api/auth/token", { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: "lighthouse-cli", device_code: "synthetic" }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error });
  });
  it("does not accept duplicate protocol fields or an oversized streaming body", async () => {
    const repeated = form("/api/auth/token", {});
    const request = new NextRequest(repeated.url, { method: "POST", headers: repeated.headers, body: "client_id=a&client_id=b" });
    await expect(body(request)).rejects.toMatchObject({ status: 400 });
    await expect(body(new Request(repeated.url, { method: "POST", headers: { "content-type": "application/json" }, body: '"' + "x".repeat(17000) + '"' }))).rejects.toMatchObject({ status: 400 });
  });
  it("native login sets a host-only secure transaction cookie and redirects", async () => {
    service.startLogin.mockResolvedValue({ cookie: "opaque-transaction", redirectUrl: "https://portal.example.invalid/login?state=fixture" });
    const response = await start(form("/api/auth/start", { returnTo: "/auth/device?user_code=ABC123" }));
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("https://portal.example.invalid/login?state=fixture");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("__Host-lighthouse_login="); expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).not.toContain("Domain=");
  });
  it("callback strips bearer URL material on failure and never echoes it", async () => {
    service.callback.mockRejectedValue(new Error("sensitive-token"));
    const response = await callback(new NextRequest("https://app.example.invalid/auth/portal/callback?token=sensitive-token&state=invalid"));
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("https://app.example.invalid/login?error=callback");
    expect(await response.text()).not.toContain("sensitive-token"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("keeps a validated callback destination on retry, excluding bearer material", async () => {
    service.loginReturnTo.mockResolvedValue("/auth/device?user_code=ABCD-EFGH");
    service.callback.mockRejectedValue(new Error("sensitive-token"));
    const response = await callback(new NextRequest("https://app.example.invalid/auth/portal/callback?token=sensitive-token&state=bound&returnTo=https://evil.invalid", { headers: { cookie: "__Host-lighthouse_login=browser" } }));
    expect(service.loginReturnTo).toHaveBeenCalledWith({ state: "bound", cookie: "browser" });
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login"); expect(location.searchParams.get("returnTo")).toBe("/auth/device?user_code=ABCD-EFGH");
    expect(location.searchParams.get("error")).toBe("callback"); expect(location.href).not.toContain("sensitive-token");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("rejects an unbound transaction before using any callback return target", async () => {
    service.loginReturnTo.mockRejectedValue(new AccessError("invalid", 401));
    const response = await callback(new NextRequest("https://app.example.invalid/auth/portal/callback?token=private&state=wrong&returnTo=/action"));
    expect(response.headers.get("location")).toBe("https://app.example.invalid/login?error=callback");
    expect(service.callback).not.toHaveBeenCalled();
  });
  it("native failures are readable without JavaScript and do not expose exception text", async () => {
    service.startLogin.mockRejectedValue(new Error("sensitive exception"));
    const response = await start(form("/api/auth/start", {}));
    expect(response.status).toBe(503); expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text(); expect(html).toContain("返回登录"); expect(html).not.toContain("sensitive");
  });
  it("pending confirmation binds its cookie and submitted nonce before issuing a session", async () => {
    service.confirmPending.mockResolvedValue({ sessionToken: "new-opaque-session", returnTo: "/" });
    const request = form("/api/auth/portal-login", { csrfToken: "pending-nonce" }); request.headers.set("cookie", "__Host-lighthouse_pending=pending-opaque");
    const response = await confirm(request);
    expect(service.confirmPending).toHaveBeenCalledWith("pending-opaque", "pending-nonce"); expect(response.status).toBe(303); expect(response.headers.get("set-cookie")).toContain("__Host-lighthouse_session=new-opaque-session");
  });
  it("native logout checks its submitted CSRF and expires all authentication cookies", async () => {
    const denied = await logout(false)(form("/api/auth/logout", { csrfToken: "wrong" }));
    expect(denied.status).toBe(403); expect(service.logout).not.toHaveBeenCalled();
    const response = await logout(true)(form("/api/auth/logout-all", { csrfToken: "fixture-csrf" }));
    expect(response.status).toBe(303); expect(service.logout).toHaveBeenCalledWith(expect.objectContaining({ userId: "fixture" }), true);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("IAM callback HTTP boundary", () => {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ format: "der", type: "spki" }).toString("base64");
  beforeEach(() => {
    for (const [name, value] of Object.entries({ AUTH_MODE: "iam", IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "fixture", IAM_CLIENT_SECRET: "synthetic", IAM_SYNC_APP_KEY: "fixture", IAM_SYNC_PUBLIC_KEY: key, IAM_SYNC_AES_KEY: Buffer.alloc(32, 2).toString("base64"), IAM_SYNC_AES_IV: Buffer.alloc(16, 3).toString("base64") })) vi.stubEnv(name, value);
  });
  it("creates a bound login from the navigation card entry and rejects bearer injection", async () => {
    service.startLogin.mockResolvedValue({ cookie: "transaction", redirectUrl: "https://iam.example.invalid/idp/authCenter/authenticate?state=fixture" });
    const response = await iamStart(new NextRequest("https://app.example.invalid/auth/iam/start?returnTo=%2Fheart"));
    expect(response.status).toBe(303); expect(service.startLogin).toHaveBeenCalledWith("/heart");
    expect(response.headers.get("set-cookie")).toContain("__Host-lighthouse_iam_login=transaction");
    const rejected = await iamStart(new NextRequest("https://app.example.invalid/auth/iam/start?token=injected"));
    expect(rejected.status).toBe(400);
  });
  it("consumes code/state only at IAM callback and issues an opaque cookie", async () => {
    service.iamCallback.mockResolvedValue({ sessionToken: "opaque-session", returnTo: "/heart" });
    const response = await iamCallback(new NextRequest("https://app.example.invalid/auth/iam/callback?code=synthetic-code&state=state&lang=zh_CN", { headers: { cookie: "__Host-lighthouse_iam_login=browser" } }));
    expect(service.iamCallback).toHaveBeenCalledWith({ code: "synthetic-code", state: "state", cookie: "browser" });
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("https://app.example.invalid/heart");
    expect(response.headers.get("set-cookie")).toContain("__Host-lighthouse_iam_session=opaque-session");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain("synthetic-code");
  });
  it.each(["code=private-code&state=bound", "error=access_denied&state=bound"])("preserves the bound IAM destination after failure: %s", async query => {
    service.loginReturnTo.mockResolvedValue("/auth/device?user_code=ABCD-EFGH");
    service.iamCallback.mockRejectedValue(new Error("private-code"));
    const response = await iamCallback(new NextRequest(`https://app.example.invalid/auth/iam/callback?${query}`, { headers: { cookie: "__Host-lighthouse_iam_login=browser" } }));
    expect(service.loginReturnTo).toHaveBeenCalledWith({ state: "bound", cookie: "browser" });
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("returnTo")).toBe("/auth/device?user_code=ABCD-EFGH");
    expect(location.href).not.toContain("private-code"); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it.each(["code=one&code=two&state=a", "code=a", "code=a&state=a&state=b", "error=denied&code=a&state=b"])("rejects ambiguous callback %s", async query => {
    const response = await iamCallback(new NextRequest(`https://app.example.invalid/auth/iam/callback?${query}`));
    expect(service.iamCallback).not.toHaveBeenCalled(); expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.invalid/login?error=callback");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("ends only the Lighthouse session and shows its own login page", async () => {
    const response = await logout(false)(form("/api/auth/logout", { csrfToken: "fixture-csrf" }));
    expect(response.headers.get("location")).toBe("https://app.example.invalid/login?loggedOut=1");
    expect(response.headers.get("set-cookie")).toContain("__Host-lighthouse_iam_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  });
});
