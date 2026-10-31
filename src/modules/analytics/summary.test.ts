import { describe, expect, it, vi } from "vitest";
import { analyticsWindow, getAnalyticsSummary, type SummaryReader, type SummarySource } from "./summary";

const now = new Date("2026-10-31T04:05:06.000Z");
const counts: Record<SummarySource, Record<string, bigint>> = {
  auth: { logins: BigInt(4), logouts: BigInt(2) },
  hermit: { employeeMessages: BigInt(9), guestMessages: BigInt(3), unknownMessages: BigInt(1), conversations: BigInt(6), employees: BigInt(2) },
  knowledgeInventory: { resources: BigInt(10), publishedResources: BigInt(8), unpublishedResources: BigInt(2) },
  knowledgeOperations: { operations: BigInt(7) },
};
const options = { now, knowledgeDriver: "mysql", knowledgeEnabled: true };

describe("analytics calendar window", () => {
  it("includes today and the previous six Shanghai calendar days, without future events", () => {
    expect(analyticsWindow(7, now)).toEqual({ start: new Date("2026-10-24T16:00:00.000Z"), end: now, startDate: "2026-10-25", endDate: "2026-10-31" });
  });
  it("switches dates at Shanghai midnight and computes 30 days across month boundaries", () => {
    const before = analyticsWindow(30, new Date("2026-10-31T15:59:59.999Z"));
    const after = analyticsWindow(30, new Date("2026-10-31T16:00:00.000Z"));
    expect([before.startDate, before.endDate]).toEqual(["2026-10-02", "2026-10-31"]);
    expect([after.startDate, after.endDate]).toEqual(["2026-10-03", "2026-11-01"]);
    expect(after.start.toISOString()).toBe("2026-10-02T16:00:00.000Z");
  });
  it("rejects unsupported or invalid input before reading data", async () => {
    const read = vi.fn();
    await expect(getAnalyticsSummary(14 as 7, { ...options, read })).rejects.toThrow(RangeError);
    expect(() => analyticsWindow(7, new Date("invalid"))).toThrow(RangeError);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("aggregate summary", () => {
  it("returns only declared numerical aggregates and keeps employee / guest / unknown users distinct", async () => {
    const read = vi.fn<SummaryReader>().mockImplementation(async (source) => ({ ...counts[source], arbitraryPrivateField: BigInt(123) }));
    const result = await getAnalyticsSummary(7, { ...options, read });
    expect(result.period).toEqual({ days: 7, startDate: "2026-10-25", endDate: "2026-10-31", timeZone: "Asia/Shanghai", generatedAt: now.toISOString() });
    expect(read).toHaveBeenCalledTimes(4);
    for (const call of read.mock.calls) {
      expect(call[1]).toEqual(new Date("2026-10-24T16:00:00.000Z"));
      expect(call[2]).toEqual(now);
    }
    expect(result.sections.find((section) => section.id === "hermit")?.metrics.map((item) => item.value)).toEqual([9, 3, 1, 6, 2]);
    expect(result.sections.slice(0, 4).every((section) => section.status === "available")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("arbitraryPrivateField");
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it("shows true empty sources as zero and uncollected metrics as null", async () => {
    const result = await getAnalyticsSummary(7, { ...options, read: async (source) => Object.fromEntries(Object.keys(counts[source]).map((key) => [key, BigInt(0)])) });
    expect(result.sections[0].status).toBe("available");
    expect(result.sections[0].metrics.every((item) => item.value === 0)).toBe(true);
    const coverage = result.sections.find((section) => section.id === "coverage")!;
    expect(coverage.status).toBe("not_collected");
    expect(coverage.metrics.every((item) => item.value === null)).toBe(true);
  });
  it("isolates a failed source and never serializes connection details", async () => {
    const read: SummaryReader = async (source) => {
      if (source === "auth") throw new Error("mysql://admin:private-password@database:3306/app");
      return counts[source];
    };
    const result = await getAnalyticsSummary(30, { ...options, read });
    expect(result.sections[0].status).toBe("unavailable");
    expect(result.sections[0].metrics.every((item) => item.value === null)).toBe(true);
    expect(result.sections[1].status).toBe("available");
    expect(JSON.stringify(result)).not.toContain("private-password");
  });
  it.each([{}, { logins: BigInt(-1), logouts: BigInt(0) }, { logins: BigInt("9007199254740992"), logouts: BigInt(0) }, { logins: 1.5, logouts: 0 }])("rejects missing, unsafe or malformed counts atomically for that source", async (invalid) => {
    const result = await getAnalyticsSummary(7, { ...options, read: async (source) => source === "auth" ? invalid : counts[source] });
    expect(result.sections[0].status).toBe("unavailable");
    expect(result.sections[0].metrics.every((item) => item.value === null)).toBe(true);
  });
  it.each([{ knowledgeDriver: "sqlite", knowledgeEnabled: true }, { knowledgeDriver: "mysql", knowledgeEnabled: false }])("does not present inactive MySQL tables as the current knowledge source (%j)", async (knowledge) => {
    const read = vi.fn<SummaryReader>().mockImplementation(async (source) => counts[source]);
    const result = await getAnalyticsSummary(7, { ...options, ...knowledge, read });
    expect(read.mock.calls.map(([source]) => source)).toEqual(["auth", "hermit"]);
    expect(result.sections.filter((section) => section.id.startsWith("knowledge")).every((section) => section.status === "not_collected")).toBe(true);
  });
});
