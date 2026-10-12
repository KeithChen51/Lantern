import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAdminPortalCookieHeaderAuthorized } from "@/modules/admin";
import { POST, DELETE } from "./route";

beforeEach(() => {
  vi.stubEnv("ADMIN_PORTAL_PASSWORD", "test-password");
  vi.stubEnv("ADMIN_PORTAL_COOKIE_SECRET", "test-cookie-secret");
});
afterEach(() => vi.unstubAllEnvs());

function login(password = "test-password") {
  return POST(new Request("http://test.internal/api/admin/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  }));
}

describe("admin session runtime cookie policy", () => {
  it.each([undefined, "true", "", "FALSE", "unexpected"])(
    "keeps login and logout Secure for %s", async (value) => {
      vi.stubEnv("ADMIN_COOKIE_SECURE", value);
      for (const response of [await login(), await DELETE()]) {
        expect(response.status).toBe(200);
        expect(response.headers.get("set-cookie")).toMatch(/; Secure(?:;|$)/);
      }
    },
  );

  it("supports HTTP sessions and deletion with an explicit runtime opt-out", async () => {
    vi.stubEnv("ADMIN_COOKIE_SECURE", "false");
    const response = await login();
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).not.toMatch(/; Secure(?:;|$)/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(isAdminPortalCookieHeaderAuthorized(cookie.split(";")[0])).toBe(true);
    const logout = (await DELETE()).headers.get("set-cookie")!;
    expect(logout).toContain("lighthouse_admin_session=;");
    expect(logout).toContain("Max-Age=0");
    expect(logout).toContain("Path=/");
    expect(logout).not.toMatch(/; Secure(?:;|$)/);
  });

  it("reads the policy on each request after the module was imported", async () => {
    vi.stubEnv("ADMIN_COOKIE_SECURE", "false");
    expect((await login()).headers.get("set-cookie")).not.toContain("; Secure");
    vi.stubEnv("ADMIN_COOKIE_SECURE", "true");
    expect((await login()).headers.get("set-cookie")).toContain("; Secure");
  });

  it("still rejects an incorrect password without issuing a cookie", async () => {
    vi.stubEnv("ADMIN_COOKIE_SECURE", "false");
    const response = await login("wrong-password");
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
