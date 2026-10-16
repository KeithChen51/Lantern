import { createPublicKey, type KeyObject } from "node:crypto";
import { AccessError } from "./access-types";

export type IamSyncConfig = { appKey: string; publicKey: KeyObject; aesKey: Buffer; aesIv: Buffer };

export function strictBase64(value: string, maxBytes: number): Buffer {
  if (!value || value.length > Math.ceil(maxBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid Base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maxBytes || bytes.toString("base64") !== value) throw new Error("Invalid Base64");
  return bytes;
}

/** These are permission-platform keys, distinct from the OAuth client secret. */
export function readIamSyncConfig(env: NodeJS.ProcessEnv = process.env): IamSyncConfig {
  try {
    const appKey = env.IAM_SYNC_APP_KEY ?? "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(appKey)) throw new Error("Invalid app key");
    const publicKey = createPublicKey({ key: strictBase64(env.IAM_SYNC_PUBLIC_KEY ?? "", 4096), format: "der", type: "spki" });
    if (publicKey.asymmetricKeyType !== "rsa" || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error("Invalid RSA key");
    const aesKey = strictBase64(env.IAM_SYNC_AES_KEY ?? "", 32), aesIv = strictBase64(env.IAM_SYNC_AES_IV ?? "", 16);
    if (aesKey.length !== 32 || aesIv.length !== 16) throw new Error("Invalid AES key");
    return { appKey, publicKey, aesKey, aesIv };
  } catch { throw new AccessError("IAM synchronization is not configured", 503); }
}
