import { describe, expect, it, vi } from "vitest";
import { AccessService } from "./access-service";
import { MemoryAccessStore } from "./access-store";
import { AccessError, EMPLOYEE_CAPABILITIES, type AccessConfig, type PortalAdapter, type PortalIdentity, type Principal } from "./access-types";

const HOUR = 3600000;
const config: AccessConfig = {
  origin: "https://lighthouse.invalid", portalBaseUrl: "https://portal.invalid/api", portalLoginUrl: "https://portal.invalid/login",
  appCode: "test-application", appSecret: "test-application-secret", adminRole: "KNOWLEDGE_ADMIN", encryptionKey: Buffer.alloc(32, 17).toString("base64"),
  callbackParam: "redirectUrl", stateParam: "state", tokenParam: "token", allowLegacyConfirmation: false, secureCookies: true,
  sessionCookie: "session", transactionCookie: "transaction", pendingCookie: "pending", sessionAbsoluteMs: 8 * HOUR, sessionIdleMs: HOUR,
  identityFreshMs: 300000, roleFreshMs: 300000, adminWriteFreshMs: 60000, deviceMs: 300000, accessMs: 300000, clientMs: 8 * HOUR, transactionMs: 300000,
};
function fixture(overrides: Partial<AccessConfig> = {}) {
  let time = 1800000000000;
  const store = new MemoryAccessStore();
  const identity = vi.fn<(token: string) => Promise<PortalIdentity>>().mockResolvedValue({ account: "000042", displayName: "Test employee" });
  const roles = vi.fn<(account: string) => Promise<readonly string[]>>().mockResolvedValue([]);
  const portal: PortalAdapter = { identity, roles };
  const service = new AccessService({ ...config, ...overrides }, portal, store, () => time);
  const advance = (milliseconds: number) => { time += milliseconds; };
  const login = async (upstream = "synthetic-upstream-token") => {
    const start = await service.startLogin("/heart");
    const result = await service.callback({ token: upstream, state: start.state, cookie: start.cookie });
    if (result.kind !== "session") throw new Error("Expected session");
    const principal = await service.webPrincipal(result.sessionToken);
    return { ...result, principal, start };
  };
  const device = async (principal: Principal) => {
    const request = await service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "hashed-origin", name: "Test CLI" });
    await service.decideDevice(principal, request.user_code, true, "hashed-origin");
    return request;
  };
  const client = async (principal: Principal) => { const request = await device(principal); const tokens = await service.exchangeDevice(request.device_code, "lighthouse-cli"); const clientPrincipal = await service.clientPrincipal(tokens.access_token); return { request, tokens, principal: clientPrincipal }; };
  return { store, service, identity, roles, advance, login, device, client, now: () => time };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("employee login and identity shadows", () => {
  it("grants ordinary employee capabilities with empty roles and preserves account leading zeros", async () => {
    const f = fixture(), login = await f.login();
    expect(login.principal.account).toBe("000042");
    expect(login.principal.capabilities).toEqual(EMPLOYEE_CAPABILITIES);
    expect(login.principal.capabilities).not.toContain("knowledge:manage");
    expect(login.returnTo).toBe("/heart");
  });
  it("binds state and cookie, rejects replay, and never falls back for a supplied invalid state", async () => {
    const f = fixture({ allowLegacyConfirmation: true }), start = await f.service.startLogin("https://evil.invalid");
    expect(new URL(start.redirectUrl).searchParams.get("state")).toBe(start.state);
    await expect(f.service.callback({ token: "synthetic", state: start.state, cookie: "wrong-cookie" })).rejects.toMatchObject({ status: 401 });
    await expect(f.service.callback({ token: "synthetic", state: "unknown", cookie: start.cookie })).rejects.toMatchObject({ status: 401 });
    await expect(f.service.callback({ token: "synthetic", state: "", cookie: start.cookie })).rejects.toMatchObject({ status: 401 });
    expect(f.identity).not.toHaveBeenCalled();
    expect(f.store.snapshot().filter((row) => row.kind === "pending")).toHaveLength(0);
    const result = await f.service.callback({ token: "synthetic", ...start });
    expect(result.returnTo).toBe("/");
    await expect(f.service.callback({ token: "synthetic", ...start })).rejects.toMatchObject({ status: 401 });
  });
  it("requires explicit fresh legacy confirmation with its cookie and CSRF nonce exactly once", async () => {
    const f = fixture({ allowLegacyConfirmation: true });
    const result = await f.service.callback({ token: "synthetic-legacy" });
    if (result.kind !== "pending") throw new Error("Expected pending");
    expect(f.store.snapshot().filter((row) => row.kind === "grant")).toHaveLength(0);
    const pending = await f.service.pending(result.pendingToken);
    await expect(f.service.confirmPending(result.pendingToken, "wrong-csrf")).rejects.toMatchObject({ status: 401 });
    const session = await f.service.confirmPending(result.pendingToken, pending.csrfToken);
    expect(f.identity).toHaveBeenCalledTimes(2);
    expect((await f.service.webPrincipal(session.sessionToken)).account).toBe(pending.account);
    await expect(f.service.confirmPending(result.pendingToken, pending.csrfToken)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects an identity change during legacy confirmation", async () => {
    const f = fixture({ allowLegacyConfirmation: true }), result = await f.service.callback({ token: "synthetic-legacy" });
    if (result.kind !== "pending") throw new Error("Expected pending");
    const pending = await f.service.pending(result.pendingToken);
    f.identity.mockResolvedValue({ account: "different-test-account", displayName: "Other employee" });
    await expect(f.service.confirmPending(result.pendingToken, pending.csrfToken)).rejects.toMatchObject({ status: 401 });
    expect(f.store.snapshot().filter((row) => row.kind === "session")).toHaveLength(0);
  });
  it("bounds legacy pending callbacks globally and does not store their credentials in plaintext", async () => {
    const f = fixture({ allowLegacyConfirmation: true }); let account = 0;
    f.identity.mockImplementation(async () => ({ account: `synthetic-${account++}`, displayName: "Test employee" }));
    for (let i = 0; i < 100; i++) {
      const result = await f.service.callback({ token: `unique-synthetic-upstream-${i}` });
      if (result.kind !== "pending") throw new Error("Expected pending");
      const payloads = JSON.stringify(f.store.snapshot());
      expect(payloads).not.toContain(`unique-synthetic-upstream-${i}`);
      expect(payloads).not.toContain(result.pendingToken);
    }
    await expect(f.service.callback({ token: "limited-upstream" })).rejects.toMatchObject({ status: 429 });
    expect(f.identity).toHaveBeenCalledTimes(100);
    expect(f.store.snapshot().filter((row) => row.kind === "pending")).toHaveLength(100);
  });
  it.each([{ active: false, employee: true }, { active: true, employee: false }, { active: true, employee: true, conflicting: true }])("rejects disabled/nonemployee/conflicting mappings: %j", async (flags) => {
    const f = fixture(); f.store.seedEmployee({ id: "old-user", account: "000042", displayName: "Old user", ...flags });
    await expect(f.login()).rejects.toMatchObject({ status: 403 });
    expect(f.store.snapshot().filter((row) => row.kind === "session")).toHaveLength(0);
  });
  it("atomically creates one shadow per trusted account during concurrent logins", async () => {
    const f = fixture(), [one, two, three] = await Promise.all([f.login(), f.login(), f.login()]);
    expect(new Set([one.principal.userId, two.principal.userId, three.principal.userId]).size).toBe(1);
    expect(f.store.snapshot().filter((row) => row.kind === "grant")).toHaveLength(3);
  });
  it("bounds global login creation and per-account active grants", async () => {
    const f = fixture();
    for (let i = 0; i < 100; i++) await f.service.startLogin();
    await expect(f.service.startLogin()).rejects.toMatchObject({ status: 429 });
    expect(f.store.snapshot().filter((row) => row.kind === "login")).toHaveLength(100);
    const account = fixture();
    for (let i = 0; i < 50; i++) await account.login();
    await expect(account.login()).rejects.toMatchObject({ status: 429 });
    expect(account.store.snapshot().filter((row) => row.kind === "grant")).toHaveLength(50);
  });
  it("checks local disabled mappings on every request even with a fresh upstream cache", async () => {
    const f = fixture(), login = await f.login();
    f.store.seedEmployee({ id: login.principal.userId, account: login.principal.account, displayName: "Disabled", active: false, employee: true });
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    expect(f.identity).toHaveBeenCalledTimes(1);
  });
});

describe("freshness and revocation", () => {
  it("removes expired administrative roles during role outage while retaining employee browsing", async () => {
    const f = fixture(); f.roles.mockResolvedValue(["KNOWLEDGE_ADMIN", "highest_admin"]);
    const login = await f.login(); expect(login.principal.capabilities).toContain("knowledge:manage");
    f.roles.mockRejectedValue(new AccessError("role outage", 503));
    f.advance(60001);
    const write = await f.service.webPrincipal(login.sessionToken, { adminWrite: true });
    expect(write.capabilities).toEqual(EMPLOYEE_CAPABILITIES);
    // The normal 300s snapshot is still fresh and can authorize read-only management.
    expect((await f.service.webPrincipal(login.sessionToken)).capabilities).toContain("knowledge:manage");
    f.advance(240000);
    const ordinary = await f.service.webPrincipal(login.sessionToken);
    expect(ordinary.capabilities).toEqual(EMPLOYEE_CAPABILITIES);
    const grant = f.store.snapshot().find((row) => row.kind === "grant")!;
    expect((grant.payload as { rolesAt: number }).rolesAt).toBe(1800000000000);
    expect(ordinary.capabilities).not.toContain("highest_admin");
  });
  it("does not renew identity timestamps on outage and denies after the 300s cache expires", async () => {
    const f = fixture(), login = await f.login(); f.identity.mockRejectedValue(new AccessError("outage", 503));
    f.advance(299999); await expect(f.service.webPrincipal(login.sessionToken)).resolves.toMatchObject({ account: "000042" });
    f.advance(2); await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 503 });
    expect((f.store.snapshot().find((row) => row.kind === "grant")!.payload as { identityAt: number }).identityAt).toBe(1800000000000);
    f.identity.mockResolvedValue({ account: "000042", displayName: "Test employee" });
    await expect(f.service.webPrincipal(login.sessionToken)).resolves.toMatchObject({ account: "000042" });
  });
  it("revokes the grant permanently for upstream account mismatch", async () => {
    const f = fixture(), login = await f.login(); f.advance(300001);
    f.identity.mockResolvedValue({ account: "other-test-account", displayName: "Other employee" });
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    f.identity.mockResolvedValue({ account: "000042", displayName: "Test employee" });
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    expect((f.store.snapshot().find((row) => row.kind === "grant")!.payload as { active: boolean }).active).toBe(false);
  });
  it("revokes permanent upstream invalidation but keeps temporary outage retryable", async () => {
    const f = fixture(), login = await f.login(); f.advance(300001); f.identity.mockRejectedValue(new AccessError("invalid token", 401));
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    expect(f.store.snapshot().some((row) => row.kind === "audit" && (row.payload as { action: string }).action === "identity-invalid")).toBe(true);
  });
  it("limits absolute grants to upstream expiry and 8h despite repeated activity", async () => {
    const f = fixture(); f.identity.mockImplementation(async () => ({ account: "000042", displayName: "Test employee", expiresAt: 1800000000000 + 8 * HOUR }));
    const login = await f.login();
    for (let i = 0; i < 15; i++) { f.advance(HOUR / 2); await f.service.webPrincipal(login.sessionToken); }
    f.advance(HOUR / 2); await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    const shorter = fixture(); shorter.identity.mockResolvedValue({ account: "000042", displayName: "Test employee", expiresAt: shorter.now() + 120000 });
    const shortLogin = await shorter.login(); expect(shortLogin.principal.expiresAt).toBe(shorter.now() + 120000);
  });
  it("keeps approved tools valid after web idle expiry, then explicit logout revokes descendants", async () => {
    const f = fixture({ sessionIdleMs: 1000 }), login = await f.login(), client = await f.client(login.principal);
    expect(client.principal.capabilities).toEqual(["knowledge:read"]);
    f.advance(1001);
    await expect(f.service.webPrincipal(login.sessionToken)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.clientPrincipal(client.tokens.access_token)).resolves.toMatchObject({ capabilities: ["knowledge:read"] });
    // A new session can revoke an old client's own-account grant.
    const newLogin = await f.login(); await f.service.revokeClient(newLogin.principal, client.principal.credentialId);
    await expect(f.service.clientPrincipal(client.tokens.access_token)).rejects.toMatchObject({ status: 401 });
    const activeClient = await f.client(newLogin.principal), pending = await f.device(newLogin.principal);
    await f.service.logout(newLogin.principal);
    await expect(f.service.clientPrincipal(activeClient.tokens.access_token)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.refresh(activeClient.tokens.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
    await expect(f.service.exchangeDevice(pending.device_code, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
  });
  it("exchanges approval after idle expiry but rejects approval made after idle expiry", async () => {
    const f = fixture({ sessionIdleMs: 1000 }), login = await f.login(), device = await f.device(login.principal);
    const unapproved = await f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "another-origin" });
    f.advance(1001);
    await expect(f.service.decideDevice(login.principal, unapproved.user_code, true, "another-origin")).rejects.toMatchObject({ status: 401 });
    await expect(f.service.exchangeDevice(device.device_code, "lighthouse-cli")).resolves.toMatchObject({ scope: "knowledge:read" });
  });
  it("logout-all invalidates all account grants, sessions and clients", async () => {
    const f = fixture(), first = await f.login(), second = await f.login(), client = await f.client(first.principal);
    await f.service.logout(second.principal, true);
    await expect(f.service.webPrincipal(first.sessionToken)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.webPrincipal(second.sessionToken)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.clientPrincipal(client.tokens.access_token)).rejects.toMatchObject({ status: 401 });
  });
  it("restricts clients to knowledge read even for administrators and rejects other-account revocation", async () => {
    const f = fixture(); f.roles.mockResolvedValue(["KNOWLEDGE_ADMIN"]);
    const admin = await f.login(), client = await f.client(admin.principal);
    expect((await f.service.clientPrincipal(client.tokens.access_token, "mcp")).capabilities).toEqual(["knowledge:read"]);
    expect(await f.service.listClients(admin.principal)).toEqual([expect.objectContaining({ id: client.principal.credentialId, name: "Test CLI" })]);
    f.identity.mockResolvedValue({ account: "different-account", displayName: "Different employee" });
    const other = await f.login("other-upstream");
    await expect(f.service.revokeClient(other.principal, client.principal.credentialId)).rejects.toMatchObject({ status: 403 });
  });
});

describe("device grant and rotating refresh", () => {
  it("enforces fixed scope/client, bounded names, issuance rate and guessing rate", async () => {
    const f = fixture(), login = await f.login();
    await expect(f.service.authorizeDevice({ clientId: "other", scope: "knowledge:read", rateKey: "origin" })).rejects.toMatchObject({ error: "invalid_client" });
    await expect(f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:manage", rateKey: "origin" })).rejects.toMatchObject({ error: "invalid_scope" });
    await expect(f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", name: "x".repeat(101), rateKey: "origin" })).rejects.toMatchObject({ error: "invalid_request" });
    for (let i = 0; i < 10; i++) await f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "origin" });
    await expect(f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "origin" })).rejects.toMatchObject({ error: "slow_down", status: 429 });
    for (let i = 0; i < 20; i++) await expect(f.service.deviceRequest(login.principal, "INVALID_CODE", "guess-origin")).rejects.toMatchObject({ status: 400 });
    await expect(f.service.deviceRequest(login.principal, "INVALID_CODE", "guess-origin")).rejects.toMatchObject({ error: "slow_down", status: 429 });
    f.advance(60001); await expect(f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "origin" })).resolves.toMatchObject({ interval: 5 });
  });
  it("generates human alphanumeric codes compatible with the first-party client", async () => {
    const f = fixture();
    for (let i = 0; i < 10; i++) {
      const device = await f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "origin" });
      expect(device.user_code).toMatch(/^[A-Z0-9]{12}$/);
      expect(device.user_code).toMatch(/^[A-Za-z0-9 -]{1,64}$/);
    }
  });
  it("persists polling delays and denial/expiry semantics", async () => {
    const f = fixture(), login = await f.login(), device = await f.service.authorizeDevice({ clientId: "lighthouse-cli", scope: "knowledge:read", rateKey: "origin" });
    await expect(f.service.exchangeDevice(device.device_code, "lighthouse-cli")).rejects.toMatchObject({ error: "authorization_pending" });
    await expect(f.service.exchangeDevice(device.device_code, "lighthouse-cli")).rejects.toMatchObject({ error: "slow_down" });
    f.advance(10000); await expect(f.service.exchangeDevice(device.device_code, "lighthouse-cli")).rejects.toMatchObject({ error: "authorization_pending" });
    await f.service.decideDevice(login.principal, device.user_code, false, "origin");
    await expect(f.service.exchangeDevice(device.device_code, "lighthouse-cli")).rejects.toMatchObject({ error: "access_denied" });
    f.advance(300000); await expect(f.service.exchangeDevice(device.device_code, "lighthouse-cli")).rejects.toMatchObject({ error: "expired_token" });
  });
  it("permits one exchange only under concurrent requests", async () => {
    const f = fixture(), login = await f.login(), device = await f.device(login.principal);
    const results = await Promise.allSettled([f.service.exchangeDevice(device.device_code, "lighthouse-cli"), f.service.exchangeDevice(device.device_code, "lighthouse-cli")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(f.store.snapshot().filter((row) => row.kind === "client")).toHaveLength(1);
  });
  it("retains old refresh generations and replay revokes all access tokens in the family", async () => {
    const f = fixture(), login = await f.login(), client = await f.client(login.principal);
    const second = await f.service.refresh(client.tokens.refresh_token, "lighthouse-cli"), third = await f.service.refresh(second.refresh_token, "lighthouse-cli");
    expect(f.store.snapshot().filter((row) => row.kind === "refresh")).toHaveLength(3);
    await expect(f.service.refresh(client.tokens.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
    await expect(f.service.clientPrincipal(third.access_token)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.clientPrincipal(client.tokens.access_token)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.refresh(third.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
    expect(f.store.snapshot().some((row) => row.kind === "audit" && (row.payload as { action: string }).action === "refresh-replay")).toBe(true);
  });
  it("has one concurrent refresh winner and invalidates the family on losing replay", async () => {
    const f = fixture(), login = await f.login(), client = await f.client(login.principal);
    const results = await Promise.allSettled([f.service.refresh(client.tokens.refresh_token, "lighthouse-cli"), f.service.refresh(client.tokens.refresh_token, "lighthouse-cli")]);
    const winners = results.filter((result) => result.status === "fulfilled");
    expect(winners).toHaveLength(1); expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const winner = winners[0]; if (winner.status !== "fulfilled") throw new Error("Expected winner");
    await expect(f.service.clientPrincipal(winner.value.access_token)).rejects.toMatchObject({ status: 401 });
  });
  it("rechecks client revocation after a refresh network call", async () => {
    const f = fixture(), login = await f.login(), client = await f.client(login.principal); f.advance(300001);
    const waiting = deferred<PortalIdentity>(), started = deferred<void>();
    f.identity.mockImplementation(async () => { started.resolve(); return waiting.promise; });
    const refresh = f.service.refresh(client.tokens.refresh_token, "lighthouse-cli");
    await started.promise; await f.service.revokeClient(login.principal, client.principal.credentialId);
    waiting.resolve({ account: "000042", displayName: "Test employee" });
    await expect(refresh).rejects.toMatchObject({ error: "invalid_grant" });
    expect(f.store.snapshot().filter((row) => row.kind === "refresh")).toHaveLength(1);
  });
  it("rechecks explicit logout while a principal request is refreshing identity", async () => {
    const f = fixture(), login = await f.login(), client = await f.client(login.principal); f.advance(300001);
    const waiting = deferred<PortalIdentity>(), started = deferred<void>();
    f.identity.mockImplementation(async () => { started.resolve(); return waiting.promise; });
    // Refresh the access record expiry through the transaction fixture to isolate identity-refresh race.
    await f.store.transaction(async (tx) => { const access = f.store.snapshot().find((row) => row.kind === "access")!; const row = await tx.get("access", access.id); row!.expiresAt = f.now() + 300000; await tx.put(row!); });
    const request = f.service.clientPrincipal(client.tokens.access_token);
    await started.promise; await f.service.logout(login.principal);
    waiting.resolve({ account: "000042", displayName: "Test employee" });
    await expect(request).rejects.toMatchObject({ status: 401 });
  });
  it("rechecks explicit logout while device exchange refreshes identity", async () => {
    const f = fixture({ identityFreshMs: 1000 }), login = await f.login(), device = await f.device(login.principal); f.advance(1001);
    const waiting = deferred<PortalIdentity>(), started = deferred<void>();
    f.identity.mockImplementation(async () => { started.resolve(); return waiting.promise; });
    const exchange = f.service.exchangeDevice(device.device_code, "lighthouse-cli");
    await started.promise; await f.service.logout(login.principal);
    waiting.resolve({ account: "000042", displayName: "Test employee" });
    await expect(exchange).rejects.toMatchObject({ error: "invalid_grant" });
    expect(f.store.snapshot().filter((row) => row.kind === "client")).toHaveLength(0);
  });
  it("checks client parent locally and never stores plaintext bearer or upstream tokens", async () => {
    const f = fixture(), login = await f.login("synthetic-unique-upstream-secret"), client = await f.client(login.principal);
    const serialized = JSON.stringify(f.store.snapshot());
    for (const secret of ["synthetic-unique-upstream-secret", login.sessionToken, login.start.state, login.start.cookie, client.request.device_code, client.request.user_code, client.tokens.access_token, client.tokens.refresh_token]) expect(serialized).not.toContain(secret);
    expect(serialized).toContain('"tokenCipher":"v1.');
    await f.service.revokeClient(client.principal, client.principal.credentialId);
    await expect(f.service.clientPrincipal(client.tokens.access_token)).rejects.toMatchObject({ status: 401 });
  });
  it("checks parent session active state on each client request and refresh independently of idle timeout", async () => {
    const f = fixture(), login = await f.login(), client = await f.client(login.principal);
    await f.store.transaction(async (tx) => { const session = await tx.get("session", login.principal.credentialId); session!.payload.active = false; await tx.put(session!); });
    await expect(f.service.clientPrincipal(client.tokens.access_token)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.refresh(client.tokens.refresh_token, "lighthouse-cli")).rejects.toMatchObject({ error: "invalid_grant" });
  });
});
