import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "./access-types";
import { WecomTicketClient } from "./wecom-ticket-client";

const config = { baseUrl: "https://wecom.example.invalid", appId: "Synthetic-AppId&A", appKey: "Synthetic-Key+/=" };
const input = { userId: "000071", token: "Synthetic-Ticket&+" };
const employee = { DIVISION: "测试事业部", EMPID: "000071", EMPNAME: "测试员工", USERID: "synthetic-wecom-user" };
const success = { code: "0", msg: employee, detailCode: "0" };
const jsonHeaders = { "content-type": "application/json" };
const reply = (value: unknown) => Response.json(value);
afterEach(() => vi.useRealTimers());

describe("WeCom integration platform configuration and scan URL", () => {
  it("formats a scan URL using a supplied transaction ID, preserving appId case and encoding", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new WecomTicketClient({ ...config, baseUrl: config.baseUrl + "/" }, fetcher);
    const url = new URL(client.scanUrl("Synthetic-Transaction&+"));
    expect(url.origin + url.pathname).toBe(config.baseUrl + "/app/login");
    expect(Object.fromEntries(url.searchParams)).toEqual({ deviceid: "Synthetic-Transaction&+", appid: config.appId });
    expect(url.toString()).not.toContain(config.appKey);
    expect(url.searchParams.has("token")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "http://wecom.example.invalid", "https://wecom.example.invalid/path", "https://user:pass@wecom.example.invalid",
    "https://wecom.example.invalid?x=1", "https://wecom.example.invalid#fragment", "https://wecom.example.invalid?",
    "https://wecom.example.invalid#", " https://wecom.example.invalid", "https://WECOM.example.invalid",
    "https://wecom.example.invalid:443", "https://wecom.example.invalid/../", "https://wecom.example.invalid//",
  ])("rejects a noncanonical or unsafe base URL %s", baseUrl => {
    expect(() => new WecomTicketClient({ ...config, baseUrl })).toThrow("企微认证配置无效。");
  });

  it.each([
    { appId: "" }, { appId: " app" }, { appId: "x".repeat(121) }, { appId: "app\n" },
    { appKey: "" }, { appKey: "key\u0085value" }, { appKey: "key\nvalue" }, { appKey: "密钥" },
    { appKey: "x".repeat(8193) }, { appKey: 17 }, { baseUrl: undefined },
  ])("rejects invalid configuration without disclosing it %#", changes => {
    expect(() => new WecomTicketClient({ ...config, ...changes } as typeof config)).toThrow("企微认证配置无效。");
  });

  it.each(["", " transaction", "x".repeat(257), "transaction\n", "transaction\u0085"])("rejects malformed transaction IDs %#", deviceId => {
    expect(() => new WecomTicketClient(config).scanUrl(deviceId)).toThrow("企微扫码请求无效。");
  });

  it("copies configuration at construction and snapshots verification input", async () => {
    const mutableConfig = { ...config };
    const mutableInput = { ...input };
    const fetcher = vi.fn<typeof fetch>(async () => reply(success));
    const client = new WecomTicketClient(mutableConfig, fetcher);
    mutableConfig.baseUrl = "https://untrusted.example.invalid";
    mutableConfig.appKey = "changed-key";
    mutableConfig.appId = "changed-app";
    const result = client.verify(mutableInput);
    mutableInput.userId = "changed-account";
    mutableInput.token = "changed-ticket";
    expect(await result).toMatchObject({ account: "000071" });
    expect(fetcher.mock.calls[0][0]).toBe(config.baseUrl + "/admin/services/weixin/auth/validtokenbackuserinfo");
    expect(fetcher.mock.calls[0][1]!.headers).toEqual({ Authentication: `Basic ${config.appKey}`, "Content-Type": "application/json" });
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ ...input, appId: config.appId });
    expect(new URL(client.scanUrl("synthetic-transaction")).searchParams.get("appid")).toBe(config.appId);
  });
});

describe("single-use WeCom ticket verification", () => {
  it("sends the exact documented request and trusts only the account-bound employee response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply({ ...success, roles: ["ignored-role"], isActive: true }));
    expect(await new WecomTicketClient(config, fetcher).verify(input)).toEqual({
      account: "000071", displayName: "测试员工", wecomUserId: "synthetic-wecom-user", division: "测试事业部",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(config.baseUrl + "/admin/services/weixin/auth/validtokenbackuserinfo");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(init!.headers).toEqual({ Authentication: `Basic ${config.appKey}`, "Content-Type": "application/json" });
    expect(JSON.parse(init!.body as string)).toEqual({ ...input, appId: config.appId });
    expect(new Headers(init!.headers).has("Authorization")).toBe(false);
    expect(String(url)).not.toContain(input.token);
    expect(String(url)).not.toContain(config.appKey);
  });

  it("falls back to the exact employee account only when EMPNAME is absent", async () => {
    const msg = { EMPID: "000071", USERID: "different-wecom-id" };
    expect(await new WecomTicketClient(config, async () => reply({ code: "0", msg })).verify(input)).toEqual({
      account: "000071", displayName: "000071", wecomUserId: "different-wecom-id",
    });
  });

  it.each([
    { code: "1", msg: "Synthetic upstream failure" }, { code: 0, msg: employee }, { msg: employee },
    { code: "0", msg: null }, { code: "0", msg: [] }, { code: "0", msg: "invalid" },
    { ...success, detailCode: "1" }, { ...success, detailCode: 0 },
  ])("rejects business failure and malformed success envelopes %#", async body => {
    const fetcher = vi.fn<typeof fetch>(async () => reply(body));
    await expect(new WecomTicketClient(config, fetcher).verify(input)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { EMPID: "71" }, { EMPID: 71 }, { EMPID: "000072" }, { EMPID: "000071\n" }, { EMPID: "x".repeat(81) },
    { EMPID: undefined, USERID: "000071" }, { USERID: undefined }, { USERID: 71 }, { USERID: "" },
    { USERID: "id\u0000" }, { USERID: "x".repeat(257) }, { EMPNAME: null }, { EMPNAME: "" },
    { EMPNAME: "name\n" }, { EMPNAME: "x".repeat(121) }, { DIVISION: null }, { DIVISION: 42 },
    { DIVISION: "division\u0085" }, { DIVISION: "x".repeat(201) },
  ])("rejects mismatched accounts and invalid employee field types or bounds %#", async changes => {
    await expect(new WecomTicketClient(config, async () => reply({ ...success, msg: { ...employee, ...changes } })).verify(input))
      .rejects.toMatchObject({ status: 401 });
  });

  it.each([
    { userId: 71 }, { userId: " 000071" }, { userId: "000071\n" }, { userId: "x".repeat(81) },
    { token: "" }, { token: "token\n" }, { token: "token\u0085" }, { token: "x".repeat(8193) }, { token: 7 },
  ])("rejects invalid input before issuing any request %#", async changes => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new WecomTicketClient(config, fetcher).verify({ ...input, ...changes } as typeof input)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([301, 302, 307, 401, 403, 404, 500])("rejects HTTP %s with no retry and no upstream body leakage", async status => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("Synthetic-Secret-Body", { status }));
    const error = await new WecomTicketClient(config, fetcher).verify(input).catch(error => error);
    expect(error).toMatchObject({ status: [401, 403].includes(status) ? 401 : 503 });
    expect(error.message).not.toContain("Synthetic-Secret-Body");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("also rejects an already-followed redirect returned by a transport", async () => {
    const response = reply(success);
    Object.defineProperty(response, "redirected", { value: true });
    await expect(new WecomTicketClient(config, async () => response).verify(input)).rejects.toMatchObject({ status: 503 });
  });

  it("recognizes the documented JSON invalid-ticket response with HTTP 404", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: "1", msg: "Synthetic-Private-Ticket", detailCode: "0" }, { status: 404 }));
    const error = await new WecomTicketClient(config, fetcher).verify(input).catch(error => error);
    expect(error).toMatchObject({ status: 401 });
    expect(error.message).not.toContain("Synthetic");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([Error, AccessError])("sanitizes even credential-bearing transport errors of type %s", async ErrorClass => {
    const secret = `${config.baseUrl}?token=${input.token}&key=${config.appKey}`;
    const fetcher = vi.fn<typeof fetch>(async () => { throw new ErrorClass(secret); });
    const error = await new WecomTicketClient(config, fetcher).verify(input).catch(error => error);
    expect(error.message).toBe("企微认证服务暂时不可用，请稍后重试。");
    expect(error.cause).toBeUndefined();
    expect(`${error.stack} ${JSON.stringify(error)}`).not.toContain("Synthetic");
    expect(`${error.stack} ${JSON.stringify(error)}`).not.toContain("wecom.example.invalid");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => new Response("not JSON", { headers: jsonHeaders }),
    () => new Response("{}", { headers: { "content-type": "text/html" } }),
    () => new Response("{}", { headers: { "content-type": "application/json-invalid" } }),
    () => new Response(null, { headers: jsonHeaders }),
    () => reply([]), () => reply(null),
    () => reply({ ...success, padding: "x".repeat(65536) }),
    () => new Response("{}", { headers: { ...jsonHeaders, "content-length": "65537" } }),
    () => new Response("{}", { headers: { ...jsonHeaders, "content-length": "invalid" } }),
    () => new Response(new Uint8Array([0xff]), { headers: jsonHeaders }),
  ])("rejects malformed JSON, media type, encoding, and excessive response size %#", async makeResponse => {
    await expect(new WecomTicketClient(config, async () => makeResponse()).verify(input)).rejects.toMatchObject({ status: 503 });
  });

  it("bounds the actual stream even if the declared size is smaller and cancels the reader", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(65536)); controller.enqueue(new Uint8Array(1)); }, cancel,
    });
    await expect(new WecomTicketClient(config, async () => new Response(stream, { headers: { ...jsonHeaders, "content-length": "2" } })).verify(input))
      .rejects.toMatchObject({ status: 503 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("sanitizes response stream failures", async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(new Error("Synthetic-Stream-Secret")); } });
    const error = await new WecomTicketClient(config, async () => new Response(stream, { headers: jsonHeaders })).verify(input).catch(error => error);
    expect(error).toMatchObject({ status: 503 });
    expect(`${error.message} ${error.stack} ${JSON.stringify(error)}`).not.toContain("Synthetic-Stream-Secret");
    expect(error.cause).toBeUndefined();
  });

  it("enforces the deadline when fetch ignores abort and never retries", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const result = new WecomTicketClient(config, fetcher).verify(input);
    const rejected = expect(result).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies the same deadline to a stalled body even when its cancellation also stalls", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"code":')); }, cancel });
    const result = new WecomTicketClient(config, async () => new Response(stream, { headers: jsonHeaders })).verify(input);
    const rejected = expect(result).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
