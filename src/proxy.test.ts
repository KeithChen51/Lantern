import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { REQUEST_PATH_HEADER } from "./modules/auth/page-access";
import { createLoginArrival, loginArrivalCookie, LOGIN_ARRIVAL_HEADER } from "./modules/auth/login-arrival";

const { employee, portalCallback } = vi.hoisted(() => ({ employee: vi.fn(), portalCallback: vi.fn() }));
vi.mock("@/modules/auth/access-http", () => ({ callback: portalCallback }));
vi.mock("@/modules/auth/access", () => ({ requireEmployee: employee, requireSiteVisitor: employee, readAccessCookie: (headers: Headers, name: string) => headers.get("cookie")?.split("; ").find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) }));
vi.mock("@/modules/auth/access-config", () => ({ readAccessConfig: () => ({ origin: "https://lighthouse.invalid", mode: process.env.AUTH_MODE ?? "portal", sessionCookie: "lighthouse_test_session", secureCookies: true, transactionMs: 300000, encryptionKey: Buffer.alloc(32, 5).toString("base64") }) }));
beforeEach(() => { employee.mockReset(); portalCallback.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
describe("employee request gate", () => {
  it("starts IAM automatically from the domain document while preserving its local query", async () => {
    vi.stubEnv("AUTH_MODE", "iam");
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest("https://lighthouse.invalid/?view=values", { headers: { accept: "text/html" } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://lighthouse.invalid/auth/iam/start?returnTo=%2F%3Fview%3Dvalues");
  });
  it("does not auto-start twice when a returned session cookie is missing", async () => {
    vi.stubEnv("AUTH_MODE", "iam");
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest("https://lighthouse.invalid/", { headers: { accept: "text/html", cookie: `${loginArrivalCookie("lighthouse_test_session")}=recent-callback` } }));
    expect(response.headers.get("location")).toBe("https://lighthouse.invalid/login?returnTo=%2F");
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it.each(["/login?loggedOut=1", "/login?error=callback", "/?loggedOut=1", "/?error=callback", "/heart"])("keeps explicit retry and other page entries out of automatic login: %s", async path => {
    vi.stubEnv("AUTH_MODE", "iam");
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest(`https://lighthouse.invalid${path}`, { headers: { accept: "text/html" } }));
    expect(response.headers.get("location") ?? "").not.toContain("/auth/iam/start");
  });
  it.each([
    { rsc: "1" }, { "next-router-prefetch": "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" },
  ] as Record<string, string>[])("does not start IAM for flight or speculative requests %j", async headers => {
    vi.stubEnv("AUTH_MODE", "iam");
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest("https://lighthouse.invalid/", { headers: { accept: "text/html", ...headers } }));
    expect(response.headers.get("location") ?? "").not.toContain("/auth/iam/start");
  });
  it.each(["/?code=private", "/?state=private", "/?token=private"])("clears stray IAM material without automatic authentication: %s", async path => {
    vi.stubEnv("AUTH_MODE", "iam");
    const response = await proxy(new NextRequest(`https://lighthouse.invalid${path}`, { headers: { accept: "text/html" } }));
    expect(response.headers.get("location")).toBe("https://lighthouse.invalid/login?error=callback");
    expect(employee).not.toHaveBeenCalled();
  });
  it("consumes a successful IAM arrival only on the authenticated destination document", async () => {
    vi.stubEnv("AUTH_MODE", "iam");
    employee.mockResolvedValue({ userId: "employee" });
    const config = { origin: "https://lighthouse.invalid", encryptionKey: Buffer.alloc(32, 5).toString("base64") };
    const token = "synthetic-session";
    const name = loginArrivalCookie("lighthouse_test_session");
    const marker = createLoginArrival(config, token, "/heart?view=values");
    const cookie = `lighthouse_test_session=${token}; ${name}=${marker}`;
    const prefetched = await proxy(new NextRequest("https://lighthouse.invalid/heart?view=values", { headers: { accept: "text/html", cookie, "next-router-prefetch": "1" } }));
    expect(prefetched.headers.has("set-cookie")).toBe(false);
    expect(prefetched.headers.has(`x-middleware-request-${LOGIN_ARRIVAL_HEADER}`)).toBe(false);
    const otherTab = await proxy(new NextRequest("https://lighthouse.invalid/action", { headers: { accept: "text/html", cookie } }));
    expect(otherTab.headers.has("set-cookie")).toBe(false);
    expect(otherTab.headers.has(`x-middleware-request-${LOGIN_ARRIVAL_HEADER}`)).toBe(false);
    const document = await proxy(new NextRequest("https://lighthouse.invalid/heart?view=values", { headers: { accept: "text/html", cookie } }));
    expect(document.headers.get(`x-middleware-request-${LOGIN_ARRIVAL_HEADER}`)).toBe("/heart");
    expect(document.headers.get("set-cookie")).toContain(`${name}=;`);
    expect(document.headers.get("set-cookie")).toContain("Max-Age=0");
    const refreshed = await proxy(new NextRequest("https://lighthouse.invalid/heart?view=values", { headers: { accept: "text/html", cookie: `lighthouse_test_session=${token}` } }));
    expect(refreshed.headers.has(`x-middleware-request-${LOGIN_ARRIVAL_HEADER}`)).toBe(false);
  });
  it("drops forged arrival headers and markers even for authenticated pages", async () => {
    vi.stubEnv("AUTH_MODE", "iam");
    employee.mockResolvedValue({ userId: "employee" });
    for (const path of ["/login", "/api/auth/me", "/heart"]) {
      const response = await proxy(new NextRequest(`https://lighthouse.invalid${path}`, { headers: { accept: "text/html", [LOGIN_ARRIVAL_HEADER]: "/heart", cookie: `${loginArrivalCookie("lighthouse_test_session")}=forged` } }));
      expect(response.headers.has(`x-middleware-request-${LOGIN_ARRIVAL_HEADER}`)).toBe(false);
    }
  });
  it("does not accept middle-platform card tokens as IAM credentials", async () => {
    vi.stubEnv("AUTH_MODE", "iam");
    const response = await proxy(new NextRequest("https://lighthouse.invalid/?token=synthetic"));
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("https://lighthouse.invalid/login?error=callback");
    expect(portalCallback).not.toHaveBeenCalled(); expect(employee).not.toHaveBeenCalled();
  });
  it("consumes root card tokens before authentication and never redirects with a bearer returnTo", async () => {
    portalCallback.mockResolvedValue(new Response(null, { status: 303, headers: { Location: "/auth/confirm", "Referrer-Policy": "no-referrer" } }));
    const request = new NextRequest("https://lighthouse.invalid/?token=synthetic");
    const response = await proxy(request);
    expect(portalCallback).toHaveBeenCalledWith(request);
    expect(employee).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/auth/confirm");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("removes stray portal tokens from anonymous deep-link returnTo", async () => {
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest("https://lighthouse.invalid/heart?token=synthetic&view=values"));
    expect(response.headers.get("location")).toBe("https://lighthouse.invalid/login?returnTo=%2Fheart%3Fview%3Dvalues");
  });
  it("redirects anonymous deep links with a safe internal return and no caching", async () => {
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest("https://lighthouse.invalid/auth/device?user_code=ABCD-EFGH"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://lighthouse.invalid/login?returnTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-EFGH");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("redirects to the configured origin when the request host is hostile", async () => {
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest("https://hostile.invalid/heart?view=values", { headers: { host: "hostile.invalid", "x-forwarded-host": "hostile.invalid" } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://lighthouse.invalid/login?returnTo=%2Fheart%3Fview%3Dvalues");
  });
  it.each(["/_next/static/chunks/heart.js", "/_next/data/build/heart.json", "/files/internal.pdf", "/files/internal.html", "/images/games/service-store.webp", "/images/games/service-voyage.webp", "/_next/image?url=%2Fimages%2Fgames%2Fservice-store.webp&w=640&q=75"])("rejects anonymous business asset %s without login redirects", async path => {
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest(`https://lighthouse.invalid${path}`));
    expect(response.status).toBe(401); expect(response.headers.has("location")).toBe(false);
  });
  it.each(["/images/games/service-store.webp", "/images/games/service-voyage.webp"])("allows authenticated employees to request cover %s directly", async path => {
    employee.mockResolvedValue({ userId: "employee" });
    const request = new NextRequest(`https://lighthouse.invalid${path}`);
    const response = await proxy(request);
    expect(employee).toHaveBeenCalledWith(request);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
  });
  it("rejects anonymous RSC and spoofed public-layout header", async () => {
    employee.mockRejectedValue({ status: 401 });
    const response = await proxy(new NextRequest("https://lighthouse.invalid/heart", { headers: { rsc: "1", [REQUEST_PATH_HEADER]: "/login" } }));
    expect(response.status).toBe(401);
  });
  it("overwrites client-supplied layout path on authenticated requests", async () => {
    employee.mockResolvedValue({ userId: "employee" });
    const response = await proxy(new NextRequest("https://lighthouse.invalid/admin/knowledge", { headers: { [REQUEST_PATH_HEADER]: "/login" } }));
    expect(response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe("/admin/knowledge");
    expect(response.headers.get("cache-control")).toContain("private");
  });
  it("allows native login and leaves tool bearer APIs to endpoint guards", async () => {
    for (const path of ["/login", "/auth/confirm", "/api/auth/token", "/api/client/v1/resources"]) {
      const response = await proxy(new NextRequest(`https://lighthouse.invalid${path}`)); expect(response.status).toBe(200);
    }
    expect(employee).not.toHaveBeenCalled();
  });
  it("preserves native HTTP form Origin on clean auth pages but never shares credential referrers", async () => {
    for (const path of ["/login", "/auth/confirm", "/login?token=synthetic", "/auth/confirm?token=synthetic"]) expect((await proxy(new NextRequest(`https://lighthouse.invalid${path}`))).headers.get("referrer-policy")).toBe("strict-origin");
    expect((await proxy(new NextRequest("https://lighthouse.invalid/auth/portal/callback"))).headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("returns safe service outage response before protected work", async () => {
    employee.mockRejectedValue(new Error("private adapter detail"));
    const response = await proxy(new NextRequest("https://lighthouse.invalid/action"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private adapter detail");
  });
});
