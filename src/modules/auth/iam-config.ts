import { AccessError } from "./access-types";

export interface IamLoginConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export function readIamLoginConfig(env: Record<string, string | undefined> = process.env): IamLoginConfig {
  const baseUrl = env.IAM_BASE_URL;
  try {
    if (!baseUrl) throw new Error();
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.origin !== baseUrl || url.username || url.password) throw new Error();
  } catch {
    throw new AccessError("IAM_BASE_URL 必须是规范的 HTTPS 源地址。", 503);
  }
  const credential = (name: "IAM_CLIENT_ID" | "IAM_CLIENT_SECRET", max: number) => {
    const value = env[name];
    if (!value || value.length > max || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new AccessError(`${name} 配置无效。`, 503);
    }
    return value;
  };
  return { baseUrl, clientId: credential("IAM_CLIENT_ID", 256), clientSecret: credential("IAM_CLIENT_SECRET", 8192) };
}
