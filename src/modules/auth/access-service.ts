import { randomBytes, randomUUID } from "node:crypto";
import { equalSecret, hashToken, openToken, randomToken, safeReturnTo, sealToken } from "./access-crypto";
import { AccessError, EMPLOYEE_CAPABILITIES, OAuthError, type AccessConfig, type Capability, type PortalAdapter, type PortalIdentity, type Principal } from "./access-types";
import type { AccessKind, AccessPayloads, AccessRecord, AccessStore, AccessTransaction } from "./access-store";
import { IAM_ROLES, readIamDirectory } from "./iam-directory";
import { accessAuthority, usesIamPortalAuthorization, usesIamSyncAuthorization } from "./authorization-source";
import { employeeDisplayName, readPortalEmployeeName } from "./employee-name";
import type { WecomAutoAccessService } from "./wecom-auto-access";

export type ClientView = { id: string; name: string; createdAt: number; lastUsedAt: number; expiresAt: number };
export type DeviceView = { userCode: string; clientName: string; scope: "knowledge:read"; expiresAt: number };
export type DeviceReply = { device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; expires_in: number; interval: number };
export type TokenReply = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: "knowledge:read" };
type LoginResult = { kind: "session"; sessionToken: string; returnTo: string } | { kind: "pending"; pendingToken: string; returnTo: string };
type AuthorizationSnapshot = { roles: string[]; at: number; organization?: string; displayName?: string };
type ToolOwner = { subjectId: string; ownerKind?: AccessPayloads["client"]["ownerKind"] };
type ToolParent = ToolOwner & { sessionId: string; grantId: string };
type ToolAuthority = AccessRecord<"grant"> | AccessRecord<"wecomAutoSession">;
const HOUR = 3600000;
const CLIENT_ID = "lighthouse-cli";
const SCOPE = "knowledge:read";
const APPLICATION_ROLES = new Set<string>(IAM_ROLES.map(role => role.code));
const key = (kind: AccessKind, value: string) => `${kind}:${hashToken(value)}`;
const take = <T>(result: T): Exclude<T, Error> => { if (result instanceof Error) throw result; return result as Exclude<T, Error>; };
const expired = (record: AccessRecord, now: number) => record.expiresAt <= now;
const permanent = (error: unknown) => error instanceof AccessError && (error.status === 401 || error.status === 403);
const toolOAuthError = (error: unknown) => error instanceof AccessError && error.status === 503
  ? new OAuthError("temporarily_unavailable", 503)
  : new OAuthError("invalid_grant");

/** Security decisions live here; HTTP transport owns cookies, same-origin checks, and CSRF submission. */
export class AccessService {
  constructor(
    private readonly config: AccessConfig,
    private readonly portal: PortalAdapter,
    private readonly store: AccessStore,
    private readonly now: () => number = Date.now,
    private readonly getDealerAccess?: () => WecomAutoAccessService,
  ) {}
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
    if (value.employeeNo !== undefined && (typeof value.employeeNo !== "string" || !value.employeeNo || value.employeeNo.trim() !== value.employeeNo || value.employeeNo.length > 191 || /[\u0000-\u001f\u007f]/.test(value.employeeNo))) throw new AccessError("Invalid employee number", 401);
    return value;
  }
  private async verified(token: string) {
    this.secret(token);
    try { return this.identity(await this.portal.identity(token)); }
    catch (error) { if (permanent(error)) throw new AccessError("Employee authorization is invalid", 401); throw new AccessError("Employee verification is unavailable", 503); }
  }
  private async roles(account: string): Promise<AuthorizationSnapshot | null> {
    try {
      const authorization = this.portal.authorization ? await this.portal.authorization(account) : { roles: await this.portal.roles(account) };
      const { roles, organization } = authorization;
      if (!Array.isArray(roles) || roles.length > 1000 || roles.some((role) => typeof role !== "string" || role.length > 200)) throw new AccessError("Invalid application roles", 503);
      const granted = usesIamPortalAuthorization(this.config) ? [...new Set(roles.filter(role => APPLICATION_ROLES.has(role)))] : [...roles];
      if (usesIamPortalAuthorization(this.config) && !granted.length) throw new AccessError("Lighthouse access has not been granted", 403);
      const displayName = readPortalEmployeeName(authorization.displayName, account);
      return { roles: granted, at: this.now(), ...(typeof organization === "string" && organization.length <= 1000 ? { organization } : {}), ...(displayName ? { displayName } : {}) };
    } catch (error) {
      // In the combined mode IAM proves identity only. A missing or failed
      // role lookup must never become the legacy portal's employee fallback.
      if (usesIamPortalAuthorization(this.config)) {
        if (permanent(error)) throw new AccessError("Lighthouse access has not been granted", 403);
        throw new AccessError("Application authorization is unavailable", 503);
      }
      if (permanent(error)) throw new AccessError("Employee role authorization is invalid", 401);
      return null;
    }
  }
  private portalRolesFresh(grant: AccessRecord<"grant">, adminWrite = false) {
    return !usesIamPortalAuthorization(this.config) || this.now() - grant.payload.rolesAt < this.duration(adminWrite ? this.config.adminWriteFreshMs : this.config.roleFreshMs, adminWrite ? 60000 : 300000);
  }
  private requirePortalRolesFresh(grant: AccessRecord<"grant">, adminWrite = false) {
    if (!this.portalRolesFresh(grant, adminWrite)) throw new AccessError("Application authorization is unavailable", 503);
  }
  private grantExpiry(identity: PortalIdentity) { return Math.min(this.now() + this.duration(this.config.sessionAbsoluteMs, 8 * HOUR), identity.expiresAt ?? Infinity); }
  async startLogin(returnTo?: string): Promise<{ state: string; cookie: string; redirectUrl: string }> {
    // Card entry has no child-app callback/state contract. The user returns via
    // the registered portal card and confirms the verified identity locally.
    // Its browser-bound record preserves navigation only, never bypassing that confirmation.
    const card = this.config.mode !== "iam" && this.config.portalLoginMode === "card";
    const state = card ? "" : randomToken(), cookie = randomToken();
    const url = this.config.mode === "iam"
      ? new URL(this.portal.authorizationUrl!(new URL("/auth/iam/callback", this.config.origin).toString(), state))
      : new URL(this.config.portalLoginUrl);
    if (this.config.mode !== "iam" && !card) {
      url.searchParams.set(this.config.callbackParam, new URL("/auth/portal/callback", this.config.origin).toString());
      url.searchParams.set(this.config.stateParam, state);
    }
    take(await this.store.transaction(async (tx) => {
      if (!await this.rate(tx, "login-start", "global", 100, 60000)) return new AccessError("Login requests are temporarily limited", 429);
      await tx.put(this.record("login", key("login", card ? cookie : state), "", null, { authority: accessAuthority(this.config), verifierHash: hashToken(cookie), returnTo: safeReturnTo(returnTo ?? "/"), consumed: false, ...(card ? { entry: "card" as const } : {}) }, this.now() + this.duration(this.config.transactionMs, 10 * 60000)));
    }));
    return { state, cookie, redirectUrl: url.toString() };
  }
  /** Read navigation context only after proving the live transaction belongs to this browser. */
  async loginReturnTo(input: { state?: string; cookie?: string }): Promise<string> {
    const card = input.state === undefined && this.config.mode !== "iam" && this.config.portalLoginMode === "card";
    if (input.state === undefined && !card) return "/";
    if (!input.cookie) {
      if (card) return "/";
      throw new AccessError("Login transaction is missing", 401);
    }
    this.secret(input.cookie);
    if (!card) this.secret(input.state!);
    const id = key("login", card ? input.cookie : input.state!), verifier = hashToken(input.cookie);
    return this.store.transaction(async tx => {
      const row = await tx.get("login", id);
      if (!row || row.payload.authority !== accessAuthority(this.config) || expired(row, this.now()) || row.payload.consumed || (row.payload.entry === "card") !== card || !equalSecret(row.payload.verifierHash, verifier)) {
        if (card) return "/"; // Opening a portal card directly remains supported.
        throw new AccessError("Login transaction is invalid", 401);
      }
      return safeReturnTo(row.payload.returnTo);
    });
  }
  async callback(input: { token: string; state?: string; cookie?: string }): Promise<LoginResult> {
    if (this.config.mode === "iam") throw new AccessError("Portal authentication is disabled", 401);
    this.secret(input.token);
    // A present but wrong/empty state must never enter the legacy confirmation path.
    if (input.state !== undefined) {
      this.secret(input.state);
      if (!input.cookie) throw new AccessError("Login transaction is missing", 401);
      this.secret(input.cookie);
      const id = key("login", input.state), verifier = hashToken(input.cookie);
      const transaction = await this.store.transaction(async (tx) => {
        const row = await tx.get("login", id);
        if (!row || (row.payload.authority ?? "portal") !== "portal" || row.payload.entry === "card" || expired(row, this.now()) || row.payload.consumed || !equalSecret(row.payload.verifierHash, verifier)) throw new AccessError("Login transaction is invalid", 401);
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
      let returnTo = "/";
      if (this.config.portalLoginMode === "card" && input.cookie) {
        const navigation = await tx.get("login", key("login", input.cookie));
        if (navigation && navigation.payload.authority === "portal" && navigation.payload.entry === "card" && !expired(navigation, this.now()) && !navigation.payload.consumed && equalSecret(navigation.payload.verifierHash, hashToken(input.cookie))) {
          returnTo = safeReturnTo(navigation.payload.returnTo);
          navigation.payload.consumed = true; await this.save(tx, navigation);
        }
      }
      await tx.put(this.record("pending", key("pending", pendingToken), identity.account, null, { tokenCipher: cipher, account: identity.account, displayName: identity.displayName, csrfToken, returnTo, consumed: false, upstreamExpiresAt: this.grantExpiry(identity) }, this.now() + this.duration(this.config.transactionMs, 10 * 60000)));
    });
    return { kind: "pending", pendingToken, returnTo: "/auth/confirm" };
  }
  async iamCallback(input: { code: string; state: string; cookie?: string }): Promise<{ sessionToken: string; returnTo: string }> {
    if (this.config.mode !== "iam" || !this.portal.exchange) throw new AccessError("IAM authentication is disabled", 401);
    this.secret(input.code); this.secret(input.state);
    if (!input.cookie) throw new AccessError("Login transaction is missing", 401);
    this.secret(input.cookie);
    const id = key("login", input.state), verifier = hashToken(input.cookie);
    // Claim before exchanging a one-use code. A failed exchange requires a new
    // login; racing callbacks must never redeem the same code twice.
    const transaction = await this.store.transaction(async tx => {
      const row = await tx.get("login", id);
      if (!row || row.payload.authority !== accessAuthority(this.config) || expired(row, this.now()) || row.payload.consumed || !equalSecret(row.payload.verifierHash, verifier)) throw new AccessError("Login transaction is invalid", 401);
      row.payload.consumed = true; await this.save(tx, row); return row;
    });
    const exchanged = await this.portal.exchange(input.code);
    const identity = this.identity({ ...await this.verified(exchanged.token), expiresAt: exchanged.expiresAt });
    const identityAt = this.now(), sessionToken = randomToken(), grantId = `grant:${randomUUID()}`, candidateId = randomUUID(), csrfToken = randomToken();
    const roles = usesIamPortalAuthorization(this.config) ? await this.roles(identity.account) : null;
    const cipher = sealToken(exchanged.token, this.config.encryptionKey);
    return this.store.transaction(async tx => {
      if (expired(transaction, this.now())) throw new AccessError("Login transaction expired", 401);
      await this.createSession(tx, identity, identityAt, roles, cipher, grantId, candidateId, sessionToken, csrfToken);
      return { sessionToken, returnTo: transaction.payload.returnTo };
    });
  }
  async pending(token: string): Promise<{ account: string; displayName: string; csrfToken: string; returnTo: string }> {
    if (this.config.mode === "iam") throw new AccessError("Portal authentication is disabled", 401);
    this.secret(token);
    return this.store.transaction(async (tx) => { const row = await tx.get("pending", key("pending", token)); if (!row || expired(row, this.now()) || row.payload.consumed || row.payload.upstreamExpiresAt <= this.now()) throw new AccessError("Login confirmation expired", 401); const { account, displayName, csrfToken, returnTo } = row.payload; return { account, displayName, csrfToken, returnTo }; });
  }
  async confirmPending(token: string, csrfToken: string): Promise<{ sessionToken: string; returnTo: string }> {
    if (this.config.mode === "iam") throw new AccessError("Portal authentication is disabled", 401);
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
  private async createSession(tx: AccessTransaction, identity: PortalIdentity, identityAt: number, roles: AuthorizationSnapshot | null, cipher: string, grantId: string, candidateId: string, token: string, csrfToken: string) {
    if (usesIamSyncAuthorization(this.config)) {
      const directory = await readIamDirectory(tx, identity.account, this.now());
      identity = { ...identity, displayName: directory.displayName, expiresAt: Math.min(identity.expiresAt ?? Infinity, directory.expiresAt) };
      roles = { roles: directory.roles, at: this.now(), organization: directory.organization };
    }
    if (usesIamPortalAuthorization(this.config)) {
      identity = { ...identity, displayName: roles?.displayName ?? identity.account };
    }
    const grants = await tx.find("grant", { subjectId: identity.account, expiresAfter: this.now(), activeOnly: true });
    if (grants.filter((grant) => grant.payload.active).length >= 50) throw new AccessError("Too many active employee sessions", 429);
    const user = await tx.ensureEmployee(identity.account, identity.displayName, candidateId), expiresAt = this.grantExpiry(identity);
    if (expiresAt <= this.now()) throw new AccessError("Employee authorization expired", 401);
    const grant = this.record("grant", grantId, identity.account, null, { authority: accessAuthority(this.config), userId: user.id, account: identity.account, displayName: identity.displayName, employeeNo: identity.employeeNo, organization: roles?.organization, tokenCipher: cipher, active: true, identityAt, rolesAt: roles?.at ?? 0, roles: roles?.roles ?? [] }, expiresAt);
    await tx.put(grant);
    await tx.put(this.record("session", key("session", token), identity.account, grantId, { grantId, csrfToken, active: true, lastUsedAt: this.now() }, expiresAt));
    await this.audit(tx, "login", identity.account, grantId);
  }
  private sessionValid(session: AccessRecord<"session">) { return session.payload.active && !expired(session, this.now()) && this.now() - session.payload.lastUsedAt < this.duration(this.config.sessionIdleMs, HOUR); }
  private async activeGrant(tx: AccessTransaction, id: string) {
    const grant = await tx.get("grant", id);
    if (!grant || (grant.payload.authority ?? "portal") !== accessAuthority(this.config) || !grant.payload.active || expired(grant, this.now()) || !await tx.employeeActive(grant.payload.account, grant.payload.userId)) throw new AccessError("Employee authorization expired", 401);
    if (usesIamPortalAuthorization(this.config) && !grant.payload.roles.some(role => APPLICATION_ROLES.has(role))) throw new AccessError("Lighthouse access has not been granted", 403);
    if (usesIamSyncAuthorization(this.config)) {
      const directory = await readIamDirectory(tx, grant.payload.account, this.now());
      grant.payload.roles = directory.roles;
      grant.payload.rolesAt = this.now();
      grant.payload.displayName = directory.displayName;
      grant.payload.organization = directory.organization;
      grant.expiresAt = Math.min(grant.expiresAt, directory.expiresAt);
    }
    return grant;
  }
  private dealerAccess() {
    if (!this.getDealerAccess) throw new AccessError("Dealer authorization is unavailable", 401);
    return this.getDealerAccess();
  }
  private async toolAuthority(tx: AccessTransaction, parent: ToolParent): Promise<ToolAuthority> {
    if (parent.ownerKind === "dealer") {
      const session = await this.dealerAccess().toolSession(tx, parent.sessionId);
      if (session.id === parent.grantId && session.subjectId === parent.subjectId) return session;
    } else {
      const session = await tx.get("session", parent.sessionId);
      if (session?.payload.active && session.payload.grantId === parent.grantId && session.subjectId === parent.subjectId) {
        return this.activeGrant(tx, parent.grantId);
      }
    }
    throw new AccessError("Client parent authorization expired", 401);
  }
  private async activeClient(tx: AccessTransaction, id: string) {
    const client = await tx.get("client", id);
    if (!client?.payload.active || expired(client, this.now())) throw new AccessError("Client authorization expired", 401);
    const authority = await this.toolAuthority(tx, { ...client.payload, subjectId: client.subjectId });
    return { client, authority };
  }
  private async clientAccess(tx: AccessTransaction, id: string) {
    const access = await tx.get("access", id);
    if (!access || expired(access, this.now())) throw new AccessError("Client token expired", 401);
    return { access, ...await this.activeClient(tx, access.payload.clientId) };
  }
  private async renewToolAuthority(authority: ToolAuthority): Promise<void> {
    if (authority.kind === "wecomAutoSession") await this.dealerAccess().renewToolSession(authority);
    else await this.renew(authority);
  }
  private requireFreshToolAuthority(authority: ToolAuthority): void {
    if (authority.kind === "wecomAutoSession") {
      this.dealerAccess().requireFreshIdentity(authority);
      return;
    }
    this.requirePortalRolesFresh(authority);
    if (this.now() - authority.payload.identityAt >= this.duration(this.config.identityFreshMs, 300000)) {
      throw new AccessError("Employee verification is unavailable", 503);
    }
  }
  private ownsClient(owner: ToolOwner, client: AccessRecord<"client">) {
    return client.subjectId === owner.subjectId &&
      (client.payload.ownerKind ?? "employee") === (owner.ownerKind ?? "employee");
  }
  private async renew(grant: AccessRecord<"grant">, adminWrite = false): Promise<void> {
    const now = this.now(), identityFresh = this.duration(adminWrite ? Math.min(this.config.identityFreshMs, this.config.adminWriteFreshMs) : this.config.identityFreshMs, adminWrite ? 60000 : 300000), roleFresh = this.duration(adminWrite ? this.config.adminWriteFreshMs : this.config.roleFreshMs, adminWrite ? 60000 : 300000);
    let identity: PortalIdentity | undefined, identityAt: number | undefined;
    if (now - grant.payload.identityAt >= identityFresh) {
      try { identity = await this.verified(openToken(grant.payload.tokenCipher, this.config.encryptionKey)); identityAt = this.now(); if (identity.account !== grant.payload.account) throw new AccessError("Employee identity changed", 401); }
      catch (error) { if (permanent(error)) await this.invalidateGrant(grant.id, "identity-invalid"); throw error; }
    }
    let roles: AuthorizationSnapshot | null = null;
    if (!usesIamSyncAuthorization(this.config) && now - grant.payload.rolesAt >= roleFresh) {
      try { roles = await this.roles(grant.payload.account); }
      catch (error) { if (permanent(error)) await this.invalidateGrant(grant.id, "roles-invalid"); throw error; }
    }
    if (!identity && !roles) return;
    await this.store.transaction(async (tx) => {
      const current = await this.activeGrant(tx, grant.id);
      let changed = false;
      // Commit one refresh for the observed generation. Concurrent callers
      // reuse the winner, then recheck freshness and revocation below.
      if (identity && identityAt !== undefined && current.payload.identityAt === grant.payload.identityAt && identityAt > current.payload.identityAt) {
        current.payload.identityAt = identityAt;
        current.payload.employeeNo = identity.employeeNo;
        // IAM verifies the account. The combined mode's profile belongs to
        // the independently refreshed portal response, even in refresh races.
        if (!usesIamPortalAuthorization(this.config)) current.payload.displayName = identity.displayName;
        current.expiresAt = Math.min(current.expiresAt, identity.expiresAt ?? Infinity); changed = true;
      }
      if (roles && current.payload.rolesAt === grant.payload.rolesAt && roles.at > current.payload.rolesAt) {
        current.payload.roles = roles.roles; current.payload.rolesAt = roles.at; current.payload.organization = roles.organization;
        if (usesIamPortalAuthorization(this.config)) current.payload.displayName = roles.displayName ?? current.payload.account;
        changed = true;
      }
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
      this.requirePortalRolesFresh(current, options?.adminWrite);
      if (this.now() - current.payload.identityAt >= this.duration(options?.adminWrite ? Math.min(this.config.identityFreshMs, this.config.adminWriteFreshMs) : this.config.identityFreshMs, options?.adminWrite ? 60000 : 300000)) throw new AccessError("Employee verification is unavailable", 503);
      const roleFresh = this.duration(options?.adminWrite ? this.config.adminWriteFreshMs : this.config.roleFreshMs, options?.adminWrite ? 60000 : 300000);
      const adminRoles = [this.config.adminRole, this.config.platformAdminRole].filter((role): role is string => Boolean(role));
      const rolesFresh = this.now() - current.payload.rolesAt < roleFresh;
      const admin = rolesFresh && adminRoles.some(role => current.payload.roles.includes(role));
      // Existing knowledge access may have used a shared role mapping. Such a
      // mapping cannot distinguish platform administrators and must not acquire
      // access to usage statistics when this capability is introduced.
      const platformRole = this.config.platformAdminRole;
      const analytics = rolesFresh && Boolean(platformRole && platformRole !== this.config.adminRole && current.payload.roles.includes(platformRole));
      // A page loads many authenticated chunks concurrently. Keep fresh checks
      // read-only; a retry after a competing touch sees the committed timestamp.
      // Rounding activity down can expire idle sessions up to one minute early,
      // but never extends their idle or absolute authorization window.
      const touchInterval = Math.min(60000, this.duration(this.config.sessionIdleMs, HOUR) / 2);
      if (this.now() - session.payload.lastUsedAt >= touchInterval) {
        session.payload.lastUsedAt = this.now(); await this.save(tx, session);
      }
      return this.principal(current, id, "web", Math.min(session.expiresAt, current.expiresAt), session.payload.csrfToken, [
        ...(admin ? ["knowledge:manage" as const] : []),
        ...(analytics ? ["analytics:summary" as const, "feedback:manage" as const] : []),
      ]);
    });
  }
  private principal(grant: AccessRecord<"grant">, credentialId: string, channel: "web" | "cli" | "mcp", expiresAt: number, csrfToken?: string, adminCapabilities: readonly Capability[] = []): Principal {
    const employeeNo = grant.payload.employeeNo ?? (accessAuthority(this.config) !== "portal" ? grant.payload.account : undefined);
    return { userId: grant.payload.userId, account: grant.payload.account, displayName: employeeDisplayName(grant.payload.displayName, grant.payload.account),
      ...(channel === "web" && grant.payload.organization ? { organization: grant.payload.organization } : {}),
      ...(channel === "web" && employeeNo ? { employeeNo } : {}),
      grantId: grant.id, credentialId, channel, capabilities: channel === "web" ? [...EMPLOYEE_CAPABILITIES, ...adminCapabilities] : [SCOPE], csrfToken, expiresAt };
  }
  async clientPrincipal(token: string, channel: "cli" | "mcp" = "cli"): Promise<Principal> {
    this.secret(token); const id = key("access", token);
    const { authority: snapshot } = await this.store.transaction(tx => this.clientAccess(tx, id));
    await this.renewToolAuthority(snapshot);
    return this.store.transaction(async tx => {
      const { access, client, authority } = await this.clientAccess(tx, id);
      this.requireFreshToolAuthority(authority);
      client.payload.lastUsedAt = this.now();
      await this.save(tx, client);
      const expiresAt = Math.min(access.expiresAt, client.expiresAt, authority.expiresAt);
      if (authority.kind === "wecomAutoSession") {
        const { userId, memberId, displayName } = authority.payload;
        return { kind: "dealer", userId, account: memberId, displayName, grantId: authority.id, credentialId: client.id, channel, capabilities: [SCOPE], expiresAt };
      }
      return this.principal(authority, client.id, channel, expiresAt);
    });
  }
  private async authorizeWeb(tx: AccessTransaction, principal: Principal) {
    if (principal.channel !== "web" || principal.kind === "guest" || principal.kind === "dealer") {
      throw new AccessError("Web employee authorization required", 403);
    }
    const session = await tx.get("session", principal.credentialId);
    if (!session || !this.sessionValid(session) || session.payload.grantId !== principal.grantId || session.subjectId !== principal.account) throw new AccessError("Web session expired", 401);
    const grant = await this.activeGrant(tx, principal.grantId);
    if (grant.payload.userId !== principal.userId || grant.payload.account !== principal.account) throw new AccessError("Employee authorization mismatch", 401);
    this.requirePortalRolesFresh(grant);
    return session;
  }
  private async webToolParent(tx: AccessTransaction, principal: Principal): Promise<ToolParent> {
    if (principal.kind === "dealer") {
      const session = await this.dealerAccess().authorizeToolFromWeb(tx, principal);
      return { subjectId: session.subjectId, sessionId: session.id, grantId: session.id, ownerKind: "dealer" };
    }
    const session = await this.authorizeWeb(tx, principal);
    return { subjectId: session.subjectId, sessionId: session.id, grantId: session.payload.grantId, ownerKind: "employee" };
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
    return this.store.transaction(async tx => {
      const owner = await this.webToolParent(tx, principal);
      const clients = await tx.find("client", { subjectId: owner.subjectId, expiresAfter: this.now(), activeOnly: true });
      const items: ClientView[] = [];
      for (const client of clients) {
        if (!this.ownsClient(owner, client)) continue;
        try {
          const authority = await this.toolAuthority(tx, { ...client.payload, subjectId: client.subjectId });
          items.push({
            id: client.id, name: client.payload.name, createdAt: client.createdAt, lastUsedAt: client.payload.lastUsedAt,
            expiresAt: Math.min(client.expiresAt, authority.expiresAt),
          });
        } catch (error) {
          if (!permanent(error)) throw error;
        }
      }
      return items;
    });
  }
  async revokeClient(principal: Principal, id: string): Promise<void> {
    await this.store.transaction(async tx => {
      const client = await tx.get("client", id);
      const denied = new AccessError("Client ownership required", 403);
      if (!client) throw denied;
      if (principal.channel === "web") {
        if (!this.ownsClient(await this.webToolParent(tx, principal), client)) throw denied;
      } else {
        if (principal.credentialId !== id || principal.grantId !== client.payload.grantId ||
          (principal.kind ?? "employee") !== (client.payload.ownerKind ?? "employee")) throw denied;
        const authority = await this.toolAuthority(tx, { ...client.payload, subjectId: client.subjectId });
        if (authority.payload.userId !== principal.userId) throw denied;
      }
      client.payload.active = false;
      await this.save(tx, client);
      await this.audit(tx, "client-revoke", client.subjectId, id);
    });
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
    return take(await this.store.transaction(async (tx) => { await this.webToolParent(tx, principal); if (!await this.rate(tx, "device-guess", rateKey, 20, 60000)) return new OAuthError("slow_down", 429); const device = await this.lookupDevice(tx, userCode); if (!device || device.payload.status !== "pending") return new AccessError("Device request is unavailable", 400); return { userCode, clientName: device.payload.name, scope: SCOPE as "knowledge:read", expiresAt: device.expiresAt }; }));
  }
  async decideDevice(principal: Principal, userCode: string, approve: boolean, rateKey: string): Promise<void> {
    take(await this.store.transaction(async (tx) => {
      const owner = await this.webToolParent(tx, principal);
      if (!await this.rate(tx, "device-guess", rateKey, 20, 60000)) return new OAuthError("slow_down", 429);
      const device = await this.lookupDevice(tx, userCode);
      if (!device || device.payload.status !== "pending") return new AccessError("Device request is unavailable", 400);
      device.payload.status = approve ? "approved" : "denied";
      device.payload.approvedSessionId = owner.sessionId;
      device.payload.grantId = owner.grantId;
      device.payload.ownerKind = owner.ownerKind;
      device.parentId = owner.sessionId;
      device.subjectId = owner.subjectId;
      await this.save(tx, device);
      await this.audit(tx, approve ? "device-approve" : "device-deny", owner.subjectId, device.id);
    }));
  }
  private deviceParent(device: AccessRecord<"device">): ToolParent {
    const { approvedSessionId, grantId, ownerKind } = device.payload;
    if (!approvedSessionId || !grantId) throw new OAuthError("invalid_grant");
    return { sessionId: approvedSessionId, grantId, ownerKind, subjectId: device.subjectId };
  }
  async exchangeDevice(deviceCode: string, clientId: string): Promise<TokenReply> {
    this.validClient(clientId); if (!deviceCode || deviceCode.length > 8192) throw new OAuthError("invalid_grant");
    const id = key("device", deviceCode);
    const snapshot = await this.store.transaction(async (tx) => {
      const device = await tx.get("device", id);
      if (!device || expired(device, this.now()) || device.payload.status !== "approved") return null;
      const parent = this.deviceParent(device);
      try { return await this.toolAuthority(tx, parent); }
      catch (error) { throw toolOAuthError(error); }
    });
    if (snapshot) {
      try { await this.renewToolAuthority(snapshot); }
      catch (error) { throw toolOAuthError(error); }
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
      const parent = this.deviceParent(device);
      let authority: ToolAuthority;
      try {
        authority = await this.toolAuthority(tx, parent);
        this.requireFreshToolAuthority(authority);
      } catch (error) { return toolOAuthError(error); }
      const expiresAt = Math.min(now + this.duration(this.config.clientMs, 8 * HOUR), authority.expiresAt);
      const clients = await tx.find("client", { subjectId: parent.subjectId, expiresAfter: now, activeOnly: true });
      if (clients.filter(client => this.ownsClient(parent, client)).length >= 50) return new OAuthError("access_denied");
      const client = this.record("client", clientRecordId, parent.subjectId, parent.grantId, {
        grantId: parent.grantId, sessionId: parent.sessionId, ownerKind: parent.ownerKind ?? "employee",
        name: device.payload.name, active: true, currentRefreshHash: hashToken(refreshToken), lastUsedAt: now,
      }, expiresAt);
      device.payload.status = "exchanged";
      await this.save(tx, device);
      await tx.put(client);
      const reply = await this.issueTokens(tx, client, accessToken, refreshToken);
      await this.audit(tx, "client-grant", client.subjectId, client.id);
      return reply;
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
    const readRefresh = async (tx: AccessTransaction) => {
      const refresh = await tx.get("refresh", id);
      if (!refresh || expired(refresh, this.now())) return new OAuthError("invalid_grant");
      let authorized: Awaited<ReturnType<AccessService["activeClient"]>>;
      try { authorized = await this.activeClient(tx, refresh.payload.clientId); }
      catch (error) { return toolOAuthError(error); }
      const { client } = authorized;
      if (refresh.payload.used || client.payload.currentRefreshHash !== hashToken(refreshToken)) {
        client.payload.active = false;
        await this.save(tx, client);
        await this.audit(tx, "refresh-replay", client.subjectId, client.id);
        return new OAuthError("invalid_grant");
      }
      return { refresh, ...authorized };
    };
    const { authority: snapshot } = take(await this.store.transaction(readRefresh));
    try { await this.renewToolAuthority(snapshot); }
    catch (error) { throw toolOAuthError(error); }
    const accessToken = randomToken(), nextRefresh = randomToken();
    return take(await this.store.transaction(async tx => {
      const current = await readRefresh(tx);
      if (current instanceof OAuthError) return current;
      const { refresh, client, authority } = current;
      try { this.requireFreshToolAuthority(authority); }
      catch (error) { return toolOAuthError(error); }
      client.expiresAt = Math.min(client.expiresAt, authority.expiresAt);
      client.payload.currentRefreshHash = hashToken(nextRefresh);
      client.payload.lastUsedAt = this.now();
      refresh.payload.used = true;
      await this.save(tx, refresh);
      await this.save(tx, client);
      return this.issueTokens(tx, client, accessToken, nextRefresh);
    }));
  }
}
