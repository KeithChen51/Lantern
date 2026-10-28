import { describe, expect, it } from "vitest";
import { parseReadingPosition, readingEntryId, readingListPath, resourceReadingHref, safeReadingAnchor, safeReadingReturn } from "./reading-return";

describe("reading list continuity", () => {
  it("keeps a search query, ordering, type and page in the article return link", () => {
    const list = readingListPath("/search", { q: "客户等待", type: "case", sort: "published", offset: "20" });
    const article = new URL(resourceReadingHref("/resources/case-a?version=v2", list, readingEntryId("case-a")), "https://lighthouse.invalid");
    expect(article.searchParams.get("version")).toBe("v2");
    expect(article.searchParams.get("returnTo")).toBe("/search?q=%E5%AE%A2%E6%88%B7%E7%AD%89%E5%BE%85&type=case&sort=published&offset=20");
    expect(article.searchParams.get("returnAnchor")).toBe("resource-case-a");
  });
  it.each(["https://evil.test/action", "//evil.test/action", "/\\evil.test/action", "/admin", "/api/auth/login?returnTo=https://evil.test", "/search\n?x=1", ["/search"]])("rejects an unsafe or unrelated return target %s", target => {
    expect(safeReadingReturn(target)).toBeNull();
  });
  it("keeps return targets on allowed list routes and constrains fallback anchors", () => {
    expect(safeReadingReturn("/action?q=空间&tag=服务#ignore")).toBe("/action?q=%E7%A9%BA%E9%97%B4&tag=%E6%9C%8D%E5%8A%A1");
    expect(safeReadingAnchor('resource-a" onclick="alert(1)')).toBeNull();
    expect(safeReadingAnchor(readingEntryId("中文案例"))).toBeTruthy();
  });
  it("uses only recent well-formed scroll snapshots", () => {
    const snapshot = { y: 2101, anchor: "resource-case-a", savedAt: 1000 };
    expect(parseReadingPosition(JSON.stringify(snapshot), 2000)).toEqual(snapshot);
    expect(parseReadingPosition(JSON.stringify(snapshot), 31 * 60_000)).toBeNull();
    expect(parseReadingPosition(JSON.stringify({ ...snapshot, y: -1 }), 2000)).toBeNull();
    expect(parseReadingPosition(JSON.stringify({ ...snapshot, anchor: "other" }), 2000)).toBeNull();
    expect(parseReadingPosition("broken", 2000)).toBeNull();
  });
});
