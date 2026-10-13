import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminPortalSessionCookieValue, verifyAdminPortalPassword, verifyAdminPortalSessionCookieValue, isAdminPortalCookieHeaderAuthorized } from "./portal";
afterEach(() => vi.unstubAllEnvs());
describe("retired shared-password auth", () => {
  it("cannot grant access even when legacy secrets are configured", () => {
    vi.stubEnv("ADMIN_PORTAL_PASSWORD", "fixture-password");
    vi.stubEnv("ADMIN_PORTAL_COOKIE_SECRET", "fixture-key");
    expect(verifyAdminPortalPassword("fixture-password")).toBe(false);
    expect(verifyAdminPortalSessionCookieValue("old.signed.cookie")).toBe(false);
    expect(isAdminPortalCookieHeaderAuthorized("lighthouse_admin_session=old.signed.cookie")).toBe(false);
    expect(() => createAdminPortalSessionCookieValue()).toThrow("retired");
  });
});
