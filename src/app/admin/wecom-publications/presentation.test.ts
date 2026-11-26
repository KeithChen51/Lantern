import { describe, expect, it } from "vitest";
import { audienceLabel, beijingSchedule, beijingTime, parseAudienceIds, previewDocument } from "./presentation";

describe("publication presentation boundaries", () => {
  it("interprets the chosen wall time as Beijing time regardless of host timezone", () => {
    expect(new Date(beijingSchedule("2026-12-01T09:30")).toISOString()).toBe("2026-12-01T01:30:00.000Z");
    expect(beijingTime("2026-11-30T16:00:00Z")).toContain("2026/12/01 00:00:00");
  });

  it.each(["2026-02-30T09:30", "2026-13-01T09:30", "2026-12-01T24:00", "2026-12-01", "2026-12-01T09:30Z"])("rejects an invalid or ambiguous wall time %s", value => {
    expect(() => beijingSchedule(value)).toThrow();
  });

  it("keeps unique IDs in their original corporate namespace", () => {
    expect(parseAudienceIds("user.one，user.two\nuser.one|caseSensitive;2；3")).toEqual(["user.one", "user.two", "caseSensitive", "2", "3"]);
    expect(audienceLabel({ kind: "all" })).toContain("发送时应用可见范围");
  });

  it("isolates preview requests and allows only embedded images and fonts", () => {
    const html = previewDocument("<p>已保存的正文</p>", true);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("font-src data:");
    expect(html).toContain("img-src data:");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("color-scheme:dark");
    expect(html).toContain("<p>已保存的正文</p>");
  });
});
