import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { readAccessConfig } from "./access-config";
import { HttpPortalAdapter } from "./portal";
import { openToken, sealToken, safeReturnTo } from "./access-crypto";

const env = {
  NODE_ENV: "test", AUTH_MODE: "portal", LIGHTHOUSE_ORIGIN: "https://app.example.invalid",
  PORTAL_API_BASE_URL: "https://portal.example.invalid", PORTAL_LOGIN_URL: "https://portal.example.invalid/login",
  PORTAL_APP_CODE: "lighthouse", PORTAL_APP_SECRET: "fixture-secret", PORTAL_KNOWLEDGE_ADMIN_ROLE: "lighthouse_knowledge_admin",
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "true",
} as NodeJS.ProcessEnv;
const config = readAccessConfig(env);
const reply = (value: unknown) => Response.json(value);
describe("portal integration contract", () => {
  it("preserves leading zeros and ignores roles carried on identity responses", async () => {
    const fetcher = vi.fn(async () => reply({ ret: 200, data: { account: "0007", empNo: "0007", name: "Fixture employee", roles: ["highest_admin"] } }));
    expect(await new HttpPortalAdapter(config, fetcher).identity("fixture-token")).toEqual({ account: "0007", displayName: "Fixture employee" });
    expect(fetcher.mock.calls[0]).toBeDefined();
  });
  it.each([
    { ret: 500, data: { account: "0007" } },
    { ret: 200, data: { account: "0007", empNo: "0008" } },
    { ret: 200, data: { account: 7 } },
    { ret: 200, data: { account: " 0007" } },
  ])("rejects unsuccessful or ambiguous identity %#", async value => {
    await expect(new HttpPortalAdapter(config, async () => reply(value)).identity("fixture-token")).rejects.toMatchObject({ status: 401 });
  });
  it("signs the exact account and millisecond timestamp and validates app binding", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply({ code: "000000", data: { account: "0007", appCode: "lighthouse", roles: [{ code: "lighthouse_knowledge_admin" }] } }));
    expect(await new HttpPortalAdapter(config, fetcher, () => 12345).roles("0007")).toEqual(["lighthouse_knowledge_admin"]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "POST", redirect: "error", cache: "no-store", body: '{"account":"0007"}',
      headers: { appKey: "lighthouse", timestamp: "12345", sign: createHmac("sha256", "fixture-secret").update("0007.12345").digest("hex") },
    });
  });
  it.each([
    { code: "000000", data: { account: "0008", appCode: "lighthouse", roles: [] } },
    { code: "000000", data: { account: "0007", appCode: "other-app", roles: [] } },
    { code: "failed", data: { account: "0007", appCode: "lighthouse", roles: [] } },
  ])("rejects wrong account/application or protocol failures %#", async value => {
    await expect(new HttpPortalAdapter(config, async () => reply(value)).roles("0007")).rejects.toMatchObject({ status: 503 });
  });
  it("bounds response size and retries network failures once without exposing tokens", async () => {
    await expect(new HttpPortalAdapter(config, async () => reply({ huge: "x".repeat(70_000) })).identity("secret")).rejects.toMatchObject({ status: 503 });
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("secret URL must not escape"); });
    await expect(new HttpPortalAdapter(config, fetcher).identity("secret")).rejects.toThrow("统一门户暂时不可用");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
describe("access configuration and credential sealing", () => {
  it("requires a confirmed employee contract and secure production runtime", () => {
    expect(() => readAccessConfig({ ...env, PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: undefined })).toThrow();
    expect(() => readAccessConfig({ ...env, NODE_ENV: "production" })).toThrow();
    const production = { ...env, NODE_ENV: "production", DATABASE_URL: "mysql://fixture", KNOWLEDGE_HUB_ENABLED: "true", KNOWLEDGE_HUB_DRIVER: "mysql" } as NodeJS.ProcessEnv;
    expect(readAccessConfig(production).sessionCookie).toBe("__Host-lighthouse_session");
    expect(() => readAccessConfig({ ...production, AUTH_ALLOW_LOCAL_HTTP: "true", LIGHTHOUSE_ORIGIN: "http://localhost:3000" })).toThrow();
    expect(() => readAccessConfig({ ...env, PORTAL_STATE_PARAM: "token" })).toThrow();
  });
  it("authenticates encryption and refuses a wrong key or damaged ciphertext", () => {
    const sealed = sealToken("fixture upstream bearer", config.encryptionKey);
    expect(sealed).not.toContain("fixture");
    expect(openToken(sealed, config.encryptionKey)).toBe("fixture upstream bearer");
    expect(() => openToken(sealed, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    const parts = sealed.split("."); parts[2] = Buffer.alloc(16).toString("base64url");
    expect(() => openToken(parts.join("."), config.encryptionKey)).toThrow();
  });
  it.each(["https://other.invalid", "//other.invalid", "/%2fother.invalid", "/%252fother.invalid", "/\\other.invalid", "/auth/portal/callback", "/api/auth/start", "/%2e%2e/auth/confirm", "/x\r\nLocation: nope"])("rejects unsafe or looping return %s", value => {
    expect(safeReturnTo(value)).toBe("/");
  });
  it("retains a local device approval deep link", () => expect(safeReturnTo("/auth/device?user_code=TEST-CODE")).toBe("/auth/device?user_code=TEST-CODE"));
});
