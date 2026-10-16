import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("retired feedback submission", () => {
  it("keeps the My destination readable without reopening the retired submission flow", () => {
    const page = readFileSync(join(process.cwd(), "src/app/feedback/page.tsx"), "utf8");
    const nav = readFileSync(join(process.cwd(), "src/components/layout/Navigation.tsx"), "utf8");
    expect(page).toContain("反馈提交暂未开放"); expect(page).toContain('href="/me"');
    expect(page).not.toContain("notFound()"); expect(page).not.toContain("FeedbackForm"); expect(nav).not.toContain("SidebarFeedbackLink");
  });
});
