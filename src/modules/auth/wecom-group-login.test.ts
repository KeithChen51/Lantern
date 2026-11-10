import { describe, expect, it, vi } from "vitest";
import { MemoryAccessStore } from "./access-store";
import type { AccessConfig } from "./access-types";
import { readWecomGroupConfig, WECOM_GROUP_CALLBACK, WECOM_GROUP_MARKER } from "./wecom-group-config";
import { WecomGroupLogin } from "./wecom-group-login";

const site = {
  mode: "iam", origin: "https://lighthouse.example.invalid", secureCookies: true,
  encryptionKey: Buffer.alloc(32, 5).toString("base64"), sessionCookie: "__Host-lighthouse_session",
  transactionMs: 300_000,
} as AccessConfig;
const env = {
  WECOM_GROUP_MODE: "probe", WECOM_GROUP_CORP_ID: "ww1234567890123456",
  WECOM_GROUP_APP_ID: "group-pilot", WECOM_GROUP_APP_KEY: "synthetic-key",
};
const identity = { account: "000123", displayName: "员工", wecomUserId: "synthetic-member" };

function setup() {
  let now = 1_000_000;
  const config = readWecomGroupConfig(site, env)!;
  const store = new MemoryAccessStore();
  const client = { verify: vi.fn(async () => identity) };
  const flow = new WecomGroupLogin(config, client, store, () => now);
  const advance = (ms: number) => { now += ms; };
  async function begin(returnTo?: string) {
    const { cookie, redirectUrl } = await flow.startLogin(returnTo);
    const oauth = new URL(redirectUrl);
    const middle = new URL(oauth.searchParams.get("redirect_uri")!);
    const backUrl = new URL(middle.searchParams.get("backurl")!);
    const params = new URLSearchParams(backUrl.search);
    params.set("userid", identity.account);
    params.set("token", "synthetic+ticket/=value");
    params.set("appid", config.appId);
    params.set("redirect", "https://untrusted.example.invalid/");
    return { cookie, oauth, middle, backUrl, params };
  }
  return { config, store, client, flow, advance, begin };
}

describe("Group WeCom workbench transaction", () => {
  it("keeps the Group app ID in state and the browser transaction in the fixed HTTPS backurl", async () => {
    const { begin, config, flow, client, store } = setup();
    const { cookie, oauth, middle, backUrl, params } = await begin("/hermit?topic=practice&token=must-not-persist");
    expect(oauth.origin + oauth.pathname).toBe("https://open.weixin.qq.com/connect/oauth2/authorize");
    expect(oauth.hash).toBe("#wechat_redirect");
    expect(oauth.searchParams.get("appid")).toBe(config.corpId);
    expect(oauth.searchParams.get("state")).toBe(config.appId);
    expect(oauth.searchParams.get("scope")).toBe("snsapi_userinfo");
    expect(middle.origin + middle.pathname).toBe("https://weixin.byd.com/admin/app/auth");
    expect(backUrl.origin + backUrl.pathname).toBe(site.origin + WECOM_GROUP_CALLBACK);
    expect([...backUrl.searchParams.keys()]).toEqual([WECOM_GROUP_MARKER]);
    expect(backUrl.searchParams.get(WECOM_GROUP_MARKER)).toMatch(/^[a-f0-9]{32}$/);
    const result = await flow.verifyCallback(params, cookie);
    expect(result).toMatchObject({ identity, returnTo: "/hermit?topic=practice" });
    expect(client.verify).toHaveBeenCalledExactlyOnceWith({ userId: "000123", token: "synthetic+ticket/=value" });
    const persisted = JSON.stringify(store.snapshot());
    for (const value of [env.WECOM_GROUP_APP_KEY, cookie, "synthetic+ticket", "must-not-persist", "untrusted.example.invalid"]) {
      expect(persisted).not.toContain(value);
    }
  });

  it("rejects cross-browser, wrong-app, missing and duplicate parameters before submitting the ticket", async () => {
    const { begin, flow, client } = setup();
    const first = await begin();
    const other = await begin();
    await expect(flow.verifyCallback(first.params, other.cookie)).rejects.toMatchObject({ status: 401 });
    for (const [name, value] of [["appid", "another-app"], ["userid", ""], [WECOM_GROUP_MARKER, ""], ["token", ""], ["code", "unexpected"]]) {
      const params = new URLSearchParams(first.params);
      params.set(name, value);
      await expect(flow.verifyCallback(params, first.cookie)).rejects.toMatchObject({ status: 401 });
    }
    const duplicate = new URLSearchParams(first.params);
    duplicate.append("token", "other-ticket");
    await expect(flow.verifyCallback(duplicate, first.cookie)).rejects.toMatchObject({ status: 401 });
    expect(client.verify).not.toHaveBeenCalled();
    await expect(flow.verifyCallback(first.params, first.cookie)).resolves.toMatchObject({ identity });
  });

  it("claims a ticket once even when two browser transactions race, and a failure requires a fresh ticket", async () => {
    const { begin, flow, client } = setup();
    const first = await begin();
    const second = await begin();
    client.verify.mockRejectedValueOnce(new Error("synthetic upstream failure"));
    const results = await Promise.allSettled([
      flow.verifyCallback(first.params, first.cookie), flow.verifyCallback(second.params, second.cookie),
    ]);
    expect(results.map(result => result.status)).toEqual(["rejected", "rejected"]);
    await expect(flow.verifyCallback(first.params, first.cookie)).rejects.toMatchObject({ status: 401 });
    expect(client.verify).toHaveBeenCalledTimes(1);
    second.params.set("token", "fresh-ticket");
    await expect(flow.verifyCallback(second.params, second.cookie)).resolves.toMatchObject({ identity });
  });

  it("rejects an expired transaction without spending the ticket", async () => {
    const { advance, begin, flow, client, config } = setup();
    const first = await begin();
    advance(config.transactionMs);
    await expect(flow.verifyCallback(first.params, first.cookie)).rejects.toMatchObject({ status: 401 });
    expect(client.verify).not.toHaveBeenCalled();
  });

  it("uses an isolated cookie namespace, is off by default, and rejects insecure configuration", () => {
    expect(readWecomGroupConfig(site, {})).toBeUndefined();
    expect(() => readWecomGroupConfig({ ...site, secureCookies: false }, env)).toThrow();
    expect(() => readWecomGroupConfig(site, { ...env, WECOM_GROUP_APP_KEY: "" })).toThrow();
    const rotated = readWecomGroupConfig(site, { ...env, WECOM_GROUP_APP_KEY: "rotated-synthetic-key" })!;
    expect(rotated.transactionCookie).not.toBe(readWecomGroupConfig(site, env)!.transactionCookie);
  });

  it("requires confirmation of the callback restriction and a fixed pilot roster", () => {
    const employeePilot = { ...env, WECOM_GROUP_MODE: "employee-pilot" };
    expect(() => readWecomGroupConfig(site, employeePilot)).toThrow();
    const confirmed = { ...employeePilot, WECOM_GROUP_BACKURL_RESTRICTION_CONFIRMED: "true" };
    expect(() => readWecomGroupConfig(site, confirmed)).toThrow();
    expect(() => readWecomGroupConfig(site, { ...confirmed, WECOM_GROUP_PILOT_ACCOUNTS: "000123,000123" })).toThrow();
    const pilot = readWecomGroupConfig({ ...site, sessionAbsoluteMs: 10_000_000, identityFreshMs: 300_000, roleFreshMs: 300_000 },
      { ...confirmed, WECOM_GROUP_PILOT_ACCOUNTS: "000123" });
    expect(pilot).toMatchObject({ mode: "employee-pilot", sessionMs: 300_000 });
    expect(pilot?.transactionCookie).not.toBe(readWecomGroupConfig(site, env)?.transactionCookie);
  });
});
