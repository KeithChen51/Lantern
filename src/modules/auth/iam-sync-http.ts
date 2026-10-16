import type { AccessStore } from "./access-store";
import { AccessError } from "./access-types";
import { IamDirectorySync, iamMenuCatalogue, iamRoleCatalogue } from "./iam-directory";
import { readIamSyncConfig, type IamSyncConfig } from "./iam-sync-config";
import { decryptIamPayload, encryptIamPayload, iamDeliveryId, verifyIamSyncRequest } from "./iam-sync-crypto";

const MAX_BODY = 128 * 1024;
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new AccessError("JSON required", 400);
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) throw new AccessError("Invalid request size", 400);
  if (!request.body) throw new AccessError("Missing request body", 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_BODY) { await reader.cancel(); throw new AccessError("Request too large", 400); }
      chunks.push(result.value);
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => key !== "data")) throw new Error("Invalid envelope");
    return value;
  } catch (error) { if (error instanceof AccessError) throw error; throw new AccessError("Invalid JSON", 400); }
  finally { reader.releaseLock(); }
}
async function defaultStore(): Promise<AccessStore> {
  const [{ prisma }, { PrismaAccessStore }] = await Promise.all([import("@/infrastructure/db/client"), import("./access-store")]);
  return new PrismaAccessStore(prisma);
}
type Dependencies = { env?: () => NodeJS.ProcessEnv; config?: () => IamSyncConfig; store?: () => Promise<AccessStore>; now?: () => number };
export function createIamSyncHandlers(dependencies: Dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  async function handle(request: Request, endpoint: "account" | "permission" | "roles" | "menus"): Promise<Response> {
    try {
      const env = dependencies.env?.() ?? process.env;
      if (env.AUTH_MODE !== "iam") throw new AccessError("IAM synchronization is unavailable", 503);
      const config = dependencies.config?.() ?? readIamSyncConfig(env);
      const push = endpoint === "account" || endpoint === "permission";
      if (request.method !== (push ? "POST" : "GET")) throw new AccessError("Invalid method", 400);
      const auth = verifyIamSyncRequest(request.headers, config, push, now());
      if (!push) {
        const catalogue = endpoint === "roles" ? iamRoleCatalogue(config.appKey, now()) : iamMenuCatalogue(config.appKey, now());
        return Response.json({ code: "000000", msg: "success", data: encryptIamPayload(catalogue, config) }, { headers });
      }
      const envelope = await jsonBody(request);
      const value = decryptIamPayload(envelope.data, config);
      const delivery = iamDeliveryId(endpoint, auth.jwt, envelope.data as string);
      const sync = new IamDirectorySync(await (dependencies.store ?? defaultStore)(), now);
      await sync[endpoint](value, delivery, auth.expiresAt);
      return Response.json({ code: "000000", msg: "success", data: endpoint === "account" ? "同步成功" : "操作成功" }, { headers });
    } catch (error) {
      const status = error instanceof AccessError ? error.status : 503;
      return Response.json({ code: "999999", msg: status === 401 ? "authentication failed" : status === 400 ? "invalid request" : "synchronization unavailable" }, { status, headers });
    }
  }
  return {
    account: (request: Request) => handle(request, "account"), permission: (request: Request) => handle(request, "permission"),
    roles: (request: Request) => handle(request, "roles"), menus: (request: Request) => handle(request, "menus"),
  };
}
export const iamSyncHandlers = createIamSyncHandlers();
