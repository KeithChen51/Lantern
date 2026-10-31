import { describe, expect, it } from "vitest";
import { parseReportPeriod, reportBounds } from "./report-period";

const now = new Date("2026-10-31T08:00:00.000Z");
const parse = (query: string, at = now) => parseReportPeriod(new URLSearchParams(query), at);

describe("Shanghai report calendar", () => {
  it("starts the week on Monday and the month on its first day", () => {
    expect(parse("")).toEqual({ preset: "week", startDate: "2026-10-26", endDate: "2026-10-31", timeZone: "Asia/Shanghai" });
    expect(parse("preset=month").startDate).toBe("2026-10-01");
    expect(parse("preset=week", new Date("2026-11-01T16:00:00.000Z")).startDate).toBe("2026-11-02");
  });
  it("keeps custom dates inclusive and binds UTC bounds until now", () => {
    const period = parse("preset=custom&start=2026-10-30&end=2026-10-30");
    expect(reportBounds(period, now)).toEqual({ start: new Date("2026-10-29T16:00:00.000Z"), endExclusive: new Date("2026-10-30T16:00:00.000Z") });
    expect(reportBounds(parse("preset=month"), now).endExclusive).toEqual(now);
  });
  it.each([
    "preset=other", "preset=week&preset=month", "start=2026-10-01", "preset=month&end=2026-10-01",
    "preset=custom&start=2026-02-29&end=2026-10-31", "preset=custom&start=2026-10-32&end=2026-10-32",
    "preset=custom&start=2026-10-31&end=2026-11-01", "preset=custom&start=2026-10-31&end=2026-10-30",
    "preset=custom&start=2026-10-01&end=2026-10-02&end=2026-10-03",
    "preset=custom&start=2024-10-30&end=2026-10-31", "preset=custom&start=&end=2026-10-31",
    "preset=custom&start=2026-1-01&end=2026-10-31", "preset=week&employee=other",
  ])("rejects ambiguous, impossible, future or oversized dates %s", query => {
    expect(() => parse(query)).toThrow(RangeError);
  });
  it("accepts exactly 24 calendar months including leap-year bounds", () => {
    expect(parse("preset=custom&start=2024-10-31&end=2026-10-31").startDate).toBe("2024-10-31");
    const at = new Date("2028-02-29T04:00:00Z");
    expect(parse("preset=custom&start=2026-02-28&end=2028-02-29", at).startDate).toBe("2026-02-28");
    expect(() => parse("preset=custom&start=2026-02-27&end=2028-02-29", at)).toThrow();
  });
});
