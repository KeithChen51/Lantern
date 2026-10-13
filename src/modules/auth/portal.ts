import { createHmac } from "node:crypto";
import { AccessError, type AccessConfig, type PortalAdapter, type PortalIdentity } from "./access-types";

const MAX_RESPONSE_BYTES = 64 * 1024;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccessError("统一门户响应无效。", 503);
  return value as Record<string, unknown>;
}
function account(value: unknown): string {
  // Do not coerce employee numbers to integers or silently trim/normalise them.
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(value)) throw new AccessError("统一门户未返回有效工号。", 401);
  return value;
}
async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) throw new AccessError("统一门户响应无效。", 503);
  if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) throw new AccessError("统一门户响应无效。", 503);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new AccessError("统一门户响应无效。", 503);
      chunks.push(part.value);
    }
    return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AccessError) throw error;
    throw new AccessError("统一门户响应无效。", 503);
  } finally { reader.releaseLock(); }
}
export class HttpPortalAdapter implements PortalAdapter {
  constructor(private readonly config: AccessConfig, private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {}
  private async request(path: string, init: RequestInit, identity = false): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetcher(`${this.config.portalBaseUrl}${path}`, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000) });
        if (!response.ok) {
          await response.body?.cancel();
          if (identity && [401, 403].includes(response.status)) throw new AccessError("门户登录已失效，请重新登录。", 401);
          throw new AccessError("统一门户暂时不可用。", 503);
        }
        return await boundedJson(response);
      } catch (error) {
        if (error instanceof AccessError) throw error;
        if (attempt === 1) throw new AccessError("统一门户暂时不可用。", 503);
      }
    }
    throw new AccessError("统一门户暂时不可用。", 503);
  }
  async identity(token: string): Promise<PortalIdentity> {
    if (!token || token.length > 8192 || /[\r\n\u0000]/.test(token)) throw new AccessError("门户登录凭据无效。", 401);
    const body = await this.request("/sso/admin/infoByToken", { headers: { token } }, true);
    if (body.ret !== 200) throw new AccessError("门户登录已失效，请重新登录。", 401);
    const data = object(body.data);
    const employeeAccount = account(data.account ?? data.empNo);
    if (data.empNo !== undefined && data.empNo !== null && account(data.empNo) !== employeeAccount) throw new AccessError("门户返回的员工信息不一致。", 401);
    const displayName = data.name ?? data.realName ?? employeeAccount;
    if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 120) throw new AccessError("门户返回的员工信息无效。", 401);
    // Status/expiry fields are deliberately not guessed. Production readiness
    // requires the active-employee contract to be confirmed by the provider.
    return { account: employeeAccount, displayName };
  }
  async roles(employeeAccount: string): Promise<readonly string[]> {
    const timestamp = String(this.now());
    const sign = createHmac("sha256", this.config.appSecret).update(`${employeeAccount}.${timestamp}`).digest("hex");
    const body = await this.request("/sso/admin/subapp/role-query", {
      method: "POST", headers: { "content-type": "application/json", appKey: this.config.appCode, timestamp, sign }, body: JSON.stringify({ account: employeeAccount }),
    });
    if (body.code !== "000000") throw new AccessError("门户授权查询暂时不可用。", 503);
    const data = object(body.data);
    if (data.account !== employeeAccount || data.appCode !== this.config.appCode || !Array.isArray(data.roles) || data.roles.length > 100) throw new AccessError("门户授权响应不匹配。", 503);
    return data.roles.map(role => {
      const code = object(role).code;
      if (typeof code !== "string" || !code || code.length > 120) throw new AccessError("门户授权响应无效。", 503);
      return code;
    });
  }
}
