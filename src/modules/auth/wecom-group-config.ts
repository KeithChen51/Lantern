import { createHmac } from "node:crypto";
import { AccessError, type AccessConfig } from "./access-types";
import type { GuestAccessConfig } from "./site-access-config";
import type { WecomTicketConfig } from "./wecom-ticket-client";

export const WECOM_GROUP_START = "/auth/wecom/group/start";
export const WECOM_GROUP_CALLBACK = "/auth/wecom/group/callback";
export const WECOM_GROUP_MARKER = "lh_probe";

const GROUP_ORIGIN = "https://weixin.byd.com";

export type WecomGroupConfig = WecomTicketConfig & Readonly<{
  corpId: string;
  origin: string;
  namespace: string;
  transactionCookie: string;
  transactionMs: number;
}> & (
  { mode: "probe" } |
  { mode: "employee-pilot"; pilotAccounts: ReadonlySet<string>; sessionMs: number }
);

export function isWecomGroupSessionToken(token: string): boolean {
  return /^group_[A-Za-z0-9_-]{43}$/.test(token);
}

export function readWecomGroupConfig(site: AccessConfig | GuestAccessConfig, env: Record<string, string | undefined> = process.env): WecomGroupConfig | undefined {
  const mode = env.WECOM_GROUP_MODE;
  if (!mode || mode === "off") return undefined;
  const { WECOM_GROUP_CORP_ID: corpId, WECOM_GROUP_APP_ID: appId, WECOM_GROUP_APP_KEY: appKey } = env;
  const invalid = () => new AccessError("集团企微登录配置不可用，请联系平台维护人员。", 503);
  if ((mode !== "probe" && mode !== "employee-pilot") || site.mode !== "iam" || !site.secureCookies
    || !corpId || !/^ww[A-Za-z0-9]{16}$/.test(corpId)
    || !appId || !/^[A-Za-z0-9_.-]{1,120}$/.test(appId)
    || !appKey || !/^[\x21-\x7e]{1,8192}$/.test(appKey)) {
    throw invalid();
  }

  const accounts = mode === "employee-pilot" ? (env.WECOM_GROUP_PILOT_ACCOUNTS ?? "").split(",").map(value => value.trim()) : [];
  const pilotAccounts = new Set(accounts);
  if (mode === "employee-pilot" && (env.WECOM_GROUP_BACKURL_RESTRICTION_CONFIRMED !== "true"
    || accounts.length > 25 || accounts.length !== pilotAccounts.size || accounts.some(account => !/^[A-Za-z0-9._-]{1,80}$/.test(account)))) {
    throw invalid();
  }
  const namespace = createHmac("sha256", Buffer.from(site.encryptionKey, "base64"))
    .update(JSON.stringify(["wecom-group:v1", mode, site.origin, site.sessionCookie, corpId, appId, appKey, accounts.sort()]))
    .digest("hex");
  const common = {
    baseUrl: GROUP_ORIGIN, appId, appKey, corpId, origin: site.origin, namespace,
    transactionCookie: `__Host-lighthouse_wecom_group_${namespace.slice(0, 16)}_login`,
    transactionMs: site.transactionMs,
  };
  return mode === "probe" ? { ...common, mode } : {
    ...common, mode, pilotAccounts, sessionMs: Math.min(300_000, site.sessionAbsoluteMs, site.identityFreshMs, site.roleFreshMs),
  };
}
