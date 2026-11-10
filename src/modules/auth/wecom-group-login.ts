import { randomBytes } from "node:crypto";
import { equalSecret, hashToken, randomToken, safeReturnTo } from "./access-crypto";
import type { AccessStore } from "./access-store";
import { AccessError } from "./access-types";
import { classifyAccessPath, isEmployeePage } from "./page-access";
import { WECOM_GROUP_CALLBACK, WECOM_GROUP_MARKER, type WecomGroupConfig } from "./wecom-group-config";
import type { WecomTicketClient, WecomTicketIdentity } from "./wecom-ticket-client";

const MINUTE = 60_000;
const CALLBACK_PARAMS = new Set([WECOM_GROUP_MARKER, "userid", "token", "appid", "redirect"]);
const invalidCallback = () => new AccessError("集团企微登录已失效，请从工作台重新打开灯塔。", 401);

export type VerifiedWecomGroupLogin = {
  identity: WecomTicketIdentity;
  verifiedAt: number;
  returnTo: string;
  transactionExpiresAt: number;
  namespace: string;
};

function workbenchReturnTo(value: string | undefined, origin: string): string {
  const target = new URL(safeReturnTo(value), origin);
  if (classifyAccessPath(target.pathname) !== "page" || isEmployeePage(target.pathname)) return "/";
  for (const name of [...CALLBACK_PARAMS, "code", "state"]) target.searchParams.delete(name);
  return target.pathname + target.search;
}

/** Proves the browser transaction and exchanges a ticket exactly once. */
export class WecomGroupLogin {
  constructor(
    private readonly config: WecomGroupConfig,
    private readonly client: Pick<WecomTicketClient, "verify">,
    private readonly store: AccessStore,
    private readonly now: () => number = Date.now,
  ) {}

  private key(kind: "wecomGroupLogin" | "wecomGroupTicket" | "bucket", value: string): string {
    return `${kind}:${hashToken(`${this.config.namespace}:${value}`)}`;
  }

  async startLogin(returnTo?: string): Promise<{ cookie: string; redirectUrl: string }> {
    // Match the 128-bit hex marker exercised in the standalone H5 probe.
    const marker = randomBytes(16).toString("hex");
    const cookie = randomToken();
    const backUrl = new URL(WECOM_GROUP_CALLBACK, this.config.origin);
    backUrl.searchParams.set(WECOM_GROUP_MARKER, marker);
    const middle = new URL("/admin/app/auth", this.config.baseUrl);
    middle.searchParams.set("backurl", backUrl.href);
    const oauth = new URL("https://open.weixin.qq.com/connect/oauth2/authorize#wechat_redirect");
    oauth.search = new URLSearchParams({
      appid: this.config.corpId, redirect_uri: middle.href, response_type: "code",
      scope: "snsapi_userinfo", state: this.config.appId,
    }).toString();

    await this.store.transaction(async tx => {
      const now = this.now();
      const window = Math.floor(now / MINUTE);
      const bucketId = this.key("bucket", `group-login:${window}`);
      const bucket = await tx.get("bucket", bucketId);
      const count = bucket?.payload.count ?? 0;
      if (count >= 120) throw new AccessError("企微登录请求过于频繁，请稍后重试。", 429);
      await tx.put({
        kind: "bucket", id: bucketId, subjectId: this.config.namespace, parentId: null,
        payload: { count: count + 1 }, expiresAt: (window + 2) * MINUTE,
        createdAt: bucket?.createdAt ?? now, updatedAt: now,
      });
      await tx.put({
        kind: "wecomGroupLogin", id: this.key("wecomGroupLogin", marker), subjectId: this.config.namespace, parentId: null,
        payload: { verifierHash: hashToken(cookie), returnTo: workbenchReturnTo(returnTo, this.config.origin), consumed: false },
        expiresAt: now + this.config.transactionMs, createdAt: now, updatedAt: now,
      });
    });
    return { cookie, redirectUrl: oauth.href };
  }

  async verifyCallback(params: URLSearchParams, cookie?: string): Promise<VerifiedWecomGroupLogin> {
    const names = [...params.keys()];
    if (new Set(names).size !== names.length || names.some(name => !CALLBACK_PARAMS.has(name))) throw invalidCallback();
    const marker = params.get(WECOM_GROUP_MARKER);
    const userId = params.get("userid");
    const token = params.get("token");
    if (!marker || !/^[a-f0-9]{32}$/.test(marker) || !cookie || !/^[a-zA-Z0-9_-]{43}$/.test(cookie)
      || !userId || !/^[A-Za-z0-9._-]{1,80}$/.test(userId)
      || !token || token.length > 8192 || token.trim() !== token || /[\u0000-\u001f\u007f-\u009f]/.test(token)
      || params.get("appid") !== this.config.appId) throw invalidCallback();
    // The provider's redirect parameter is never used for navigation. Claim both
    // the browser transaction and the ticket before making the one-use POST.
    const id = this.key("wecomGroupLogin", marker);
    const ticketId = this.key("wecomGroupTicket", token);
    const verifier = hashToken(cookie);
    const transaction = await this.store.transaction(async tx => {
      const row = await tx.get("wecomGroupLogin", id);
      const now = this.now();
      if (!row || row.expiresAt <= now || row.payload.consumed || !equalSecret(row.payload.verifierHash, verifier)) throw invalidCallback();
      const prior = await tx.get("wecomGroupTicket", ticketId);
      if (prior && prior.expiresAt > now) throw invalidCallback();
      row.payload.consumed = true;
      row.updatedAt = now;
      await tx.put(row);
      await tx.put({
        kind: "wecomGroupTicket", id: ticketId, subjectId: this.config.namespace, parentId: row.id,
        payload: { claimed: true }, expiresAt: now + 10 * MINUTE, createdAt: now, updatedAt: now,
      });
      return row;
    });

    const identity = await this.client.verify({ userId, token });
    const verifiedAt = this.now();
    if (transaction.expiresAt <= verifiedAt) throw invalidCallback();
    return { identity, verifiedAt, returnTo: transaction.payload.returnTo, transactionExpiresAt: transaction.expiresAt, namespace: this.config.namespace };
  }
}
