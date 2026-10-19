import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { readAccessConfig } from "./access-config";
import { AccessError, type AccessConfig } from "./access-types";
import { strictBase64 } from "./iam-sync-config";

export type GuestAccessConfig = {
  mode: "guest"; origin: string; deployment: "production" | "test" | "development";
  encryptionKey: string; namespace: string; sessionCookie: string;
  secureCookies: boolean; sessionAbsoluteMs: number;
};

/** Site access is explicitly selected. Employee configuration never falls back to guest. */
export function readSiteAccessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig | GuestAccessConfig {
  if (env.AUTH_MODE !== "guest") return readAccessConfig(env);
  const fail = (): never => { throw new AccessError("访客访问尚未完成配置，请联系平台维护人员。", 503); };
  try {
    const production = env.NODE_ENV === "production";
    const deployment = env.LIGHTHOUSE_DEPLOYMENT_ENV ?? (production ? "production" : "development");
    if (!["production", "test", "development"].includes(deployment) || (production && deployment === "development")) fail();
    const localHttp = env.AUTH_ALLOW_LOCAL_HTTP === "true" && !production && deployment === "development";
    if (env.AUTH_ALLOW_LOCAL_HTTP === "true" && !localHttp) fail();
    const origin = new URL(env.LIGHTHOUSE_ORIGIN ?? "");
    const privateIpv4 = () => {
      const octets = origin.hostname.split(".").map(Number);
      return isIP(origin.hostname) === 4 && (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
    };
    const testOrigin = env.AUTH_TEST_HTTP_ORIGIN;
    if (testOrigin && (deployment !== "test" || testOrigin !== origin.origin || origin.protocol !== "http:")) fail();
    const testHttp = deployment === "test" && origin.protocol === "http:" && privateIpv4() && testOrigin === origin.origin && env.LIGHTHOUSE_ORIGIN === origin.origin;
    const local = localHttp && origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.username || origin.password || origin.hash || origin.search || origin.pathname !== "/" || (origin.protocol !== "https:" && !testHttp && !local)) fail();
    const encryptionKey = env.AUTH_ENCRYPTION_KEY ?? "";
    if (strictBase64(encryptionKey, 32).length !== 32) fail();
    if (production && (!env.DATABASE_URL?.startsWith("mysql://") || env.KNOWLEDGE_HUB_ENABLED !== "true" || env.KNOWLEDGE_HUB_DRIVER !== "mysql")) fail();
    // Include the origin, deployment AND key in the server-side lookup namespace.
    // Renaming/copied cookies cannot cross deployments even with a shared database.
    const namespace = createHmac("sha256", Buffer.from(encryptionKey, "base64")).update(`lighthouse:guest:v1:${deployment}:${origin.origin}`).digest("hex");
    const secureCookies = origin.protocol === "https:";
    return { mode: "guest", origin: origin.origin, deployment: deployment as GuestAccessConfig["deployment"], encryptionKey, namespace,
      sessionCookie: `${secureCookies ? "__Host-" : ""}lighthouse_guest_${namespace.slice(0, 16)}_session`, secureCookies, sessionAbsoluteMs: 8 * 3600_000 };
  } catch { return fail(); }
}
