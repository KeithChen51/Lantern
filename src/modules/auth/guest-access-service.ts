import { randomUUID } from "node:crypto";
import { hashToken, randomToken } from "./access-crypto";
import { AccessError, type Principal } from "./access-types";
import type { AccessStore, AccessTransaction } from "./access-store";
import type { GuestAccessConfig } from "./site-access-config";

const GUEST_CAPABILITIES = ["content:read", "knowledge:read", "hermit:chat", "hermit:attachment:self"] as const;
const MINUTE = 60_000;

/** Opaque anonymous credentials have no User/employee record or upstream identity. */
export class GuestAccessService {
  constructor(private readonly config: GuestAccessConfig, private readonly store: AccessStore, private readonly now: () => number = Date.now) {}
  private id(token: string) { return `guest:${hashToken(`${this.config.namespace}:${token}`)}`; }
  private async rate(tx: AccessTransaction, action: string, subject: string, limit: number) {
    const now = this.now(), window = Math.floor(now / MINUTE);
    const id = `bucket:${hashToken(`${this.config.namespace}:${action}:${subject}:${window}`)}`;
    const row = await tx.get("bucket", id);
    if (row && row.payload.count >= limit) throw new AccessError("访客请求过于频繁，请稍后重试。", 429);
    await tx.put({ id, kind: "bucket", subjectId: this.config.namespace, parentId: null, payload: { count: (row?.payload.count ?? 0) + 1 }, expiresAt: (window + 2) * MINUTE, createdAt: row?.createdAt ?? now, updatedAt: now });
  }
  async issue(): Promise<{ token: string; principal: Principal }> {
    const token = randomToken(), id = this.id(token), now = this.now();
    const payload = { namespace: this.config.namespace, userId: `guest:${randomUUID()}`, grantId: `guest-grant:${randomUUID()}`, csrfToken: randomToken() };
    const expiresAt = now + Math.min(this.config.sessionAbsoluteMs, 8 * 3600_000);
    await this.store.transaction(async tx => {
      await this.rate(tx, "issue", "deployment", 120);
      await tx.put({ id, kind: "guest", subjectId: payload.userId, parentId: null, payload, expiresAt, createdAt: now, updatedAt: now });
    });
    return { token, principal: this.principal(id, payload, expiresAt) };
  }
  private principal(id: string, payload: { userId: string; grantId: string; csrfToken: string }, expiresAt: number): Principal {
    return { kind: "guest", userId: payload.userId, account: "", displayName: "访客", grantId: payload.grantId, credentialId: id, channel: "web", capabilities: GUEST_CAPABILITIES, csrfToken: payload.csrfToken, expiresAt };
  }
  async webPrincipal(token: string): Promise<Principal> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AccessError("访客会话已失效，请刷新页面。", 401);
    const row = await this.store.transaction(tx => tx.get("guest", this.id(token)));
    if (!row || row.payload.namespace !== this.config.namespace || row.expiresAt <= this.now()) throw new AccessError("访客会话已失效，请刷新页面。", 401);
    return this.principal(row.id, row.payload, row.expiresAt);
  }
  async enforceRequestLimit(principal: Principal, action: "chat" | "attachment"): Promise<void> {
    if (principal.kind !== "guest") return;
    await this.store.transaction(async tx => {
      const row = await tx.get("guest", principal.credentialId);
      if (!row || row.payload.namespace !== this.config.namespace || row.payload.userId !== principal.userId || row.payload.grantId !== principal.grantId || row.expiresAt <= this.now()) throw new AccessError("访客会话已失效，请刷新页面。", 401);
      await this.rate(tx, action, principal.credentialId, action === "chat" ? 20 : 10);
      await this.rate(tx, action, "deployment", action === "chat" ? 300 : 120);
    });
  }
}
