import { randomBytes, randomUUID } from "node:crypto";
import { equalSecret, hashToken, openToken, randomToken, safeReturnTo, sealToken } from "./access-crypto";
import { AccessError, EMPLOYEE_CAPABILITIES, OAuthError, type AccessConfig, type PortalAdapter, type PortalIdentity, type Principal } from "./access-types";
import type { AccessKind, AccessPayloads, AccessRecord, AccessStore, AccessTransaction } from "./access-store";

export type ClientView = { id: string; name: string; createdAt: number; lastUsedAt: number; expiresAt: number };
export type DeviceView = { userCode: string; clientName: string; scope: "knowledge:read"; expiresAt: number };
export type DeviceReply = { device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; expires_in: number; interval: number };
export type TokenReply = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: "knowledge:read" };
type LoginResult = { kind: "session"; sessionToken: string; returnTo: string } | { kind: "pending"; pendingToken: string; returnTo: string };
const HOUR = 3600000;
const CLIENT_ID = "lighthouse-cli";
const SCOPE = "knowledge:read";
const key = (kind: AccessKind, value: string) => `${kind}:${hashToken(value)}`;
const take = <T>(result: T): Exclude<T, Error> => { if (result instanceof Error) throw result; return result as Exclude<T, Error>; };
const expired = (record: AccessRecord, now: number) => record.expiresAt <= now;
const permanent = (error: unknown) => error instanceof AccessError && (error.status === 401 || error.status === 403);

/** Security decisions live here; HTTP transport owns cookies, same-origin checks, and CSRF submission. */
export class AccessService {
  constructor(private readonly config: AccessConfig, private readonly portal: PortalAdapter, private readonly store: AccessStore, private readonly now: () => number = Date.now) {}
  private duration(configured: number, maximum: number) { return Math.max(1, Math.min(configured, maximum)); }
  private record<K extends AccessKind>(kind: K, id: string, subjectId: string, parentId: string | null, payload: AccessPayloads[K], expiresAt: number): AccessRecord<K> {
    const now = this.now(); return { kind, id, subjectId, parentId, payload, expiresAt, createdAt: now, updatedAt: now };
  }
  private async save<K extends AccessKind>(tx: AccessTransaction, record: AccessRecord<K>) { record.updatedAt = this.now(); await tx.put(record); }
  private async audit(tx: AccessTransaction, action: string, account: string, targetId: string) {
    const now = this.now(); await tx.put(this.record("audit", `audit:${randomUUID()}`, account, targetId, { action, account, targetId }, now + 90 * 24 * HOUR));
  }
  private secret(value: string) { if (!value || value.length > 8192) throw new AccessError("Invalid authorization credential", 401); }
  private identity(value: PortalIdentity) {
    if (!value || typeof value.account !== "string" || !value.account.trim() || value.account.length > 200 || typeof value.displayName !== "string" || !value.displayName.trim() || value.displayName.length > 200 || (value.expiresAt !== undefined && (!Number.isFinite(value.expiresAt) || value.expiresAt <= this.now()))) throw new AccessError("Invalid employee identity", 401);
    return value;
  }
  private async verified(token: string) {
    this.secret(token);
    try { return this.identity(await this.portal.identity(token)); }
    catch (error) { if (permanent(error)) throw new AccessError("Employee authorization is invalid", 401); throw new AccessError("Employee verification is unavailable", 503); }
  }
  private async roles(account: string): Promise<{ roles: string[]; at: number; organization?: string } | null> {
    try {
      const authorization = this.portal.authorization ? await this.portal.authorization(account) : { roles: await this.portal.roles(account) };
      const { roles, organization } = authorization;
      if (!Array.isArray(roles) || roles.length > 1000 || roles.some((role) => typeof role !== "string" || role.length > 200)) throw new AccessError("Invalid application roles", 503);
      return { roles: [...roles], at: this.now(), ...(typeof organization === "string" && organization.length <= 1000 ? { organization } : {}) };
    } catch (error) { if (permanent(error)) throw new AccessError("Employee role authorization is invalid", 401); return null; }
  }
  private grantExpiry(identity: PortalIdentity) { return Math.min(this.now() + this.duration(this.config.sessionAbsoluteMs, 8 * HOUR), identity.expiresAt ?? Infinity); }
  async startLogin(returnTo?: string): Promise<{ state: string; cookie: string; redirectUrl: string }> {
    // Card entry has no child-app callback/state contract. The user returns via
    // the registered portal card and confirms the verified identity locally.
    if (this.config.portalLoginMode === "card") return { state: "", cookie: "", redirectUrl: this.config.portalLoginUrl };
    const state = randomToken(), cookie = randomToken();
    const url = new URL(this.config.portalLoginUrl);
    url.searchParams.set(this.config.callbackParam, new URL("/auth/portal/callback", this.config.origin).toString());
    url.searchParams.set(this.config.stateParam, state);
    take(await this.store.transaction(async (tx) => {
      if (!await this.rate(tx, "login-start", "global", 100, 60000)) return new AccessError("Login requests are temporarily limited", 429);
      await tx.put(this.record("login", key("login", state), "", null, { verifierHash: hashToken(cookie), returnTo: safeReturnTo(returnTo ?? "/"), consumed: false }, this.now() + this.duration(this.config.transactionMs, 10 * 60000)));
    }));
    return { state, cookie, redirectUrl: url.toString() };
  }
  async callback(input: { token: string; state?: string; cookie?: string }): Promise<LoginResult> {
    this.secret(input.token);
    // A present but wrong/empty state must never enter the legacy confirmation path.
    if (input.state !== undefined) {
      this.secret(input.state);
      if (!input.cookie) throw new AccessError("Login transaction is missing", 401);
      this.secret(input.cookie);
      const id = key("login", input.state), verifier = hashToken(input.cookie);
      const transaction = await this.store.transaction(async (tx) => {
        const row = await tx.get("login", id);
        if (!row || expired(row, this.now()) || row.payload.consumed || !equalSecret(row.payload.verifierHash, verifier)) throw new AccessError("Login transaction is invalid", 401);
        return row;
      });
      const identity = await this.verified(input.token), identityAt = this.now(), roles = await this.roles(identity.account);
      const sessionToken = randomToken(), grantId = `grant:${randomUUID()}`, candidateId = randomUUID(), csrfToken = randomToken(), cipher = sealToken(input.token, this.config.encryptionKey);
      return this.store.transaction(async (tx) => {
        const row = await tx.get("login", id);
        if (!row || expired(row, this.now()) || row.payload.consumed || !equalSecret(row.payload.verifierHash, verifier)) throw new AccessError("Login transaction is invalid", 401);
        row.payload.consumed = true; await this.save(tx, row);
        await this.createSession(tx, identity, identityAt, roles, cipher, grantId, candidateId, sessionToken, csrfToken);
        return { kind: "session" as const, sessionToken, returnTo: transaction.payload.returnTo };
      });
    }
    if (this.config.portalLoginMode !== "card" && !this.config.allowLegacyConfirmation) throw new AccessError("Login transaction is required", 401);
    take(await this.store.transaction(async (tx) => await this.rate(tx, "login-pending", "global", 100, 60000) ? undefined : new AccessError("Login requests are temporarily limited", 429)));
    const identity = await this.verified(input.token), pendingToken = randomToken(), csrfToken = randomToken();
    const cipher = sealToken(input.token, this.config.encryptionKey);
    await this.store.transaction(async (tx) => {
      const pending = await tx.find("pending", { subjectId: identity.account, expiresAfter: this.now() });
      if (pending.filter((row) => !row.payload.consumed).length >= 50) throw new AccessError("Too many pending employee confirmations", 429);
      await tx.put(this.record("pending", key("pending", pendingToken), identity.account, null, { tokenCipher: cipher, account: identity.account, displayName: identity.displayName, csrfToken, returnTo: "/", consumed: false, upstreamExpiresAt: this.grantExpiry(identity) }, this.now() + this.duration(this.config.transactionMs, 10 * 60000)));
    });
    return { kind: "pending", pendingToken, returnTo: "/auth/confirm" };
  }
  async pending(token: string): Promise<{ account: string; displayName: string; csrfToken: string; returnTo: string }> {
    this.secret(token);
    return this.store.transaction(async (tx) => { const row = await tx.get("pending", key("pending", token)); if (!row || expired(row, this.now()) || row.payload.consumed || row.payload.upstreamExpiresAt <= this.now()) throw new AccessError("Login confirmation expired", 401); const { account, displayName, csrfToken, returnTo } = row.payload; return { account, displayName, csrfToken, returnTo }; });
  }
  async confirmPending(token: string, csrfToken: string): Promise<{ sessionToken: string; returnTo: string }> {
    this.secret(token); this.secret(csrfToken);
    const id = key("pending", token);
    const pending = await this.store.transaction(async (tx) => { const row = await tx.get("pending", id); if (!row || expired(row, this.now()) || row.payload.consumed || !equalSecret(row.payload.csrfToken, csrfToken) || row.payload.upstreamExpiresAt <= this.now()) throw new AccessError("Login confirmation is invalid", 401); return row; });
    const upstreamToken = openToken(pending.payload.tokenCipher, this.config.encryptionKey);
    const identity = await this.verified(upstreamToken), identityAt = this.now();
    if (identity.account !== pending.payload.account) throw new AccessError("Employee identity changed", 401);
    const roles = await this.roles(identity.account), sessionToken = randomToken(), grantId = `grant:${randomUUID()}`, candidateId = randomUUID(), sessionCsrf = randomToken();
    return this.store.transaction(async (tx) => {
      const row = await tx.get("pending", id);
      if (!row || expired(row, this.now()) || row.payload.consumed || !equalSecret(row.payload.csrfToken, csrfToken) || row.payload.upstreamExpiresAt <= this.now()) throw new AccessError("Login confirmation is invalid", 401);
      row.payload.consumed = true; await this.save(tx, row);
      await this.createSession(tx, { ...identity, expiresAt: Math.min(identity.expiresAt ?? Infinity, row.payload.upstreamExpiresAt) }, identityAt, roles, row.payload.tokenCipher, grantId, candidateId, sessionToken, sessionCsrf);
      return { sessionToken, returnTo: row.payload.returnTo };
    });
  }
  private async createSession(tx: AccessTransaction, identity: PortalIdentity, identityAt: number, roles: { roles: string[]; at: number; organization?: string } | null, cipher: string, grantId: string, candidateId: string, token: string, csrfToken: string) {
    const grants = await tx.find("grant", { subjectId: identity.account, expiresAfter: this.now(), activeOnly: true });
    if (grants.filter((grant) => grant.payload.active).length >= 50) throw new AccessError("Too many active employee sessions", 429);
    const user = await tx.ensureEmployee(identity.account, identity.displayName, candidateId), expiresAt = this.grantExpiry(identity);
    if (expiresAt <= this.now()) throw new AccessError("Employee authorization expired", 401);
    const grant = this.record("grant", grantId, identity.account, null, { userId: user.id, account: identity.account, displayName: identity.displayName, organization: roles?.organization, tokenCipher: cipher, active: true, identityAt, rolesAt: roles?.at ?? 0, roles: roles?.roles ?? [] }, expiresAt);
    await tx.put(grant);
    await tx.put(this.record("session", key("session", token), identity.account, grantId, { grantId, csrfToken, active: true, lastUsedAt: this.now() }, expiresAt));
    await this.audit(tx, "login", identity.account, grantId);
  }
  private sessionValid(session: AccessRecord<"session">) { return session.payload.active && !expired(session, this.now()) && this.now() - session.payload.lastUsedAt < this.duration(this.config.sessionIdleMs, HOUR); }
  private async activeGrant(tx: AccessTransaction, id: string) {
    const grant = await tx.get("grant", id);
    if (!grant || !grant.payload.active || expired(grant, this.now()) || !await tx.employeeActive(grant.payload.account, grant.payload.userId)) throw new AccessError("Employee authorization expired", 401);
    return grant;
  }
  private async activeClient(tx: AccessTransaction, id: string) {
    const client = await tx.get("client", id);
    if (!client?.payload.active || expired(client, this.now())) throw new AccessError("Client authorization expired", 401);
    const session = await tx.get("session", client.payload.sessionId);
    if (!session?.payload.active || session.payload.grantId !== client.payload.grantId || session.subjectId !== client.subjectId) throw new AccessError("Client parent authorization expired", 401);
    return client;
  }
  private async renew(grant: AccessRecord<"grant">, adminWrite = false): Promise<void> {
    const now = this.now(), identityFresh = this.duration(adminWrite ? Math.min(this.config.identityFreshMs, this.config.adminWriteFreshMs) : this.config.identityFreshMs, adminWrite ? 60000 : 300000), roleFresh = this.duration(adminWrite ? this.config.adminWriteFreshMs : this.config.roleFreshMs, adminWrite ? 60000 : 300000);
    let identity: PortalIdentity | undefined, identityAt: number | undefined;
    if (now - grant.payload.identityAt >= identityFresh) {
      try { identity = await this.verified(openToken(grant.payload.tokenCipher, this.config.encryptionKey)); identityAt = this.now(); if (identity.account !== grant.payload.account) throw new AccessError("Employee identity changed", 401); }
      catch (error) { if (permanent(error)) await this.invalidateGrant(grant.id, "identity-invalid"); throw error; }
    }
    let roles: { roles: string[]; at: number; organization?: string } | null = null;
    if (now - grant.payload.rolesAt >= roleFresh) {
      try { roles = await this.roles(grant.payload.account); }
      catch (error) { await this.invalidateGrant(grant.id, "roles-invalid"); throw error; }
    }
    if (!identity && !roles) return;
    await this.store.transaction(async (tx) => {
      const current = await this.activeGrant(tx, grant.id);
      let changed = false;
      // Commit one refresh for the observed generation. Concurrent callers
      // reuse the winner, then recheck freshness and revocation below.
      if (identity && identityAt !== undefined && current.payload.identityAt === grant.payload.identityAt && identityAt > current.payload.identityAt) { current.payload.identityAt = identityAt; current.payload.displayName = identity.displayName; current.expiresAt = Math.min(current.expiresAt, identity.expiresAt ?? Infinity); changed = true; }
      if (roles && current.payload.rolesAt === grant.payload.rolesAt && roles.at > current.payload.rolesAt) { current.payload.roles = roles.roles; current.payload.rolesAt = roles.at; current.payload.organization = roles.organization; changed = true; }
      if (changed) await this.save(tx, current);
    });
  }
  private async invalidateGrant(id: string, action: string) {
    await this.store.transaction(async (tx) => { const grant = await tx.get("grant", id); if (grant?.payload.active) { grant.payload.active = false; await this.save(tx, grant); await this.audit(tx, action, grant.payload.account, id); } });
  }
  async webPrincipal(token: string, options?: { adminWrite?: boolean }): Promise<Principal> {
    this.secret(token); const id = key("session", token);
    const grant = await this.store.transaction(async (tx) => { const session = await tx.get("session", id); if (!session || !this.sessionValid(session)) throw new AccessError("Web session expired", 401); return this.activeGrant(tx, session.payload.grantId); });
    await this.renew(grant, options?.adminWrite);
    return this.store.transaction(async (tx) => {
      const session = await tx.get("session", id); if (!session || !this.sessionValid(session)) throw new AccessError("Web session expired", 401);
      const current = await this.activeGrant(tx, session.payload.grantId);
      if (this.now() - current.payload.identityAt >= this.duration(options?.adminWrite ? Math.min(this.config.identityFreshMs, this.config.adminWriteFreshMs) : this.config.identityFreshMs, options?.adminWrite ? 60000 : 300000)) throw new AccessError("Employee verification is unavailable", 503);
      const roleFresh = this.duration(options?.adminWrite ? this.config.adminWriteFreshMs : this.config.roleFreshMs, options?.adminWrite ? 60000 : 300000);
      const adminRoles = [this.config.adminRole, this.config.platformAdminRole].filter((role): role is string => Boolean(role));
      const admin = this.now() - current.payload.rolesAt < roleFresh && adminRoles.some(role => current.payload.roles.includes(role));
      // A page loads many authenticated chunks concurrently. Keep fresh checks
      // read-only; a retry after a competing touch sees the committed timestamp.
      // Rounding activity down can expire idle sessions up to one minute early,
      // but never extends their idle or absolute authorization window.
      const touchInterval = Math.min(60000, this.duration(this.config.sessionIdleMs, HOUR) / 2);
      if (this.now() - session.payload.lastUsedAt >= touchInterval) {
        session.payload.lastUsedAt = this.now(); await this.save(tx, session);
      }
      return this.principal(current, id, "web", Math.min(session.expiresAt, current.expiresAt), session.payload.csrfToken, admin);
    });
  }
  private principal(grant: AccessRecord<"grant">, credentialId: string, channel: "web" | "cli" | "mcp", expiresAt: number, csrfToken?: string, admin = false): Principal {
    return { userId: grant.payload.userId, account: grant.payload.account, displayName: grant.payload.displayName, ...(channel === "web" && grant.payload.organization ? { organization: grant.payload.organization } : {}), grantId: grant.id, credentialId, channel, capabilities: channel === "web" ? [...EMPLOYEE_CAPABILITIES, ...(admin ? ["knowledge:manage" as const] : [])] : [SCOPE], csrfToken, expiresAt };
  }
  async clientPrincipal(token: string, channel: "cli" | "mcp" = "cli"): Promise<Principal> {
    this.secret(token); const id = key("access", token);
    const grant = await this.store.transaction(async (tx) => { const access = await tx.get("access", id); if (!access || expired(access, this.now())) throw new AccessError("Client token expired", 401); const client = await this.activeClient(tx, access.payload.clientId); return this.activeGrant(tx, client.payload.grantId); });
    await this.renew(grant);
    return this.store.transaction(async (tx) => {
      const access = await tx.get("access", id); if (!access || expired(access, this.now())) throw new AccessError("Client token expired", 401);
      const client = await this.activeClient(tx, access.payload.clientId);
      const current = await this.activeGrant(tx, client.payload.grantId);
      if (this.now() - current.payload.identityAt >= this.duration(this.config.identityFreshMs, 300000)) throw new AccessError("Employee verification is unavailable", 503);
      client.payload.lastUsedAt = this.now(); await this.save(tx, client);
      return this.principal(current, client.id, channel, Math.min(access.expiresAt, client.expiresAt, current.expiresAt));
    });
  }
  private async authorizeWeb(tx: AccessTransaction, principal: Principal) {
    if (principal.channel !== "web") throw new AccessError("Web employee authorization required", 403);
    const session = await tx.get("session", principal.credentialId);
    if (!session || !this.sessionValid(session) || session.payload.grantId !== principal.grantId || session.subjectId !== principal.account) throw new AccessError("Web session expired", 401);
    const grant = await this.activeGrant(tx, principal.grantId);
    if (grant.payload.userId !== principal.userId || grant.payload.account !== principal.account) throw new AccessError("Employee authorization mismatch", 401);
    return session;
  }
  async logout(principal: Principal, all = false): Promise<void> {
    await this.store.transaction(async (tx) => {
      await this.authorizeWeb(tx, principal);
      const grants = all ? await tx.find("grant", { subjectId: principal.account, expiresAfter: this.now(), activeOnly: true }) : [await this.activeGrant(tx, principal.grantId)];
      for (const grant of grants) { grant.payload.active = false; await this.save(tx, grant); for (const session of await tx.find("session", { parentId: grant.id, expiresAfter: this.now(), activeOnly: true })) { session.payload.active = false; await this.save(tx, session); for (const device of await tx.find("device", { parentId: session.id, expiresAfter: this.now() })) { device.payload.status = "revoked"; await this.save(tx, device); } } for (const client of await tx.find("client", { parentId: grant.id, expiresAfter: this.now(), activeOnly: true })) { client.payload.active = false; await this.save(tx, client); } }
      await this.audit(tx, all ? "logout-all" : "logout", principal.account, principal.credentialId);
    });
  }
  async listClients(principal: Principal): Promise<ClientView[]> {
    return this.store.transaction(async (tx) => { await this.authorizeWeb(tx, principal); const clients = await tx.find("client", { subjectId: principal.account, expiresAfter: this.now(), activeOnly: true }); const items: ClientView[] = []; for (const client of clients) { const grant = await tx.get("grant", client.payload.grantId); if (client.payload.active && !expired(client, this.now()) && grant?.payload.active && !expired(grant, this.now())) items.push({ id: client.id, name: client.payload.name, createdAt: client.createdAt, lastUsedAt: client.payload.lastUsedAt, expiresAt: Math.min(client.expiresAt, grant.expiresAt) }); } return items; });
  }
  async revokeClient(principal: Principal, id: string): Promise<void> {
    await this.store.transaction(async (tx) => { if (principal.channel === "web") await this.authorizeWeb(tx, principal); else { if (principal.credentialId !== id) throw new AccessError("Client ownership required", 403); await this.activeGrant(tx, principal.grantId); } const client = await tx.get("client", id); if (!client || client.subjectId !== principal.account) throw new AccessError("Client ownership required", 403); client.payload.active = false; await this.save(tx, client); await this.audit(tx, "client-revoke", principal.account, id); });
  }
  private async rate(tx: AccessTransaction, name: string, rateKey: string, limit: number, windowMs: number): Promise<boolean> {
    if (!rateKey || rateKey.length > 256) throw new OAuthError("invalid_request");
    const id = key("bucket", `${name}:${rateKey}`), existing = await tx.get("bucket", id), now = this.now();
    const bucket = existing && !expired(existing, now) ? existing : this.record("bucket", id, "", null, { count: 0 }, now + windowMs);
    bucket.payload.count++; await this.save(tx, bucket); return bucket.payload.count <= limit;
  }
  private validClient(clientId: string, scope = SCOPE) { if (clientId !== CLIENT_ID) throw new OAuthError("invalid_client", 401); if (scope !== SCOPE) throw new OAuthError("invalid_scope"); }
  async authorizeDevice(input: { clientId: string; scope: string; name?: string; rateKey: string }): Promise<DeviceReply> {
    this.validClient(input.clientId, input.scope);
    if (input.name !== undefined && (!input.name.trim() || input.name.length > 100 || /[\u0000-\u001f]/.test(input.name))) throw new OAuthError("invalid_request");
    const deviceCode = randomToken(), userCode = randomBytes(6).toString("hex").toUpperCase(), now = this.now(), expiresAt = now + this.duration(this.config.deviceMs, 300000);
    take(await this.store.transaction(async (tx) => { if (!await this.rate(tx, "device-issue", input.rateKey, 10, 60000)) return new OAuthError("slow_down", 429); await tx.put(this.record("device", key("device", deviceCode), "", null, { name: input.name?.trim() ?? "Lighthouse CLI", userCodeHash: hashToken(userCode), status: "pending", lastPollAt: -1, intervalMs: 5000 }, expiresAt)); await tx.put(this.record("userCode", key("userCode", userCode), "", key("device", deviceCode), { deviceId: key("device", deviceCode) }, expiresAt)); }));
    const verificationUri = new URL("/auth/device", this.config.origin).toString(), complete = new URL(verificationUri); complete.searchParams.set("user_code", userCode);
    return { device_code: deviceCode, user_code: userCode, verification_uri: verificationUri, verification_uri_complete: complete.toString(), expires_in: Math.floor((expiresAt - now) / 1000), interval: 5 };
  }
  private async lookupDevice(tx: AccessTransaction, userCode: string) {
    if (!/^[A-Z0-9_-]{12}$/.test(userCode)) return null;
    const index = await tx.get("userCode", key("userCode", userCode));
    if (!index || expired(index, this.now())) return null;
    const device = await tx.get("device", index.payload.deviceId);
    return device && !expired(device, this.now()) && device.payload.userCodeHash === hashToken(userCode) ? device : null;
  }
  async deviceRequest(principal: Principal, userCode: string, rateKey: string): Promise<DeviceView> {
    return take(await this.store.transaction(async (tx) => { await this.authorizeWeb(tx, principal); if (!await this.rate(tx, "device-guess", rateKey, 20, 60000)) return new OAuthError("slow_down", 429); const device = await this.lookupDevice(tx, userCode); if (!device || device.payload.status !== "pending") return new AccessError("Device request is unavailable", 400); return { userCode, clientName: device.payload.name, scope: SCOPE as "knowledge:read", expiresAt: device.expiresAt }; }));
  }
  async decideDevice(principal: Principal, userCode: string, approve: boolean, rateKey: string): Promise<void> {
    take(await this.store.transaction(async (tx) => {
      const session = await this.authorizeWeb(tx, principal);
      if (!await this.rate(tx, "device-guess", rateKey, 20, 60000)) return new OAuthError("slow_down", 429);
      const device = await this.lookupDevice(tx, userCode);
      if (!device || device.payload.status !== "pending") return new AccessError("Device request is unavailable", 400);
      device.payload.status = approve ? "approved" : "denied";
      device.payload.approvedSessionId = session.id; device.payload.grantId = principal.grantId; device.parentId = session.id; device.subjectId = principal.account;
      await this.save(tx, device); await this.audit(tx, approve ? "device-approve" : "device-deny", principal.account, device.id);
    }));
  }
  private async deviceParent(tx: AccessTransaction, device: AccessRecord<"device">) {
    if (!device.payload.approvedSessionId || !device.payload.grantId) throw new OAuthError("invalid_grant");
    const session = await tx.get("session", device.payload.approvedSessionId);
    // Idle expiry alone does not invalidate approval. Explicit logout sets active=false.
    if (!session?.payload.active || session.payload.grantId !== device.payload.grantId) throw new OAuthError("invalid_grant");
    try { return await this.activeGrant(tx, device.payload.grantId); } catch { throw new OAuthError("invalid_grant"); }
  }
  async exchangeDevice(deviceCode: string, clientId: string): Promise<TokenReply> {
    this.validClient(clientId); if (!deviceCode || deviceCode.length > 8192) throw new OAuthError("invalid_grant");
    const id = key("device", deviceCode);
    const snapshot = await this.store.transaction(async (tx) => {
      const device = await tx.get("device", id);
      return device && !expired(device, this.now()) && device.payload.status === "approved" ? this.deviceParent(tx, device) : null;
    });
    if (snapshot) {
      try { await this.renew(snapshot); }
      catch (error) { if (error instanceof AccessError && error.status === 503) throw new OAuthError("temporarily_unavailable", 503); throw new OAuthError("invalid_grant"); }
    }
    const accessToken = randomToken(), refreshToken = randomToken(), clientRecordId = `client:${randomUUID()}`;
    return take(await this.store.transaction(async (tx) => {
      const device = await tx.get("device", id), now = this.now();
      if (!device) return new OAuthError("invalid_grant");
      if (expired(device, now)) return new OAuthError("expired_token");
      if (device.payload.status === "denied") return new OAuthError("access_denied");
      if (device.payload.status === "revoked" || device.payload.status === "exchanged") return new OAuthError("invalid_grant");
      if (device.payload.lastPollAt >= 0 && now - device.payload.lastPollAt < device.payload.intervalMs) { device.payload.intervalMs += 5000; device.payload.lastPollAt = now; await this.save(tx, device); return new OAuthError("slow_down"); }
      device.payload.lastPollAt = now;
      if (device.payload.status === "pending") { await this.save(tx, device); return new OAuthError("authorization_pending"); }
      const grant = await this.deviceParent(tx, device), expiresAt = Math.min(now + this.duration(this.config.clientMs, 8 * HOUR), grant.expiresAt);
      if (now - grant.payload.identityAt >= this.duration(this.config.identityFreshMs, 300000)) return new OAuthError("temporarily_unavailable", 503);
      const clients = await tx.find("client", { subjectId: grant.payload.account, expiresAfter: this.now(), activeOnly: true });
      if (clients.filter((client) => client.payload.active && !expired(client, now)).length >= 50) return new OAuthError("access_denied");
      const client = this.record("client", clientRecordId, grant.payload.account, grant.id, { grantId: grant.id, sessionId: device.payload.approvedSessionId!, name: device.payload.name, active: true, currentRefreshHash: hashToken(refreshToken), lastUsedAt: now }, expiresAt);
      device.payload.status = "exchanged"; await this.save(tx, device); await tx.put(client);
      const reply = await this.issueTokens(tx, client, accessToken, refreshToken);
      await this.audit(tx, "client-grant", grant.payload.account, client.id); return reply;
    }));
  }
  private async issueTokens(tx: AccessTransaction, client: AccessRecord<"client">, accessToken: string, refreshToken: string): Promise<TokenReply> {
    const accessExpires = Math.min(this.now() + this.duration(this.config.accessMs, 300000), client.expiresAt);
    await tx.put(this.record("access", key("access", accessToken), client.subjectId, client.id, { clientId: client.id }, accessExpires));
    // Every generation remains addressable until the family's absolute expiry.
    await tx.put(this.record("refresh", key("refresh", refreshToken), client.subjectId, client.id, { clientId: client.id, used: false }, client.expiresAt));
    return { access_token: accessToken, token_type: "Bearer", expires_in: Math.max(0, Math.floor((accessExpires - this.now()) / 1000)), refresh_token: refreshToken, scope: SCOPE };
  }
  async refresh(refreshToken: string, clientId: string): Promise<TokenReply> {
    this.validClient(clientId); if (!refreshToken || refreshToken.length > 8192) throw new OAuthError("invalid_grant");
    const id = key("refresh", refreshToken);
    const snapshot = take(await this.store.transaction(async (tx) => {
      const refresh = await tx.get("refresh", id); if (!refresh || expired(refresh, this.now())) return new OAuthError("invalid_grant");
      let client: AccessRecord<"client">; try { client = await this.activeClient(tx, refresh.payload.clientId); } catch { return new OAuthError("invalid_grant"); }
      if (refresh.payload.used || client.payload.currentRefreshHash !== hashToken(refreshToken)) { client.payload.active = false; await this.save(tx, client); await this.audit(tx, "refresh-replay", client.subjectId, client.id); return new OAuthError("invalid_grant"); }
      try { return await this.activeGrant(tx, client.payload.grantId); } catch { return new OAuthError("invalid_grant"); }
    }));
    try { await this.renew(snapshot); } catch (error) { if (error instanceof AccessError && error.status === 503) throw new OAuthError("temporarily_unavailable", 503); throw new OAuthError("invalid_grant"); }
    const accessToken = randomToken(), nextRefresh = randomToken();
    return take(await this.store.transaction(async (tx) => {
      const refresh = await tx.get("refresh", id); if (!refresh || expired(refresh, this.now())) return new OAuthError("invalid_grant");
      let client: AccessRecord<"client">; try { client = await this.activeClient(tx, refresh.payload.clientId); } catch { return new OAuthError("invalid_grant"); }
      if (refresh.payload.used || client.payload.currentRefreshHash !== hashToken(refreshToken)) { client.payload.active = false; await this.save(tx, client); await this.audit(tx, "refresh-replay", client.subjectId, client.id); return new OAuthError("invalid_grant"); }
      let grant: AccessRecord<"grant">; try { grant = await this.activeGrant(tx, client.payload.grantId); } catch { return new OAuthError("invalid_grant"); }
      if (this.now() - grant.payload.identityAt >= this.duration(this.config.identityFreshMs, 300000)) return new OAuthError("temporarily_unavailable", 503);
      client.expiresAt = Math.min(client.expiresAt, grant.expiresAt); client.payload.currentRefreshHash = hashToken(nextRefresh); client.payload.lastUsedAt = this.now(); refresh.payload.used = true;
      await this.save(tx, refresh); await this.save(tx, client); return this.issueTokens(tx, client, accessToken, nextRefresh);
    }));
  }
}
