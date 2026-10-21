import { AccessError } from "./access-types";
import { readIamLoginConfig, type IamLoginConfig } from "./iam-config";

const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 3000;
const unavailable = () => new AccessError("OA 认证服务暂时不可用，请稍后重试。", 503);
const invalidLogin = () => new AccessError("OA 登录凭据无效或已失效，请重新登录。", 401);

function credential(value: unknown, max = 8192): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) throw unavailable();
  const declaredSize = response.headers.get("content-length");
  if (declaredSize !== null && (!/^\d+$/.test(declaredSize) || Number(declaredSize) > MAX_RESPONSE_BYTES)) {
    await response.body.cancel().catch(() => undefined);
    throw unavailable();
  }
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw unavailable();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw unavailable();
      chunks.push(part.value);
    }
    if (signal.aborted) throw unavailable();
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw unavailable();
    return body as Record<string, unknown>;
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Domestic IAM OAuth contract. IAM bearer credentials stay on the server;
 * role grants come from the separately configured authorization source. */
export class IamIdentityClient {
  private readonly config: IamLoginConfig;
  constructor(config: IamLoginConfig, private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {
    this.config = readIamLoginConfig({ IAM_BASE_URL: config.baseUrl, IAM_CLIENT_ID: config.clientId, IAM_CLIENT_SECRET: config.clientSecret });
  }

  authorizationUrl(redirectUri: string, state: string): string {
    try {
      const callback = new URL(redirectUri);
      if (!["https:", "http:"].includes(callback.protocol) || callback.username || callback.password || callback.hash || !credential(state, 2048)) throw new Error();
    } catch {
      throw new AccessError("OA 登录请求无效。", 400);
    }
    const url = new URL("/idp/authCenter/authenticate", this.config.baseUrl);
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: redirectUri, response_type: "code", state }).toString();
    return url.toString();
  }

  private async request(url: URL, init: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await this.fetcher(url.toString(), { ...init, cache: "no-store", redirect: "error", signal: controller.signal });
          if (!response.ok || response.redirected) {
            await response.body?.cancel().catch(() => undefined);
            if ([401, 403].includes(response.status)) throw invalidLogin();
            throw unavailable();
          }
          const body = await boundedJson(response, controller.signal);
          // Documented success objects have no status/error envelope. An HTTP
          // 200 with an IAM business failure must never authenticate a user.
          if ("errcode" in body || "error" in body || "code" in body || body.status === "fail") throw invalidLogin();
          return body;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, REQUEST_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      if (error instanceof AccessError) throw error;
      // Fetch failures can contain credential-bearing URLs. Never propagate
      // their message, stack, response body or cause into application errors.
      throw unavailable();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async exchange(code: string): Promise<{ token: string; expiresAt: number }> {
    if (!credential(code, 4096)) throw invalidLogin();
    const startedAt = this.now();
    // Codes are single-use: there is intentionally no automatic retry.
    const body = await this.request(new URL("/gateway/bam-protocol-service/oauth2/getToken", this.config.baseUrl), {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, code, grant_type: "authorization_code" }).toString(),
    });
    const rawSeconds = body.expires_in;
    const seconds = typeof rawSeconds === "number" ? rawSeconds : typeof rawSeconds === "string" && /^\d+$/.test(rawSeconds) ? Number(rawSeconds) : NaN;
    const expiresAt = startedAt + seconds * 1000;
    if (!credential(body.access_token) || !Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isSafeInteger(expiresAt) || expiresAt > 8.64e15 || expiresAt <= this.now()) throw unavailable();
    return { token: body.access_token, expiresAt };
  }

  async identity(token: string): Promise<{ account: string; displayName: string }> {
    if (!credential(token)) throw invalidLogin();
    const url = new URL("/gateway/bam-protocol-service/oauth2/getUserInfo", this.config.baseUrl);
    url.search = new URLSearchParams({ access_token: token, client_id: this.config.clientId }).toString();
    const body = await this.request(url, { method: "GET", headers: { accept: "application/json" } });
    if (typeof body.loginName !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(body.loginName)) throw invalidLogin();
    return { account: body.loginName, displayName: body.loginName };
  }
}
