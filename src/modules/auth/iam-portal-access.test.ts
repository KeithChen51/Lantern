import { describe, expect, it, vi } from "vitest";
import { AccessService } from "./access-service";
import { MemoryAccessStore } from "./access-store";
import { readAccessConfig } from "./access-config";
import { IamIdentityClient } from "./iam";
import { IamDirectorySync } from "./iam-directory";
import { AccessError, type PortalAdapter, type PortalAuthorization } from "./access-types";

const origin = "http://10.0.147.68:16888";
function fixture() {
  let time = 1800000000000;
  const now = () => time, store = new MemoryAccessStore();
  const config = readAccessConfig({
    NODE_ENV: "production", AUTH_MODE: "iam", IAM_AUTHORIZATION_SOURCE: "portal",
    LIGHTHOUSE_DEPLOYMENT_ENV: "test", LIGHTHOUSE_ORIGIN: origin, AUTH_TEST_HTTP_ORIGIN: origin,
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    DATABASE_URL: "mysql://synthetic", KNOWLEDGE_HUB_ENABLED: "true", KNOWLEDGE_HUB_DRIVER: "mysql",
    IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "fixture-client", IAM_CLIENT_SECRET: "synthetic-iam-secret",
    PORTAL_API_BASE_URL: "https://portal.example.invalid", PORTAL_APP_CODE: "lighthouse", PORTAL_APP_SECRET: "synthetic-portal-secret",
  });
  const iam = new IamIdentityClient(config.iam!);
  const exchange = vi.fn(async () => ({ token: "synthetic-iam-token", expiresAt: time + 1500000 }));
  const identity = vi.fn(async () => ({ account: "000042", displayName: "000042" }));
  const authorization = vi.fn(async (): Promise<PortalAuthorization> => ({ roles: ["lighthouse_user"], organization: "售后/服务" }));
  const provider: PortalAdapter = {
    exchange, identity, authorization, roles: async () => { throw new Error("Use the full role-query response"); },
    authorizationUrl: (uri, state) => iam.authorizationUrl(uri, state),
  };
  const service = new AccessService(config, provider, store, now);
  const login = async () => {
    const start = await service.startLogin("/me");
    const result = await service.iamCallback({ code: "synthetic-code", state: start.state, cookie: start.cookie });
    return { ...result, start, principal: await service.webPrincipal(result.sessionToken) };
  };
  const device = async (sessionToken: string) => {
    const request = await service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "fixture" });
    await service.decideDevice(await service.webPrincipal(sessionToken), request.user_code, true, "fixture");
    return request;
  };
  const client = async (sessionToken: string) => {
    const request = await device(sessionToken);
    return service.exchangeDevice(request.device_code, "lighthouse-cli");
  };
  return { config, provider, store, service, exchange, identity, authorization, now, login, device, client, advance: (ms: number) => { time += ms; } };
}

describe("IAM identity with middle-platform roles", () => {
  it("logs in without IAM directory events and preserves account ownership and token expiry", async () => {
    const f = fixture();
    f.store.seedEmployee({ id: "existing-user", account: "000042", displayName: "old profile", active: true, employee: true });
    const login = await f.login();
    expect(login.principal).toMatchObject({ userId: "existing-user", account: "000042", displayName: "姓名暂未获取", organization: "售后/服务", expiresAt: f.now() + 1500000 });
    expect(login.returnTo).toBe("/me");
    expect(new URL(login.start.redirectUrl).hostname).toBe("iam.example.invalid");
    expect(f.identity).toHaveBeenCalledWith("synthetic-iam-token");
    expect(f.authorization).toHaveBeenCalledExactlyOnceWith("000042");
    expect(f.store.snapshot().filter(row => ["iamAccount", "iamPermission"].includes(row.kind))).toHaveLength(0);
    expect(f.store.snapshot().find(row => row.kind === "grant")?.payload).toMatchObject({ authority: "iam-portal" });
    expect(JSON.stringify(f.store.snapshot())).not.toContain("synthetic-iam-token");
  });

  it.each([
    ["lighthouse_user", false], ["lighthouse_knowledge_admin", true], ["lighthouse_admin", true],
  ])("maps %s to distinct knowledge and analytics capabilities", async (role, admin) => {
    const f = fixture();
    f.authorization.mockResolvedValue({ roles: [role as string, "unrelated_admin"] });
    const login = await f.login();
    expect(login.principal.capabilities).toContain("content:read");
    expect(login.principal.capabilities.includes("knowledge:manage")).toBe(admin);
    expect(login.principal.capabilities.includes("analytics:summary")).toBe(role === "lighthouse_admin");
    expect(f.store.snapshot().find(row => row.kind === "grant")?.payload).toMatchObject({ roles: [role] });
    const tokens = await f.client(login.sessionToken);
    expect((await f.service.clientPrincipal(tokens.access_token, "mcp")).capabilities).toEqual(["knowledge:read"]);
  });

  it.each([[], ["router_admin"], ["LIGHTHOUSE_ADMIN"], ["lighthouse_admin "]])("rejects unrecognized or absent roles %j", async (...roles) => {
    const f = fixture();
    // it.each spreads each row; these rows represent the returned role list.
    f.authorization.mockResolvedValue({ roles: roles as string[] });
    await expect(f.login()).rejects.toMatchObject({ status: 403 });
    expect(f.store.snapshot().filter(row => row.kind === "session" || row.kind === "grant")).toHaveLength(0);
  });

  it("requires role-query success and never falls back to a local synchronized admin", async () => {
    const f = fixture(), sync = new IamDirectorySync(f.store, f.now);
    await sync.account({ actionType: 0, userInfo: { username: "000042", fullname: "Synced", isDisabled: "0" } }, "account", f.now() + 100000);
    await sync.permission({ actionType: 0, permissionInfo: { username: "000042", roleCode: "lighthouse_admin", postCode: "", expiresTime: f.now() + 1000000 } }, "permission", f.now() + 100000);
    f.authorization.mockRejectedValue(new Error("connection refused"));
    await expect(f.login()).rejects.toMatchObject({ status: 503 });
    f.authorization.mockResolvedValue({ roles: [] });
    await expect(f.login()).rejects.toMatchObject({ status: 403 });
  });

  it("rejects malformed role responses and identity failures before granting a session", async () => {
    const f = fixture();
    f.authorization.mockResolvedValue({ roles: [null] } as unknown as PortalAuthorization);
    await expect(f.login()).rejects.toMatchObject({ status: 503 });
    f.authorization.mockClear(); f.identity.mockRejectedValue(new AccessError("invalid IAM token", 401));
    await expect(f.login()).rejects.toMatchObject({ status: 401 });
    expect(f.authorization).not.toHaveBeenCalled();
  });

  it("checks state/browser before exchange, consumes code once, and forbids portal token callbacks", async () => {
    const f = fixture(), start = await f.service.startLogin();
    await expect(f.service.iamCallback({ code: "code", state: start.state, cookie: "wrong" })).rejects.toMatchObject({ status: 401 });
    expect(f.exchange).not.toHaveBeenCalled(); expect(f.authorization).not.toHaveBeenCalled();
    const results = await Promise.allSettled([1, 2].map(() => f.service.iamCallback({ code: "code", state: start.state, cookie: start.cookie })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(f.exchange).toHaveBeenCalledTimes(1); expect(f.authorization).toHaveBeenCalledTimes(1);
    await expect(f.service.callback({ token: "middle-platform-token" })).rejects.toMatchObject({ status: 401 });
  });

  it("separates transactions, sessions and client tokens from both older authentication modes", async () => {
    const f = fixture(), combinedStart = await f.service.startLogin();
    const sync = new AccessService({ ...f.config, iamAuthorizationSource: "sync" }, f.provider, f.store, f.now);
    const portal = new AccessService({ ...f.config, mode: "portal" }, f.provider, f.store, f.now);
    await expect(sync.iamCallback({ code: "code", state: combinedStart.state, cookie: combinedStart.cookie })).rejects.toMatchObject({ status: 401 });
    await expect(portal.callback({ token: "token", state: combinedStart.state, cookie: combinedStart.cookie })).rejects.toMatchObject({ status: 401 });
    const syncStart = await sync.startLogin();
    await expect(f.service.iamCallback({ code: "code", state: syncStart.state, cookie: syncStart.cookie })).rejects.toMatchObject({ status: 401 });
    expect(f.exchange).not.toHaveBeenCalled();
    const login = await f.login(), tokens = await f.client(login.sessionToken);
    for (const other of [sync, portal]) {
      await expect(other.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
      await expect(other.clientPrincipal(tokens.access_token)).rejects.toMatchObject({ status: 401 });
      await expect(other.refresh(tokens.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
    }
    expect((await f.service.webPrincipal(login.sessionToken)).account).toBe("000042");
  });
});

describe("middle-platform role refresh and revocation", () => {
  it("keeps the portal name across IAM-only revalidation and refreshes it with portal data", async () => {
    const f = fixture();
    f.config.identityFreshMs = 60000;
    f.authorization.mockResolvedValue({ roles: ["lighthouse_user"], displayName: "测试员工" });
    const login = await f.login();
    expect(login.principal.displayName).toBe("测试员工");
    const tokens = await f.client(login.sessionToken);
    expect((await f.service.clientPrincipal(tokens.access_token)).displayName).toBe("测试员工");
    f.advance(60000);
    expect((await f.service.webPrincipal(login.sessionToken)).displayName).toBe("测试员工");
    expect(f.identity).toHaveBeenCalledTimes(2);
    expect(f.authorization).toHaveBeenCalledTimes(1);
    f.authorization.mockResolvedValue({ roles: ["lighthouse_user"], displayName: "更新姓名" });
    f.advance(240000);
    const updated = await f.service.webPrincipal(login.sessionToken);
    expect(updated).toMatchObject({ userId: login.principal.userId, account: "000042", displayName: "更新姓名" });
    expect(updated.capabilities).toEqual(login.principal.capabilities);
    f.authorization.mockResolvedValue({ roles: ["lighthouse_user"] });
    f.advance(300000);
    expect((await f.service.webPrincipal(login.sessionToken)).displayName).toBe("姓名暂未获取");
  });

  it("fills existing account-only sessions on the next portal refresh and applies admin-write freshness", async () => {
    const f = fixture();
    f.authorization.mockResolvedValue({ roles: ["lighthouse_admin"] });
    const login = await f.login();
    f.authorization.mockResolvedValue({ roles: ["lighthouse_admin"], displayName: "补齐姓名" });
    f.advance(60000);
    const updated = await f.service.webPrincipal(login.sessionToken, { adminWrite: true });
    expect(updated).toMatchObject({ userId: login.principal.userId, account: "000042", displayName: "补齐姓名" });
    expect(updated.capabilities).toContain("knowledge:manage");
  });

  it("does not let a late concurrent refresh overwrite the winning portal name", async () => {
    const f = fixture();
    f.authorization.mockResolvedValue({ roles: ["lighthouse_user"], displayName: "初始姓名" });
    const login = await f.login();
    let release!: (value: { account: string; displayName: string }) => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    f.identity.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
    f.advance(300000);
    const slow = f.service.webPrincipal(login.sessionToken);
    await waiting;
    f.advance(1);
    f.authorization.mockResolvedValueOnce({ roles: ["lighthouse_user"], displayName: "新姓名" });
    expect((await f.service.webPrincipal(login.sessionToken)).displayName).toBe("新姓名");
    f.authorization.mockResolvedValueOnce({ roles: ["lighthouse_user"], displayName: "较旧姓名" });
    release({ account: "000042", displayName: "000042" });
    expect((await slow).displayName).toBe("新姓名");
  });

  it("refreshes general authorization at five minutes and admin writes at one minute", async () => {
    const f = fixture(); f.authorization.mockResolvedValue({ roles: ["lighthouse_admin"] });
    const login = await f.login(); f.advance(59999);
    expect((await f.service.webPrincipal(login.sessionToken, { adminWrite: true })).capabilities).toContain("knowledge:manage");
    expect(f.authorization).toHaveBeenCalledTimes(1);
    f.authorization.mockResolvedValue({ roles: ["lighthouse_user"], organization: "售后/新组织" }); f.advance(1);
    const lowered = await f.service.webPrincipal(login.sessionToken, { adminWrite: true });
    expect(lowered.capabilities).not.toContain("knowledge:manage"); expect(lowered.capabilities).toContain("content:read");
    expect(lowered.organization).toBe("售后/新组织");
    expect(f.authorization).toHaveBeenCalledTimes(2);
    f.advance(299999); await f.service.webPrincipal(login.sessionToken); expect(f.authorization).toHaveBeenCalledTimes(2);
    f.advance(1); await f.service.webPrincipal(login.sessionToken); expect(f.authorization).toHaveBeenCalledTimes(3);
  });

  it("keeps a fresh snapshot usable, denies after expiry during outages, and recovers without a new login", async () => {
    const f = fixture(), login = await f.login();
    f.authorization.mockRejectedValue(new Error("timeout")); f.advance(299999);
    expect((await f.service.webPrincipal(login.sessionToken)).account).toBe("000042");
    f.advance(1); await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 503 });
    expect(f.store.snapshot().find(row => row.kind === "grant")?.payload).toMatchObject({ active: true });
    f.authorization.mockResolvedValue({ roles: ["lighthouse_user"] });
    expect((await f.service.webPrincipal(login.sessionToken)).account).toBe("000042");
  });

  it("fails closed on stale roles for MCP, refresh, device exchange and old approval principals", async () => {
    const f = fixture(); f.config.roleFreshMs = 1000;
    const login = await f.login(), tokens = await f.client(login.sessionToken), device = await f.device(login.sessionToken);
    f.advance(1000); f.authorization.mockRejectedValue(new Error("timeout"));
    await expect(f.service.clientPrincipal(tokens.access_token, "mcp")).rejects.toMatchObject({ status: 503 });
    await expect(f.service.refresh(tokens.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ status: 503, error: "temporarily_unavailable" });
    await expect(f.service.exchangeDevice(device.device_code, "lighthouse-cli")).rejects.toMatchObject({ status: 503, error: "temporarily_unavailable" });
    const newRequest = await f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "fixture" });
    await expect(f.service.decideDevice(login.principal, newRequest.user_code, true, "fixture")).rejects.toMatchObject({ status: 503 });
    f.authorization.mockResolvedValue({ roles: ["lighthouse_user"] });
    expect((await f.service.refresh(tokens.refresh_token, "lighthouse-cli")).access_token).toBeTruthy();
  });

  it("removing all roles invalidates the grant and every descendant, and adding roles does not resurrect it", async () => {
    const f = fixture(); f.config.roleFreshMs = 1000;
    const login = await f.login(), tokens = await f.client(login.sessionToken), device = await f.device(login.sessionToken);
    f.authorization.mockResolvedValue({ roles: [] }); f.advance(1000);
    await expect(f.service.clientPrincipal(tokens.access_token, "mcp")).rejects.toMatchObject({ status: 403 });
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.refresh(tokens.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
    await expect(f.service.exchangeDevice(device.device_code, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
    f.authorization.mockResolvedValue({ roles: ["lighthouse_user"] });
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    expect((await f.login()).principal.account).toBe("000042");
  });

  it("cannot restore an invalidated grant with a delayed successful role refresh", async () => {
    const f = fixture(); f.config.roleFreshMs = 1000;
    const login = await f.login(); f.advance(1000);
    let release!: (value: PortalAuthorization) => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    f.authorization.mockImplementationOnce(() => new Promise(resolve => { release = resolve; started(); }));
    const delayed = f.service.webPrincipal(login.sessionToken);
    await entered;
    f.authorization.mockResolvedValue({ roles: [] });
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 403 });
    release({ roles: ["lighthouse_admin"] });
    await expect(delayed).rejects.toMatchObject({ status: 401 });
    expect(f.store.snapshot().find(row => row.kind === "grant")?.payload).toMatchObject({ active: false });
  });

  it("IAM identity mismatch revokes access even if middle-platform roles remain", async () => {
    const f = fixture(), login = await f.login();
    f.identity.mockResolvedValue({ account: "other-employee", displayName: "other" }); f.advance(300000);
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    expect(f.store.snapshot().find(row => row.kind === "grant")?.payload).toMatchObject({ active: false });
  });

  it("logout invalidates both web and device families", async () => {
    const f = fixture(), login = await f.login(), tokens = await f.client(login.sessionToken);
    await f.service.logout(login.principal);
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.clientPrincipal(tokens.access_token)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.refresh(tokens.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
  });
});
