import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AccessService } from "./access-service";
import { MemoryAccessStore } from "./access-store";
import { readAccessConfig } from "./access-config";
import { IamDirectorySync } from "./iam-directory";
import { IamIdentityClient } from "./iam";
import type { AccessConfig, PortalAdapter } from "./access-types";

const origin = "http://10.0.147.68:16888";
const publicKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production", AUTH_MODE: "iam", LIGHTHOUSE_DEPLOYMENT_ENV: "test", LIGHTHOUSE_ORIGIN: origin, AUTH_TEST_HTTP_ORIGIN: origin,
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  DATABASE_URL: "mysql://synthetic", KNOWLEDGE_HUB_ENABLED: "true", KNOWLEDGE_HUB_DRIVER: "mysql",
  IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "fixture-client", IAM_CLIENT_SECRET: "synthetic-client-secret",
  IAM_SYNC_APP_KEY: "fixture-app", IAM_SYNC_PUBLIC_KEY: publicKey, IAM_SYNC_AES_KEY: Buffer.alloc(32, 2).toString("base64"), IAM_SYNC_AES_IV: Buffer.alloc(16, 3).toString("base64"),
};
function fixture() {
  let time = 1800000000000, delivery = 0;
  const now = () => time, store = new MemoryAccessStore(), config = readAccessConfig(env);
  const iam = new IamIdentityClient(config.iam!);
  const exchange = vi.fn(async () => ({ token: "synthetic-upstream-token", expiresAt: time + 1500_000 }));
  const identity = vi.fn(async () => ({ account: "000042", displayName: "000042" }));
  const roles = vi.fn(async () => { throw new Error("Middle platform must not be called"); });
  const provider: PortalAdapter = { exchange, identity, roles, authorizationUrl: (uri, state) => iam.authorizationUrl(uri, state) };
  const service = new AccessService(config, provider, store, now), sync = new IamDirectorySync(store, now);
  const account = (actionType = 0, isDisabled: string | undefined = "0") => sync.account({ actionType, userInfo: { username: "000042", fullname: "模拟员工", organization: "售后/服务", ...(isDisabled === undefined ? {} : { isDisabled }) } }, `fixture-${++delivery}`, time + 600000);
  const permission = (actionType = 0, roleCode = "lighthouse_user", postCode = "primary", expiresTime = time + 3600000) => sync.permission({ actionType, permissionInfo: { username: "000042", roleCode, postCode, expiresTime } }, `fixture-${++delivery}`, time + 600000);
  const login = async (returnTo = "/heart") => {
    const start = await service.startLogin(returnTo);
    const result = await service.iamCallback({ code: "single-use-code", state: start.state, cookie: start.cookie });
    return { ...result, start, principal: await service.webPrincipal(result.sessionToken) };
  };
  return { config, provider, store, service, exchange, identity, roles, account, permission, login, now, advance: (ms: number) => { time += ms; } };
}

describe("IAM configuration is independent of portal credentials", () => {
  it("allows the explicit HTTP test origin, isolates sessions, and requires sync configuration", () => {
    const config = readAccessConfig(env);
    expect(config.mode).toBe("iam"); expect(config.sessionCookie).toMatch(/^lighthouse_test_.*_iam_session$/);
    expect(config.secureCookies).toBe(false); expect(config.allowLegacyConfirmation).toBe(false);
    for (const missing of ["IAM_CLIENT_ID", "IAM_CLIENT_SECRET", "IAM_BASE_URL", "IAM_SYNC_APP_KEY", "IAM_SYNC_PUBLIC_KEY", "IAM_SYNC_AES_KEY", "IAM_SYNC_AES_IV"]) {
      expect(() => readAccessConfig({ ...env, [missing]: undefined })).toThrow();
    }
    expect(() => readAccessConfig({ ...env, AUTH_TEST_HTTP_ORIGIN: undefined })).toThrow();
    expect(() => readAccessConfig({ ...env, LIGHTHOUSE_DEPLOYMENT_ENV: "production", AUTH_TEST_HTTP_ORIGIN: undefined })).toThrow();
    const production = readAccessConfig({ ...env, LIGHTHOUSE_DEPLOYMENT_ENV: "production", LIGHTHOUSE_ORIGIN: "https://lighthouse.example.invalid", AUTH_TEST_HTTP_ORIGIN: undefined });
    expect(production.sessionCookie).toBe("__Host-lighthouse_iam_session"); expect(production.secureCookies).toBe(true);
  });
});

describe("IAM login and synchronized authorization", () => {
  it.each(["lighthouse_user", "lighthouse_knowledge_admin", "lighthouse_admin"])("separates %s summary permissions and immediately observes synchronized revocation", async role => {
    const f = fixture();
    await f.account(); await f.permission(0, role);
    const login = await f.login();
    expect(login.principal.capabilities.includes("knowledge:manage")).toBe(role !== "lighthouse_user");
    expect(login.principal.capabilities.includes("analytics:summary")).toBe(role === "lighthouse_admin");
    await f.permission(2, role);
    await expect(f.service.webPrincipal(login.sessionToken, { adminWrite: true })).rejects.toMatchObject({ status: 401 });
  });
  it("binds a one-use browser callback, preserves a trusted shadow ID and profile, and caps token lifetime", async () => {
    const f = fixture();
    f.store.seedEmployee({ id: "existing-portal-user", account: "000042", displayName: "old name", active: true, employee: true });
    await f.account(); await f.permission();
    const login = await f.login("/auth/device?user_code=ABC123");
    const url = new URL(login.start.redirectUrl);
    expect(url.pathname).toBe("/idp/authCenter/authenticate");
    expect(url.searchParams.get("redirect_uri")).toBe(`${origin}/auth/iam/callback`);
    expect(url.searchParams.get("response_type")).toBe("code"); expect(url.searchParams.get("state")).toBe(login.start.state);
    expect(login.returnTo).toBe("/auth/device?user_code=ABC123");
    expect(login.principal).toMatchObject({ userId: "existing-portal-user", account: "000042", displayName: "模拟员工", organization: "售后/服务", expiresAt: f.now() + 1500000 });
    expect(f.roles).not.toHaveBeenCalled();
    expect(JSON.stringify(f.store.snapshot())).not.toContain("synthetic-upstream-token");
    await expect(f.service.iamCallback({ code: "single-use-code", state: login.start.state, cookie: login.start.cookie })).rejects.toMatchObject({ status: 401 });
    expect(f.exchange).toHaveBeenCalledTimes(1);
  });
  it("rejects wrong browser/state before code exchange and permits only one concurrent callback", async () => {
    const f = fixture(); await f.account(); await f.permission();
    const start = await f.service.startLogin("https://attacker.invalid");
    await expect(f.service.iamCallback({ code: "code", state: start.state, cookie: "wrong-cookie" })).rejects.toMatchObject({ status: 401 });
    expect(f.exchange).not.toHaveBeenCalled();
    const results = await Promise.allSettled([1, 2].map(() => f.service.iamCallback({ code: "code", state: start.state, cookie: start.cookie })));
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(f.exchange).toHaveBeenCalledTimes(1);
    expect(results.find(item => item.status === "fulfilled")).toMatchObject({ value: { returnTo: "/" } });
  });
  it("does not retry an exchange after its transaction was consumed", async () => {
    const f = fixture(), start = await f.service.startLogin("/auth/device?user_code=ABCD-EFGH");
    expect(await f.service.loginReturnTo(start)).toBe("/auth/device?user_code=ABCD-EFGH");
    f.exchange.mockRejectedValueOnce(new Error("upstream unavailable"));
    await expect(f.service.iamCallback({ code: "code", state: start.state, cookie: start.cookie })).rejects.toThrow();
    await expect(f.service.loginReturnTo(start)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.iamCallback({ code: "code", state: start.state, cookie: start.cookie })).rejects.toMatchObject({ status: 401 });
    expect(f.exchange).toHaveBeenCalledTimes(1);
  });
  it("refuses retry destinations for wrong, expired, and cross-authority transactions", async () => {
    const f = fixture(), start = await f.service.startLogin("/action");
    await expect(f.service.loginReturnTo({ state: start.state, cookie: "wrong-cookie" })).rejects.toMatchObject({ status: 401 });
    const portal = new AccessService({ ...f.config, mode: "portal", portalLoginMode: "callback" }, { identity: f.identity, roles: async () => [] }, f.store, f.now);
    const other = await portal.startLogin("/me");
    await expect(f.service.loginReturnTo(other)).rejects.toMatchObject({ status: 401 });
    f.advance(f.config.transactionMs + 1);
    await expect(f.service.loginReturnTo(start)).rejects.toMatchObject({ status: 401 });
    expect(f.exchange).not.toHaveBeenCalled();
  });
  it("refuses identity-only login and requires both account and application role", async () => {
    const f = fixture();
    await expect(f.login()).rejects.toMatchObject({ status: 403 });
    await f.account(); await expect(f.login()).rejects.toMatchObject({ status: 403 });
    await f.permission(); expect((await f.login()).principal.capabilities).toContain("content:read");
  });
  it("rejects portal callbacks and old portal credentials in IAM mode", async () => {
    const f = fixture();
    const portalConfig: AccessConfig = { ...f.config, mode: "portal", portalLoginMode: "callback" };
    const portal = new AccessService(portalConfig, { identity: f.identity, roles: async () => ["lighthouse_admin"] }, f.store, f.now);
    const start = await portal.startLogin(), old = await portal.callback({ token: "old-portal-token", state: start.state, cookie: start.cookie });
    if (old.kind !== "session") throw new Error("Expected session");
    await f.account(); await f.permission();
    await expect(f.service.webPrincipal(old.sessionToken)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.callback({ token: "portal-token" })).rejects.toMatchObject({ status: 401 });
    await expect(f.service.confirmPending("old-pending", "csrf")).rejects.toMatchObject({ status: 401 });
    await expect(f.service.iamCallback({ code: "code", state: start.state, cookie: start.cookie })).rejects.toMatchObject({ status: 401 });
  });
  it("propagates revocation to existing web, device, access and refresh grants", async () => {
    const f = fixture(); await f.account(); await f.permission(0, "lighthouse_knowledge_admin");
    const login = await f.login(); expect(login.principal.capabilities).toContain("knowledge:manage");
    const request = await f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "fixture" });
    await f.service.decideDevice(login.principal, request.user_code, true, "fixture");
    const tokens = await f.service.exchangeDevice(request.device_code, "lighthouse-cli");
    expect((await f.service.clientPrincipal(tokens.access_token, "mcp")).capabilities).toEqual(["knowledge:read"]);
    await f.permission(2, "lighthouse_knowledge_admin");
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.clientPrincipal(tokens.access_token)).rejects.toThrow();
    await expect(f.service.refresh(tokens.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
    await f.permission(0, "lighthouse_knowledge_admin");
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toThrow();
    expect((await f.login()).principal.capabilities).toContain("knowledge:manage");
  });
  it("disabling and re-enabling does not resurrect sessions; partial revocation preserves other posts", async () => {
    const f = fixture(); await f.account(); await f.permission(); await f.permission(0, "lighthouse_user", "secondary");
    const first = await f.login(); await f.account(1, "1");
    await expect(f.service.webPrincipal(first.sessionToken)).rejects.toThrow();
    await f.account(1, "0"); await expect(f.service.webPrincipal(first.sessionToken)).rejects.toThrow();
    await f.permission(2); const second = await f.login();
    expect(second.principal.capabilities).toContain("content:read");
    await f.service.logout(second.principal); await expect(f.service.webPrincipal(second.sessionToken)).rejects.toThrow();
    expect(f.exchange).toHaveBeenCalledTimes(2);
  });
  it("caps a session at permission expiry and cannot extend it by token revalidation", async () => {
    const f = fixture(); await f.account(); await f.permission(0, "lighthouse_user", "primary", f.now() + 400000);
    const login = await f.login(); f.advance(300001);
    expect((await f.service.webPrincipal(login.sessionToken)).expiresAt).toBe(login.principal.expiresAt);
    f.advance(100000); await expect(f.service.webPrincipal(login.sessionToken)).rejects.toThrow();
  });
});
