import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Principal } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";
vi.mock("@/modules/hermit/admin-records-data", () => ({ readHermitRecord: vi.fn() }));
import { getAuditedHermitRecord, validateHermitRecordCursor,
  validateHermitRecordId } from "./admin-records-access";

const principal: Principal = {
  userId: "admin", account: "007", displayName: "Admin", grantId: "grant", credentialId: "credential",
  channel: "web", capabilities: ["analytics:summary"], expiresAt: Date.parse("2026-11-03T00:00:00Z"),
};
const now = new Date("2026-11-02T18:00:00Z");
const execute = vi.fn();
const readRecord = vi.fn();
const recheck = vi.fn();
const database = { $executeRaw: execute } as unknown as Pick<PrismaClient, "$executeRaw">;
const input = () => ({ principal, id: "session-1", recheck });
beforeEach(() => {
  vi.resetAllMocks();
  execute.mockResolvedValue(1);
  readRecord.mockResolvedValue({ messages: [{ id: "m1", role: "user", text: "private conversation" }], nextCursor: null });
});

describe("audited Hermit content reads", () => {
  it("commits an attempt before reading and completion before disclosure, without copying content into audits", async () => {
    const events: string[] = [];
    execute.mockImplementation(async (sql: Prisma.Sql) => {
      events.push(sql.sql.includes("INSERT") ? "attempt" : "completion");
      return 1;
    });
    readRecord.mockImplementation(async () => { events.push("read"); return { messages: [], nextCursor: null }; });
    recheck.mockImplementation(async () => { events.push("recheck"); });
    await getAuditedHermitRecord(input(), { database, readRecord, now });
    expect(events).toEqual(["attempt", "read", "recheck", "completion"]);
    const audit = execute.mock.calls[0][0] as Prisma.Sql;
    expect(audit.sql).toContain("session_id");
    expect(audit.values).toEqual([expect.any(String), "admin", "role:platform-admin", "查看路引对话记录",
      "2026-11-03", "2026-11-03", now, "session-1"]);
    expect(audit.sql).not.toMatch(/content|metadata|messages|title/);
    expect(JSON.stringify(execute.mock.calls)).not.toContain("private conversation");
  });
  it.each([0, 2])("does not read when the attempt affects %s rows", async changed => {
    execute.mockResolvedValueOnce(changed);
    await expect(getAuditedHermitRecord(input(), { database, readRecord })).rejects.toThrow("audit");
    expect(readRecord).not.toHaveBeenCalled();
  });
  it("does not read if the audit store is down", async () => {
    execute.mockRejectedValueOnce(new Error("private database URI"));
    await expect(getAuditedHermitRecord(input(), { database, readRecord })).rejects.toThrow();
    expect(readRecord).not.toHaveBeenCalled();
  });
  it("does not disclose if completion cannot be committed", async () => {
    execute.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(getAuditedHermitRecord(input(), { database, readRecord })).rejects.toThrow("completion audit");
    expect(execute.mock.calls.at(-1)![0].sql).toContain("'failed'");
  });
  it("records failure and refuses disclosure when authorization changes", async () => {
    recheck.mockRejectedValue(new Error("revoked"));
    await expect(getAuditedHermitRecord(input(), { database, readRecord })).rejects.toThrow("revoked");
    expect(execute.mock.calls.at(-1)![0].sql).toContain("'failed'");
    expect(execute.mock.calls.some(([sql]) => sql.sql.includes("'completed'"))).toBe(false);
  });
  it("records a missing record as a failed attempt and preserves its safe status", async () => {
    readRecord.mockRejectedValue(new AppError("not_found", "Gone", 404));
    await expect(getAuditedHermitRecord(input(), { database, readRecord })).rejects.toMatchObject({ status: 404 });
    expect(execute.mock.calls.at(-1)![0].sql).toContain("'failed'");
  });
  it("passes a bounded cursor and audits each read", async () => {
    await getAuditedHermitRecord({ ...input(), cursor: "cursor_123" }, { database, readRecord });
    expect(readRecord).toHaveBeenCalledWith("session-1", "cursor_123");
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it.each(["", " abc ", "a".repeat(192), "ab\ncd", undefined])("rejects an invalid id before auditing %j", value => {
    expect(() => validateHermitRecordId(value)).toThrow();
  });
  it.each(["", "a".repeat(1601), "cursor/unsafe", null])("rejects an invalid cursor %j", value => {
    expect(() => validateHermitRecordCursor(value)).toThrow();
  });
});
