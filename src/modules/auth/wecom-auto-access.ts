import { randomBytes, randomUUID } from "node:crypto";
import { equalSecret, hashToken, randomToken, safeReturnTo } from "./access-crypto";
import type { AccessRecord, AccessStore, AccessTransaction } from "./access-store";
import { AccessError, type Principal } from "./access-types";
import { classifyAccessPath, isEmployeePage, normalizeAccessPath } from "./page-access";
import type { WecomAutoEntry, WecomAutoMember, WecomAutoProvider } from "./wecom-auto-client";
import { WECOM_AUTO_ROUTES, type WecomAutoConfig } from "./wecom-auto-config";

type MemberSession = AccessRecord<"wecomAutoSession">;
const CAPABILITIES = ["content:read", "knowledge:read", "hermit:chat", "hermit:attachment:self", "auth:client:self"] as const;
const MINUTE = 60_000;
const LOGIN_ERROR = "企微登录已失效，请重新登录灯塔。";

export function isWecomAutoSessionToken(token: string): boolean {
  return /^dealer_[a-zA-Z0-9_-]{43}$/.test(token);
}

function dealerReturnTo(value: string | undefined): string {
  const target = safeReturnTo(value);
  const pathname = target.split(/[?#]/, 1)[0];
  const path = normalizeAccessPath(pathname);
  return path && !isEmployeePage(path) && classifyAccessPath(pathname) === "page" ? target : "/";
}

/** Both dealer entry points share the same identity and permission policy. */
export class WecomAutoAccessService {
  constructor(
    private readonly config: WecomAutoConfig,
    private readonly upstream: WecomAutoProvider,
    private readonly store: AccessStore,
    private readonly now: () => number = Date.now,
  ) {}

  private id(kind: "wecomAutoLogin" | "wecomAutoSession", value: string): string {
    return `${kind}:${hashToken(`${this.config.namespace}:${value}`)}`;
  }

  private subject(userId: string): string {
    return hashToken(`${this.config.namespace}:${userId}`);
  }

  async startLogin(entry: WecomAutoEntry, returnTo?: string) {
    if (!this.config.entries[entry]) throw new AccessError("此环境未启用该企微登录入口。", 401);
    // Enterprise WeChat requires an alphanumeric OAuth state.
    const state = randomBytes(32).toString("hex");
    const cookie = randomToken();
    const now = this.now();
    const window = Math.floor(now / MINUTE);
    const bucketId = `bucket:${hashToken(`${this.config.namespace}:login:${window}`)}`;
    const callbackUrl = new URL(WECOM_AUTO_ROUTES[entry].callback, this.config.origin).href;
    const redirectUrl = this.upstream.authorizationUrl(callbackUrl, state, entry);
    await this.store.transaction(async tx => {
      const bucket = await tx.get("bucket", bucketId);
      const count = bucket?.payload.count ?? 0;
      if (count >= 120) throw new AccessError("企微登录请求过于频繁，请稍后重试。", 429);
      await tx.put({
        kind: "bucket", id: bucketId, subjectId: this.config.namespace, parentId: null,
        payload: { count: count + 1 }, expiresAt: (window + 2) * MINUTE,
        createdAt: bucket?.createdAt ?? now, updatedAt: now,
      });
      await tx.put({
        kind: "wecomAutoLogin", id: this.id("wecomAutoLogin", state), subjectId: this.config.namespace, parentId: null,
        payload: { verifierHash: hashToken(cookie), returnTo: dealerReturnTo(returnTo), consumed: false, entry },
        expiresAt: now + this.config.transactionMs, createdAt: now, updatedAt: now,
      });
    });
    return { cookie, redirectUrl };
  }

  async callback(entry: WecomAutoEntry, input: { state: string; code: string; cookie?: string; previousSession?: string }) {
    if (!this.config.entries[entry] || !/^[a-f0-9]{64}$/.test(input.state)
      || !input.cookie || !/^[a-zA-Z0-9_-]{43}$/.test(input.cookie)) {
      throw new AccessError(LOGIN_ERROR, 401);
    }
    const id = this.id("wecomAutoLogin", input.state);
    const verifier = hashToken(input.cookie);
    const transaction = await this.store.transaction(async tx => {
      const row = await tx.get("wecomAutoLogin", id);
      const now = this.now();
      if (!row || row.expiresAt <= now || row.payload.consumed || (row.payload.entry ?? "workbench") !== entry
        || !equalSecret(row.payload.verifierHash, verifier)) {
        throw new AccessError(LOGIN_ERROR, 401);
      }
      row.payload.consumed = true;
      row.updatedAt = now;
      await tx.put(row);
      return row;
    });

    const member = await this.upstream.authenticate(input.code);
    const sessionToken = `dealer_${randomToken()}`;
    const csrfToken = randomToken();
    await this.store.transaction(async tx => {
      const now = this.now();
      if (transaction.expiresAt <= now) throw new AccessError(LOGIN_ERROR, 401);
      const userId = await tx.ensureDealer(this.config.provider, member.userId, member.displayName);
      const subjectId = this.subject(userId);
      // A newly verified login replaces the browser's previous dealer session.
      if (input.previousSession && isWecomAutoSessionToken(input.previousSession)) {
        const prior = await tx.get("wecomAutoSession", this.id("wecomAutoSession", input.previousSession));
        if (prior?.payload.active) await this.endSession(tx, prior, now);
      }
      const active = await tx.find("wecomAutoSession", { subjectId, activeOnly: true, expiresAfter: now });
      if (active.filter(row => now - row.payload.lastUsedAt < this.config.sessionIdleMs).length >= 50) {
        throw new AccessError("有效登录会话过多，请退出其他会话后重试。", 429);
      }
      const session: MemberSession = {
        kind: "wecomAutoSession", id: this.id("wecomAutoSession", sessionToken), subjectId, parentId: null,
        payload: { userId, memberId: member.userId, displayName: member.displayName, csrfToken, active: true, verifiedAt: now, lastUsedAt: now, entry },
        expiresAt: now + this.config.sessionAbsoluteMs, createdAt: now, updatedAt: now,
      };
      await tx.put(session);
      await this.audit(tx, entry === "scan" ? "wecom-auto-scan-login" : "wecom-auto-login", userId, session.id, now);
    });
    return { sessionToken, returnTo: dealerReturnTo(transaction.payload.returnTo) };
  }

  private async activeSession(tx: AccessTransaction, id: string, use: "web" | "tool" = "web"): Promise<MemberSession> {
    const row = await tx.get("wecomAutoSession", id);
    const now = this.now();
    if (!row?.payload.active || !this.config.entries[row.payload.entry ?? "workbench"]
      || row.subjectId !== this.subject(row.payload.userId)
      || row.expiresAt <= now
      || (use === "web" && now - row.payload.lastUsedAt >= this.config.sessionIdleMs)
      || !await tx.dealerActive(this.config.provider, row.payload.memberId, row.payload.userId)) {
      throw new AccessError(LOGIN_ERROR, 401);
    }
    return row;
  }

  private identityIsFresh(row: MemberSession) {
    return this.now() - row.payload.verifiedAt < this.config.identityFreshMs;
  }

  requireFreshIdentity(row: MemberSession) {
    if (!this.identityIsFresh(row)) throw new AccessError("企微身份暂时无法复验。", 503);
  }

  private async principal(tx: AccessTransaction, row: MemberSession): Promise<Principal> {
    this.requireFreshIdentity(row);
    const now = this.now();
    // Browser assets often arrive together. Only persist idle activity when it advances.
    if (now - row.payload.lastUsedAt >= 15_000) {
      row.payload.lastUsedAt = now;
      row.updatedAt = now;
      await tx.put(row);
    }
    return {
      kind: "dealer", channel: "web", userId: row.payload.userId, account: row.payload.memberId, displayName: row.payload.displayName,
      grantId: row.id, credentialId: row.id, capabilities: CAPABILITIES, csrfToken: row.payload.csrfToken, expiresAt: row.expiresAt,
    };
  }

  async webPrincipal(token: string): Promise<Principal> {
    if (!isWecomAutoSessionToken(token)) throw new AccessError(LOGIN_ERROR, 401);
    const id = this.id("wecomAutoSession", token);
    const initial = await this.store.transaction(async tx => {
      const row = await this.activeSession(tx, id);
      return this.identityIsFresh(row) ? this.principal(tx, row) : row;
    });
    if (!("payload" in initial)) return initial;

    const member = await this.verifyMember(initial), verifiedAt = this.now();
    return this.store.transaction(async tx => {
      const row = await this.saveVerifiedSession(tx, initial, member, verifiedAt, "web");
      return this.principal(tx, row);
    });
  }

  async authorizeToolFromWeb(tx: AccessTransaction, principal: Principal): Promise<MemberSession> {
    if (principal.kind !== "dealer" || principal.channel !== "web") throw new AccessError(LOGIN_ERROR, 401);
    const row = await this.activeSession(tx, principal.credentialId);
    if (row.id !== principal.grantId || row.payload.userId !== principal.userId || row.payload.memberId !== principal.account) {
      throw new AccessError(LOGIN_ERROR, 401);
    }
    this.requireFreshIdentity(row);
    return row;
  }

  // Like employee grants, tools use the original login's absolute lifetime.
  // Tool activity never extends the browser's idle timeout.
  toolSession(tx: AccessTransaction, id: string): Promise<MemberSession> {
    return this.activeSession(tx, id, "tool");
  }

  async renewToolSession(initial: MemberSession): Promise<void> {
    if (this.identityIsFresh(initial)) return;
    const member = await this.verifyMember(initial), verifiedAt = this.now();
    await this.store.transaction(tx => this.saveVerifiedSession(tx, initial, member, verifiedAt, "tool"));
  }

  private async verifyMember(initial: MemberSession): Promise<WecomAutoMember> {
    try {
      const member = await this.upstream.readMember(initial.payload.memberId);
      if (member.userId !== initial.payload.memberId) throw new AccessError(LOGIN_ERROR, 401);
      return member;
    } catch (error) {
      if (!(error instanceof AccessError && (error.status === 401 || error.status === 403))) throw error;
      await this.store.transaction(async tx => {
        const row = await tx.get("wecomAutoSession", initial.id);
        if (row?.payload.active) await this.endSession(tx, row, this.now());
      });
      throw new AccessError(LOGIN_ERROR, 401);
    }
  }

  private async saveVerifiedSession(tx: AccessTransaction, initial: MemberSession, member: WecomAutoMember, verifiedAt: number, use: "web" | "tool") {
    const row = await this.activeSession(tx, initial.id, use);
    if (row.payload.verifiedAt === initial.payload.verifiedAt) {
      row.payload.verifiedAt = verifiedAt;
      row.payload.displayName = member.displayName;
      if (use === "web") row.payload.lastUsedAt = verifiedAt;
      row.updatedAt = verifiedAt;
      await tx.put(row);
    }
    return row;
  }

  async logout(principal: Principal, all: boolean): Promise<void> {
    if (principal.kind !== "dealer" || principal.channel !== "web") throw new AccessError(LOGIN_ERROR, 401);
    await this.store.transaction(async tx => {
      const session = await this.activeSession(tx, principal.credentialId);
      const now = this.now();
      if (session.payload.userId !== principal.userId || session.subjectId !== this.subject(principal.userId)) {
        throw new AccessError(LOGIN_ERROR, 401);
      }
      const sessions = all ? await tx.find("wecomAutoSession", { subjectId: session.subjectId, expiresAfter: now, activeOnly: true }) : [session];
      for (const row of sessions) await this.endSession(tx, row, now);
      await this.audit(tx, all ? "wecom-auto-logout-all" : "wecom-auto-logout", principal.userId, session.id, now);
    });
  }

  private async endSession(tx: AccessTransaction, row: MemberSession, now: number) {
    row.payload.active = false;
    row.updatedAt = now;
    await tx.put(row);
  }

  private async audit(tx: AccessTransaction, action: string, userId: string, targetId: string, now: number) {
    await tx.put({
      kind: "audit", id: `audit:${randomUUID()}`, subjectId: userId, parentId: targetId,
      payload: { action, account: userId, targetId }, createdAt: now, updatedAt: now, expiresAt: now + 90 * 24 * 60 * MINUTE,
    });
  }
}
