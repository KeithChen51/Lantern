import { describe, expect, it } from "vitest";
import { feedbackListHref, feedbackReturnHref, readFeedbackBrowse } from "./feedback-navigation";
import { resourceReadingHref } from "@/components/knowledge/reading-return";

describe("feedback browse return", () => {
  it("preserves every filter and page in both the card and return link", () => {
    const path = "/feedback?view=popular&category=culture&status=accepted&mine=true&page=3";
    const browse = readFeedbackBrowse(new URL(path, "https://lighthouse.invalid").searchParams);
    expect(feedbackListHref(browse)).toBe(path);
    const href = resourceReadingHref("/feedback/idea#discussion", path, "resource-idea-discussion");
    const url = new URL(href, "https://lighthouse.invalid");
    expect(url.hash).toBe("#discussion");
    expect(feedbackReturnHref(url.searchParams)).toBe(`${path}#resource-idea-discussion`);
  });

  it("normalizes unsupported or malformed query values", () => {
    expect(readFeedbackBrowse(new URLSearchParams("view=unknown&category=x&status=x&mine=1&page=-8")))
      .toEqual({ view: "latest", category: "", status: "", mine: false, page: 1 });
    expect(readFeedbackBrowse(new URLSearchParams("page=1.5")).page).toBe(1);
    expect(readFeedbackBrowse(new URLSearchParams("page=1001")).page).toBe(1);
    expect(readFeedbackBrowse(new URLSearchParams("page=1000")).page).toBe(1000);
  });

  it("rejects external destinations and other internal pages", () => {
    for (const returnTo of ["https://evil.invalid", "//evil.invalid", "/admin", "/feedback/idea", "/feedback\\evil"]) {
      expect(feedbackReturnHref(new URLSearchParams({ returnTo }))).toBe("/feedback");
    }
    expect(feedbackReturnHref(new URLSearchParams({ returnTo: "/feedback?view=participated", returnAnchor: "unsafe#anchor" })))
      .toBe("/feedback?view=participated");
  });
});
