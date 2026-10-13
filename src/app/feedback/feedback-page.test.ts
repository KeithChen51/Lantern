import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("retired feedback submission", () => {
  it("does not render a submission form or expose navigation", () => {
    const page = readFileSync(join(process.cwd(), "src/app/feedback/page.tsx"), "utf8");
    const nav = readFileSync(join(process.cwd(), "src/components/layout/Navigation.tsx"), "utf8");
    expect(page).toContain("notFound()"); expect(page).not.toContain("FeedbackForm"); expect(nav).not.toContain("SidebarFeedbackLink");
  });
});
