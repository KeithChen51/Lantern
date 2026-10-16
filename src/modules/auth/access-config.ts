import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { AccessError, type AccessConfig } from "./access-types";
import { readIamLoginConfig } from "./iam-config";
import { readIamSyncConfig } from "./iam-sync-config";

export function readAccessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig {
  const fail = (): never => { throw new AccessError("统一登录尚未完成配置，请联系平台维护人员。", 503); };
  const required = (name: string) => env[name]?.trim() || fail();
  const production = env.NODE_ENV === "production";
  // Deployment identity is separate from Next's build/runtime mode. An HTTP
  // intranet test deployment still runs the production build and DB checks.
  const deployment = env.LIGHTHOUSE_DEPLOYMENT_ENV ?? (production ? "production" : "development");
  if (!["production", "test", "development"].includes(deployment) || (production && deployment === "development")) fail();
  const testHttpOrigin = env.AUTH_TEST_HTTP_ORIGIN;
  if (testHttpOrigin !== undefined && testHttpOrigin !== "" && deployment !== "test") fail();
  const localHttp = env.AUTH_ALLOW_LOCAL_HTTP === "true" && !production && deployment === "development";
  if (env.AUTH_ALLOW_LOCAL_HTTP === "true" && !localHttp) fail();
  const mode = required("AUTH_MODE");
  if (mode !== "portal" && mode !== "iam") return fail();
  const privateIpv4 = (hostname: string) => {
    const octets = hostname.split(".").map(Number);
    return isIP(hostname) === 4 && (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
  };
  const apiHttpOrigin = mode === "portal" ? env.PORTAL_API_HTTP_ORIGIN : undefined;
  if (apiHttpOrigin) {
    try {
      const allowed = new URL(apiHttpOrigin);
      if (allowed.protocol !== "http:" || !privateIpv4(allowed.hostname) || apiHttpOrigin !== allowed.origin) fail();
    } catch { fail(); }
  }
  const url = (name: string, allowTestHttp = false) => {
    try {
      const value = new URL(required(name));
      const testException = allowTestHttp && deployment === "test" && value.protocol === "http:" && privateIpv4(value.hostname) && testHttpOrigin === value.origin && env[name] === value.origin;
      const apiException = name === "PORTAL_API_BASE_URL" && value.protocol === "http:" && apiHttpOrigin === value.origin && (env[name] === value.origin || env[name]?.startsWith(`${value.origin}/`));
      const localException = localHttp && value.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(value.hostname);
      if (value.username || value.password || value.hash || (value.protocol !== "https:" && !testException && !localException && !apiException)) fail();
      return value;
    } catch { return fail(); }
  };
  const origin = url("LIGHTHOUSE_ORIGIN", true);
  if (origin.pathname !== "/" || origin.search) fail();
  // Reject stale or mismatched exceptions even if the application uses HTTPS.
  if (testHttpOrigin && (origin.protocol !== "http:" || testHttpOrigin !== origin.origin)) fail();
  const iam = mode === "iam" ? readIamLoginConfig(env) : undefined;
  if (mode === "iam") readIamSyncConfig(env);
  const api = iam ? new URL(iam.baseUrl) : url("PORTAL_API_BASE_URL");
  if (api.search) fail();
  if (apiHttpOrigin && (api.protocol !== "http:" || apiHttpOrigin !== api.origin)) fail();
  const login = iam ? new URL("/idp/authCenter/authenticate", iam.baseUrl) : url("PORTAL_LOGIN_URL");
  const portalLoginMode = iam ? "callback" : env.PORTAL_LOGIN_MODE || "callback";
  if (portalLoginMode !== "card" && portalLoginMode !== "callback") return fail();
  const encryptionKey = required("AUTH_ENCRYPTION_KEY");
  if (Buffer.from(encryptionKey, "base64").length !== 32) fail();
  // This assertion can only be enabled after the platform confirms that a
  // successful identity query means a currently active internal employee.
  if (mode === "portal" && env.PORTAL_EMPLOYEE_VALIDATION_CONFIRMED !== "true") fail();
  if (production && (!env.DATABASE_URL?.startsWith("mysql://") || env.KNOWLEDGE_HUB_ENABLED !== "true" || env.KNOWLEDGE_HUB_DRIVER !== "mysql")) fail();
  const secureCookies = origin.protocol === "https:";
  // Cookies have no port isolation. Test deployments use an origin-specific
  // namespace and never share the production cookie name or __Host on HTTP.
  const testNamespace = `lighthouse_test_${createHash("sha256").update(origin.origin).digest("hex").slice(0, 16)}_`;
  const namespace = deployment === "test" ? `${secureCookies ? "__Host-" : ""}${testNamespace}` : secureCookies ? "__Host-lighthouse_" : "lighthouse_dev_";
  const prefix = `${namespace}${iam ? "iam_" : ""}`;
  const parameter = (name: string, fallback: string) => {
    const value = env[name] || fallback;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(value)) fail();
    return value;
  };
  const callbackParam = iam ? "redirect_uri" : parameter("PORTAL_CALLBACK_PARAM", "redirectUrl");
  const stateParam = iam ? "state" : parameter("PORTAL_STATE_PARAM", "state");
  const tokenParam = iam ? "code" : parameter("PORTAL_TOKEN_PARAM", "token");
  if (new Set([callbackParam, stateParam, tokenParam]).size !== 3) fail();
  return {
    mode, iam,
    origin: origin.origin, portalBaseUrl: api.toString().replace(/\/$/, ""), portalLoginUrl: login.toString(),
    appCode: iam?.clientId ?? required("PORTAL_APP_CODE"), appSecret: iam?.clientSecret ?? required("PORTAL_APP_SECRET"),
    adminRole: iam ? "lighthouse_knowledge_admin" : required("PORTAL_KNOWLEDGE_ADMIN_ROLE"), platformAdminRole: iam ? "lighthouse_admin" : env.PORTAL_PLATFORM_ADMIN_ROLE?.trim() || undefined, encryptionKey,
    portalLoginMode,
    callbackParam, stateParam, tokenParam,
    allowLegacyConfirmation: !iam && env.PORTAL_ALLOW_LEGACY_CONFIRMATION === "true",
    secureCookies, sessionCookie: `${prefix}session`, transactionCookie: `${prefix}login`, pendingCookie: `${prefix}pending`,
    sessionAbsoluteMs: 8 * 3600_000, sessionIdleMs: 3600_000, identityFreshMs: 300_000,
    roleFreshMs: 300_000, adminWriteFreshMs: 60_000, deviceMs: 300_000,
    accessMs: 300_000, clientMs: 8 * 3600_000, transactionMs: 300_000,
  };
}
