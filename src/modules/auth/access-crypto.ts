import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AccessError } from "./access-types";

export function randomToken(): string { return randomBytes(32).toString("base64url"); }
export function hashToken(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function equalSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function key(value: string): Buffer {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new AccessError("登录加密配置不可用。", 503);
  return bytes;
}
export function sealToken(token: string, encryptionKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(encryptionKey), iv);
  cipher.setAAD(Buffer.from("lighthouse:portal-grant:v1"));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function openToken(value: string, encryptionKey: string): string {
  try {
    const [version, iv, tag, ciphertext, extra] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext || extra) throw new Error("format");
    const decipher = createDecipheriv("aes-256-gcm", key(encryptionKey), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from("lighthouse:portal-grant:v1"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new AccessError("登录凭据不可用，请重新登录。", 401); }
}
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//")) return "/";
  let decoded = value;
  try {
    for (let i = 0; i < 4; i++) {
      if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return "/";
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (/%[0-9a-f]{2}/i.test(decoded) || /[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return "/";
    const parsed = new URL(decoded, "https://return.invalid");
    if (parsed.origin !== "https://return.invalid" || /^\/(?:api|login)(?:\/|$)/i.test(parsed.pathname)) return "/";
    if (/^\/auth(?:\/|$)/i.test(parsed.pathname) && !["/auth/device", "/auth/tools"].includes(parsed.pathname)) return "/";
    return value;
  } catch { return "/"; }
}
