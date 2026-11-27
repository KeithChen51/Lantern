import { randomUUID } from "node:crypto";
import { MAX_ARTICLE_BYTES, MAX_PUBLICATION_IMAGES, PUBLICATION_RECIPIENTS, imageMarker, type DeliveryOutcome, type PublicationArticle, type PublicationAudience, type PublicationChannel, type PublicationImage, type RecipientIssues } from "./contracts";
import { readPublicationConfiguration, type PublicationConfiguration } from "./configuration";

export class PublicationPreparationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "PublicationPreparationError"; }
}

export type PreparedPublication = PublicationArticle & { coverMediaId: string };
export type WecomChannelAdapter = {
  prepare(article: PublicationArticle, cover: PublicationImage, images: readonly PublicationImage[]): Promise<PreparedPublication>;
  send(prepared: PreparedPublication, audience: PublicationAudience): Promise<DeliveryOutcome>;
};

type JsonObject = Record<string, unknown>;
const API_ROOT = "https://qyapi.weixin.qq.com/cgi-bin/";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const unknown = (): DeliveryOutcome => ({ status: "unknown", code: "unconfirmed", message: "发送结果尚未确认，请核验企微收件情况。" });
const preparation = (code: string, message: string) => new PublicationPreparationError(code, message);

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function statusCode(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return typeof value === "string" && /^-?\d{1,12}$/.test(value) ? value : undefined;
}

function identifier(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;
}

function unwrap(value: unknown): unknown {
  if (typeof value !== "string" || !value.trimStart().startsWith("{")) return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

function apiFailure(code: string): PublicationPreparationError {
  return preparation(`wecom_${code}`, code === "60020" ? "企微拒绝当前出口，请核对应用的企业可信 IP（60020）。" : `企微接口拒绝请求（${code}）。`);
}

function requireSuccess(body: JsonObject, field: string): void {
  const code = statusCode(body[field]);
  if (code === undefined) throw preparation("invalid_response", "企微返回的接口状态无法确认。");
  if (code !== "0") throw apiFailure(code);
}

function requireGroupSuccess(body: JsonObject): void {
  requireSuccess(body, "code");
  if ("detailCode" in body) requireSuccess(body, "detailCode");
}

function imageUrl(value: unknown): string {
  const url = identifier(value);
  try {
    const parsed = new URL(url ?? "");
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.href;
  } catch {
    throw preparation("invalid_image_url", "企微返回的正文配图地址无效。");
  }
}

function escapedUrl(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function validateArticle(article: PublicationArticle): void {
  if (!article.title.trim() || Buffer.byteLength(article.title, "utf8") > 128 || Buffer.byteLength(article.digest, "utf8") > 512
    || Buffer.byteLength(article.author ?? "", "utf8") > 64 || !article.html.trim()) {
    throw preparation("invalid_article", "请核对图文标题、摘要、作者和正文长度。");
  }
  if (Buffer.byteLength(article.html, "utf8") > MAX_ARTICLE_BYTES) throw preparation("article_too_large", "正文超过企微的 666 K 字节限制。");
  if (article.sourceUrl) imageUrl(article.sourceUrl);
}

function validateImage(image: PublicationImage, maximum: number): void {
  const bytes = image.bytes;
  const png = bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (bytes.byteLength <= 5 || bytes.byteLength > maximum || !(image.mimeType === "image/png" && png || image.mimeType === "image/jpeg" && jpeg)) {
    throw preparation("invalid_image", "图片类型或大小不符合所选企微通道要求。");
  }
}

function multipart(image: PublicationImage, fields?: Record<string, string>): { body: Uint8Array<ArrayBuffer>; headers: Record<string, string> } {
  const boundary = `---------------------------${randomUUID().replaceAll("-", "")}`;
  const name = image.mimeType === "image/png" ? "image.png" : "image.jpg";
  const chunks: Buffer[] = [];
  if (fields) {
    for (const [key, value] of Object.entries({ filename: name, "content-type": image.mimeType, ...fields })) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
    }
  }
  const disposition = fields ? `name="file"; filename="${name}"` : `name="media";filename="${name}"; filelength=${image.bytes.byteLength}`;
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; ${disposition}\r\nContent-Type: ${image.mimeType}\r\n\r\n`));
  chunks.push(Buffer.from(image.bytes), Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = new Uint8Array(Buffer.concat(chunks));
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body.byteLength) } };
}

function audienceFields(audience: PublicationAudience): { touser: string; toparty: string; totag: string } {
  if (audience.kind === "all") return { touser: "@all", toparty: "", totag: "" };
  const { max: maximum, pattern } = PUBLICATION_RECIPIENTS[audience.kind];
  if (!audience.ids.length || audience.ids.length > maximum || audience.ids.some(id => !pattern.test(id))) {
    throw preparation("invalid_audience", "请核对所选应用的成员账号或部门 ID。");
  }
  const value = [...new Set(audience.ids)].join("|");
  return { touser: audience.kind === "members" ? value : "", toparty: audience.kind === "departments" ? value : "", totag: "" };
}

function recipientList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string" || value.length > 100_000 || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  return [...new Set(value.split("|").filter(Boolean))];
}

function recipientIssues(body: JsonObject): RecipientIssues | undefined {
  const invalidUsers = recipientList(body.invaliduser);
  const invalidDepartments = recipientList(body.invalidparty);
  const invalidTags = recipientList(body.invalidtag);
  const unlicensedUsers = recipientList(body.unlicenseduser);
  if (!invalidUsers || !invalidDepartments || !invalidTags || !unlicensedUsers) return undefined;
  return { invalidUsers, invalidDepartments, invalidTags, unlicensedUsers };
}

function sendResult(body: JsonObject, group: boolean): DeliveryOutcome {
  const inner = object(unwrap(body.msg));
  const code = statusCode(group ? body.code : body.errcode);
  const detail = group && "detailCode" in body ? statusCode(body.detailCode) : "0";
  const innerCode = group && inner && "errcode" in inner ? statusCode(inner.errcode) : "0";
  if (code === undefined || detail === undefined || innerCode === undefined) return unknown();
  const messageId = identifier(body.msgid) ?? identifier(inner?.msgid);
  const rejected = [code, detail, innerCode].find(value => value !== "0");
  const issues = recipientIssues({ ...inner, ...body });
  if (rejected) {
    if (messageId) return unknown();
    return { status: "failed", code: `wecom_${rejected}`, message: apiFailure(rejected).message, ...(issues ? { issues } : {}) };
  }
  if (!messageId || !issues) return unknown();
  return { status: Object.values(issues).some(list => list.length) ? "partial" : "accepted", messageId, issues };
}

async function readJson(response: Response, signal: AbortSignal): Promise<JsonObject> {
  const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!response.ok || response.redirected || !response.body || type && type !== "application/json" && !type.endsWith("+json")) {
    void response.body?.cancel().catch(() => undefined);
    throw preparation("invalid_response", "企微接口响应未通过检查。");
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw preparation("invalid_response", "企微响应超出大小限制。");
      chunks.push(next.value);
    }
    signal.throwIfAborted();
    const body = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
    if (!body) throw new Error();
    return body;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

class ChannelAdapter implements WecomChannelAdapter {
  private token?: { value: string; expiresAt: number };
  private loadingToken?: Promise<string>;

  constructor(private readonly config: PublicationConfiguration, private readonly fetcher: typeof fetch) {}

  private async request(endpoint: string, body?: Uint8Array<ArrayBuffer> | string, headers: Record<string, string> = {}, parameters: Record<string, string> = {}): Promise<JsonObject> {
    const url = new URL(endpoint, this.config.kind === "group" ? this.config.baseUrl : API_ROOT);
    url.search = new URLSearchParams(parameters).toString();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await this.fetcher(url.href, {
            method: body === undefined ? "GET" : "POST", body, cache: "no-store", redirect: "error", signal: controller.signal,
            headers: { accept: "application/json", ...(this.config.kind === "group" ? { Authentication: `Basic ${this.config.appKey}` } : {}), ...headers },
          });
          return readJson(response, controller.signal);
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(preparation("request_failed", "企微接口连接或响应失败。")); }, REQUEST_TIMEOUT_MS);
        }),
      ]);
    } catch {
      // Request URLs and upstream messages may contain application credentials.
      throw preparation("request_failed", "企微接口连接或响应失败。");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async accessToken(): Promise<string> {
    if (this.config.kind !== "auto") throw preparation("invalid_channel", "企微通道配置无效。");
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    this.loadingToken ??= (async () => {
      if (this.config.kind !== "auto") throw new Error();
      const started = Date.now();
      const body = await this.request("gettoken", undefined, {}, { corpid: this.config.corpId, corpsecret: this.config.secret });
      requireSuccess(body, "errcode");
      const value = identifier(body.access_token);
      if (!value || typeof body.expires_in !== "number" || !Number.isSafeInteger(body.expires_in) || body.expires_in <= 0) {
        throw preparation("invalid_token_response", "企微应用鉴权响应无效。");
      }
      this.token = { value, expiresAt: started + Math.min(body.expires_in, 7200) * 1000 - 60_000 };
      return value;
    })().finally(() => { this.loadingToken = undefined; });
    return this.loadingToken;
  }

  private async upload(image: PublicationImage, cover: boolean): Promise<string> {
    if (this.config.kind === "auto") {
      const form = multipart(image);
      const token = await this.accessToken();
      const body = await this.request(cover ? "media/upload" : "media/uploadimg", form.body, form.headers, { access_token: token, ...(cover ? { type: "image" } : {}) });
      if (["40014", "42001"].includes(statusCode(body.errcode) ?? "")) this.token = undefined;
      requireSuccess(body, "errcode");
      if (!cover) return imageUrl(body.url);
      const id = identifier(body.media_id);
      if (!id) throw preparation("invalid_media_response", "企微未返回封面素材编号。");
      return id;
    }
    const form = multipart(image, cover ? { type: "image" } : { appId: this.config.appId });
    const body = await this.request(cover ? "media/temp/upload" : "media/uploadimg", form.body, form.headers);
    if (cover) {
      requireGroupSuccess(body);
      const inner = object(unwrap(body.msg));
      if (!inner) throw preparation("invalid_media_response", "企微未返回封面素材编号。");
      requireSuccess(inner, "errcode");
      const id = identifier(inner.media_id);
      if (!id) throw preparation("invalid_media_response", "企微未返回封面素材编号。");
      return id;
    }
    if ("code" in body || "detailCode" in body) {
      if ("code" in body) requireSuccess(body, "code");
      if ("detailCode" in body) requireSuccess(body, "detailCode");
      if ("errcode" in body) requireSuccess(body, "errcode");
      const value = unwrap(body.msg);
      const inner = object(value);
      if (inner && "errcode" in inner) requireSuccess(inner, "errcode");
      return imageUrl(inner ? inner.url : value);
    }
    requireSuccess(body, "errcode");
    return imageUrl(body.url);
  }

  async prepare(article: PublicationArticle, cover: PublicationImage, images: readonly PublicationImage[]): Promise<PreparedPublication> {
    validateArticle(article);
    validateImage(cover, (this.config.kind === "group" ? 2 : 10) * 1024 * 1024);
    if (images.length > MAX_PUBLICATION_IMAGES) throw preparation("invalid_images", "正文配图数量过多。");
    for (const [index, image] of images.entries()) {
      validateImage(image, 2 * 1024 * 1024);
      if (!article.html.includes(imageMarker(index))) throw preparation("invalid_images", "正文配图与稿件引用不一致。");
    }
    const withoutMarkers = images.reduce((html, _, index) => html.replaceAll(imageMarker(index), ""), article.html);
    if (/__LANTERN_WECOM_IMAGE_\d+__/.test(withoutMarkers)) throw preparation("invalid_images", "稿件引用的正文配图缺失。");
    const coverMediaId = await this.upload(cover, true);
    let html = article.html;
    for (const [index, image] of images.entries()) html = html.replaceAll(imageMarker(index), escapedUrl(await this.upload(image, false)));
    const prepared = { ...article, html, coverMediaId };
    validateArticle(prepared);
    return prepared;
  }

  async send(prepared: PreparedPublication, audience: PublicationAudience): Promise<DeliveryOutcome> {
    let recipients: ReturnType<typeof audienceFields>;
    try {
      validateArticle(prepared);
      recipients = audienceFields(audience);
      if (!identifier(prepared.coverMediaId) || /__LANTERN_WECOM_IMAGE_\d+__/.test(prepared.html)) throw preparation("invalid_article", "稿件素材尚未准备完成。");
    } catch (error) {
      return { status: "failed", code: error instanceof PublicationPreparationError ? error.code : "invalid_article", message: "稿件或发送对象未通过检查。" };
    }
    const article = { title: prepared.title, digest: prepared.digest, content: prepared.html, thumb_media_id: prepared.coverMediaId, author: prepared.author ?? "", content_source_url: prepared.sourceUrl ?? "" };
    const payload = {
      ...recipients, msgtype: "mpnews", safe: 0, enable_id_trans: 0, enable_duplicate_check: 1, duplicate_check_interval: 1800,
      ...(this.config.kind === "group" ? { appid: this.config.appId, msgDetail: { articles: [article] } } : { agentid: this.config.agentId, mpnews: { articles: [article] } }),
    };
    let parameters: Record<string, string> = {};
    if (this.config.kind === "auto") {
      try { parameters = { access_token: await this.accessToken() }; }
      catch (error) { return { status: "failed", code: error instanceof PublicationPreparationError ? error.code : "authentication_failed", message: "发送前的企微应用鉴权失败。" }; }
    }
    try {
      const body = await this.request(this.config.kind === "group" ? "msg/send" : "message/send", JSON.stringify(payload), { "content-type": "application/json; charset=utf-8" }, parameters);
      if (this.config.kind === "auto" && ["40014", "42001"].includes(statusCode(body.errcode) ?? "")) this.token = undefined;
      return sendResult(body, this.config.kind === "group");
    } catch { return unknown(); }
  }
}

export function createChannelAdapter(id: PublicationChannel, options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {}): WecomChannelAdapter {
  let config: PublicationConfiguration;
  try { config = readPublicationConfiguration(id, options.env); }
  catch { throw preparation("channel_unavailable", "所选企微发布通道尚未启用或配置无效。"); }
  return new ChannelAdapter(config, options.fetcher ?? fetch);
}
