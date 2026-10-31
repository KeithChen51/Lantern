import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { pruneUsage } from "./usage-prune";

const now = new Date("2026-10-31T16:05:00.000Z");
type Candidate = { event_id: string; archive_day: string | null };
function fixture(options: { candidates?: Candidate[][]; saved?: string[]; failArchive?: boolean; remaining?: number } = {}) {
  const calls: Array<{ kind: string; sql: Prisma.Sql }> = [];
  let batch = 0;
  let candidateCount = 0;
  const query = vi.fn(async (sql: Prisma.Sql) => {
    calls.push({ kind: "query", sql });
    if (sql.sql.includes("FOR UPDATE")) {
      const rows = options.candidates?.[batch++] ?? [];
      candidateCount = rows.length;
      return rows;
    }
    if (sql.sql.includes("FROM analytics_daily_visitors") && !sql.sql.includes("COUNT(*)")) return (options.saved ?? []).map(day => ({ day }));
    return [{ total: BigInt(options.remaining ?? 0) }];
  });
  const execute = vi.fn(async (sql: Prisma.Sql) => {
    calls.push({ kind: "execute", sql });
    if (sql.sql.includes("INSERT IGNORE")) {
      if (options.failArchive) throw new Error("database unavailable");
      return 1;
    }
    if (sql.sql.includes("DELETE FROM analytics_page_views")) return candidateCount;
    return 0;
  });
  const transaction = vi.fn(async (action: (tx: unknown) => Promise<unknown>) => action({ $queryRaw: query, $executeRaw: execute }));
  return { db: { $queryRaw: query, $executeRaw: execute, $transaction: transaction }, query, execute, transaction, calls };
}

describe("anonymous UV preservation during bounded usage expiry", () => {
  it("previews all five expiry sources without a transaction or data writes", async () => {
    const f = fixture({ remaining: 2 });
    const result = await pruneUsage(f.db as never, false, now);
    expect(result.mode).toBe("preview");
    expect(result.results.map(row => row.source)).toEqual(["visitRateBuckets", "pageViews", "personAudits", "dailyVisits", "dailyVisitors"]);
    expect(result.results.every(row => row.removed === 0 && row.remaining === 2)).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
    const summaries = f.query.mock.calls.filter(([sql]) => sql.sql.includes("INTERVAL 24 MONTH"));
    expect(summaries).toHaveLength(2);
    expect(summaries.every(([sql]) => sql.values.includes("2026-11-01"))).toBe(true);
  });

  it("freezes distinct actor/subject pairs for complete Shanghai days before deleting exact locked facts", async () => {
    const f = fixture({ candidates: [[{ event_id: "expired-1", archive_day: "2026-05-05" }, { event_id: "expired-2", archive_day: "2026-05-05" }]] });
    const result = await pruneUsage(f.db as never, true, now);
    const locks = f.query.mock.calls.find(([sql]) => sql.sql.includes("FOR UPDATE"))![0];
    expect(locks.sql).toContain("ORDER BY occurred_at, actor_kind, subject_id, event_id");
    expect(locks.values).toEqual(["2026-11-01", new Date(now.getTime() - 180 * 86_400_000), 500]);
    expect(locks.sql).toMatch(/DATE_ADD\(DATE_ADD\(DATE\(DATE_ADD\(occurred_at, INTERVAL 8 HOUR\)\), INTERVAL 1 DAY\), INTERVAL 24 MONTH\)/);
    const insert = f.execute.mock.calls.find(([sql]) => sql.sql.includes("INSERT IGNORE"))![0];
    expect(insert.sql).toContain("COUNT(DISTINCT actor_kind, subject_id)");
    expect(insert.sql).toMatch(/HAVING COUNT\(\*\) > 0 AND COUNT\(\*\) =/);
    expect(insert.sql).toContain("SELECT SUM(views) FROM analytics_visit_days");
    expect(insert.values).toEqual(["2026-05-05", new Date("2026-05-04T16:00:00.000Z"), new Date("2026-05-05T16:00:00.000Z"), "2026-05-05"]);
    const deletion = f.execute.mock.calls.find(([sql]) => sql.sql.includes("DELETE FROM analytics_page_views"))![0];
    expect(deletion.values).toEqual([new Date(now.getTime() - 180 * 86_400_000), "expired-1", "expired-2"]);
    expect(f.calls.findIndex(call => call.sql === insert)).toBeLessThan(f.calls.findIndex(call => call.sql === deletion));
    expect(result.results.find(row => row.source === "pageViews")?.removed).toBe(2);
  });

  it("does not overwrite known complete days and skips archive work for summary-expired dates", async () => {
    const f = fixture({ candidates: [[{ event_id: "retained-summary", archive_day: "2026-05-05" }, { event_id: "ancient", archive_day: null }]], saved: ["2026-05-05"] });
    const result = await pruneUsage(f.db as never, true, now);
    expect(f.execute.mock.calls.every(([sql]) => !sql.sql.includes("INSERT"))).toBe(true);
    expect(result.results.find(row => row.source === "pageViews")?.removed).toBe(2);
  });

  it("does not delete the selected facts when saving their complete UV fails", async () => {
    const f = fixture({ candidates: [[{ event_id: "expired", archive_day: "2026-05-05" }]], failArchive: true });
    await expect(pruneUsage(f.db as never, true, now)).rejects.toThrow("database unavailable");
    expect(f.execute.mock.calls.every(([sql]) => !sql.sql.includes("DELETE FROM analytics_page_views"))).toBe(true);
  });

  it("does not extend individual retention when a day was already partly pruned", async () => {
    const f = fixture({ candidates: [[{ event_id: "remaining-fact", archive_day: "2026-05-05" }]] });
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async sql => sql.sql.includes("INSERT IGNORE") ? 0 : original(sql));
    const result = await pruneUsage(f.db as never, true, now);
    expect(result.results.find(row => row.source === "pageViews")?.removed).toBe(1);
  });

  it("caps personal deletion at 5,000 per invocation and scans the same affected day once", async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({ event_id: "event-" + index, archive_day: "2026-05-05" }));
    const f = fixture({ candidates: Array.from({ length: 11 }, () => rows), remaining: 77 });
    const result = await pruneUsage(f.db as never, true, now);
    expect(f.transaction).toHaveBeenCalledTimes(10);
    expect(f.execute.mock.calls.filter(([sql]) => sql.sql.includes("INSERT IGNORE"))).toHaveLength(1);
    expect(result.results.find(row => row.source === "pageViews")).toEqual({ source: "pageViews", removed: 5_000, remaining: 77 });
  });
});
