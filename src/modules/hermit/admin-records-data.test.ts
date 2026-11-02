import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "@/shared/errors";

vi.mock("@/infrastructure/db", () => ({ prisma: {} }));
import { listHermitRecords, readHermitRecord } from "./admin-records-data";

const query = vi.fn();
const options = { database: { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw"> };
const record = (id: string, lastQuestionAt: Date | null = new Date("2026-11-02T03:00:00.000Z")) => ({
  id, actor: "employee", createdAt: new Date("2026-11-01T03:00:00.000Z"), lastQuestionAt, turns: BigInt(2),
});
const message = (id: string, role: string, turn: unknown = null) => ({ id: `db-${id}`, externalMessageId: id, role, turn });
const contents = (ids: string[]) => ids.map(externalMessageId => ({ externalMessageId, text: `saved ${externalMessageId} [1]` }));

beforeEach(() => { query.mockReset(); });

describe("administrator conversation inventory", () => {
  it("fetches only inventory metadata, including empty and identity-unknown old sessions", async () => {
    query.mockResolvedValue([record("first"), { ...record("empty", null), actor: "unknown", turns: BigInt(0) }]);
    const result = await listHermitRecords({}, options);
    expect(result).toEqual({ rows: [
      { id: "first", actor: "employee", createdAt: "2026-11-01T03:00:00.000Z", lastQuestionAt: "2026-11-02T03:00:00.000Z", turns: 2 },
      { id: "empty", actor: "unknown", createdAt: "2026-11-01T03:00:00.000Z", lastQuestionAt: null, turns: 0 },
    ], nextCursor: null });
    const sql = query.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).not.toMatch(/\b(title|content|metadata_json|display_name|account)\b/i);
    expect(sql.sql).toContain("MAX(created_at)");
    expect(sql.sql).toContain("LEFT JOIN");
    expect(sql.sql).toContain("BINARY inventory.id DESC");
    expect(sql.values).toEqual([21]);
  });

  it("binds calendar boundaries as Shanghai days and an exact case-sensitive identifier", async () => {
    query.mockResolvedValue([]);
    await listHermitRecords({ start: "2026-11-01", end: "2026-11-02", actor: "guest", id: "session' OR 1=1 --" }, options);
    const sql = query.mock.calls[0][0] as Prisma.Sql;
    expect(sql.values).toEqual([
      ...Array(3).fill("session' OR 1=1 --"), new Date("2026-10-31T16:00:00.000Z"), new Date("2026-11-02T16:00:00.000Z"), "guest", 21,
    ]);
    expect(sql.sql).not.toContain("OR 1=1");
    expect(sql.sql).toContain("AND session_id = ?");
    expect(sql.sql).toContain("WHERE s.id = ? AND BINARY s.id = BINARY ?");
  });

  it("pages tied timestamps without losing the nullable tail and binds cursors to filters", async () => {
    query.mockResolvedValueOnce(Array.from({ length: 21 }, (_, index) => record(`record-${index}`))).mockResolvedValue([]);
    const result = await listHermitRecords({ actor: "employee" }, options);
    expect(result.rows).toHaveLength(20);
    expect(result.nextCursor).toBeTypeOf("string");
    await listHermitRecords({ actor: "employee", cursor: result.nextCursor! }, options);
    const sql = query.mock.calls[1][0] as Prisma.Sql;
    expect(sql.sql).toContain("inventory.lastQuestionAt IS NULL OR");
    expect(sql.values).toContain("record-19");
    await expect(listHermitRecords({ actor: "guest", cursor: result.nextCursor! }, options)).rejects.toMatchObject({ status: 400 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("continues empty legacy sessions with a creation-time/id keyset", async () => {
    query.mockResolvedValueOnce(Array.from({ length: 21 }, (_, index) => record(`record-${index}`, null))).mockResolvedValue([]);
    const first = await listHermitRecords({}, options);
    await listHermitRecords({ cursor: first.nextCursor! }, options);
    expect((query.mock.calls[1][0] as Prisma.Sql).sql).toContain("inventory.lastQuestionAt IS NULL AND");
  });

  it.each([
    { start: "2026-02-30" }, { end: "2026-13-01" }, { start: "2026-11-03", end: "2026-11-01" },
    { actor: "everyone" }, { id: " " }, { id: "x\ny" }, { cursor: "not-a-cursor" }, { start: "2026-1-1" },
    { start: "0000-01-01" }, { end: "9999-12-31" },
  ])("rejects malformed filters before accessing storage %j", async input => {
    await expect(listHermitRecords(input as Parameters<typeof listHermitRecords>[0], options)).rejects.toBeInstanceOf(AppError);
    expect(query).not.toHaveBeenCalled();
  });

  it("refuses unsafe count conversion instead of showing rounded totals", async () => {
    query.mockResolvedValue([{ ...record("overflow"), turns: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1) }]);
    await expect(listHermitRecords({}, options)).rejects.toThrow("Invalid saved conversation count");
  });
});

describe("audited conversation transcript repository", () => {
  it("preserves current retry answers across later turns without fetching private metadata", async () => {
    query.mockResolvedValueOnce([{ id: "session" }]).mockResolvedValueOnce([
      message("u1", "USER"), message("old", "ASSISTANT", { userMessageId: "db-u1", startedAt: 10 }),
      message("u2", "USER"), message("a2", "ASSISTANT", { userMessageId: "db-u2", startedAt: 30 }),
      message("retry", "ASSISTANT", JSON.stringify({ userMessageId: "db-u1", startedAt: 20 })),
      message("late-old", "ASSISTANT", { userMessageId: "db-u1", startedAt: 9 }),
    ]).mockResolvedValueOnce(contents(["u1", "retry", "u2", "a2"]).reverse());
    const result = await readHermitRecord("session", undefined, options);
    expect(result).toEqual({ messages: [
      { id: "u1", role: "user", text: "saved u1 [1]" }, { id: "retry", role: "assistant", text: "saved retry [1]" },
      { id: "u2", role: "user", text: "saved u2 [1]" }, { id: "a2", role: "assistant", text: "saved a2 [1]" },
    ], nextCursor: null });
    const descriptorQuery = query.mock.calls[1][0] as Prisma.Sql;
    expect((query.mock.calls[0][0] as Prisma.Sql).sql).toContain("WHERE id = ? AND BINARY id = BINARY ?");
    expect(descriptorQuery.sql).toContain("WHERE session_id = ?");
    expect(descriptorQuery.sql).not.toContain("WHERE BINARY session_id");
    expect(descriptorQuery.sql).not.toMatch(/\b(content|user_id|guest_id|title)\b/);
    expect(descriptorQuery.sql).toContain("JSON_EXTRACT(metadata_json, '$.hermitTurn')");
    const textQuery = query.mock.calls[2][0] as Prisma.Sql;
    expect(textQuery.sql).not.toMatch(/\b(metadata_json|user_id|guest_id|model_name)\b/);
    expect(textQuery.sql).toContain("role IN ('user', 'assistant')");
    expect(JSON.stringify(result)).not.toContain("userMessageId");
  });

  it("serves a long transcript in bounded ordered pages and refuses another session's cursor", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => message(`message-${index}`, index % 2 ? "ASSISTANT" : "USER"));
    query.mockResolvedValueOnce([{ id: "session" }]).mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(contents(rows.slice(0, 50).map(row => row.externalMessageId)))
      .mockResolvedValueOnce([{ id: "session" }]).mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(contents(rows.slice(50).map(row => row.externalMessageId)));
    const first = await readHermitRecord("session", undefined, options);
    expect(first.messages).toHaveLength(50);
    const second = await readHermitRecord("session", first.nextCursor!, options);
    expect(second.messages.map(row => row.id)).toEqual(rows.slice(50).map(row => row.externalMessageId));
    expect(second.nextCursor).toBeNull();
    await expect(readHermitRecord("other", first.nextCursor!, options)).rejects.toMatchObject({ status: 400 });
    expect(query).toHaveBeenCalledTimes(6);
  });

  it("keeps orphan old answers, folds adjacent legacy retries and tolerates malformed turn metadata", async () => {
    query.mockResolvedValueOnce([{ id: "legacy" }]).mockResolvedValueOnce([
      message("orphan", "ASSISTANT", "broken-json"), message("u", "USER"),
      message("old", "ASSISTANT"), message("new", "ASSISTANT"),
    ]).mockResolvedValueOnce(contents(["orphan", "u", "new"]));
    expect((await readHermitRecord("legacy", undefined, options)).messages.map(row => row.id)).toEqual(["orphan", "u", "new"]);
  });

  it("returns an empty transcript for an existing empty session", async () => {
    query.mockResolvedValueOnce([{ id: "empty" }]).mockResolvedValueOnce([]);
    expect(await readHermitRecord("empty", undefined, options)).toEqual({ messages: [], nextCursor: null });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid cursors before a read and a removed retry anchor before fetching text", async () => {
    await expect(readHermitRecord("session", "not-a-cursor", options)).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
    const cursor = Buffer.from(JSON.stringify({ session: "session", after: "obsolete-attempt" })).toString("base64url");
    query.mockResolvedValueOnce([{ id: "session" }]).mockResolvedValueOnce([message("u", "USER")]);
    await expect(readHermitRecord("session", cursor, options)).rejects.toMatchObject({ status: 400 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("reports an unavailable session or removed page explicitly", async () => {
    query.mockResolvedValueOnce([]);
    await expect(readHermitRecord("missing", undefined, options)).rejects.toMatchObject({ status: 404 });
    query.mockResolvedValueOnce([{ id: "removed" }]).mockResolvedValueOnce([message("u", "USER")]).mockResolvedValueOnce([]);
    await expect(readHermitRecord("removed", undefined, options)).rejects.toMatchObject({ status: 404 });
  });

  it("pages every stored attempt chronologically for very large sessions without an arbitrary length failure", async () => {
    const stored = Array.from({ length: 51 }, (_, index) => ({
      ...message(`u-${index}`, "USER"), text: `Question ${index}`, createdAt: new Date("2026-11-02T03:00:00.000Z"),
    }));
    query.mockResolvedValueOnce([{ id: "huge" }])
      .mockResolvedValueOnce(Array.from({ length: 10_001 }, (_, index) => message(`u-${index}`, "USER")))
      .mockResolvedValueOnce(stored)
      .mockResolvedValueOnce([{ id: "huge" }])
      .mockResolvedValueOnce([{ id: "threshold-message" }])
      .mockResolvedValueOnce(stored.slice(50));
    const first = await readHermitRecord("huge", undefined, options);
    expect(first.view).toBe("stored-attempts");
    expect(first.messages).toHaveLength(50);
    const second = await readHermitRecord("huge", first.nextCursor!, options);
    expect(second.messages).toEqual([{ id: "u-50", role: "user", text: "Question 50" }]);
    expect(second.view).toBe("stored-attempts");
    expect(second.nextCursor).toBeNull();
    expect(query).toHaveBeenCalledTimes(6);
    const threshold = query.mock.calls[4][0] as Prisma.Sql;
    expect(threshold.sql).toContain("LIMIT 1 OFFSET ?");
    expect(threshold.values).toEqual(["huge", 10000]);
    expect(threshold.sql).not.toMatch(/\b(content|metadata_json)\b/);
    const page = query.mock.calls[5][0] as Prisma.Sql;
    expect(page.sql).toContain("WHERE session_id = ?");
    expect(page.sql).toContain("BINARY id > BINARY ?");
    expect(page.values).toContain("db-u-49");
  });

  it("rejects a forged stored-attempts cursor for a short or shrunk session before reading any reply", async () => {
    const cursor = Buffer.from(JSON.stringify({ session: "short", mode: "stored-attempts", createdAt: "2026-11-02T00:00:00.000Z", id: "old" })).toString("base64url");
    query.mockResolvedValueOnce([{ id: "short" }]).mockResolvedValueOnce([]);
    await expect(readHermitRecord("short", cursor, options)).rejects.toMatchObject({ status: 400 });
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls as [Prisma.Sql][]) expect(sql.sql).not.toMatch(/\b(content|metadata_json)\b/);
  });
});
