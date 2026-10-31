import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Principal } from "@/modules/auth/access";
import { getAuditedEmployeeRankings, validateEmployeeRankingPurpose } from "./employee-rankings";
import type { ReportPeriod } from "./report-period";

const now = new Date("2026-10-31T08:00:00.000Z");
const period: ReportPeriod = { preset: "month", startDate: "2026-10-01", endDate: "2026-10-31", timeZone: "Asia/Shanghai" };
const principal: Principal = { userId: "operator", account: "0007", displayName: "测试管理员", grantId: "g", credentialId: "s", channel: "web", capabilities: ["analytics:summary"], expiresAt: 1900000000000 };
const execute = vi.fn();
const query = vi.fn();
const recheck = vi.fn();
const database = { $executeRaw: execute, $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw" | "$executeRaw">;
const input = () => ({ principal, approvalRef: "APPROVAL-107", purpose: "核对本月推广使用情况", period, recheck });
beforeEach(() => {
  vi.stubEnv("LIGHTHOUSE_VISITS_START_AT", "2026-10-01T00:00:00.000Z");
  vi.clearAllMocks();
  execute.mockResolvedValue(1);
  recheck.mockResolvedValue(undefined);
  query.mockImplementation(async (sql: Prisma.Sql) => sql.sql.includes("analytics_page_views")
    ? [{ employeeId: "a", displayName: "同名员工", discriminator: "0007", visits: BigInt(7) }]
    : [{ employeeId: "b", displayName: "同名员工", discriminator: "0007", conversations: BigInt(3), turns: BigInt(5) }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("audited employee rankings", () => {
  it("audits before reading, rechecks current approval and records row counts before returning minimal labels", async () => {
    const result = await getAuditedEmployeeRankings(input(), { database, now });
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[0]);
    expect(query.mock.invocationCallOrder[1]).toBeLessThan(recheck.mock.invocationCallOrder[0]);
    expect(recheck.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[1]);
    expect(execute.mock.calls[1][0].sql).toContain("result_rows = ?");
    expect(execute.mock.calls[1][0].values).toContain(2);
    expect(result.visits.rows[0]).toEqual({ rank: 1, employee: "同名员工 · 0007-1", visits: 7 });
    expect(result.ai.rows[0]).toEqual({ rank: 1, employee: "同名员工 · 0007-2", conversations: 3, turns: 5 });
    expect(JSON.stringify(result)).not.toContain("employeeId");
  });
  it("uses bound UTC windows, only employee identities and database-side Top 10 ordered by AI conversations", async () => {
    await getAuditedEmployeeRankings(input(), { database, now });
    const visits = query.mock.calls[0][0] as Prisma.Sql;
    const ai = query.mock.calls[1][0] as Prisma.Sql;
    expect(visits.sql).toContain("actor_kind = 'employee'");
    expect(visits.sql).toContain("u.user_type = 'internal_employee'");
    expect(visits.sql).toContain("ORDER BY totals.visits DESC, u.id ASC LIMIT 10");
    expect(ai.sql).toContain("m.role = 'user'");
    expect(ai.sql).toContain("s.guest_id IS NULL");
    expect(ai.sql).toContain("ORDER BY totals.conversations DESC, totals.turns DESC, u.id ASC LIMIT 10");
    for (const sql of [visits, ai]) {
      expect(sql.sql).not.toMatch(/\b(content|metadata_json|payload|token)\b/);
      expect(sql.values[1]).toEqual(now);
    }
  });
  it.each([0, 2])("never reads rows if the starting audit reports %s written rows", async affected => {
    execute.mockResolvedValueOnce(affected);
    await expect(getAuditedEmployeeRankings(input(), { database, now })).rejects.toThrow("audit");
    expect(query).not.toHaveBeenCalled();
  });
  it("never discloses if audit completion affects no row", async () => {
    execute.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(getAuditedEmployeeRankings(input(), { database, now })).rejects.toThrow("completion audit");
    expect(execute.mock.calls[2][0].sql).toContain("'failed'");
  });
  it("never reads named rows if the audit store fails", async () => {
    execute.mockRejectedValueOnce(new Error("private connection"));
    await expect(getAuditedEmployeeRankings(input(), { database, now })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("records a failure and rejects if the role or approval changes during the query", async () => {
    recheck.mockRejectedValue(new Error("approval revoked"));
    await expect(getAuditedEmployeeRankings(input(), { database, now })).rejects.toThrow("revoked");
    expect(execute.mock.calls.at(-1)![0].sql).toContain("'failed'");
    expect(execute.mock.calls.some(([sql]) => sql.sql.includes("'completed'"))).toBe(false);
  });
  it("keeps a source failure private and never returns the other ranking", async () => {
    query.mockRejectedValueOnce(new Error("SQL unavailable"));
    await expect(getAuditedEmployeeRankings(input(), { database, now })).rejects.toThrow();
    expect(execute.mock.calls.at(-1)![0].sql).toContain("'failed'");
  });
  it("does not present visits before collection and clips old employee chat details to 180 days", async () => {
    vi.stubEnv("LIGHTHOUSE_VISITS_START_AT", "");
    const oldPeriod: ReportPeriod = { ...period, startDate: "2026-01-01" };
    const result = await getAuditedEmployeeRankings({ ...input(), period: oldPeriod }, { database, now });
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.visits.rows).toEqual([]);
    expect(result.visits.note).toContain("可查询范围");
    expect(query.mock.calls[0][0].values[0]).toEqual(new Date(now.getTime() - 180 * 86_400_000));
    expect(result.ai.note).toContain("180 天");
  });
  it.each(["", " a ", "核对\n报表", "a".repeat(257), undefined])("rejects an invalid reason before auditing %j", reason => {
    expect(() => validateEmployeeRankingPurpose(reason)).toThrow();
  });
});

