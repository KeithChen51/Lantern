import { describe, expect, it } from "vitest";
import { readAccessConfig } from "./access-config";

const production: NodeJS.ProcessEnv = {
  NODE_ENV: "production", AUTH_MODE: "portal", LIGHTHOUSE_ORIGIN: "https://app.example.invalid",
  PORTAL_API_BASE_URL: "https://portal.example.invalid/api", PORTAL_LOGIN_URL: "https://portal.example.invalid/login",
  PORTAL_APP_CODE: "fixture", PORTAL_APP_SECRET: "synthetic", PORTAL_KNOWLEDGE_ADMIN_ROLE: "knowledge_admin",
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "true",
  DATABASE_URL: "mysql://fixture", KNOWLEDGE_HUB_ENABLED: "true", KNOWLEDGE_HUB_DRIVER: "mysql",
};
const testOrigin = "http://10.20.30.40:3080";
const testDeployment = { ...production, LIGHTHOUSE_DEPLOYMENT_ENV: "test", LIGHTHOUSE_ORIGIN: testOrigin, AUTH_TEST_HTTP_ORIGIN: testOrigin };

describe("explicit HTTP intranet test deployment", () => {
  it("accepts only the opted-in test origin while retaining production runtime checks", () => {
    const config = readAccessConfig(testDeployment);
    expect(config.origin).toBe(testOrigin);
    expect(config.secureCookies).toBe(false);
    expect(config.sessionCookie).toMatch(/^lighthouse_test_[a-f0-9]{16}_session$/);
    expect(config.transactionCookie).toMatch(/^lighthouse_test_[a-f0-9]{16}_login$/);
    expect(config.pendingCookie).toMatch(/^lighthouse_test_[a-f0-9]{16}_pending$/);
    expect(config.allowLegacyConfirmation).toBe(false);
    for (const override of [{ DATABASE_URL: undefined }, { KNOWLEDGE_HUB_DRIVER: "sqlite" }, { KNOWLEDGE_HUB_ENABLED: "false" }, { PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "false" }]) {
      expect(() => readAccessConfig({ ...testDeployment, ...override })).toThrow();
    }
  });
  it.each<Record<string, string | undefined>>([
    { LIGHTHOUSE_DEPLOYMENT_ENV: undefined }, { LIGHTHOUSE_DEPLOYMENT_ENV: "production" },
    { LIGHTHOUSE_DEPLOYMENT_ENV: "development" }, { LIGHTHOUSE_DEPLOYMENT_ENV: "staging" },
    { AUTH_TEST_HTTP_ORIGIN: undefined }, { AUTH_TEST_HTTP_ORIGIN: "" },
    { AUTH_TEST_HTTP_ORIGIN: "http://10.20.30.41:3080" }, { AUTH_TEST_HTTP_ORIGIN: "http://10.20.30.40:3081" },
    { AUTH_TEST_HTTP_ORIGIN: testOrigin + "/" }, { AUTH_ALLOW_LOCAL_HTTP: "true" },
  ])("rejects missing, mismatched or bypass configuration %j", override => {
    expect(() => readAccessConfig({ ...testDeployment, ...override })).toThrow();
  });
  it.each([
    "http://8.8.8.8", "http://127.0.0.1", "http://localhost", "http://0.0.0.0", "http://169.254.1.1", "http://100.64.0.1",
    "http://172.15.0.1", "http://172.32.0.1", "http://192.169.0.1", "http://test.example.invalid",
    "http://10.20.30.40/path", "http://10.20.30.40?x=y", "http://10.20.30.40#fragment", "http://user:pass@10.20.30.40",
    "http://0x0a141e28", "http://10.20.30.40:80", "http://10.20.30.40/", " http://10.20.30.40",
  ])("rejects non-private or non-canonical origin %s", origin => {
    expect(() => readAccessConfig({ ...testDeployment, LIGHTHOUSE_ORIGIN: origin, AUTH_TEST_HTTP_ORIGIN: origin })).toThrow();
  });
  it.each(["http://10.0.0.1", "http://172.16.0.1:8080", "http://172.31.255.254", "http://192.168.1.2"])("allows an explicitly matched RFC1918 IPv4 origin %s", origin => {
    expect(readAccessConfig({ ...testDeployment, LIGHTHOUSE_ORIGIN: origin, AUTH_TEST_HTTP_ORIGIN: origin }).origin).toBe(origin);
  });
  it("never opens HTTP portal endpoints or weakens the production HTTPS configuration", () => {
    for (const key of ["PORTAL_API_BASE_URL", "PORTAL_LOGIN_URL"]) expect(() => readAccessConfig({ ...testDeployment, [key]: testOrigin })).toThrow();
    const config = readAccessConfig(production);
    expect(config.sessionCookie).toBe("__Host-lighthouse_session"); expect(config.secureCookies).toBe(true);
    expect(() => readAccessConfig({ ...production, AUTH_TEST_HTTP_ORIGIN: testOrigin })).toThrow();
    expect(() => readAccessConfig({ ...testDeployment, LIGHTHOUSE_ORIGIN: production.LIGHTHOUSE_ORIGIN })).toThrow();
    expect(() => readAccessConfig({ ...production, LIGHTHOUSE_ORIGIN: testOrigin, AUTH_ALLOW_LOCAL_HTTP: "true" })).toThrow();
  });
  it("isolates cookie names between test origins and from production", () => {
    const config = readAccessConfig(testDeployment), other = "http://10.20.30.40:3081";
    expect(readAccessConfig({ ...testDeployment, LIGHTHOUSE_ORIGIN: other, AUTH_TEST_HTTP_ORIGIN: other }).sessionCookie).not.toBe(config.sessionCookie);
    const https = readAccessConfig({ ...production, LIGHTHOUSE_DEPLOYMENT_ENV: "test" });
    expect(https.sessionCookie).toMatch(/^__Host-lighthouse_test_/); expect(https.secureCookies).toBe(true);
    expect(https.sessionCookie).not.toBe(readAccessConfig(production).sessionCookie);
  });
  it("preserves explicit nonproduction loopback development without allowing a private IP", () => {
    const dev: NodeJS.ProcessEnv = { ...production, NODE_ENV: "development", AUTH_ALLOW_LOCAL_HTTP: "true", LIGHTHOUSE_ORIGIN: "http://localhost:3000", PORTAL_API_BASE_URL: "http://127.0.0.1:4000", PORTAL_LOGIN_URL: "http://localhost:4000/login" };
    expect(readAccessConfig(dev).sessionCookie).toBe("lighthouse_dev_session");
    expect(() => readAccessConfig({ ...dev, LIGHTHOUSE_ORIGIN: testOrigin })).toThrow();
    expect(() => readAccessConfig({ ...dev, LIGHTHOUSE_DEPLOYMENT_ENV: "production" })).toThrow();
  });
});
