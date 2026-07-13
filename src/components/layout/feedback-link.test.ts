import { describe, expect, it } from "vitest";
import { getFeedbackHref } from "./feedback-link";

describe("feedback link", () => {
  it("preserves the originating pathname in the feedback URL", () => {
    expect(getFeedbackHref("/mirror")).toBe("/feedback?from=%2Fmirror");
  });

  it("falls back to the home path when no pathname is available", () => {
    expect(getFeedbackHref("   ")).toBe("/feedback?from=%2F");
  });
});
