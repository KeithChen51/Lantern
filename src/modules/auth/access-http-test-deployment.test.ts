import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/infrastructure/db", () => ({ prisma: {} }));
// Exercise real configuration, routes, facade, state, sessions and CSRF with
// synthetic portal identities and an in-memory transaction store (not MySQL).
vi.mock("./access-store", async importOriginal => {
  const actual = await importOriginal<typeof import("./access-store")>();
  const store = new actual.MemoryAccessStore();
  return { ...actual, PrismaAccessStore: class { transaction = store.transaction.bind(store); } };
});
vi.mock("./portal", () => ({ HttpPortalAdapter: class {
  async identity() { return { account: "000123", displayName: "Fixture employee" }; }
  async roles() { return []; }
} }));
import { readAccessConfig } from "./access-config";
import { callback, logout, me, start } from "./access-http";

const origin = "http://10.20.30.40:3080";
const env = {
  NODE_ENV: "production", LIGHTHOUSE_DEPLOYMENT_ENV: "test", AUTH_MODE: "portal", LIGHTHOUSE_ORIGIN: origin, AUTH_TEST_HTTP_ORIGIN: origin, AUTH_ALLOW_LOCAL_HTTP: "false",
  PORTAL_API_BASE_URL: "https://portal.example.invalid/api", PORTAL_LOGIN_URL: "https://portal.example.invalid/login", PORTAL_APP_CODE: "fixture", PORTAL_APP_SECRET: "synthetic", PORTAL_KNOWLEDGE_ADMIN_ROLE: "knowledge_admin",
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "true", PORTAL_ALLOW_LEGACY_CONFIRMATION: "false",
  DATABASE_URL: "mysql://fixture", KNOWLEDGE_HUB_ENABLED: "true", KNOWLEDGE_HUB_DRIVER: "mysql",
};
beforeEach(() => { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());
const post = (path: string, input: Record<string, string>, headers: Record<string, string> = {}) => new NextRequest(origin + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin, ...headers }, body: new URLSearchParams(input) });
function cookie(response: Response, name: string) {
  const found = response.headers.getSetCookie().find(item => item.startsWith(name + "="));
  expect(found).toBeDefined(); return found!;
}
async function begin(returnTo = "/heart") {
  const config = readAccessConfig(), response = await start(post("/api/auth/start", { returnTo }));
  expect(response.status).toBe(303);
  const portalUrl = new URL(response.headers.get("location")!);
  expect(portalUrl.origin).toBe("https://portal.example.invalid");
  expect(portalUrl.searchParams.get("redirectUrl")).toBe(origin + "/auth/portal/callback");
  const transactionCookie = cookie(response, config.transactionCookie);
  return { config, response, transactionCookie, state: portalUrl.searchParams.get("state")! };
}
const callbackRequest = (state: string, cookie: string) => new NextRequest(origin + "/auth/portal/callback?" + new URLSearchParams({ state, token: "synthetic-upstream" }), { headers: { cookie } });

describe("HTTP test login preserves the authentication protocol", () => {
  it("sets HTTP-compatible isolated cookies, authenticates, and requires CSRF to logout", async () => {
    const flow = await begin();
    const response = await callback(callbackRequest(flow.state, flow.transactionCookie.split(";")[0]));
    expect(response.headers.get("location")).toBe(origin + "/heart");
    const session = cookie(response, flow.config.sessionCookie);
    for (const value of [flow.transactionCookie, session]) {
      expect(value).toContain("HttpOnly"); expect(value).toContain("SameSite=Lax"); expect(value).toContain("Path=/");
      expect(value).not.toContain("Secure"); expect(value).not.toContain("__Host-"); expect(value).not.toContain("Domain=");
    }
    const sessionHeader = session.split(";")[0];
    const current = await me(new NextRequest(origin + "/api/auth/me", { headers: { cookie: sessionHeader } }));
    expect(current.status).toBe(200);
    const identity = await current.json(); expect(identity.user.account).toBe("000123"); expect(identity.capabilities).not.toContain("knowledge:manage");
    const rejectedHeaders: Record<string, string>[] = [{ cookie: sessionHeader }, { cookie: sessionHeader, origin: "http://10.20.30.41:3080" }, { cookie: sessionHeader, origin: "http://10.20.30.40:3081" }];
    for (const headers of rejectedHeaders) {
      const bad = await logout(false)(post("/api/auth/logout", { csrfToken: headers.origin ? identity.csrfToken : "wrong" }, headers));
      expect(bad.status).toBe(403);
    }
    const loggedOut = await logout(false)(post("/api/auth/logout", { csrfToken: identity.csrfToken }, { cookie: sessionHeader }));
    expect(loggedOut.status).toBe(303);
    for (const name of [flow.config.sessionCookie, flow.config.transactionCookie, flow.config.pendingCookie]) expect(cookie(loggedOut, name)).toContain("Max-Age=0");
    expect((await me(new NextRequest(origin + "/api/auth/me", { headers: { cookie: sessionHeader } }))).status).toBe(401);
  });
  it("rejects foreign origins, mismatched state and cookie, and unsafe return targets", async () => {
    const bad = await start(post("/api/auth/start", {}, { origin: "http://10.20.30.41:3080", "x-forwarded-host": "10.20.30.40:3080" }));
    expect(bad.status).toBe(403);
    const flow = await begin("https://hostile.invalid");
    for (const request of [callbackRequest("incorrect-state", flow.transactionCookie.split(";")[0]), callbackRequest(flow.state, `${flow.config.transactionCookie}=${"a".repeat(43)}`)]) {
      const response = await callback(request);
      expect(response.headers.get("location")).toBe(origin + "/login?error=callback"); expect(response.headers.has("set-cookie")).toBe(false);
    }
    const completed = await callback(callbackRequest(flow.state, flow.transactionCookie.split(";")[0]));
    expect(completed.headers.get("location")).toBe(origin + "/");
    const replay = await callback(callbackRequest(flow.state, flow.transactionCookie.split(";")[0]));
    expect(replay.headers.get("location")).toBe(origin + "/login?error=callback");
  });
});
