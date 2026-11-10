import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callback } from "@/app/auth/wecom/group/callback/route";
import { GET as start } from "@/app/auth/wecom/group/start/route";
import { proxy } from "@/proxy";
import { getAccessService, requireEmployee, requireKnowledgeAdmin } from "./access";
import { hashToken } from "./access-crypto";
import { logout } from "./access-http";
import type { MemoryAccessStore } from "./access-store";
import { classifyAccessPath } from "./page-access";
import { WECOM_GROUP_CALLBACK, WECOM_GROUP_START } from "./wecom-group-config";

vi.mock("@/infrastructure/db", () => ({ prisma: {} }));
const fixtures = vi.hoisted(() => ({ store: undefined as MemoryAccessStore | undefined }));
vi.mock("./access-store", async importOriginal => {
  const actual = await importOriginal<typeof import("./access-store")>();
  const store = new actual.MemoryAccessStore();
  fixtures.store = store;
  return { ...actual, PrismaAccessStore: class { transaction = store.transaction.bind(store); } };
});

const origin = "https://lighthouse.example.invalid";
const env = {
  AUTH_MODE: "iam", IAM_AUTHORIZATION_SOURCE: "portal", LIGHTHOUSE_ORIGIN: origin,
  IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "fixture", IAM_CLIENT_SECRET: "iam-key",
  PORTAL_API_BASE_URL: "https://portal.example.invalid", PORTAL_APP_CODE: "fixture", PORTAL_APP_SECRET: "portal-key",
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"),
  WECOM_GROUP_MODE: "probe", WECOM_GROUP_CORP_ID: "ww1234567890123456",
  WECOM_GROUP_APP_ID: "group-app", WECOM_GROUP_APP_KEY: "group-key",
};
const verify = vi.fn<typeof fetch>();
const sessionCookie = "__Host-lighthouse_iam_portal_session";
const currentSession = `${sessionCookie}=${"a".repeat(43)}`;
const cookieValue = (setCookie: string) => setCookie.split(";", 1)[0];
beforeEach(() => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  verify.mockReset();
  vi.stubGlobal("fetch", verify);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function startAndBuildCallback(token: string, account = "000123") {
  const response = await start(new NextRequest(origin + WECOM_GROUP_START + "?returnTo=%2Fhermit", { headers: { cookie: currentSession } }));
  expect(response.status).toBe(303);
  const [transaction] = response.headers.getSetCookie();
  const outer = new URL(response.headers.get("location")!);
  const middle = new URL(outer.searchParams.get("redirect_uri")!);
  const target = new URL(middle.searchParams.get("backurl")!);
  target.searchParams.set("userid", account);
  target.searchParams.set("token", token);
  target.searchParams.set("appid", env.WECOM_GROUP_APP_ID);
  target.searchParams.set("redirect", "https://untrusted.example.invalid/");
  return { transaction, target };
}

function employeePilot(account = "000123") {
  vi.stubEnv("WECOM_GROUP_MODE", "employee-pilot");
  vi.stubEnv("WECOM_GROUP_BACKURL_RESTRICTION_CONFIRMED", "true");
  vi.stubEnv("WECOM_GROUP_PILOT_ACCOUNTS", account);
}

function upstreamEmployee(account: string, roles = ["lighthouse_admin"]) {
  verify.mockResolvedValueOnce(Response.json({ code: "0", msg: { EMPID: account, USERID: "synthetic-member" } }));
  verify.mockResolvedValueOnce(Response.json({ code: "000000", data: { account, appCode: "fixture", roles: roles.map(code => ({ code })), name: "员工" } }));
}

async function complete(token: string, account = "000123") {
  const { target, transaction } = await startAndBuildCallback(token, account);
  return callback(new NextRequest(target, { headers: { cookie: `${currentSession}; ${cookieValue(transaction)}` } }));
}

describe("Group WeCom workbench probe routes", () => {
  it("starts on the approved path, verifies the callback, and removes URL credentials before showing the result", async () => {
    expect(classifyAccessPath(WECOM_GROUP_START)).toBe("public");
    expect(classifyAccessPath(WECOM_GROUP_CALLBACK)).toBe("public");
    verify.mockResolvedValueOnce(Response.json({ code: "0", msg: { EMPID: "000123", USERID: "synthetic-member" } }));
    const flow = await startAndBuildCallback("ticket-a");
    expect(flow.transaction).toMatch(/^__Host-lighthouse_wecom_group_/);
    expect(flow.transaction).toContain("; Path=/; HttpOnly; SameSite=Lax;");
    expect(flow.transaction).toContain("; Secure");
    const first = await callback(new NextRequest(flow.target, { headers: { cookie: `${currentSession}; ${cookieValue(flow.transaction)}` } }));
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe(origin + WECOM_GROUP_CALLBACK);
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    expect(first.headers.get("cache-control")).toContain("no-store");
    const [target, options] = verify.mock.calls[0];
    expect(target).toBe("https://weixin.byd.com/admin/services/weixin/auth/validtokenbackuserinfo");
    expect(options?.headers).toMatchObject({ Authentication: "Basic group-key" });
    expect(JSON.parse(String(options?.body))).toEqual({ userId: "000123", token: "ticket-a", appId: "group-app" });
    const cookies = first.headers.getSetCookie();
    expect(cookies.every(value => value.startsWith("__Host-lighthouse_wecom_group_"))).toBe(true);
    const resultCookie = cookies.find(value => value.includes("_result="))!;
    const forged = await callback(new NextRequest(origin + WECOM_GROUP_CALLBACK, {
      headers: { cookie: resultCookie.split("=")[0] + "=verified" },
    }));
    expect(forged.headers.get("location")).toBe("/login?error=wecomGroupProbe");
    const result = await callback(new NextRequest(origin + WECOM_GROUP_CALLBACK, { headers: { cookie: cookieValue(resultCookie) } }));
    expect(await result.json()).toEqual({ probe: "wecom-group-workbench", result: "identity_verified", sessionCreated: false });
    expect(result.headers.getSetCookie()).toEqual([expect.stringContaining("Max-Age=0")]);
    expect((await callback(new NextRequest(origin + WECOM_GROUP_CALLBACK))).status).toBe(303);
  });

  it("drops failed callback credentials and leaves other sessions alone", async () => {
    const { target, transaction } = await startAndBuildCallback("private-failed-ticket");
    verify.mockRejectedValueOnce(new Error("private upstream details"));
    const response = await callback(new NextRequest(target, { headers: { cookie: `${currentSession}; ${cookieValue(transaction)}` } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?error=wecomGroupProbe");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.text()).toBe("");
  });

  it("requires explicit enabling and will not submit a ticket when disabled", async () => {
    const { target, transaction } = await startAndBuildCallback("ticket-disabled");
    vi.stubEnv("WECOM_GROUP_MODE", "off");
    expect((await start(new NextRequest(origin + WECOM_GROUP_START))).status).toBe(401);
    const response = await callback(new NextRequest(target, { headers: { cookie: cookieValue(transaction) } }));
    expect(response.headers.get("location")).toBe("/login?error=wecomGroup");
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("Group employee workbench session", () => {
  const employee = { id: "existing-iam-user", account: "000123", displayName: "现有员工", active: true, employee: true };

  it("reuses the existing employee and role source, expires in five minutes, and does not grant admin or CLI", async () => {
    vi.setSystemTime(new Date("2026-11-10T05:00:00Z"));
    employeePilot();
    fixtures.store!.seedEmployee(employee);
    upstreamEmployee(employee.account);
    const response = await complete("pilot-ticket-a");
    expect(response.headers.get("location")).toBe(origin + "/hermit");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const cookie = response.headers.getSetCookie().find(value => value.startsWith(sessionCookie + "="))!;
    expect(cookie).toMatch(/^__Host-lighthouse_iam_portal_session=group_[A-Za-z0-9_-]{43};/);
    const maxAge = Number(cookie.match(/Max-Age=(\d+)/)?.[1]);
    expect(maxAge).toBe(300);
    const request = new NextRequest(origin + "/hermit", { headers: { cookie: cookieValue(cookie) } });
    const principal = await requireEmployee(request);
    expect(principal).toMatchObject({ account: employee.account, userId: employee.id });
    expect(principal.capabilities).toEqual(["content:read", "knowledge:read", "hermit:chat", "hermit:attachment:self"]);
    await expect(requireKnowledgeAdmin(request, { write: true })).rejects.toMatchObject({ status: 403 });
    await expect(getAccessService().decideDevice(principal, "synthetic", true, "fixture")).rejects.toMatchObject({ status: 403 });
    expect(verify.mock.calls.map(([target]) => new URL(String(target)).pathname)).toEqual([
      "/admin/services/weixin/auth/validtokenbackuserinfo", "/sso/admin/subapp/role-query",
    ]);
    const grant = fixtures.store!.snapshot().find(record => record.id === principal.grantId);
    expect(grant?.payload).toMatchObject({ source: "wecom-group", authority: "iam-portal" });
    expect(grant?.payload).not.toHaveProperty("tokenCipher");
    expect(JSON.stringify(fixtures.store!.snapshot())).not.toContain("pilot-ticket-a");
    const sessionToken = cookieValue(cookie).slice(sessionCookie.length + 1);
    expect(await fixtures.store!.transaction(tx => tx.get("session", `session:${hashToken(sessionToken)}`))).toBeNull();
    vi.setSystemTime(new Date(principal.expiresAt));
    await expect(requireEmployee(request)).rejects.toMatchObject({ status: 401 });
    const expiredHome = new NextRequest(origin, { headers: { cookie: cookieValue(cookie), accept: "text/html" } });
    expect((await proxy(expiredHome)).headers.get("location")).toBe(origin + "/login?error=wecomGroup&returnTo=%2F");
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("rejects a valid ticket if the account has no existing mapping or application role", async () => {
    employeePilot("000999");
    upstreamEmployee("000999");
    const missing = await complete("unmapped-ticket", "000999");
    expect(missing.headers.get("location")).toBe("/login?error=wecomGroupAccess");
    expect(missing.headers.getSetCookie()).toEqual([]);
    expect(await fixtures.store!.transaction(tx => tx.findEmployee("000999"))).toBeNull();

    employeePilot();
    fixtures.store!.seedEmployee(employee);
    upstreamEmployee(employee.account, ["unrecognized_role"]);
    const noRole = await complete("no-role-ticket");
    expect(noRole.headers.get("location")).toBe("/login?error=wecomGroupAccess");
    expect(noRole.headers.getSetCookie()).toEqual([]);
  });

  it("blocks verified accounts outside the roster before reading roles or creating a session", async () => {
    employeePilot("000555");
    verify.mockResolvedValueOnce(Response.json({ code: "0", msg: { EMPID: "000123", USERID: "synthetic-member" } }));
    const response = await complete("not-a-pilot-ticket");
    expect(response.headers.get("location")).toBe("/login?error=wecomGroupAccess");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("honors local employee disable and explicit logout within the pilot window", async () => {
    employeePilot();
    fixtures.store!.seedEmployee(employee);
    upstreamEmployee(employee.account);
    const first = await complete("pilot-ticket-disable");
    const cookie = first.headers.getSetCookie().find(value => value.startsWith(sessionCookie + "="))!;
    const request = new NextRequest(origin + "/me", { headers: { cookie: cookieValue(cookie) } });
    const principal = await requireEmployee(request);
    fixtures.store!.seedEmployee({ ...employee, active: false });
    await expect(requireEmployee(request)).rejects.toMatchObject({ status: 401 });
    fixtures.store!.seedEmployee(employee);
    const pending = await startAndBuildCallback("pending-ticket-after-logout");
    const signOut = (path: string) => new NextRequest(origin + path, {
      method: "POST",
      headers: { cookie: `${cookieValue(cookie)}; ${cookieValue(pending.transaction)}`, origin, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: principal.csrfToken! }),
    });
    expect((await logout(true)(signOut("/api/auth/logout-all"))).status).toBe(403);
    const response = await logout(false)(signOut("/api/auth/logout"));
    expect(response.headers.get("location")).toBe(origin + "/login?loggedOut=1");
    const transactionName = pending.transaction.split("=")[0];
    expect(response.headers.getSetCookie()).toContainEqual(expect.stringMatching(new RegExp(`^${transactionName}=;.*Max-Age=0`)));
    await expect(requireEmployee(request)).rejects.toMatchObject({ status: 401 });
  });
});
