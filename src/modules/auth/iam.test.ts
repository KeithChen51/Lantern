import { afterEach, describe, expect, it, vi } from "vitest";
import { readIamLoginConfig } from "./iam-config";
import { IamIdentityClient } from "./iam";

const config = { baseUrl: "https://iam.example.invalid", clientId: "fixture-client", clientSecret: "fixture-secret&+" };
const env = { IAM_BASE_URL: config.baseUrl, IAM_CLIENT_ID: config.clientId, IAM_CLIENT_SECRET: config.clientSecret };
const reply = (value: unknown) => Response.json(value);
afterEach(() => vi.useRealTimers());

describe("direct IAM configuration", () => {
  it("requires an explicit canonical HTTPS origin and credentials", () => {
    expect(readIamLoginConfig(env)).toEqual(config);
    expect(() => readIamLoginConfig({ ...env, IAM_CLIENT_ID: undefined })).toThrow("IAM_CLIENT_ID");
    expect(() => readIamLoginConfig({ ...env, IAM_CLIENT_SECRET: " secret" })).toThrow("IAM_CLIENT_SECRET");
  });
  it.each([undefined, "http://iam.example.invalid", "https://iam.example.invalid/", "https://user:pass@iam.example.invalid", "https://iam.example.invalid/path", "https://iam.example.invalid?x=1", "https://iam.example.invalid#x", "https://IAM.example.invalid", " https://iam.example.invalid"])("rejects noncanonical origin %s", baseUrl => {
    expect(() => readIamLoginConfig({ ...env, IAM_BASE_URL: baseUrl })).toThrow("IAM_BASE_URL");
  });
});

describe("direct IAM OAuth contract", () => {
  it("builds browser authorization with an encoded callback and opaque state", () => {
    const url = new URL(new IamIdentityClient(config).authorizationUrl("http://10.0.147.68:16888/auth/iam/callback", "state&+value"));
    expect(url.origin + url.pathname).toBe(config.baseUrl + "/idp/authCenter/authenticate");
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: config.clientId, redirect_uri: "http://10.0.147.68:16888/auth/iam/callback", response_type: "code", state: "state&+value" });
    expect(url.toString()).not.toContain(config.clientSecret);
  });
  it.each(["javascript:alert(1)", "https://user:pass@example.invalid/callback", "https://example.invalid/callback#fragment"])("rejects invalid callbacks %s", callback => {
    expect(() => new IamIdentityClient(config).authorizationUrl(callback, "fixture-state")).toThrow();
  });
  it("exchanges one code using form BODY and caps expiry from request start", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply({ access_token: "fixture-token", expires_in: "1500", refresh_token: "ignored-refresh", uid: "ignored-uid" }));
    const result = await new IamIdentityClient(config, fetcher, () => 10_000).exchange("fixture-code&+");
    expect(result).toEqual({ token: "fixture-token", expiresAt: 1_510_000 });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(config.baseUrl + "/gateway/bam-protocol-service/oauth2/getToken");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(Object.fromEntries(new URLSearchParams(init!.body as string))).toEqual({ client_id: config.clientId, client_secret: config.clientSecret, code: "fixture-code&+", grant_type: "authorization_code" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("gets the exact loginName without numeric coercion or role inference", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply({ loginName: "000071", displayName: "Untrusted name", spRoleList: ["lighthouse_admin"] }));
    expect(await new IamIdentityClient(config, fetcher).identity("token&+value")).toEqual({ account: "000071", displayName: "000071" });
    const [url, init] = fetcher.mock.calls[0];
    const requestUrl = new URL(url as string);
    expect(requestUrl.pathname).toBe("/gateway/bam-protocol-service/oauth2/getUserInfo");
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({ access_token: "token&+value", client_id: config.clientId });
    expect(init).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
  });
  it.each([{ code: "201", status: "fail", data: null }, { errcode: "21013", msg: "secret-echo" }, { error: "bad", access_token: "token", expires_in: 1500 }])("rejects business failure despite HTTP 200 %#", async body => {
    await expect(new IamIdentityClient(config, async () => reply(body)).exchange("code")).rejects.toMatchObject({ status: 401 });
  });
  it.each([0, -1, 1.5, "0", "1.5", "Infinity", " 1500", null, 9e15])("rejects invalid lifetime %s", async expires_in => {
    await expect(new IamIdentityClient(config, async () => reply({ access_token: "token", expires_in })).exchange("code")).rejects.toMatchObject({ status: 503 });
  });
  it("rejects an already elapsed token rather than extending it after a slow exchange", async () => {
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(2000);
    await expect(new IamIdentityClient(config, async () => reply({ access_token: "token", expires_in: 1 }), now).exchange("code")).rejects.toMatchObject({ status: 503 });
  });
  it.each([7, " 0007", "0007\n", "", null])("rejects invalid identity %s", async loginName => {
    await expect(new IamIdentityClient(config, async () => reply({ loginName })).identity("token")).rejects.toMatchObject({ status: 401 });
  });
  it("rejects credentials containing control characters before network access", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new IamIdentityClient(config, fetcher);
    await expect(client.exchange("code\n")).rejects.toMatchObject({ status: 401 });
    await expect(client.identity("token\u0000")).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not retry a failed single-use code exchange or leak transport details", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("https://iam.invalid?access_token=secret&client_secret=secret"); });
    await expect(new IamIdentityClient(config, fetcher).exchange("secret-code")).rejects.toThrow("OA 认证服务暂时不可用");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([301, 401, 403, 500])("rejects HTTP %s and discards upstream body", async status => {
    await expect(new IamIdentityClient(config, async () => new Response("secret", { status })).identity("token")).rejects.toMatchObject({ status: [401, 403].includes(status) ? 401 : 503 });
  });
  it.each([
    () => new Response("not JSON", { headers: { "content-type": "application/json" } }),
    () => new Response("{}", { headers: { "content-type": "text/html" } }),
    () => reply([]),
    () => reply(null),
    () => reply({ loginName: "0007", huge: "x".repeat(65536) }),
    () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "65537" } }),
  ])("rejects malformed or oversized response %#", async makeResponse => {
    await expect(new IamIdentityClient(config, async () => makeResponse()).identity("token")).rejects.toMatchObject({ status: 503 });
  });
  it("enforces a deadline even when transport does not honor abort", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const result = new IamIdentityClient(config, fetcher).exchange("code");
    const rejected = expect(result).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect((fetcher.mock.calls[0][1]!.signal as AbortSignal).aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("applies the same deadline to a stalled response body and cancels it", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"loginName":')); }, cancel });
    const result = new IamIdentityClient(config, async () => new Response(stream, { headers: { "content-type": "application/json" } })).identity("token");
    const rejected = expect(result).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
