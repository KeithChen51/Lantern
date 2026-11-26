import { describe, expect, it, vi } from "vitest";
import { createChannelAdapter } from "./channels";
import { getPublicationChannelInfo, publicationEnabled } from "./configuration";
import { MAX_ARTICLE_BYTES, imageMarker, type PublicationArticle, type PublicationImage } from "./contracts";

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  WECOM_PUBLISHING_ENABLED: "true",
  WECOM_PUBLISHING_GROUP_BASE_URL: "https://gateway.example.test/platform/",
  WECOM_PUBLISHING_GROUP_APP_ID: "example-app",
  WECOM_PUBLISHING_GROUP_APP_KEY: "private-app-key",
  WECOM_PUBLISHING_AUTO_CORP_ID: "wwexample",
  WECOM_PUBLISHING_AUTO_AGENT_ID: "1000001",
  WECOM_PUBLISHING_AUTO_SECRET: "private-app-secret",
};
const image: PublicationImage = { name: "cover.png", mimeType: "image/png", bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]) };
const article: PublicationArticle = { title: "测试图文", digest: "摘要", html: `<p><img src="${imageMarker(0)}"></p>`, sourceUrl: "https://lighthouse.example.test/article" };
const emptyIssues = { invalidUsers: [], invalidDepartments: [], invalidTags: [], unlicensedUsers: [] };

function fetchFixture(replies: unknown[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const reply of replies) fetcher.mockResolvedValueOnce(Response.json(reply));
  return fetcher;
}

function jsonBody(fetcher: ReturnType<typeof fetchFixture>, index: number) {
  return JSON.parse(String(fetcher.mock.calls[index][1]?.body));
}

describe("publication application configuration", () => {
  it("requires explicit activation and keeps incomplete applications out of the targets", () => {
    expect(publicationEnabled({ NODE_ENV: "test", WECOM_PUBLISHING_ENABLED: "TRUE" })).toBe(false);
    expect(getPublicationChannelInfo({ NODE_ENV: "test" })).toEqual([]);
    expect(getPublicationChannelInfo(env)).toEqual([
      { id: "group", label: "集团企微", coverLimit: 2 * 1024 * 1024, bodyImageLimit: 2 * 1024 * 1024 },
      { id: "auto", label: "汽车企微", coverLimit: 10 * 1024 * 1024, bodyImageLimit: 2 * 1024 * 1024 },
    ]);
    expect(getPublicationChannelInfo({ ...env, WECOM_PUBLISHING_AUTO_SECRET: "" }).map(item => item.id)).toEqual(["group"]);
  });

  it.each(["http://gateway.example.test/", "https://user:password@gateway.example.test/", "https://gateway.example.test/?query=secret", "not a URL"])("rejects invalid configured upstream %s without exposing it", base => {
    expect(() => createChannelAdapter("group", { env: { ...env, WECOM_PUBLISHING_GROUP_BASE_URL: base } })).toThrow("所选企微发布通道尚未启用或配置无效。");
  });
});

describe("group publication adapter", () => {
  it("uploads with the group fields and raw Basic AppKey, replaces body images, and sends independent department recipients", async () => {
    const fetcher = fetchFixture([
      { code: 0, detailCode: 0, msg: { errcode: 0, media_id: "cover-media" } },
      { code: 0, detailCode: 0, msg: JSON.stringify({ url: "https://image.example.test/body?a=1&b=2" }) },
      { code: 0, msgid: "message-1" },
    ]);
    const adapter = createChannelAdapter("group", { env, fetcher });
    const prepared = await adapter.prepare(article, image, [image]);
    expect(prepared.html).toContain("?a=1&amp;b=2");
    expect(await adapter.send(prepared, { kind: "departments", ids: ["42", "50"] })).toEqual({ status: "accepted", messageId: "message-1", issues: emptyIssues });
    const paths = fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual(["/platform/media/temp/upload", "/platform/media/uploadimg", "/platform/msg/send"]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
      expect(new Headers(init?.headers).get("Authentication")).toBe("Basic private-app-key");
    }
    const coverWire = Buffer.from(fetcher.mock.calls[0][1]?.body as Uint8Array).toString();
    expect(coverWire).toContain('name="filename"\r\n\r\nimage.png');
    expect(coverWire).toContain('name="content-type"\r\n\r\nimage/png');
    expect(coverWire).toContain('name="type"\r\n\r\nimage');
    expect(coverWire).toContain('name="file"; filename="image.png"');
    const imageWire = Buffer.from(fetcher.mock.calls[1][1]?.body as Uint8Array).toString();
    expect(imageWire).toContain('name="appId"\r\n\r\nexample-app');
    expect(jsonBody(fetcher, 2)).toMatchObject({ appid: "example-app", touser: "", toparty: "42|50", totag: "", msgtype: "mpnews", msgDetail: { articles: [{ thumb_media_id: "cover-media", content_source_url: article.sourceUrl }] } });
    expect(jsonBody(fetcher, 2)).not.toHaveProperty("agentid");
  });

  it.each([
    { errcode: 0, url: "https://image.example.test/body" },
    { code: 0, detailCode: 0, msg: { errcode: 0, url: "https://image.example.test/body" } },
    { code: 0, detailCode: 0, msg: "https://image.example.test/body" },
    { detailCode: 0, msg: JSON.stringify({ url: "https://image.example.test/body" }) },
  ])("accepts verified image response shapes %j", async response => {
    const fetcher = fetchFixture([{ code: 0, msg: { errcode: 0, media_id: "cover" } }, response]);
    const adapter = createChannelAdapter("group", { env, fetcher });
    expect((await adapter.prepare(article, image, [image])).html).toContain("https://image.example.test/body");
  });

  it("requires both the outer and inner cover status", async () => {
    const fetcher = fetchFixture([{ code: 0, detailCode: 0, msg: { errcode: 60020, media_id: "invalid" } }]);
    await expect(createChannelAdapter("group", { env, fetcher }).prepare(article, image, [image])).rejects.toMatchObject({ code: "wecom_60020" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ code: 0, detailCode: 60020 }, "failed"],
    [{ detailCode: 0, msgid: "missing-code" }, "unknown"],
    [{ code: 0, msg: JSON.stringify({ errcode: 0, msgid: "message", invalidparty: "42" }) }, "partial"],
    [{ code: 1, msgid: "conflicting-result" }, "unknown"],
  ])("retains wrapped send status %j", async (reply, status) => {
    const fetcher = fetchFixture([reply]);
    const result = await createChannelAdapter("group", { env, fetcher }).send({ ...article, html: "<p>正文</p>", coverMediaId: "cover" }, { kind: "all" });
    expect(result.status).toBe(status);
  });
});

describe("official publication adapter", () => {
  it("sends the validated byte multipart and a numeric application id", async () => {
    const fetcher = fetchFixture([
      { errcode: 0, access_token: "private-token", expires_in: 7200 },
      { errcode: 0, media_id: "cover" },
      { errcode: 0, url: "https://image.example.test/body" },
      { errcode: 0, msgid: "message-2", invaliduser: "member-2", unlicenseduser: "member-3" },
    ]);
    const adapter = createChannelAdapter("auto", { env, fetcher });
    const prepared = await adapter.prepare(article, image, [image]);
    expect(await adapter.send(prepared, { kind: "members", ids: ["member-1", "member-2", "member-3"] })).toEqual({ status: "partial", messageId: "message-2", issues: { ...emptyIssues, invalidUsers: ["member-2"], unlicensedUsers: ["member-3"] } });
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(["/cgi-bin/gettoken", "/cgi-bin/media/upload", "/cgi-bin/media/uploadimg", "/cgi-bin/message/send"]);
    const upload = fetcher.mock.calls[1][1]!;
    const headers = new Headers(upload.headers);
    const type = headers.get("content-type")!;
    expect(type).toMatch(/^multipart\/form-data; boundary=[-a-z0-9]+$/);
    const body = Buffer.from(upload.body as Uint8Array);
    expect(Number(headers.get("content-length"))).toBe(body.byteLength);
    expect(body.toString()).toContain('Content-Disposition: form-data; name="media";filename="image.png"; filelength=9\r\nContent-Type: image/png\r\n\r\n');
    expect(body.subarray(-4).toString()).toBe("--\r\n");
    const sent = jsonBody(fetcher, 3);
    expect(sent).toMatchObject({ agentid: 1000001, touser: "member-1|member-2|member-3", msgtype: "mpnews", mpnews: { articles: [{ content: prepared.html }] }, enable_duplicate_check: 1 });
    expect(sent).not.toHaveProperty("appid");
  });

  it.each([
    [{ errcode: 81013 }, "failed", "wecom_81013"],
    [{ errcode: 0 }, "unknown", "unconfirmed"],
    [{ msgid: "without-status" }, "unknown", "unconfirmed"],
    [{ errcode: 0, msgid: "with-id", invalidparty: [42] }, "unknown", "unconfirmed"],
    [{ errcode: 0, msgid: "ok" }, "accepted", undefined],
  ])("preserves send outcome %j", async (reply, status, code) => {
    const fetcher = fetchFixture([{ errcode: 0, access_token: "private-token", expires_in: 7200 }, reply]);
    const result = await createChannelAdapter("auto", { env, fetcher }).send({ ...article, html: "<p>正文</p>", coverMediaId: "cover" }, { kind: "all" });
    expect(result).toMatchObject({ status, ...(code ? { code } : {}) });
    expect(jsonBody(fetcher, 1)).toMatchObject({ touser: "@all", toparty: "", totag: "" });
  });

  it("keeps network failures unconfirmed without retrying or disclosing secrets", async () => {
    const fetcher = fetchFixture([{ errcode: 0, access_token: "private-token", expires_in: 7200 }]);
    fetcher.mockRejectedValueOnce(new Error("https://upstream/?access_token=private-token"));
    const result = await createChannelAdapter("auto", { env, fetcher }).send({ ...article, html: "<p>正文</p>", coverMediaId: "cover" }, { kind: "all" });
    expect(result).toMatchObject({ status: "unknown", code: "unconfirmed" });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("leaves an unresponsive send pending verification after the request deadline", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
      const outcome = createChannelAdapter("group", { env, fetcher }).send({ ...article, html: "<p>正文</p>", coverMediaId: "cover" }, { kind: "all" });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await outcome).toMatchObject({ status: "unknown", code: "unconfirmed" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("replaces multiple references using this application's uploaded image URLs", async () => {
    const fetcher = fetchFixture([
      { errcode: 0, access_token: "token", expires_in: 7200 }, { errcode: 0, media_id: "cover" },
      { errcode: 0, url: "https://image.example.test/first" }, { errcode: 0, url: "https://image.example.test/second" },
    ]);
    const html = `<img src="${imageMarker(0)}"><img src="${imageMarker(1)}"><img src="${imageMarker(0)}">`;
    const prepared = await createChannelAdapter("auto", { env, fetcher }).prepare({ ...article, html }, image, [image, image]);
    expect(prepared.html).toBe('<img src="https://image.example.test/first"><img src="https://image.example.test/second"><img src="https://image.example.test/first">');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("keeps non-JSON send responses and oversized responses pending verification", async () => {
    const prepared = { ...article, html: "<p>正文</p>", coverMediaId: "cover" };
    for (const response of [new Response("<html>Unavailable</html>", { status: 502 }), Response.json({ code: 0, msgid: "a".repeat(1024 * 1024) })]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response);
      const result = await createChannelAdapter("group", { env, fetcher }).send(prepared, { kind: "all" });
      expect(result.status).toBe("unknown");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("blocks invalid images and unmatched references before uploading", async () => {
    const fetcher = fetchFixture([]);
    const adapter = createChannelAdapter("auto", { env, fetcher });
    await expect(adapter.prepare(article, { ...image, bytes: new Uint8Array(10) }, [image])).rejects.toMatchObject({ code: "invalid_image" });
    await expect(adapter.prepare(article, image, [])).rejects.toMatchObject({ code: "invalid_images" });
    await expect(adapter.prepare({ ...article, html: "<p>没有引用</p>" }, image, [image])).rejects.toMatchObject({ code: "invalid_images" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rechecks UTF-8 content size after replacing uploaded URLs", async () => {
    const fetcher = fetchFixture([{ errcode: 0, access_token: "token", expires_in: 7200 }, { errcode: 0, media_id: "cover" }, { errcode: 0, url: `https://image.example.test/${"a".repeat(150)}` }]);
    const html = `${"a".repeat(MAX_ARTICLE_BYTES - imageMarker(0).length)}${imageMarker(0)}`;
    await expect(createChannelAdapter("auto", { env, fetcher }).prepare({ ...article, html }, image, [image])).rejects.toMatchObject({ code: "article_too_large" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
