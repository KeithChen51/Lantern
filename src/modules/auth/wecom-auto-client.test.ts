import { describe, expect, it, vi } from "vitest";
import { WecomAutoClient } from "./wecom-auto-client";

const app = { corpId: "wwexample", agentId: "1000001", secret: "app-secret" };
const token = { errcode: 0, access_token: "app-token", expires_in: 7200 };
const details = { errcode: 0, agentid: 1000001, close: 0 };
const identity = { errcode: 0, userid: "Member-A" };
const member = { errcode: 0, userid: "MEMBER-A", status: 1, name: "测试成员" };

function fixture(replies: unknown[], now?: () => number) {
  const fetcher = vi.fn<typeof fetch>();
  for (const reply of replies) fetcher.mockResolvedValueOnce(Response.json(reply));
  return { client: new WecomAutoClient(app, fetcher, now), fetcher };
}

function paths(fetcher: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname);
}

describe("official WeCom authentication", () => {
  it("builds a silent authorization request for the configured application", () => {
    const { client, fetcher } = fixture([]);
    const callback = "https://lighthouse.example/auth/wecom/auto/callback";
    const url = new URL(client.authorizationUrl(callback, "ab01"));
    expect(url.origin + url.pathname).toBe("https://open.weixin.qq.com/connect/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      appid: app.corpId, redirect_uri: callback, response_type: "code", scope: "snsapi_base", state: "ab01", agentid: app.agentId,
    });
    expect(url.hash).toBe("#wechat_redirect");
    expect(url.href).not.toContain(app.secret);
    expect(() => client.authorizationUrl(callback, "contains_nonAlnum")).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("proves the app and checks visibility with the app token before returning a canonical member", async () => {
    const { client, fetcher } = fixture([token, details, identity, member]);
    await expect(client.authenticate("single-use-code")).resolves.toEqual({ userId: "member-a", displayName: "测试成员" });
    expect(paths(fetcher)).toEqual(["/cgi-bin/gettoken", "/cgi-bin/agent/get", "/cgi-bin/auth/getuserinfo", "/cgi-bin/user/get"]);
    const requests = fetcher.mock.calls.map(([input, init]) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://qyapi.weixin.qq.com");
      expect(init).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
      return Object.fromEntries(url.searchParams);
    });
    expect(requests).toEqual([
      { corpid: app.corpId, corpsecret: app.secret },
      { access_token: "app-token", agentid: app.agentId },
      { access_token: "app-token", code: "single-use-code" },
      { access_token: "app-token", userid: "member-a" },
    ]);
  });

  it.each([
    { ...details, agentid: 1000002 },
    { ...details, close: 1 },
  ])("refuses a token for the wrong or disabled app: %j", async (appDetails) => {
    const { client, fetcher } = fixture([token, appDetails]);
    await expect(client.authenticate("code")).rejects.toMatchObject({ status: 503 });
    expect(paths(fetcher)).toEqual(["/cgi-bin/gettoken", "/cgi-bin/agent/get"]);
  });

  it.each([
    { errcode: 0, openid: "external" },
    { errcode: 0, userid: "wwanother/Member-A" },
    { ...identity, external_userid: "ambiguous" },
  ])("does not look up an external, linked or ambiguous identity: %j", async (profile) => {
    const { client, fetcher } = fixture([token, details, profile]);
    await expect(client.authenticate("code")).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    { errcode: 60011 },
    { errcode: 60111 },
    { ...member, status: 2 },
    { ...member, userid: "wrong-member" },
  ])("requires an active and visible matching member: %j", async (profile) => {
    const { client, fetcher } = fixture([token, details, identity, profile]);
    await expect(client.authenticate("code")).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not repeat a code exchange if the app token expires", async () => {
    const { client, fetcher } = fixture([token, details, { errcode: 42001 }]);
    await expect(client.authenticate("code")).rejects.toMatchObject({ status: 503 });
    expect(paths(fetcher)).toEqual(["/cgi-bin/gettoken", "/cgi-bin/agent/get", "/cgi-bin/auth/getuserinfo"]);
  });

  it("reuses the app token and retries an idempotent member read once after token expiry", async () => {
    const { client, fetcher } = fixture([
      token, details, member,
      { errcode: 40014 }, { ...token, access_token: "replacement" }, details, { ...member, name: undefined },
      { errcode: 60011 },
    ]);
    await client.readMember("MEMBER-A");
    await expect(client.readMember("member-a")).resolves.toEqual({ userId: "member-a", displayName: "member-a" });
    await expect(client.readMember("member-a")).rejects.toMatchObject({ status: 403 });
    expect(paths(fetcher)).toEqual([
      "/cgi-bin/gettoken", "/cgi-bin/agent/get", "/cgi-bin/user/get", "/cgi-bin/user/get",
      "/cgi-bin/gettoken", "/cgi-bin/agent/get", "/cgi-bin/user/get", "/cgi-bin/user/get",
    ]);
    expect(new URL(String(fetcher.mock.calls[6][0])).searchParams.get("access_token")).toBe("replacement");
  });

  it("coalesces simultaneous token requests and refreshes the cache before expiration", async () => {
    let now = 0;
    const { client, fetcher } = fixture([token, details, member, member, token, details, member], () => now);
    await Promise.all([client.readMember("member-a"), client.readMember("member-a")]);
    now += (7200 - 59) * 1000;
    await client.readMember("member-a");
    expect(paths(fetcher)).toEqual([
      "/cgi-bin/gettoken", "/cgi-bin/agent/get", "/cgi-bin/user/get", "/cgi-bin/user/get",
      "/cgi-bin/gettoken", "/cgi-bin/agent/get", "/cgi-bin/user/get",
    ]);
  });

  it("does not expose request credentials or response data on a network failure", async () => {
    const { client, fetcher } = fixture([token, details]);
    fetcher.mockRejectedValueOnce(new Error("request includes app-token and single-use-code"));
    await expect(client.authenticate("single-use-code")).rejects.toMatchObject({
      status: 503, message: "企业微信认证服务暂时不可用，请稍后重试。",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("WeCom member organization", () => {
  const department = (id: number, name: string, parentid: number) => ({ errcode: 0, department: { id, name, parentid } });

  it("reads the verified member's main department and renders the readable path in hierarchy order", async () => {
    const { client, fetcher } = fixture([
      token, details, { ...member, department: [9, 12], main_department: 12 },
      department(12, "试点门店", 8), department(8, "区域服务部", 3), department(3, "售后服务", 1),
    ]);
    await expect(client.readOrganization("member-a")).resolves.toBe("售后服务 / 区域服务部 / 试点门店");
    expect(paths(fetcher)).toEqual([
      "/cgi-bin/gettoken", "/cgi-bin/agent/get", "/cgi-bin/user/get",
      "/cgi-bin/department/get", "/cgi-bin/department/get", "/cgi-bin/department/get",
    ]);
    expect(fetcher.mock.calls.slice(3).map(([url]) => new URL(String(url)).searchParams.get("id"))).toEqual(["12", "8", "3"]);
  });

  it("keeps the readable department when the app cannot read its parent", async () => {
    const { client, fetcher } = fixture([
      token, details, { ...member, department: [1, 12] },
      department(12, "试点门店", 8), { errcode: 60011 },
    ]);
    await expect(client.readOrganization("member-a")).resolves.toBe("试点门店");
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("leaves organization empty when there is no unambiguous department", async () => {
    const { client, fetcher } = fixture([token, details, { ...member, department: [7, 12] }]);
    await expect(client.readOrganization("member-a")).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not look up any department for a different member in the response", async () => {
    const { client, fetcher } = fixture([token, details, { ...member, userid: "another-user", main_department: 12 }]);
    await expect(client.readOrganization("member-a")).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
