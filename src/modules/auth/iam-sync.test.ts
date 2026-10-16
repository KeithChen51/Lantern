import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryAccessStore, type AccessRecord } from "./access-store";
import { IamDirectorySync, readIamDirectory } from "./iam-directory";
import { readIamSyncConfig } from "./iam-sync-config";
import { decryptIamPayload, encryptIamPayload, iamDeliveryId, verifyIamSyncRequest } from "./iam-sync-crypto";
import { createIamSyncHandlers } from "./iam-sync-http";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  NODE_ENV: "test" as const, AUTH_MODE: "iam", IAM_SYNC_APP_KEY: "lighthouse-test",
  IAM_SYNC_PUBLIC_KEY: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  IAM_SYNC_AES_KEY: Buffer.alloc(32, 7).toString("base64"), IAM_SYNC_AES_IV: Buffer.alloc(16, 11).toString("base64"),
};
const config = readIamSyncConfig(env), now = 1800000000000, seconds = now / 1000;
function jwt(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const parts = [Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", ...header })).toString("base64url"), Buffer.from(JSON.stringify({ iss: config.appKey, iat: seconds - 300, nbf: seconds - 300, exp: seconds + 600, ...claims })).toString("base64url")];
  return `${parts.join(".")}.${sign("RSA-SHA256", Buffer.from(parts.join(".")), privateKey).toString("base64url")}`;
}
function auth(token = jwt(), key: string | null = config.appKey) { return new Headers({ authorization: token, ...(key === null ? {} : { appKey: key }) }); }
const user = (extra: Record<string, unknown> = {}, actionType: unknown = 0) => ({ actionType, userInfo: { username: "001234", fullname: "测试员工", isDisabled: "0", ...extra } });
const permission = (extra: Record<string, unknown> = {}, actionType: unknown = 0) => ({ actionType, permissionInfo: { username: "001234", roleCode: "lighthouse_user", postCode: "post-1", expiresTime: now + 3600000, dataRanges: [], ...extra } });
function fixture() {
  const store = new MemoryAccessStore(), sync = new IamDirectorySync(store, () => now);
  let receipt = 0;
  return { store, sync, account: (payload: unknown) => sync.account(payload, `account-${receipt++}`, now + 900000), permission: (payload: unknown) => sync.permission(payload, `permission-${receipt++}`, now + 900000), read: () => store.transaction(tx => readIamDirectory(tx, "001234", now)) };
}

describe("IAM permission-platform cryptographic contract", () => {
  it("reads only explicit strong sync keys and verifies the official RS256 raw JWT", () => {
    expect(verifyIamSyncRequest(auth(), config, true, now).expiresAt).toBe(now + 900000);
    expect(verifyIamSyncRequest(auth(`Bearer ${jwt()}`, null), config, false, now).jwt).toBe(jwt());
    expect(() => readIamSyncConfig({ ...env, IAM_SYNC_AES_KEY: Buffer.alloc(16).toString("base64") })).toThrow();
    expect(() => readIamSyncConfig({ ...env, IAM_SYNC_PUBLIC_KEY: "not-base64" })).toThrow();
  });
  it.each([
    [{ iss: "another-app" }, {}], [{ exp: seconds - 301 }, {}], [{ nbf: seconds + 301 }, {}],
    [{ iat: seconds + 301, exp: seconds + 1000 }, {}], [{ exp: seconds + 2000 }, {}],
    [{ exp: "1800000600" }, {}], [{ iat: null }, {}], [{}, { alg: "HS256" }], [{}, { crit: ["foo"] }],
  ])("rejects wrong issuer, algorithm, type and invalid time claims %#", (claims, header) => {
    expect(() => verifyIamSyncRequest(auth(jwt(claims, header)), config, true, now)).toThrow();
  });
  it("rejects signature changes, absent POST appKey and a mismatched optional GET appKey", () => {
    const token = jwt(), [head, body, signature] = token.split(".");
    const changed = Buffer.from(JSON.stringify({ iss: "lighthouse-test", iat: seconds, nbf: seconds, exp: seconds + 1, elevated: true })).toString("base64url");
    expect(() => verifyIamSyncRequest(auth(`${head}.${changed}.${signature}`), config, true, now)).toThrow();
    expect(() => verifyIamSyncRequest(auth(token, null), config, true, now)).toThrow();
    expect(() => verifyIamSyncRequest(auth(token, "other-app"), config, false, now)).toThrow();
    expect(() => verifyIamSyncRequest(auth(token.replace(signature, "AAAA")), config, true, now)).toThrow();
    expect(body).toBeTruthy();
  });
  it("implements AES-256-CBC padding and rejects corrupt, noncanonical and non-JSON data", () => {
    const encrypted = encryptIamPayload(user(), config);
    expect(decryptIamPayload(encrypted, config)).toEqual(user());
    expect(() => decryptIamPayload(`${encrypted}\n`, config)).toThrow();
    expect(() => decryptIamPayload("AAAA", config)).toThrow();
    const bytes = Buffer.from(encrypted, "base64"); bytes[bytes.length - 1] ^= 0xff;
    expect(() => decryptIamPayload(bytes.toString("base64"), config)).toThrow();
    expect(() => decryptIamPayload(encrypted, { ...config, aesIv: Buffer.alloc(16, 100) })).toThrow();
  });
});

describe("IAM account and permission projection", () => {
  it("requires both a known enabled account and an active supported role, preserving leading zeros", async () => {
    const f = fixture();
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
    await f.permission(permission());
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
    await f.account(user({ organization: "服务/文化" }));
    expect(await f.read()).toEqual({ displayName: "测试员工", organization: "服务/文化", roles: ["lighthouse_user"], expiresAt: now + 3600000 });
    expect(f.store.snapshot().find(row => row.kind === "iamAccount")?.subjectId).toBe("001234");
  });
  it("preserves omitted update fields and fails closed for a previously unknown partial update", async () => {
    const f = fixture();
    await f.permission(permission());
    await f.account({ actionType: "1", userInfo: { username: "001234", fullname: "待确认" } });
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
    await f.account(user({ organization: "文化" }));
    await f.account({ actionType: "1", userInfo: { username: "001234" } });
    expect(await f.read()).toMatchObject({ displayName: "测试员工", organization: "文化" });
    await f.account(user({ isDisabled: "true" }, 1));
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
  });
  it("keeps grants per post and caps authorization at the earliest live expiry", async () => {
    const f = fixture(); await f.account(user());
    await f.permission(permission({ postCode: "primary", expiresTime: now + 1000 }));
    await f.permission(permission({ postCode: "secondary", expiresTime: now + 2000 }));
    expect((await f.read()).expiresAt).toBe(now + 1000);
    await f.permission(permission({ postCode: "primary" }, 2));
    expect((await f.read()).expiresAt).toBe(now + 2000);
    await f.permission(permission({ postCode: "secondary" }, 2));
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
    await f.permission(permission({ expiresTime: now }));
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
  });
  it("rejects unsupported roles, ACL ranges, actions and malformed expiry without writes", async () => {
    const f = fixture();
    for (const payload of [permission({ roleCode: "router_admin" }), permission({ dataRanges: [{ dataValueCode: "one-org" }] }), permission({ expiresTime: 0 }), permission({ expiresTime: "invalid" }), permission({}, 1)]) {
      await expect(f.permission(payload)).rejects.toThrow();
    }
    expect(f.store.snapshot()).toEqual([]);
  });
  it("invalidates IAM sessions on changes, retains portal grants, and ignores identical state retries", async () => {
    const f = fixture(); await f.account(user()); await f.permission(permission());
    const grant = (authority: "iam" | "portal"): AccessRecord<"grant"> => ({ id: authority, kind: "grant", subjectId: "001234", parentId: null, payload: { authority, userId: "user-id", account: "001234", displayName: "员工", tokenCipher: "opaque", active: true, identityAt: now, rolesAt: now, roles: ["lighthouse_user"] }, expiresAt: now + 999999, createdAt: now, updatedAt: now });
    await f.store.transaction(async tx => { await tx.put(grant("iam")); await tx.put(grant("portal")); });
    await f.permission(permission());
    expect(f.store.snapshot().find(row => row.id === "iam")?.payload).toMatchObject({ active: true });
    await f.account(user({ isDisabled: 1 }, 1));
    expect(f.store.snapshot().find(row => row.id === "iam")?.payload).toMatchObject({ active: false });
    expect(f.store.snapshot().find(row => row.id === "portal")?.payload).toMatchObject({ active: true });
    await f.account(user());
    expect(f.store.snapshot().find(row => row.id === "iam")?.payload).toMatchObject({ active: false });
  });
  it("keeps deletion tombstones and requires fresh permission grants after recreation", async () => {
    const f = fixture(); await f.account(user()); await f.permission(permission());
    await f.account(user({}, 2));
    await expect(f.read()).rejects.toThrow();
    await f.account(user());
    await expect(f.read()).rejects.toThrow();
    await f.permission(permission()); expect((await f.read()).roles).toEqual(["lighthouse_user"]);
    expect(f.store.snapshot().filter(row => row.kind === "iamAccount" || row.kind === "iamPermission").every(row => row.expiresAt > now + 1000000000000)).toBe(true);
  });
  it("deduplicates exact delivery retries while allowing add-delete-add with fresh transport JWT", async () => {
    const f = fixture(); await f.account(user());
    const value = permission(), ciphertext = encryptIamPayload(value, config), addId = iamDeliveryId("permission", jwt(), ciphertext);
    await f.sync.permission(value, addId, now + 900000);
    await f.permission(permission({}, 2));
    await f.sync.permission(value, addId, now + 900000);
    await expect(f.read()).rejects.toThrow();
    const freshId = iamDeliveryId("permission", jwt({ iat: seconds - 299 }), ciphertext);
    await f.sync.permission(value, freshId, now + 900000);
    expect((await f.read()).roles).toEqual(["lighthouse_user"]);
  });
});

describe("IAM synchronization HTTP boundary", () => {
  function setup() {
    const store = new MemoryAccessStore(), getStore = vi.fn(async () => store);
    return { store, getStore, handlers: createIamSyncHandlers({ env: () => env, config: () => config, store: getStore, now: () => now }) };
  }
  const push = (value: unknown, token = jwt(), key: string | null = config.appKey) => new Request("https://lighthouse.example.invalid/api/iam/sync/account", { method: "POST", headers: { ...Object.fromEntries(auth(token, key)), "content-type": "application/json" }, body: JSON.stringify({ data: encryptIamPayload(value, config) }) });
  it("authenticates before accessing the DB and never echoes credentials or payload errors", async () => {
    const f = setup();
    for (const request of [push(user(), "SECRET_BAD_TOKEN"), push(user(), jwt(), null)]) {
      const response = await f.handlers.account(request);
      expect(response.status).toBe(401); expect(await response.text()).not.toContain("SECRET");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(f.getStore).not.toHaveBeenCalled(); expect(f.store.snapshot()).toEqual([]);
  });
  it("stores authenticated pushes atomically and supplies encrypted role/menu catalogues", async () => {
    const f = setup();
    expect((await f.handlers.account(push(user()))).status).toBe(200);
    expect((await f.handlers.permission(push(permission()))).status).toBe(200);
    await expect(f.store.transaction(tx => readIamDirectory(tx, "001234", now))).resolves.toMatchObject({ roles: ["lighthouse_user"] });
    const request = () => new Request("https://lighthouse.example.invalid/api/iam/roles", { headers: auth(jwt(), null) });
    for (const endpoint of ["roles", "menus"] as const) {
      const response = await f.handlers[endpoint](request()), result = await response.json();
      expect(result.code).toBe("000000");
      const catalogue = decryptIamPayload(result.data, config) as { actionType: number; details: unknown[] };
      expect(catalogue.actionType).toBe(3); expect(catalogue.details.length).toBeGreaterThan(0);
      expect(JSON.stringify(catalogue)).not.toContain("router_");
    }
  });
  it("rejects oversized streamed bodies and malformed ciphertext before creating a store", async () => {
    const f = setup();
    const request = new Request("https://lighthouse.example.invalid", { method: "POST", headers: { ...Object.fromEntries(auth()), "content-type": "application/json" }, body: JSON.stringify({ data: "x".repeat(140000) }) });
    expect((await f.handlers.account(request)).status).toBe(400);
    expect(f.getStore).not.toHaveBeenCalled();
  });
  it("refuses synchronization in portal mode, even with otherwise valid credentials", async () => {
    const getStore = vi.fn(async () => new MemoryAccessStore());
    const handlers = createIamSyncHandlers({ env: () => ({ ...env, AUTH_MODE: "portal" }), store: getStore });
    expect((await handlers.account(push(user()))).status).toBe(503); expect(getStore).not.toHaveBeenCalled();
  });
});
