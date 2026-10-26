import { AccessError } from "./access-types";

const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 3000;
const invalidTicket = () => new AccessError("企微登录票据无效或已失效，请重新登录。", 401);
const unavailable = () => new AccessError("企微认证服务暂时不可用，请稍后重试。", 503);
const invalidConfig = () => new AccessError("企微认证配置无效。", 503);

export type WecomTicketConfig = Readonly<{ baseUrl: string; appId: string; appKey: string }>;
export type WecomTicketIdentity = {
  account: string;
  displayName: string;
  wecomUserId: string;
  division?: string;
};

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function account(value: unknown): value is string {
  // Employee numbers remain strings, including their leading zeroes and case.
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(value);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function copyConfig(config: WecomTicketConfig): WecomTicketConfig {
  try {
    if (!config || !text(config.baseUrl, 2048) || !text(config.appId, 120)
      || !text(config.appKey, 8192) || !/^[\x20-\x7e]+$/.test(config.appKey)) throw invalidConfig();
    const url = new URL(config.baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || ![url.origin, `${url.origin}/`].includes(config.baseUrl)) throw invalidConfig();
    return Object.freeze({ baseUrl: url.origin, appId: config.appId, appKey: config.appKey });
  } catch {
    // Configuration errors must not echo the origin or credentials either.
    throw invalidConfig();
  }
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json" || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw unavailable();
  }
  const declaredSize = response.headers.get("content-length");
  if (declaredSize !== null && (!/^\d+$/.test(declaredSize) || Number(declaredSize) > MAX_RESPONSE_BYTES)) {
    void response.body.cancel().catch(() => undefined);
    throw unavailable();
  }
  const reader = response.body.getReader();
  // Do not await cancellation: a broken transport may stall its cancel hook.
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
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
    if (!object(body)) throw unavailable();
    return body;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

/** Server-side, single-use identity verification only. This does not establish
 * a long-lived session, verify employment status, or grant any role. */
export class WecomTicketClient {
  private readonly config: WecomTicketConfig;

  constructor(config: WecomTicketConfig, private readonly fetcher: typeof fetch = fetch) {
    this.config = copyConfig(config);
  }

  /** Caller supplies a fresh, cryptographically random transaction ID and owns
   * its lifecycle/binding. This method only formats the documented scan URL. */
  scanUrl(deviceId: string): string {
    if (!text(deviceId, 256)) throw new AccessError("企微扫码请求无效。", 400);
    const url = new URL("/app/login", this.config.baseUrl);
    url.search = new URLSearchParams({ deviceid: deviceId, appid: this.config.appId }).toString();
    return url.toString();
  }

  async verify(input: Readonly<{ userId: string; token: string }>): Promise<WecomTicketIdentity> {
    // Snapshot before awaiting anything; external mutation cannot retarget this request.
    const userId = input?.userId;
    const token = input?.token;
    if (!account(userId) || !text(token, 8192)) throw invalidTicket();
    const body = await this.request(userId, token);
    if (body.code !== "0") throw invalidTicket();
    const employee = body.msg;
    if (!object(employee) || !account(employee.EMPID) || employee.EMPID !== userId
      || !text(employee.USERID, 256)
      || (employee.EMPNAME !== undefined && !text(employee.EMPNAME, 120))
      || (employee.DIVISION !== undefined && !text(employee.DIVISION, 200))) throw invalidTicket();
    return {
      account: employee.EMPID,
      displayName: employee.EMPNAME === undefined ? employee.EMPID : employee.EMPNAME as string,
      wecomUserId: employee.USERID,
      ...(employee.DIVISION !== undefined ? { division: employee.DIVISION as string } : {}),
    };
  }

  private async request(userId: string, token: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    // Only these locally created errors may escape. Even an AccessError thrown
    // by transport/stream code can contain secrets and must be replaced.
    const rejectedTicket = invalidTicket();
    const unavailableService = unavailable();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          // One-time tickets are never automatically retried, cached, or stored.
          const response = await this.fetcher(`${this.config.baseUrl}/admin/services/weixin/auth/validtokenbackuserinfo`, {
            method: "POST",
            headers: { Authentication: `Basic ${this.config.appKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ userId, token, appId: this.config.appId }),
            cache: "no-store", redirect: "error", signal: controller.signal,
          });
          if (controller.signal.aborted || !response.ok || response.redirected) {
            void response.body?.cancel().catch(() => undefined);
            if (!controller.signal.aborted && [401, 403].includes(response.status)) throw rejectedTicket;
            throw unavailableService;
          }
          return await boundedJson(response, controller.signal);
        })(),
        // AbortSignal protects cooperative fetch/streams; the race also bounds
        // implementations that ignore abort or have a stalled cancellation hook.
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(unavailableService); }, REQUEST_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      if (error === rejectedTicket) throw rejectedTicket;
      // Never expose upstream body, URL, token, key, message, stack, or cause.
      throw unavailableService;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
