import { createHmac } from "node:crypto";
import { AccessError, type AccessConfig } from "./access-types";
import type { WecomAutoApplication, WecomAutoEntry } from "./wecom-auto-client";
import type { GuestAccessConfig } from "./site-access-config";

export const WECOM_AUTO_ROUTES = {
  workbench: { start: "/auth/wecom/auto/start", callback: "/auth/wecom/auto/callback" },
  scan: { start: "/auth/wecom/auto/scan/start", callback: "/auth/wecom/auto/scan/callback" },
} as const;

export type WecomAutoConfig = WecomAutoApplication & {
  origin: string;
  namespace: string;
  provider: string;
  entries: Record<WecomAutoEntry, boolean>;
  transactionCookie: string;
  transactionMs: number;
  sessionAbsoluteMs: number;
  sessionIdleMs: number;
  identityFreshMs: number;
};

export function readWecomAutoConfig(site: AccessConfig | GuestAccessConfig, env: NodeJS.ProcessEnv = process.env): WecomAutoConfig | undefined {
  const workbench = env.WECOM_AUTO_ENABLED || "false";
  const scan = env.WECOM_AUTO_SCAN_ENABLED || "false";
  if (workbench === "false" && scan === "false") return undefined;

  const { WECOM_AUTO_CORP_ID: corpId, WECOM_AUTO_AGENT_ID: agentId, WECOM_AUTO_SECRET: secret } = env;
  if (![workbench, scan].every(value => value === "true" || value === "false") || site.mode !== "iam" || !site.secureCookies
    || !corpId || !/^[a-zA-Z0-9_-]{1,64}$/.test(corpId)
    || !agentId || !/^[1-9][0-9]{0,9}$/.test(agentId)
    || !secret || !/^[\x21-\x7e]{1,512}$/.test(secret)) {
    throw new AccessError("汽车企微登录配置不可用，请联系平台维护人员。", 503);
  }

  const namespace = createHmac("sha256", Buffer.from(site.encryptionKey, "base64"))
    .update(JSON.stringify(["wecom-auto:v1", site.origin, site.sessionCookie, corpId, agentId]))
    .digest("hex");
  return {
    corpId, agentId, secret, origin: site.origin, namespace, provider: `wecom-auto:${corpId}`,
    entries: { workbench: workbench === "true", scan: scan === "true" },
    transactionCookie: `__Host-lighthouse_wecom_${namespace.slice(0, 16)}_login`,
    transactionMs: site.transactionMs,
    sessionAbsoluteMs: site.sessionAbsoluteMs, sessionIdleMs: site.sessionIdleMs, identityFreshMs: site.identityFreshMs,
  };
}

export function wecomAutoTransactionCookie(config: WecomAutoConfig, entry: WecomAutoEntry): string {
  return entry === "scan" ? `${config.transactionCookie}_scan` : config.transactionCookie;
}

export function isWecomAutoScanAvailable(site: AccessConfig): boolean {
  try { return readWecomAutoConfig(site)?.entries.scan === true; } catch { return false; }
}
