import { AccessError, type AccessConfig } from "./access-types";

export function readAccessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig {
  const fail = (): never => { throw new AccessError("统一登录尚未完成配置，请联系平台维护人员。", 503); };
  const required = (name: string) => env[name]?.trim() || fail();
  const production = env.NODE_ENV === "production";
  if (required("AUTH_MODE") !== "portal") fail();
  const url = (name: string) => {
    try {
      const value = new URL(required(name));
      if (value.username || value.password || value.hash || (value.protocol !== "https:" && !(env.AUTH_ALLOW_LOCAL_HTTP === "true" && !production && value.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(value.hostname)))) fail();
      return value;
    } catch { return fail(); }
  };
  const origin = url("LIGHTHOUSE_ORIGIN");
  if (origin.pathname !== "/" || origin.search) fail();
  const api = url("PORTAL_API_BASE_URL");
  if (api.search) fail();
  const login = url("PORTAL_LOGIN_URL");
  const encryptionKey = required("AUTH_ENCRYPTION_KEY");
  if (Buffer.from(encryptionKey, "base64").length !== 32) fail();
  // This assertion can only be enabled after the platform confirms that a
  // successful identity query means a currently active internal employee.
  if (env.PORTAL_EMPLOYEE_VALIDATION_CONFIRMED !== "true") fail();
  if (production && (!env.DATABASE_URL?.startsWith("mysql://") || env.KNOWLEDGE_HUB_ENABLED !== "true" || env.KNOWLEDGE_HUB_DRIVER !== "mysql")) fail();
  const secureCookies = origin.protocol === "https:";
  const prefix = secureCookies ? "__Host-lighthouse_" : "lighthouse_dev_";
  const parameter = (name: string, fallback: string) => {
    const value = env[name] || fallback;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(value)) fail();
    return value;
  };
  const callbackParam = parameter("PORTAL_CALLBACK_PARAM", "redirectUrl");
  const stateParam = parameter("PORTAL_STATE_PARAM", "state");
  const tokenParam = parameter("PORTAL_TOKEN_PARAM", "token");
  if (new Set([callbackParam, stateParam, tokenParam]).size !== 3) fail();
  return {
    origin: origin.origin, portalBaseUrl: api.toString().replace(/\/$/, ""), portalLoginUrl: login.toString(),
    appCode: required("PORTAL_APP_CODE"), appSecret: required("PORTAL_APP_SECRET"),
    adminRole: required("PORTAL_KNOWLEDGE_ADMIN_ROLE"), encryptionKey,
    callbackParam, stateParam, tokenParam,
    allowLegacyConfirmation: env.PORTAL_ALLOW_LEGACY_CONFIRMATION === "true",
    secureCookies, sessionCookie: `${prefix}session`, transactionCookie: `${prefix}login`, pendingCookie: `${prefix}pending`,
    sessionAbsoluteMs: 8 * 3600_000, sessionIdleMs: 3600_000, identityFreshMs: 300_000,
    roleFreshMs: 300_000, adminWriteFreshMs: 60_000, deviceMs: 300_000,
    accessMs: 300_000, clientMs: 8 * 3600_000, transactionMs: 300_000,
  };
}
