import { AccessError } from "./access-types";

export type WecomAutoApplication = Readonly<{ corpId: string; agentId: string; secret: string }>;
export type WecomAutoMember = { userId: string; displayName: string };
export type WecomAutoEntry = "workbench" | "scan";
export interface WecomAutoProvider {
  authorizationUrl(callbackUrl: string, state: string, entry: WecomAutoEntry): string;
  authenticate(code: string): Promise<WecomAutoMember>;
  readMember(userId: string): Promise<WecomAutoMember>;
}

const API_ORIGIN = "https://qyapi.weixin.qq.com";
const AUTHORIZE_URL = "https://open.weixin.qq.com/connect/oauth2/authorize";
const SCAN_AUTHORIZE_URL = "https://login.work.weixin.qq.com/wwlogin/sso/login";
const REQUEST_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 64 * 1024;
// Application details include the configured visible member list.
const MAX_APPLICATION_BYTES = 2 * 1024 * 1024;
const MEMBER_ID = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

const unavailable = () => new AccessError("企业微信认证服务暂时不可用，请稍后重试。", 503);
const invalidCode = () => new AccessError("企业微信登录凭据无效或已失效，请重新打开灯塔。", 401);
const memberDenied = () => new AccessError("当前企业微信成员未获灯塔访问权限。", 403);

type ApplicationToken = { value: string; refreshAt: number };
type ApiBody = Record<string, unknown> & { errcode: number };

function credential(value: unknown, maximumBytes: number): value is string {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= maximumBytes
    && value === value.trim() && !CONTROL_CHARACTER.test(value);
}

function memberId(value: unknown): string {
  // A linked enterprise's CorpId/userid and an external identity are outside
  // this application. Official member IDs are case insensitive.
  if (typeof value !== "string" || !MEMBER_ID.test(value)) throw memberDenied();
  return value.toLowerCase();
}

function tokenRejected(code: number) {
  return code === 40014 || code === 42001;
}

async function readJson(response: Response, signal: AbortSignal, maximumBytes: number): Promise<ApiBody> {
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  const length = response.headers.get("content-length");
  if (!response.ok || response.redirected || type !== "application/json" || !response.body
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > maximumBytes))) {
    void response.body?.cancel().catch(() => undefined);
    throw unavailable();
  }
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximumBytes) throw unavailable();
      chunks.push(next.value);
    }
    signal.throwIfAborted();
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!body || typeof body !== "object" || Array.isArray(body) || !("errcode" in body)
      || typeof body.errcode !== "number" || !Number.isSafeInteger(body.errcode)) throw unavailable();
    return body as ApiBody;
  } finally {
    signal.removeEventListener("abort", abort);
    abort();
    reader.releaseLock();
  }
}

/** OAuth identity and member access are both checked with this application's token. */
export class WecomAutoClient implements WecomAutoProvider {
  private readonly config: WecomAutoApplication;
  private cachedToken?: ApplicationToken;
  private loadingToken?: Promise<ApplicationToken>;

  constructor(config: WecomAutoApplication, private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(config.corpId) || !/^[1-9]\d{0,15}$/.test(config.agentId)
      || !Number.isSafeInteger(Number(config.agentId)) || !credential(config.secret, 512)) throw unavailable();
    this.config = Object.freeze({ ...config });
  }

  authorizationUrl(callbackUrl: string, state: string, entry: WecomAutoEntry = "workbench"): string {
    try {
      const callback = new URL(callbackUrl);
      if (callback.protocol !== "https:" || callback.username || callback.password || callback.hash
        || !/^[A-Za-z0-9]{1,128}$/.test(state)) throw new Error();
    } catch {
      throw new AccessError("企业微信登录请求无效。", 400);
    }
    const url = new URL(entry === "scan" ? SCAN_AUTHORIZE_URL : AUTHORIZE_URL);
    url.search = new URLSearchParams({
      appid: this.config.corpId, agentid: this.config.agentId, redirect_uri: callbackUrl, state,
    }).toString();
    if (entry === "scan") {
      url.searchParams.set("login_type", "CorpApp");
    } else {
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "snsapi_base");
      url.hash = "wechat_redirect";
    }
    return url.toString();
  }

  async authenticate(code: string): Promise<WecomAutoMember> {
    if (!credential(code, 512)) throw invalidCode();
    const token = await this.applicationToken();
    // The callback transaction claims the code before this single exchange.
    const body = await this.request("/cgi-bin/auth/getuserinfo", { access_token: token.value, code });
    this.discardRejectedToken(token, body.errcode);
    if (body.errcode === 40029) throw invalidCode();
    if (body.errcode !== 0) throw unavailable();
    if ("openid" in body || "external_userid" in body) throw memberDenied();

    // auth/getuserinfo also identifies members outside the visible range.
    const userId = memberId(body.userid);
    return this.checkedMember(await this.memberResponse(userId, token), userId);
  }

  async readMember(value: string): Promise<WecomAutoMember> {
    const userId = memberId(value);
    let body = await this.memberResponse(userId, await this.applicationToken());
    if (tokenRejected(body.errcode)) {
      // Reading member status is idempotent, unlike the OAuth exchange.
      body = await this.memberResponse(userId, await this.applicationToken());
    }
    return this.checkedMember(body, userId);
  }

  private applicationToken(): Promise<ApplicationToken> {
    if (this.cachedToken && this.cachedToken.refreshAt > this.now()) return Promise.resolve(this.cachedToken);
    this.loadingToken ??= this.issueApplicationToken().finally(() => { this.loadingToken = undefined; });
    return this.loadingToken;
  }

  private async issueApplicationToken(): Promise<ApplicationToken> {
    const startedAt = this.now();
    const body = await this.request("/cgi-bin/gettoken", { corpid: this.config.corpId, corpsecret: this.config.secret });
    if (body.errcode !== 0 || !credential(body.access_token, 512) || typeof body.expires_in !== "number"
      || !Number.isSafeInteger(body.expires_in) || body.expires_in <= 0) throw unavailable();

    const value = body.access_token;
    const app = await this.request("/cgi-bin/agent/get", { access_token: value, agentid: this.config.agentId }, MAX_APPLICATION_BYTES);
    if (app.errcode !== 0 || app.agentid !== Number(this.config.agentId) || app.close !== 0) throw unavailable();

    const lifetime = Math.min(body.expires_in, 7200) * 1000;
    const expiresAt = startedAt + lifetime;
    if (expiresAt <= this.now()) throw unavailable();
    const refreshAt = expiresAt - Math.min(60_000, lifetime / 10);
    return this.cachedToken = { value, refreshAt };
  }

  private discardRejectedToken(token: ApplicationToken, code: number): void {
    if (tokenRejected(code) && this.cachedToken === token) this.cachedToken = undefined;
  }

  private async memberResponse(userId: string, token: ApplicationToken): Promise<ApiBody> {
    const body = await this.request("/cgi-bin/user/get", { access_token: token.value, userid: userId });
    this.discardRejectedToken(token, body.errcode);
    return body;
  }

  private checkedMember(body: ApiBody, userId: string): WecomAutoMember {
    if (body.errcode === 60011 || body.errcode === 60111) throw memberDenied();
    if (body.errcode !== 0) throw unavailable();
    if (memberId(body.userid) !== userId || body.status !== 1) throw memberDenied();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const displayName = name && name.length <= 120 && !CONTROL_CHARACTER.test(name) ? name : userId;
    return { userId, displayName };
  }

  private async request(path: string, params: Record<string, string>, maximumBytes = MAX_RESPONSE_BYTES): Promise<ApiBody> {
    const url = new URL(path, API_ORIGIN);
    url.search = new URLSearchParams(params).toString();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await this.fetcher(url.toString(), {
            method: "GET", headers: { accept: "application/json" }, cache: "no-store", redirect: "error", signal: controller.signal,
          });
          return readJson(response, controller.signal, maximumBytes);
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, REQUEST_TIMEOUT_MS);
        }),
      ]);
    } catch {
      // Fetch and parsing errors can include a URL or raw response with secrets.
      throw unavailable();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
