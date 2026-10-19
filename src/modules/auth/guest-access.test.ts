import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { generateKeyPairSync } from "node:crypto";
vi.mock("@/infrastructure/db", () => ({ prisma: {} }));
vi.mock("./access-store", async importOriginal => {
  const actual = await importOriginal<typeof import("./access-store")>();
  const store = new actual.MemoryAccessStore();
  return { ...actual, PrismaAccessStore: class { transaction = store.transaction.bind(store); } };
});
import { MemoryAccessStore } from "./access-store";
import { GuestAccessService } from "./guest-access-service";
import { readSiteAccessConfig, type GuestAccessConfig } from "./site-access-config";
import { readAccessConfig } from "./access-config";
import { assertWebMutation, enforceGuestRequestLimit, getAccessService, getGuestAccessService, requireEmployee, requireKnowledgeAdmin, requireKnowledgeClient, requireSiteVisitor } from "./access";
import { me } from "./access-http";
import { createIamSyncHandlers } from "./iam-sync-http";
import { proxy } from "../../proxy";

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production", AUTH_MODE: "guest", LIGHTHOUSE_ORIGIN: "https://guest.example.invalid",
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), DATABASE_URL: "mysql://fixture",
  KNOWLEDGE_HUB_ENABLED: "true", KNOWLEDGE_HUB_DRIVER: "mysql",
};
const config = (overrides: Partial<NodeJS.ProcessEnv> = {}) => readSiteAccessConfig({ ...env, ...overrides }) as GuestAccessConfig;
const request = (cookie?: string, path = "/heart", extra: Record<string, string> = {}) => new NextRequest(`${env.LIGHTHOUSE_ORIGIN}${path}`, { headers: { ...(cookie ? { cookie } : {}), ...extra } });
beforeEach(() => { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());

describe("explicit guest configuration", () => {
  it("needs no IAM/portal credentials and retains production storage requirements", () => {
    expect(config().mode).toBe("guest");
    expect(config().secureCookies).toBe(true);
    for (const override of [{ AUTH_MODE: undefined }, { AUTH_MODE: "unknown" }, { AUTH_MODE: "iam" }, { AUTH_ENCRYPTION_KEY: "bad" }, { DATABASE_URL: undefined }, { KNOWLEDGE_HUB_ENABLED: "false" }]) expect(() => readSiteAccessConfig({ ...env, ...override })).toThrow();
    expect(() => readAccessConfig(env)).toThrow();
  });
  it("preserves the exact intranet test HTTP exception and rejects production HTTP", () => {
    const origin = "http://10.20.30.40:3080";
    const test = { LIGHTHOUSE_DEPLOYMENT_ENV: "test", LIGHTHOUSE_ORIGIN: origin, AUTH_TEST_HTTP_ORIGIN: origin };
    expect(config(test).secureCookies).toBe(false);
    expect(config(test).sessionCookie).not.toContain("__Host-");
    for (const override of [{ LIGHTHOUSE_DEPLOYMENT_ENV: "production" }, { AUTH_TEST_HTTP_ORIGIN: undefined }, { AUTH_TEST_HTTP_ORIGIN: origin + "/" }, { LIGHTHOUSE_ORIGIN: "http://8.8.8.8", AUTH_TEST_HTTP_ORIGIN: "http://8.8.8.8" }, { AUTH_ALLOW_LOCAL_HTTP: "true" }]) expect(() => config({ ...test, ...override })).toThrow();
    expect(() => config({ LIGHTHOUSE_ORIGIN: origin })).toThrow();
  });
  it("binds cookies and server namespace to origin, deployment and key", () => {
    for (const override of [{ LIGHTHOUSE_ORIGIN: "https://another.example.invalid" }, { LIGHTHOUSE_DEPLOYMENT_ENV: "test" }, { AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") }]) {
      expect(config(override).namespace).not.toBe(config().namespace);
      expect(config(override).sessionCookie).not.toBe(config().sessionCookie);
    }
  });
});

describe("anonymous credentials and quotas", () => {
  it("issues independent identities and stores only opaque hashes without employee records", async () => {
    const store = new MemoryAccessStore(), service = new GuestAccessService(config(), store);
    const a = await service.issue(), b = await service.issue();
    expect(a.token).not.toBe(b.token); expect(a.principal.userId).not.toBe(b.principal.userId);
    expect(a.principal.grantId).not.toBe(b.principal.grantId); expect(a.principal.csrfToken).not.toBe(b.principal.csrfToken);
    expect(a.principal.userId).toMatch(/^guest:/); expect(a.principal.account).toBe("");
    expect(a.principal.capabilities).not.toContain("knowledge:manage"); expect(a.principal.capabilities).not.toContain("auth:client:self");
    expect(store.snapshot().filter(row => row.kind === "guest")).toHaveLength(2);
    expect(JSON.stringify(store.snapshot())).not.toContain(a.token);
    expect(await service.webPrincipal(a.token)).toEqual(a.principal);
    await expect(service.webPrincipal(a.token.slice(0, -1) + "!")).rejects.toMatchObject({ status: 401 });
    const changed = (a.token[0] === "a" ? "b" : "a") + a.token.slice(1);
    await expect(service.webPrincipal(changed)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects expired and copied credentials across environments even in a shared store", async () => {
    const store = new MemoryAccessStore(); let now = Date.now();
    const service = new GuestAccessService(config(), store, () => now), issued = await service.issue();
    for (const override of [{ LIGHTHOUSE_DEPLOYMENT_ENV: "test" }, { LIGHTHOUSE_ORIGIN: "https://other.example.invalid" }, { AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") }]) await expect(new GuestAccessService(config(override), store).webPrincipal(issued.token)).rejects.toMatchObject({ status: 401 });
    now = issued.principal.expiresAt;
    await expect(service.webPrincipal(issued.token)).rejects.toMatchObject({ status: 401 });
  });
  it("enforces shared per-session and deployment limits across service instances", async () => {
    const store = new MemoryAccessStore(), service = new GuestAccessService(config(), store), other = new GuestAccessService(config(), store);
    const a = await service.issue();
    for (let i = 0; i < 20; i++) await service.enforceRequestLimit(a.principal, "chat");
    await expect(other.enforceRequestLimit(a.principal, "chat")).rejects.toMatchObject({ status: 429 });
    const b = await service.issue();
    await other.enforceRequestLimit(b.principal, "chat");
    // New browser sessions cannot bypass the deployment-wide attachment quota.
    for (let i = 0; i < 12; i++) { const guest = await service.issue(); for (let j = 0; j < 10; j++) await service.enforceRequestLimit(guest.principal, "attachment"); }
    await expect(other.enforceRequestLimit(b.principal, "attachment")).rejects.toMatchObject({ status: 429 });
    await expect(enforceGuestRequestLimit({ ...a.principal, kind: "employee" }, "chat")).resolves.toBeUndefined();
  });
  it("bounds anonymous issuance and prevents an expired session from consuming AI quota", async () => {
    const store = new MemoryAccessStore(); let now = Date.now();
    const service = new GuestAccessService(config(), store, () => now);
    const issued = await service.issue();
    for (let i = 1; i < 120; i++) await service.issue();
    await expect(service.issue()).rejects.toMatchObject({ status: 429 });
    now = issued.principal.expiresAt;
    await expect(service.enforceRequestLimit(issued.principal, "chat")).rejects.toMatchObject({ status: 401 });
  });
});

describe("guest HTTP boundary", () => {
  it("bootstraps page navigation and forwards exactly the issued secure cookie to rendering", async () => {
    const response = await proxy(request());
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=lax"); expect(cookie).not.toContain("Domain=");
    const forwarded = response.headers.get("x-middleware-request-cookie")!;
    expect(cookie.startsWith(forwarded + ";")).toBe(true);
    const principal = await requireSiteVisitor(request(forwarded));
    expect(principal.kind).toBe("guest");
    expect((await proxy(request(forwarded))).headers.has("set-cookie")).toBe(false);
    const current = await me(request(forwarded, "/api/auth/me"));
    expect(current.status).toBe(200);
    const data = await current.json();
    expect(data).toMatchObject({ kind: "guest", user: { id: principal.userId, account: "", displayName: "访客" }, csrfToken: principal.csrfToken });
    expect(JSON.stringify(data)).not.toContain("employee"); expect(data.user.organization).toBeUndefined();
    expect(() => assertWebMutation(request(forwarded, "/api/chat", { origin: env.LIGHTHOUSE_ORIGIN!, "x-csrf-token": principal.csrfToken! }), principal)).not.toThrow();
    for (const headers of [{ origin: "https://evil.invalid", "x-csrf-token": principal.csrfToken! }, { origin: env.LIGHTHOUSE_ORIGIN!, "x-csrf-token": "wrong" }]) expect(() => assertWebMutation(request(forwarded, "/api/chat", headers), principal)).toThrow();
  });
  it("never issues sessions for API, asset or RSC fetches or accepts client-supplied identity", async () => {
    for (const path of ["/api/auth/me", "/_next/static/chunks/app.js", "/fonts/brand/source-han-sans-cn/SourceHanSansCN-Regular.otf", "/_next/data/build/heart.json"]) expect((await proxy(request(undefined, path))).headers.has("set-cookie")).toBe(false);
    expect((await me(request(undefined, "/api/auth/me", { "x-guest-id": "guest:chosen" }))).status).toBe(401);
    const rsc = await proxy(request(undefined, "/heart", { rsc: "1" })); expect(rsc.status).toBe(401); expect(rsc.headers.has("set-cookie")).toBe(false);
    const post = await proxy(new NextRequest(`${env.LIGHTHOUSE_ORIGIN}/heart`, { method: "POST" })); expect(post.status).toBe(401); expect(post.headers.has("set-cookie")).toBe(false);
  });
  it("uses an HTTP-only non-Secure cookie only for the explicitly configured test origin", async () => {
    const origin = "http://10.20.30.40:3080";
    for (const [key, value] of Object.entries({ LIGHTHOUSE_DEPLOYMENT_ENV: "test", LIGHTHOUSE_ORIGIN: origin, AUTH_TEST_HTTP_ORIGIN: origin })) vi.stubEnv(key, value);
    const response = await proxy(new NextRequest(origin + "/heart", { method: "HEAD" }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).not.toContain("Secure"); expect(cookie).not.toContain("__Host-");
  });
  it("denies employee/admin/tool guards and IAM sync despite stale provider settings", async () => {
    vi.stubEnv("IAM_CLIENT_ID", "stale-employee-config");
    const issued = await getGuestAccessService().issue(), cookie = `${config().sessionCookie}=${issued.token}`;
    for (const guard of [requireEmployee, requireKnowledgeAdmin, requireKnowledgeClient]) await expect(guard(request(cookie))).rejects.toMatchObject({ status: 403 });
    expect(() => getAccessService()).toThrow();
    for (const path of ["/admin", "/admin/login", "/auth/tools", "/auth/device", "/api/client/v1/resources", "/api/auth/token"]) expect((await proxy(request(cookie, path))).status).toBe(403);
    const store = vi.fn(), handlers = createIamSyncHandlers({ env: () => ({ ...env, IAM_SYNC_APP_KEY: "stale" }), store });
    expect((await handlers.roles(request())).status).toBe(503); expect(store).not.toHaveBeenCalled();
  });
  it("strips callback credentials before rendering and never treats them as a session", async () => {
    const response = await proxy(request(undefined, "/heart?token=secret&code=secret&state=secret&view=values"));
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe(`${env.LIGHTHOUSE_ORIGIN}/heart?view=values`);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer"); expect(response.headers.has("set-cookie")).toBe(false);
    expect((await proxy(request(undefined, "/auth/iam/callback?code=secret&state=secret"))).headers.get("location")).toBe(env.LIGHTHOUSE_ORIGIN + "/");
  });
  it("IAM never accepts the guest session or falls back when configuration is missing", async () => {
    const issued = await getGuestAccessService().issue(), cookie = `${config().sessionCookie}=${issued.token}`;
    vi.stubEnv("AUTH_MODE", "iam");
    await expect(requireSiteVisitor(request(cookie))).rejects.toMatchObject({ status: 503 });
    expect((await proxy(request(cookie))).status).toBe(503);
    const publicKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
    for (const [key, value] of Object.entries({ IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "fixture", IAM_CLIENT_SECRET: "synthetic", IAM_SYNC_APP_KEY: "fixture", IAM_SYNC_PUBLIC_KEY: publicKey, IAM_SYNC_AES_KEY: Buffer.alloc(32, 2).toString("base64"), IAM_SYNC_AES_IV: Buffer.alloc(16, 3).toString("base64") })) vi.stubEnv(key, value);
    await expect(requireSiteVisitor(request(cookie))).rejects.toMatchObject({ status: 401 });
    const renamed = `${readAccessConfig().sessionCookie}=${issued.token}`;
    await expect(requireSiteVisitor(request(renamed))).rejects.toMatchObject({ status: 401 });
  });
});
