import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN_PORTAL_COOKIE,
  ADMIN_PORTAL_TTL_SECONDS,
  createAdminPortalSessionCookieValue,
  isAdminPortalCookieHeaderAuthorized,
  verifyAdminPortalPassword,
  verifyAdminPortalSessionCookieValue,
} from "./portal";

const originalPassword = process.env.ADMIN_PORTAL_PASSWORD;
const originalSecret = process.env.ADMIN_PORTAL_COOKIE_SECRET;

function setAdminEnv() {
  process.env.ADMIN_PORTAL_PASSWORD = "correct-password";
  process.env.ADMIN_PORTAL_COOKIE_SECRET = "cookie-secret";
}

afterEach(() => {
  process.env.ADMIN_PORTAL_PASSWORD = originalPassword;
  process.env.ADMIN_PORTAL_COOKIE_SECRET = originalSecret;
});

describe("admin portal session", () => {
  it("verifies the configured admin password", () => {
    setAdminEnv();

    expect(verifyAdminPortalPassword("correct-password")).toBe(true);
    expect(verifyAdminPortalPassword("wrong-password")).toBe(false);
  });

  it("requires an admin password to be configured", () => {
    delete process.env.ADMIN_PORTAL_PASSWORD;
    delete process.env.ADMIN_PORTAL_COOKIE_SECRET;

    expect(() => verifyAdminPortalPassword("anything")).toThrow(/not configured/i);
  });

  it("creates a signed 24 hour session cookie value", () => {
    setAdminEnv();
    const now = new Date("2026-06-10T00:00:00Z");
    const cookieValue = createAdminPortalSessionCookieValue(now);

    expect(verifyAdminPortalSessionCookieValue(cookieValue, now)).toBe(true);
    expect(
      verifyAdminPortalSessionCookieValue(cookieValue, new Date(now.getTime() + (ADMIN_PORTAL_TTL_SECONDS + 1) * 1000)),
    ).toBe(false);
  });

  it("rejects a tampered session cookie", () => {
    setAdminEnv();
    const cookieValue = createAdminPortalSessionCookieValue(new Date("2026-06-10T00:00:00Z"));
    const [payload, signature] = cookieValue.split(".");

    expect(verifyAdminPortalSessionCookieValue(`${payload}x.${signature}`)).toBe(false);
  });

  it("reads the signed session from a cookie header", () => {
    setAdminEnv();
    const now = new Date("2026-06-10T00:00:00Z");
    const cookieValue = createAdminPortalSessionCookieValue(now);

    expect(isAdminPortalCookieHeaderAuthorized(`other=1; ${ADMIN_PORTAL_COOKIE}=${cookieValue}`, now)).toBe(true);
  });
});
