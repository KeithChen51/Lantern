import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/infrastructure/db", () => ({ prisma: { $queryRaw: database.query } }));
vi.mock("@prisma/client", () => ({ Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join("?"), values }) } }));
import { getAnalyticsSummary } from "./summary";

type SqlQuery = { sql: string; values: unknown[] };
const now = new Date("2026-10-31T01:00:00.000Z");

beforeEach(() => {
  database.query.mockReset();
  database.query.mockImplementation(async ({ sql }: SqlQuery) => {
    if (sql.includes("FROM access_records")) return [{ logins: BigInt(1), logouts: BigInt(0) }];
    if (sql.includes("FROM chat_messages")) return [{ employeeMessages: BigInt(1), guestMessages: BigInt(0), unknownMessages: BigInt(0), conversations: BigInt(1), employees: BigInt(1) }];
    if (sql.includes("FROM hub_resources")) return [{ resources: BigInt(1), publishedResources: BigInt(1), unpublishedResources: BigInt(0) }];
    if (sql.includes("FROM hub_audits")) return [{ operations: BigInt(0) }];
    throw new Error("Unexpected query");
  });
});

describe("MySQL summary queries", () => {
  it("filters event aggregates with bound dates and reads only aggregate counts", async () => {
    const summary = await getAnalyticsSummary(7, { now, knowledgeDriver: "mysql", knowledgeEnabled: true });
    expect(database.query).toHaveBeenCalledTimes(4);
    expect(summary.sections.slice(0, 4).map((section) => section.status)).toEqual(["available", "available", "available", "available"]);
    const queries = database.query.mock.calls.map(([query]) => query as SqlQuery);
    for (const query of queries) {
      expect(query.sql).not.toMatch(/\b(content|metadata_json|messages|detail|account|targetId|subjectId)\b/i);
      expect(query.sql).not.toContain(now.toISOString());
      if (query.sql.includes("FROM hub_resources")) {
        expect(query.values).toEqual([]);
        expect(query.sql).toContain("archived = false");
      } else {
        expect(query.values).toEqual([new Date("2026-10-24T16:00:00.000Z"), now]);
        expect(query.sql).toMatch(/>= \? AND \w+(?:\.\w+)? <= \?/);
      }
    }
    const auth = queries.find((query) => query.sql.includes("FROM access_records"))!;
    expect(auth.sql).toContain("kind = 'audit'");
    expect(auth.sql).toContain("'$.action'");
    const hermit = queries.find((query) => query.sql.includes("FROM chat_messages"))!;
    expect(hermit.sql).toContain("m.role = 'user'");
    expect(hermit.sql).toContain("s.user_id IS NOT NULL AND s.guest_id IS NULL");
    expect(hermit.sql).toContain("s.guest_id IS NOT NULL AND s.user_id IS NULL");
    expect(hermit.sql).toContain("COUNT(DISTINCT m.session_id)");
  });

  it("treats unexpected database result shapes as unavailable rather than zero", async () => {
    database.query.mockResolvedValue([]);
    const summary = await getAnalyticsSummary(7, { now, knowledgeDriver: "mysql", knowledgeEnabled: true });
    expect(summary.sections.slice(0, 4).every((section) => section.status === "unavailable")).toBe(true);
    expect(summary.sections.flatMap((section) => section.metrics).every((metric) => metric.value === null)).toBe(true);
  });
});
