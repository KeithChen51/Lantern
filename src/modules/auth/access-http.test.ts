import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AccessError, OAuthError } from "./access-types";
const service = vi.hoisted(() => ({ authorizeDevice: vi.fn(), exchangeDevice: vi.fn(), refresh: vi.fn(), startLogin: vi.fn(), callback: vi.fn(), confirmPending: vi.fn(), revokeClient: vi.fn(), logout: vi.fn() }));
vi.mock("./access", () => ({
  getAccessService: () => service,
  requireEmployee: vi.fn(async () => ({ userId: "fixture", credentialId: "web", channel: "web", csrfToken: "fixture-csrf" })),
  requireKnowledgeClient: vi.fn(async () => ({ userId: "fixture", credentialId: "client", channel: "cli" })),
  readAccessCookie: (headers: Headers, name: string) => headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1),
  assertSameOrigin: (headers: Headers) => { if (headers.get("origin") !== "https://app.example.invalid") throw new AccessError("origin", 403); },
  assertWebMutation: (request: Request) => { if (request.headers.get("x-csrf-token") !== "fixture-csrf") throw new AccessError("csrf", 403); },
  authErrorResponse: (error: { status?: number }) => Response.json({ error: "access" }, { status: error.status ?? 503, headers: { "cache-control": "no-store" } }),
}));
import { body, callback, confirm, deviceAuthorize, logout, start, token } from "./access-http";
const env = {
  AUTH_MODE: "portal", LIGHTHOUSE_ORIGIN: "https://app.example.invalid", PORTAL_API_BASE_URL: "https://portal.example.invalid", PORTAL_LOGIN_URL: "https://portal.example.invalid/login",
  PORTAL_APP_CODE: "lighthouse", PORTAL_APP_SECRET: "synthetic", PORTAL_KNOWLEDGE_ADMIN_ROLE: "knowledge_admin", AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"), PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "true",
};
beforeEach(() => { vi.resetAllMocks(); for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); });
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
