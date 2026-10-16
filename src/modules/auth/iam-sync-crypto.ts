import { createCipheriv, createDecipheriv, createHash, verify } from "node:crypto";
import { AccessError } from "./access-types";
import { strictBase64, type IamSyncConfig } from "./iam-sync-config";

const SKEW_SECONDS = 300;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
  return value as Record<string, unknown>;
}
function jwtPart(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid JWT");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) throw new Error("Invalid JWT");
  return bytes;
}

/** Official raw Authorization JWT, with optional standard Bearer transport. */
export function verifyIamSyncRequest(headers: Headers, config: IamSyncConfig, requireAppKey: boolean, now = Date.now()): { jwt: string; expiresAt: number } {
  try {
    const suppliedKey = headers.get("appKey");
    if ((requireAppKey && suppliedKey !== config.appKey) || (suppliedKey !== null && suppliedKey !== config.appKey)) throw new Error("Invalid app key");
    const jwt = (headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    if (jwt.length > 16384) throw new Error("Invalid JWT");
    const parts = jwt.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT");
    const header = object(JSON.parse(jwtPart(parts[0]).toString("utf8")));
    if (header.alg !== "RS256" || header.crit !== undefined) throw new Error("Unsupported JWT");
    if (!verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), config.publicKey, jwtPart(parts[2]))) throw new Error("Invalid signature");
    const claims = object(JSON.parse(jwtPart(parts[1]).toString("utf8")));
    const { iat, nbf, exp } = claims;
    if (claims.iss !== config.appKey || typeof iat !== "number" || typeof nbf !== "number" || typeof exp !== "number" || ![iat, nbf, exp].every(Number.isSafeInteger)) throw new Error("Invalid claims");
    const seconds = Math.floor(now / 1000);
    if (exp <= iat || exp - iat > 1200 || nbf > exp || iat > seconds + SKEW_SECONDS || nbf > seconds + SKEW_SECONDS || exp <= seconds - SKEW_SECONDS) throw new Error("Invalid JWT time");
    return { jwt, expiresAt: (exp + SKEW_SECONDS) * 1000 };
  } catch { throw new AccessError("IAM synchronization authentication failed", 401); }
}

export function decryptIamPayload(ciphertext: unknown, config: IamSyncConfig): unknown {
  try {
    if (typeof ciphertext !== "string") throw new Error("Invalid encrypted payload");
    const bytes = strictBase64(ciphertext, 98304);
    if (!bytes.length || bytes.length % 16) throw new Error("Invalid encrypted payload");
    const decipher = createDecipheriv("aes-256-cbc", config.aesKey, config.aesIv);
    const plain = Buffer.concat([decipher.update(bytes), decipher.final()]);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(plain);
    return JSON.parse(text);
  } catch { throw new AccessError("Invalid IAM synchronization payload", 400); }
}

export function encryptIamPayload(value: unknown, config: IamSyncConfig): string {
  const cipher = createCipheriv("aes-256-cbc", config.aesKey, config.aesIv);
  return Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]).toString("base64");
}

/** Receipts distinguish exact transport retries, not permanent data hashes. */
export function iamDeliveryId(endpoint: "account" | "permission", jwt: string, ciphertext: string): string {
  return `iam-delivery:${createHash("sha256").update(JSON.stringify([endpoint, jwt, ciphertext])).digest("hex")}`;
}
