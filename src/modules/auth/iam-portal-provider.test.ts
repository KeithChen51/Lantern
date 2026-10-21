import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readAccessConfig } from "./access-config";
import { createAccessProvider } from "./access-provider";
import type { AccessConfig } from "./access-types";

const now = () => 1800000000000;
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test", AUTH_MODE: "iam", IAM_AUTHORIZATION_SOURCE: "portal", LIGHTHOUSE_ORIGIN: "https://lighthouse.example.invalid",
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "fixture-iam-client", IAM_CLIENT_SECRET: "synthetic-iam-secret",
  PORTAL_API_BASE_URL: "https://portal.example.invalid/api", PORTAL_APP_CODE: "fixture-portal-app", PORTAL_APP_SECRET: "synthetic-portal-secret",
};

function fixture(overrides: Record<string, unknown> = {}) {
  const config = readAccessConfig(env);
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/getToken")) {
      expect(url.origin).toBe(env.IAM_BASE_URL);
      expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
      expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ client_id: env.IAM_CLIENT_ID, client_secret: env.IAM_CLIENT_SECRET, code: "synthetic-code", grant_type: "authorization_code" });
      return Response.json({ access_token: "synthetic-iam-token", expires_in: "900" });
    }
    if (url.pathname.endsWith("/getUserInfo")) {
      expect(url.origin).toBe(env.IAM_BASE_URL);
      expect(Object.fromEntries(url.searchParams)).toEqual({ access_token: "synthetic-iam-token", client_id: env.IAM_CLIENT_ID });
      return Response.json({ loginName: "000042" });
    }
    expect(url.toString()).toBe(`${env.PORTAL_API_BASE_URL}/sso/admin/subapp/role-query`);
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    const headers = new Headers(init?.headers);
    expect(headers.get("appKey")).toBe(env.PORTAL_APP_CODE);
    expect(headers.get("timestamp")).toBe(String(now()));
    expect(headers.get("sign")).toBe(createHmac("sha256", env.PORTAL_APP_SECRET!).update(`000042.${now()}`).digest("hex"));
    expect(headers.has("token")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({ account: "000042" });
    expect(JSON.stringify({ url: url.toString(), headers: Object.fromEntries(headers), body: init?.body })).not.toMatch(/synthetic-iam-token|synthetic-iam-secret|fixture-iam-client/);
    return Response.json({ code: "000000", data: { account: "000042", appCode: env.PORTAL_APP_CODE,
      roles: [{ code: "lighthouse_user" }, { code: "lighthouse_knowledge_admin" }], org: { path: "售后/文化" }, ...overrides } });
  });
  return { config, fetcher, provider: createAccessProvider(config, fetcher, now) };
}

describe("IAM and portal provider composition", () => {
  it("uses real adapters with distinct credentials and preserves employee leading zeros", async () => {
    const f = fixture();
    const auth = new URL(f.provider.authorizationUrl!("https://lighthouse.example.invalid/auth/iam/callback", "synthetic-state"));
    expect(auth.origin).toBe(env.IAM_BASE_URL);
    expect(auth.searchParams.get("client_id")).toBe(env.IAM_CLIENT_ID);
    expect(auth.searchParams.get("state")).toBe("synthetic-state");
    const exchange = await f.provider.exchange!("synthetic-code");
    expect(exchange).toEqual({ token: "synthetic-iam-token", expiresAt: now() + 900000 });
    const identity = await f.provider.identity(exchange.token);
    expect(identity).toEqual({ account: "000042", displayName: "000042" });
    expect(await f.provider.authorization!(identity.account)).toEqual({ roles: ["lighthouse_user", "lighthouse_knowledge_admin"], organization: "售后/文化" });
    expect(await f.provider.roles(identity.account)).toEqual(["lighthouse_user", "lighthouse_knowledge_admin"]);
    expect(f.fetcher).toHaveBeenCalledTimes(4);
    expect(f.fetcher.mock.calls.some(([url]) => String(url).includes("infoByToken"))).toBe(false);
  });
  it.each([{ account: "42" }, { appCode: "different-app" }])("rejects mismatched portal authorization response %j", async override => {
    const f = fixture(override);
    await expect(f.provider.authorization!("000042")).rejects.toMatchObject({ status: 503 });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, "sync"] as const)("keeps synchronized roles inaccessible to the HTTP provider for source %s", async source => {
    const config = { ...readAccessConfig(env), iamAuthorizationSource: source };
    const fetcher = vi.fn<typeof fetch>();
    const provider = createAccessProvider(config, fetcher, now);
    expect(provider.authorization).toBeUndefined();
    await expect(provider.roles("000042")).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed for missing IAM config and unknown authorization sources", () => {
    const config = readAccessConfig(env);
    expect(() => createAccessProvider({ ...config, iam: undefined })).toThrow(expect.objectContaining({ status: 503 }));
    expect(() => createAccessProvider({ ...config, iamAuthorizationSource: "unknown" } as unknown as AccessConfig)).toThrow(expect.objectContaining({ status: 503 }));
  });
  it("preserves the portal provider for fixtures with no explicit mode", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ret: 200, data: { account: "000042", name: "模拟员工" } }));
    const provider = createAccessProvider({ ...readAccessConfig(env), mode: undefined }, fetcher, now);
    expect(provider.exchange).toBeUndefined();
    expect(await provider.identity("synthetic-portal-token")).toEqual({ account: "000042", displayName: "模拟员工" });
    expect(String(fetcher.mock.calls[0][0])).toBe(`${env.PORTAL_API_BASE_URL}/sso/admin/infoByToken`);
  });
});
