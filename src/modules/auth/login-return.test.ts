import { describe, expect, it } from "vitest";
import { loginRetryHref } from "./login-return";

describe("login retry navigation", () => {
  it("encodes the complete internal destination without treating its query as login parameters", () => {
    const href = loginRetryHref("/search?q=case&type=case&offset=20", "callback");
    const url = new URL(href, "https://lighthouse.invalid");
    expect(url.pathname).toBe("/login");
    expect([...url.searchParams.keys()]).toEqual(["error", "returnTo"]);
    expect(url.searchParams.get("returnTo")).toBe("/search?q=case&type=case&offset=20");
  });
  it.each([undefined, "/", "https://evil.invalid", "//evil.invalid", "/%252f%252fevil.invalid", "/auth/confirm", "/api/auth/token", "/heart#token"])("falls back without a reusable target for %s", returnTo => {
    expect(loginRetryHref(returnTo)).toBe("/login");
    expect(loginRetryHref(returnTo, "callback")).toBe("/login?error=callback");
  });
});
