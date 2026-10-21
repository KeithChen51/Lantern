import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readAccessConfig } from "./access-config";
import { accessAuthority, usesIamPortalAuthorization, usesIamSyncAuthorization } from "./authorization-source";
import type { AccessConfig } from "./access-types";
import { createIamSyncHandlers } from "./iam-sync-http";
import { readSiteAccessConfig } from "./site-access-config";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "production", AUTH_MODE: "iam", IAM_AUTHORIZATION_SOURCE: "portal",
  LIGHTHOUSE_ORIGIN: "https://lighthouse.example.invalid", AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  DATABASE_URL: "mysql://synthetic", KNOWLEDGE_HUB_ENABLED: "true", KNOWLEDGE_HUB_DRIVER: "mysql",
  IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "fixture-iam-client", IAM_CLIENT_SECRET: "synthetic-iam-secret",
  PORTAL_API_BASE_URL: "https://portal.example.invalid/api", PORTAL_APP_CODE: "fixture-portal-app", PORTAL_APP_SECRET: "synthetic-portal-secret",
};
const syncKeys = {
  IAM_SYNC_APP_KEY: "fixture-sync-app", IAM_SYNC_PUBLIC_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  IAM_SYNC_AES_KEY: Buffer.alloc(32, 2).toString("base64"), IAM_SYNC_AES_IV: Buffer.alloc(16, 3).toString("base64"),
};

describe("IAM identity with portal authorization configuration", () => {
  it("requires independent portal and IAM credentials without sync keys or portal login assertions", () => {
    const config = readAccessConfig(base);
    expect(config).toMatchObject({ mode: "iam", iamAuthorizationSource: "portal", portalBaseUrl: base.PORTAL_API_BASE_URL,
      appCode: base.PORTAL_APP_CODE, appSecret: base.PORTAL_APP_SECRET, adminRole: "lighthouse_knowledge_admin", platformAdminRole: "lighthouse_admin",
      iam: { baseUrl: base.IAM_BASE_URL, clientId: base.IAM_CLIENT_ID, clientSecret: base.IAM_CLIENT_SECRET },
      portalLoginMode: "callback", callbackParam: "redirect_uri", stateParam: "state", tokenParam: "code", allowLegacyConfirmation: false,
      portalLoginUrl: "https://iam.example.invalid/idp/authCenter/authenticate" });
    // Irrelevant portal login/sync variables never affect the combined mode.
    expect(readAccessConfig({ ...base, IAM_SYNC_PUBLIC_KEY: "invalid", PORTAL_LOGIN_URL: "invalid", PORTAL_LOGIN_MODE: "invalid",
      PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "false", PORTAL_KNOWLEDGE_ADMIN_ROLE: "other", PORTAL_PLATFORM_ADMIN_ROLE: "other" })).toEqual(config);
  });
  it.each(["IAM_BASE_URL", "IAM_CLIENT_ID", "IAM_CLIENT_SECRET", "PORTAL_API_BASE_URL", "PORTAL_APP_CODE", "PORTAL_APP_SECRET"])("rejects missing %s with 503", key => {
    expect(() => readAccessConfig({ ...base, [key]: undefined })).toThrow(expect.objectContaining({ status: 503 }));
  });
  it.each(["", "unknown", "PORTAL", " sync", "portal "])("rejects unknown IAM authorization source %j", source => {
    expect(() => readAccessConfig({ ...base, IAM_AUTHORIZATION_SOURCE: source })).toThrow(expect.objectContaining({ status: 503 }));
  });
  it("preserves default and explicit sync configuration and old IAM field semantics", () => {
    const syncEnv = { ...base, ...syncKeys, IAM_AUTHORIZATION_SOURCE: undefined, PORTAL_API_BASE_URL: undefined, PORTAL_APP_CODE: undefined, PORTAL_APP_SECRET: undefined };
    const config = readAccessConfig(syncEnv);
    expect(config).toMatchObject({ iamAuthorizationSource: "sync", portalBaseUrl: base.IAM_BASE_URL, appCode: base.IAM_CLIENT_ID, appSecret: base.IAM_CLIENT_SECRET,
      sessionCookie: "__Host-lighthouse_iam_session" });
    expect(readAccessConfig({ ...syncEnv, IAM_AUTHORIZATION_SOURCE: "sync" })).toEqual(config);
    for (const key of Object.keys(syncKeys)) {
      expect(() => readAccessConfig({ ...syncEnv, [key]: undefined })).toThrow(expect.objectContaining({ status: 503 }));
    }
  });
  it("ignores stale IAM source configuration in portal and guest modes", () => {
    const portalEnv = { ...base, AUTH_MODE: "portal", PORTAL_LOGIN_URL: "https://portal.example.invalid/login", PORTAL_KNOWLEDGE_ADMIN_ROLE: "knowledge_admin", PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "true" };
    expect(readAccessConfig({ ...portalEnv, IAM_AUTHORIZATION_SOURCE: "unknown" })).toEqual(readAccessConfig({ ...portalEnv, IAM_AUTHORIZATION_SOURCE: undefined }));
    expect(readSiteAccessConfig({ ...base, AUTH_MODE: "guest", IAM_AUTHORIZATION_SOURCE: "unknown" })).toEqual(readSiteAccessConfig({ ...base, AUTH_MODE: "guest", IAM_AUTHORIZATION_SOURCE: undefined }));
  });
  it("allows only the exact private API HTTP origin, including production, and keeps IAM HTTPS", () => {
    const apiOrigin = "http://10.20.30.41:20002";
    const env = { ...base, PORTAL_API_BASE_URL: apiOrigin + "/gateway", PORTAL_API_HTTP_ORIGIN: apiOrigin };
    expect(readAccessConfig(env).portalBaseUrl).toBe(apiOrigin + "/gateway");
    for (const override of [
      { PORTAL_API_HTTP_ORIGIN: undefined }, { PORTAL_API_HTTP_ORIGIN: apiOrigin + "/" }, { PORTAL_API_HTTP_ORIGIN: "http://8.8.8.8" },
      { PORTAL_API_BASE_URL: apiOrigin.replace("20002", "20003") }, { PORTAL_API_BASE_URL: "http://10.20.30.42:20002/gateway" },
      { PORTAL_API_BASE_URL: apiOrigin + "?x=1" }, { PORTAL_API_BASE_URL: "https://portal.example.invalid" },
      { IAM_BASE_URL: apiOrigin }, { IAM_BASE_URL: "http://localhost:3000" }, { LIGHTHOUSE_ORIGIN: apiOrigin },
    ]) expect(() => readAccessConfig({ ...env, ...override })).toThrow(expect.objectContaining({ status: 503 }));
  });
  it("isolates all combined-mode cookies from sync, portal, and other test origins", () => {
    const combo = readAccessConfig(base), sync = readAccessConfig({ ...base, ...syncKeys, IAM_AUTHORIZATION_SOURCE: "sync" });
    const portal = readAccessConfig({ ...base, AUTH_MODE: "portal", PORTAL_LOGIN_URL: "https://portal.example.invalid/login", PORTAL_KNOWLEDGE_ADMIN_ROLE: "knowledge_admin", PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "true" });
    for (const cookie of ["sessionCookie", "transactionCookie", "pendingCookie"] as const) {
      expect(combo[cookie]).toMatch(/^__Host-lighthouse_iam_portal_/);
      expect(new Set([combo[cookie], sync[cookie], portal[cookie]]).size).toBe(3);
    }
    const testOrigin = "http://10.20.30.40:3080";
    const testEnv = { ...base, LIGHTHOUSE_DEPLOYMENT_ENV: "test", LIGHTHOUSE_ORIGIN: testOrigin, AUTH_TEST_HTTP_ORIGIN: testOrigin };
    const test = readAccessConfig(testEnv);
    expect(test.secureCookies).toBe(false);
    expect(test.sessionCookie).toMatch(/^lighthouse_test_[a-f0-9]{16}_iam_portal_session$/);
    expect(() => readAccessConfig({ ...testEnv, AUTH_TEST_HTTP_ORIGIN: undefined })).toThrow();
    expect(() => readAccessConfig({ ...testEnv, LIGHTHOUSE_DEPLOYMENT_ENV: "production" })).toThrow();
    const other = "http://10.20.30.40:3081";
    expect(readAccessConfig({ ...testEnv, LIGHTHOUSE_ORIGIN: other, AUTH_TEST_HTTP_ORIGIN: other }).sessionCookie).not.toBe(test.sessionCookie);
  });
});

describe("authorization source helpers", () => {
  it.each([
    [{}, false, false, "portal"], [{ mode: "portal" }, false, false, "portal"],
    [{ mode: "portal", iamAuthorizationSource: "portal" }, false, false, "portal"],
    [{ mode: "iam" }, false, true, "iam"], [{ mode: "iam", iamAuthorizationSource: "sync" }, false, true, "iam"],
    [{ mode: "iam", iamAuthorizationSource: "portal" }, true, false, "iam-portal"],
  ] as const)("classifies %j", (config, portal, sync, authority) => {
    expect(usesIamPortalAuthorization(config)).toBe(portal);
    expect(usesIamSyncAuthorization(config)).toBe(sync);
    expect(accessAuthority(config)).toBe(authority);
  });
  it("does not classify malformed sources as synchronized authorization", () => {
    expect(usesIamSyncAuthorization({ mode: "iam", iamAuthorizationSource: "unknown" } as unknown as AccessConfig)).toBe(false);
  });
});

describe("combined-mode IAM synchronization boundary", () => {
  it.each(["portal", "unknown", "", "SYNC"])("disables reads and writes before config/store access for source %j", async source => {
    const config = vi.fn(() => { throw new Error("must not read sync config"); });
    const store = vi.fn(async () => { throw new Error("must not access store"); });
    const handlers = createIamSyncHandlers({ env: () => ({ NODE_ENV: "test", AUTH_MODE: "iam", IAM_AUTHORIZATION_SOURCE: source }), config, store });
    for (const endpoint of ["roles", "menus", "account", "permission"] as const) {
      const request = new Request(`https://lighthouse.example.invalid/api/iam/${endpoint}`, { method: ["account", "permission"].includes(endpoint) ? "POST" : "GET" });
      const response = await handlers[endpoint](request);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: "999999", msg: "synchronization unavailable" });
    }
    expect(config).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
});
