import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as wecomAutoScanStart } from "@/app/auth/wecom/auto/scan/start/route";
import { GET as wecomAutoScanCallback } from "@/app/auth/wecom/auto/scan/callback/route";
import { proxy } from "@/proxy";
import { requireKnowledgeAdmin, requireKnowledgeClient } from "./access";
import { readAccessConfig } from "./access-config";
import { clients, logout, me, wecomAutoCallback, wecomAutoStart } from "./access-http";
import type { WecomAutoEntry } from "./wecom-auto-client";
import { readWecomAutoConfig, wecomAutoTransactionCookie, WECOM_AUTO_ROUTES } from "./wecom-auto-config";

vi.mock("@/infrastructure/db", () => ({ prisma: {} }));
vi.mock("./access-store", async importOriginal => {
  const actual = await importOriginal<typeof import("./access-store")>();
  const store = new actual.MemoryAccessStore();
  return { ...actual, PrismaAccessStore: class { transaction = store.transaction.bind(store); } };
});

const ORIGIN = "https://lighthouse.example.invalid";
const START = "/auth/wecom/auto/start";
const CALLBACK = "/auth/wecom/auto/callback";
const SCAN = WECOM_AUTO_ROUTES.scan;
const app = {
  AUTH_MODE: "iam", IAM_AUTHORIZATION_SOURCE: "portal", LIGHTHOUSE_DEPLOYMENT_ENV: "test",
  LIGHTHOUSE_ORIGIN: ORIGIN, AUTH_ALLOW_LOCAL_HTTP: "false", AUTH_TEST_HTTP_ORIGIN: "",
  IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "fixture", IAM_CLIENT_SECRET: "iam-key",
  PORTAL_API_BASE_URL: "https://portal.example.invalid", PORTAL_APP_CODE: "fixture", PORTAL_APP_SECRET: "portal-key",
  WECOM_AUTO_ENABLED: "true", WECOM_AUTO_SCAN_ENABLED: "false", WECOM_AUTO_CORP_ID: "wwSyntheticAuto",
  WECOM_AUTO_AGENT_ID: "1000005", WECOM_AUTO_SECRET: "synthetic-secret",
};
const upstream = vi.fn<typeof fetch>();
let testIndex = 0;
let now: number;
let memberStatus: number;
let outOfScope: boolean;

function browser(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, ORIGIN), { headers: { accept: "text/html", ...(cookie ? { cookie } : {}) } });
}

function cookieValue(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(";", 1)[0];
}

function submitScan(returnTo: string, origin = ORIGIN) {
  return wecomAutoScanStart(new NextRequest(ORIGIN + SCAN.start, {
    method: "POST", headers: { origin }, body: new URLSearchParams({ returnTo }),
  }));
}

async function begin(returnTo = "/heart", entry: WecomAutoEntry = "workbench") {
  const start = entry === "scan" ? await submitScan(returnTo) : await wecomAutoStart(browser(`${START}?returnTo=${encodeURIComponent(returnTo)}`));
  expect(start.status).toBe(303);
  const oauth = new URL(start.headers.get("location")!);
  const site = readAccessConfig();
  const wecom = readWecomAutoConfig(site)!;
  const verifier = cookieValue(start, wecomAutoTransactionCookie(wecom, entry))!;
  const callback = `${WECOM_AUTO_ROUTES[entry].callback}?state=${oauth.searchParams.get("state")}&code=synthetic-code`;
  return { oauth, verifier, callback, site, start };
}

async function signIn(returnTo = "/heart", previous?: string, entry: WecomAutoEntry = "workbench") {
  const flow = await begin(returnTo, entry);
  const finish = entry === "scan" ? wecomAutoScanCallback : wecomAutoCallback;
  const response = await finish(browser(flow.callback, previous ? `${flow.verifier}; ${previous}` : flow.verifier));
  return { ...flow, response, session: cookieValue(response, flow.site.sessionCookie) };
}

beforeEach(() => {
  now = Date.now();
  memberStatus = 1;
  outOfScope = false;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  for (const [key, value] of Object.entries(app)) vi.stubEnv(key, value);
  vi.stubEnv("AUTH_ENCRYPTION_KEY", Buffer.alloc(32, ++testIndex).toString("base64"));
  vi.stubGlobal("fetch", upstream);
  upstream.mockReset().mockImplementation(async input => {
    const url = new URL(input.toString());
    if (url.origin !== "https://qyapi.weixin.qq.com") throw new Error("unexpected network host");
    switch (url.pathname) {
      case "/cgi-bin/gettoken": return Response.json({ errcode: 0, access_token: "app-token", expires_in: 7200 });
      case "/cgi-bin/agent/get": return Response.json({ errcode: 0, agentid: 1000005, close: 0 });
      case "/cgi-bin/auth/getuserinfo": return Response.json({ errcode: 0, userid: "Dealer01" });
      case "/cgi-bin/user/get": return Response.json(outOfScope
        ? { errcode: 60011 } : { errcode: 0, userid: "Dealer01", name: "试点经销商", status: memberStatus });
      default: throw new Error("unexpected WeCom path");
    }
  });
});

describe("BYD Auto desktop QR entry", () => {
  beforeEach(() => vi.stubEnv("WECOM_AUTO_SCAN_ENABLED", "true"));

  it("opens the official QR page and signs in a dealer with workbench disabled", async () => {
    vi.stubEnv("WECOM_AUTO_ENABLED", "false");
    expect((await wecomAutoStart(browser(START))).status).toBe(401);
    expect((await submitScan("/heart", "https://another.invalid")).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();

    const { oauth, start, site, response, session } = await signIn("/heart?view=values", undefined, "scan");
    expect(oauth.origin + oauth.pathname).toBe("https://login.work.weixin.qq.com/wwlogin/sso/login");
    expect(Object.fromEntries(oauth.searchParams)).toEqual({
      login_type: "CorpApp", appid: app.WECOM_AUTO_CORP_ID, agentid: app.WECOM_AUTO_AGENT_ID,
      redirect_uri: ORIGIN + SCAN.callback, state: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(start.headers.get("set-cookie")).toMatch(/__Host-.*_scan=.*HttpOnly; SameSite=Lax; Max-Age=300; Secure/);
    expect(start.headers.get("location")).not.toContain(app.WECOM_AUTO_SECRET);
    expect(response.headers.get("location")).toBe(ORIGIN + "/heart?view=values");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(cookieValue(response, site.transactionCookie)).toBeUndefined();
    expect(session).toBeDefined();
    const account = await (await me(browser("/api/auth/me", session))).json();
    expect(account).toMatchObject({ kind: "dealer", user: { account: "dealer01" }, capabilities: ["content:read", "knowledge:read", "hermit:chat", "hermit:attachment:self"] });
    expect((await proxy(browser("/admin/knowledge", session))).status).toBe(403);
  });

  it("rejects callbacks without the same browser and entry before contacting WeCom, and prevents replay", async () => {
    const flow = await begin("/heart", "scan");
    const wrongBrowser = await wecomAutoScanCallback(browser(flow.callback));
    expect(wrongBrowser.headers.get("location")).toBe("/login?error=wecomScan");
    const wrongRoute = await wecomAutoCallback(browser(flow.callback.replace(SCAN.callback, CALLBACK), flow.verifier.replace("_scan=", "=")));
    expect(wrongRoute.headers.get("location")).toBe("/login?error=wecom");
    expect(upstream).not.toHaveBeenCalled();

    const legitimate = await wecomAutoScanCallback(browser(flow.callback, flow.verifier));
    expect(legitimate.headers.get("location")).toBe(ORIGIN + "/heart");
    const replay = await wecomAutoScanCallback(browser(flow.callback, flow.verifier));
    expect(replay.headers.get("location")).toBe("/login?error=wecomScan");
    expect(replay.headers.has("set-cookie")).toBe(false);
    expect(upstream.mock.calls.filter(([url]) => url.toString().includes("/auth/getuserinfo"))).toHaveLength(1);
  });

  it("uses the same dealer account and stops scan access independently of workbench", async () => {
    const scan = await signIn("/", undefined, "scan");
    const workbench = await signIn();
    const scanAccount = await (await me(browser("/api/auth/me", scan.session))).json();
    const workbenchAccount = await (await me(browser("/api/auth/me", workbench.session))).json();
    expect(scanAccount.user.id).toBe(workbenchAccount.user.id);
    vi.stubEnv("WECOM_AUTO_SCAN_ENABLED", "false");
    expect((await submitScan("/")).headers.get("location")).toBe("/login?error=wecomScan");
    expect((await me(browser("/api/auth/me", scan.session))).status).toBe(401);
    expect((await me(browser("/api/auth/me", workbench.session))).status).toBe(200);
  });

  it("refuses an out-of-scope scan member without returning the code or a session", async () => {
    outOfScope = true;
    const { response, session } = await signIn("/", undefined, "scan");
    expect(response.headers.get("location")).toBe("/login?error=wecomAccess");
    expect(session).toBeUndefined();
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("BYD Auto workbench entry", () => {
  it("requires the feature to be enabled and rejects stale sessions when it is switched off", async () => {
    const { session } = await signIn();
    expect(session).toBeDefined();
    upstream.mockClear();
    vi.stubEnv("WECOM_AUTO_ENABLED", "false");
    expect((await wecomAutoStart(browser(START))).status).toBe(401);
    expect((await me(browser("/api/auth/me", session))).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("binds authorization to the browser and creates one ordinary web session", async () => {
    const flow = await begin();
    expect(flow.oauth.origin).toBe("https://open.weixin.qq.com");
    expect(flow.oauth.searchParams.get("redirect_uri")).toBe(ORIGIN + CALLBACK);
    expect(flow.oauth.searchParams.get("scope")).toBe("snsapi_base");
    expect(flow.start.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax; Max-Age=300; Secure/);
    const forged = await wecomAutoCallback(browser(flow.callback));
    expect(forged.headers.get("location")).toBe("/login?error=wecom");
    expect(upstream).not.toHaveBeenCalled();

    const iamTransaction = `${flow.site.transactionCookie}=${"i".repeat(43)}`;
    const request = () => browser(flow.callback, `${flow.verifier}; ${iamTransaction}`);
    const results = await Promise.all([wecomAutoCallback(request()), wecomAutoCallback(request())]);
    const accepted = results.find(result => result.headers.get("location") === ORIGIN + "/heart")!;
    const session = cookieValue(accepted, flow.site.sessionCookie)!;
    expect(accepted.headers.get("referrer-policy")).toBe("no-referrer");
    expect(cookieValue(accepted, flow.site.transactionCookie)).toBeUndefined();
    expect(cookieValue(accepted, flow.site.pendingCookie)).toBeUndefined();
    expect(results.filter(result => cookieValue(result, flow.site.sessionCookie))).toHaveLength(1);
    expect(upstream.mock.calls.filter(([url]) => url.toString().includes("/auth/getuserinfo"))).toHaveLength(1);
    expect((await proxy(browser("/heart", session))).headers.get("x-middleware-next")).toBe("1");

    const account = await (await me(browser("/api/auth/me", session))).json();
    expect(account).toMatchObject({ kind: "dealer", user: { account: "dealer01", displayName: "试点经销商" } });
    expect(account.capabilities).toEqual(["content:read", "knowledge:read", "hermit:chat", "hermit:attachment:self"]);
    expect((await proxy(browser("/admin/knowledge", session))).status).toBe(403);
    expect((await proxy(browser("/auth/tools", session))).status).toBe(403);
    expect((await clients(browser("/api/auth/clients", session))).status).toBe(403);
    await expect(requireKnowledgeAdmin(browser("/api/admin/knowledge", session))).rejects.toMatchObject({ status: 403 });
    await expect(requireKnowledgeClient(new Request(ORIGIN + "/api/client/me", { headers: { authorization: `Bearer ${session.split("=")[1]}` } }))).rejects.toMatchObject({ status: 401 });

    const logoutRequest = new NextRequest(ORIGIN + "/api/auth/logout", {
      method: "POST", headers: { cookie: `${session}; ${iamTransaction}`, origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: account.csrfToken }),
    });
    const loggedOut = await logout(false)(logoutRequest);
    expect(loggedOut.headers.get("location")).toBe(ORIGIN + "/login?loggedOut=wecom");
    expect(cookieValue(loggedOut, flow.site.transactionCookie)).toBeUndefined();
    expect(cookieValue(loggedOut, readWecomAutoConfig(flow.site)!.transactionCookie)).toBe(`${readWecomAutoConfig(flow.site)!.transactionCookie}=`);
    expect((await me(browser("/api/auth/me", session))).status).toBe(401);
  });

  it("rejects a known member outside the app's scope and removes the callback code", async () => {
    outOfScope = true;
    const { response, session } = await signIn("https://external.example.invalid");
    expect(response.headers.get("location")).toBe("/login?error=wecomAccess");
    expect(session).toBeUndefined();
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("rechecks scope and activation before extending access and revokes the session on denial", async () => {
    const { session } = await signIn();
    expect(session).toBeDefined();
    now += 300_001;
    memberStatus = 2;
    expect((await me(browser("/api/auth/me", session))).status).toBe(401);
    const page = await proxy(browser("/", session));
    expect(page.headers.get("location")).toBe(ORIGIN + "/login?error=wecom&returnTo=%2F");
    memberStatus = 1;
    expect((await me(browser("/api/auth/me", session))).status).toBe(401);
  });

  it("rejects a previous application's transaction and session after the configured enterprise changes", async () => {
    const existing = await signIn("/admin/knowledge");
    expect(existing.response.headers.get("location")).toBe(ORIGIN + "/");
    expect(existing.session).toBeDefined();
    const flow = await begin();
    vi.stubEnv("WECOM_AUTO_CORP_ID", "wwOtherEnterprise");
    expect((await wecomAutoCallback(browser(flow.callback, flow.verifier))).headers.get("location")).toBe("/login?error=wecom");
    expect((await me(browser("/api/auth/me", existing.session))).status).toBe(401);
  });

  it("keeps the local user on reentry and invalidates the replaced dealer session", async () => {
    const first = await signIn();
    expect(first.session).toBeDefined();
    const before = await (await me(browser("/api/auth/me", first.session))).json();
    const second = await signIn("/action", first.session);
    expect(second.response.headers.get("location")).toBe(ORIGIN + "/action");
    expect(second.session).toBeDefined();
    const after = await (await me(browser("/api/auth/me", second.session))).json();
    expect(after.user.id).toBe(before.user.id);
    expect((await me(browser("/api/auth/me", first.session))).status).toBe(401);
  });
});
