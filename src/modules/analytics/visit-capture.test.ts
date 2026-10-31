import { describe, expect, it, vi } from "vitest";
import { captureVisit, parseVisitInput } from "./visit-capture";
import type { Principal } from "@/modules/auth/access-types";
const input = parseVisitInput({ v: 1, eventId: "C13AF925-EFAC-4564-BF03-B348CA61ABF0", module: "mirror", csrfToken: "a".repeat(43) });
const principal = { userId: "employee", credentialId: "opaque-session-reference", csrfToken: "a".repeat(43), channel: "web", organization: "原部门", capabilities: [] } as unknown as Principal;
function database(duplicate?: { actor_kind: string; subject_id: string; module: string }, rate = 1) {
  const execute = vi.fn(async (sql: { sql: string }) => sql.sql.includes("INSERT IGNORE") ? duplicate ? 0 : 1 : 1);
  const query = vi.fn(async (sql: { sql: string }) => sql.sql.includes("FROM access_records") ? [{ count: rate }] : [duplicate]);
  const db = { $transaction: vi.fn(async (action: (tx: unknown) => Promise<unknown>) => action({ $executeRaw: execute, $queryRaw: query })) };
  return { db, execute, query };
}
describe("visit facts and daily totals", () => {
  it("normalizes UUID spelling and derives Shanghai day, actor and organization on server", async () => {
    const fixture = database();
    await captureVisit(principal, input, new Date("2026-10-31T16:00:00Z"), fixture.db as never);
    expect(input.eventId).toBe(input.eventId.toLowerCase());
    const insert = fixture.execute.mock.calls.find(([sql]) => sql.sql.includes("INSERT IGNORE"))![0];
    expect((insert as unknown as { values: unknown[] }).values).toEqual([input.eventId, "employee", principal.userId, "原部门", "mirror", new Date("2026-10-31T16:00:00Z")]);
    const daily = fixture.execute.mock.calls.find(([sql]) => sql.sql.includes("INSERT INTO analytics_visit_days"))![0];
    expect((daily as unknown as { values: unknown[] }).values).toEqual(["2026-11-01", "mirror"]);
  });
  it("does not increment a retried event and rejects conflicting event owners", async () => {
    const same = database({ actor_kind: "employee", subject_id: "employee", module: "mirror" });
    expect(await captureVisit(principal, input, new Date(), same.db as never)).toEqual({ recorded: false });
    expect(same.execute.mock.calls.some(([sql]) => sql.sql.includes("analytics_visit_days"))).toBe(false);
    const other = database({ actor_kind: "employee", subject_id: "other", module: "mirror" });
    await expect(captureVisit(principal, input, new Date(), other.db as never)).rejects.toMatchObject({ status: 409 });
  });
  it("never attaches organization to anonymous visitors", async () => {
    const fixture = database();
    await captureVisit({ ...principal, kind: "guest" }, input, new Date(), fixture.db as never);
    const insert = fixture.execute.mock.calls.find(([sql]) => sql.sql.includes("INSERT IGNORE"))![0];
    expect((insert as unknown as { values: unknown[] }).values.slice(1, 4)).toEqual(["guest", "employee", null]);
  });
  it("limits a hot session before inserting any facts", async () => {
    const fixture = database(undefined, 121);
    await expect(captureVisit(principal, input, new Date(), fixture.db as never)).rejects.toMatchObject({ status: 429 });
    expect(fixture.execute.mock.calls.some(([sql]) => sql.sql.includes("INSERT IGNORE"))).toBe(false);
  });
});
