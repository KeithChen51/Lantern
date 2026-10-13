import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { MemoryAccessStore, PrismaAccessStore, type AccessRecord } from "./access-store";

const row: AccessRecord<"bucket"> = { id: "bucket:synthetic-hash", kind: "bucket", subjectId: "owner", parentId: null, payload: { count: 0 }, expiresAt: 100, createdAt: 1, updatedAt: 1 };
function mapping(overrides: Record<string, unknown> = {}) {
  return { provider: "lighthouse-portal", providerUserId: "000042", userId: "mapped-user", user: { id: "mapped-user", displayName: "Test employee", status: "ACTIVE", userType: "INTERNAL_EMPLOYEE", identityAccounts: [{ provider: "lighthouse-portal", providerUserId: "000042" }], ...overrides } };
}
function dbFixture() {
  const db = {
    accessRecord: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue(undefined) },
    identityAccount: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { create: vi.fn().mockResolvedValue({ id: "new-user", displayName: "Test employee" }) },
  };
  const transaction = vi.fn(async (callback: (tx: typeof db) => Promise<unknown>, options?: { isolationLevel: string; maxWait: number; timeout: number }) => { void options; return callback(db); });
  const store = new PrismaAccessStore({ $transaction: transaction } as unknown as PrismaClient);
  return { db, transaction, store };
}

describe("transactional AccessStore", () => {
  it("filters revoked records before enumeration limits, preserving logout after churn", async () => {
    const store = new MemoryAccessStore();
    await store.transaction(async tx => {
      for (let i = 0; i < 1001; i++) await tx.put({ ...row, kind: "session", id: `session:${i}`, payload: { grantId: "grant", csrfToken: "fixture", active: false, lastUsedAt: 1 } });
      await tx.put({ ...row, kind: "session", id: "session:live", payload: { grantId: "grant", csrfToken: "fixture", active: true, lastUsedAt: 1 } });
    });
    expect(await store.transaction(tx => tx.find("session", { subjectId: "owner", activeOnly: true }))).toHaveLength(1);
    const f = dbFixture();
    await f.store.transaction(tx => tx.find("session", { parentId: "grant", activeOnly: true }));
    expect(f.db.accessRecord.findMany).toHaveBeenCalledWith({ where: { kind: "session", parentId: "grant", payload: { path: "$.active", equals: true } }, take: 1001 });
  });
  it("serializes concurrent memory mutations and rolls back thrown callbacks", async () => {
    const store = new MemoryAccessStore(); await store.transaction(async (tx) => tx.put(row));
    await Promise.all(Array.from({ length: 20 }, () => store.transaction(async (tx) => { const current = await tx.get("bucket", row.id); current!.payload.count++; await tx.put(current!); })));
    expect(await store.transaction(async (tx) => (await tx.get("bucket", row.id))!.payload.count)).toBe(20);
    await expect(store.transaction(async (tx) => { const current = await tx.get("bucket", row.id); current!.payload.count = 999; await tx.put(current!); await tx.ensureEmployee("synthetic-account", "Test employee", "rollback-user"); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect(await store.transaction(async (tx) => (await tx.get("bucket", row.id))!.payload.count)).toBe(20);
    expect(await store.transaction(async (tx) => tx.employeeActive("synthetic-account", "rollback-user"))).toBe(false);
  });
  it("requires indexed and bounded enumeration and filters expiration before the limit", async () => {
    const store = new MemoryAccessStore();
    await store.transaction(async (tx) => { for (let i = 0; i < 1001; i++) await tx.put({ ...row, id: `bucket:${i}` }); });
    await expect(store.transaction(async (tx) => tx.find("bucket", {}))).rejects.toThrow("Indexed query required");
    await expect(store.transaction(async (tx) => tx.find("bucket", { subjectId: "owner" }))).rejects.toMatchObject({ status: 503 });
    await expect(store.transaction(async (tx) => tx.find("bucket", { subjectId: "owner", expiresAfter: 101 }))).resolves.toEqual([]);
  });
  it("uses Serializable and bounded P2034 conflict retries", async () => {
    const f = dbFixture();
    f.transaction.mockRejectedValueOnce({ code: "P2034" }).mockRejectedValueOnce({ code: "P2034" });
    await expect(f.store.transaction(async () => "committed")).resolves.toBe("committed");
    expect(f.transaction).toHaveBeenCalledTimes(3);
    expect(f.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    f.transaction.mockReset().mockRejectedValue({ code: "P2034" });
    await expect(f.store.transaction(async () => "unreachable")).rejects.toMatchObject({ code: "P2034" });
    expect(f.transaction).toHaveBeenCalledTimes(4);
  });
  it("does not retry unrelated database failures", async () => {
    const f = dbFixture(); f.transaction.mockRejectedValue({ code: "P2003" });
    await expect(f.store.transaction(async () => undefined)).rejects.toMatchObject({ code: "P2003" });
    expect(f.transaction).toHaveBeenCalledTimes(1);
  });
  it("retries a shadow-account insertion collision and returns the winning exact mapping", async () => {
    const f = dbFixture(); f.db.identityAccount.findUnique.mockResolvedValueOnce(null).mockResolvedValue(mapping()); f.db.user.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(f.store.transaction(async (tx) => tx.ensureEmployee("000042", "Test employee", "candidate-user"))).resolves.toMatchObject({ id: "mapped-user", account: "000042" });
    expect(f.transaction).toHaveBeenCalledTimes(2);
    expect(f.db.user.create).toHaveBeenCalledWith({ data: { id: "candidate-user", displayName: "Test employee", userType: "INTERNAL_EMPLOYEE", status: "ACTIVE", identityAccounts: { create: { id: expect.any(String), provider: "lighthouse-portal", providerUserId: "000042" } } } });
    expect(f.db.identityAccount.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { provider_providerUserId: { provider: "lighthouse-portal", providerUserId: "000042" } } }));
    // No lookup by employeeNo/email and no merging with unrelated demo/history users occurs.
    expect(Object.keys(f.db.user)).toEqual(["create"]);
  });
  it.each([{ status: "DISABLED" }, { userType: "DEALER_USER" }, { identityAccounts: [{ provider: "lighthouse-portal", providerUserId: "other-account" }] }])("rejects ineligible Prisma identity mappings: %j", async (override) => {
    const f = dbFixture(); f.db.identityAccount.findUnique.mockResolvedValue(mapping(override));
    await expect(f.store.transaction(async (tx) => tx.ensureEmployee("000042", "Test employee", "candidate"))).rejects.toMatchObject({ status: 403 });
    expect(await f.store.transaction(async (tx) => tx.employeeActive("000042", "mapped-user"))).toBe(false);
    expect(f.db.user.create).not.toHaveBeenCalled();
  });
  it("rejects collation-equivalent account/provider mismatches rather than merging them", async () => {
    const f = dbFixture(); f.db.identityAccount.findUnique.mockResolvedValue({ ...mapping(), providerUserId: "000042 " });
    await expect(f.store.transaction(async (tx) => tx.ensureEmployee("000042", "Test employee", "candidate"))).rejects.toMatchObject({ status: 403 });
    f.db.identityAccount.findUnique.mockResolvedValue({ ...mapping(), provider: "LIGHTHOUSE-PORTAL" });
    expect(await f.store.transaction(async (tx) => tx.employeeActive("000042", "mapped-user"))).toBe(false);
  });
  it("sends bounded indexed Prisma queries, translates dates, and keeps payload opaque", async () => {
    const f = dbFixture(); f.db.accessRecord.findUnique.mockResolvedValue({ ...row, expiresAt: new Date(row.expiresAt), createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) });
    await f.store.transaction(async (tx) => { expect(await tx.get("bucket", row.id)).toEqual(row); await tx.put(row); await tx.find("bucket", { subjectId: "owner", expiresAfter: 100 }); });
    expect(f.db.accessRecord.findMany).toHaveBeenCalledWith({ where: { kind: "bucket", subjectId: "owner", expiresAt: { gt: new Date(100) } }, take: 1001 });
    expect(f.db.accessRecord.upsert).toHaveBeenCalledWith({ where: { id: row.id }, create: { ...row, expiresAt: new Date(100), createdAt: new Date(1), updatedAt: new Date(1) }, update: { ...row, expiresAt: new Date(100), createdAt: new Date(1), updatedAt: new Date(1) } });
  });
});
