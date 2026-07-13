import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("feedback page", () => {
  it("uses shared form primitives with segmented categories and read-only page context", () => {
    const form = readProjectFile("src/app/feedback/FeedbackForm.tsx");

    expect(form).toContain("<fieldset");
    expect(form).toContain('type="radio"');
    expect(form).toContain('type="email"');
    expect(form).toContain("LhTextField");
    expect(form).toContain("LhTextArea");
    expect(form).toContain("LhCallout");
    expect(form).toContain("LhStateNotice");
    expect(form).toContain("data-lh-feedback-context");
    expect(form).toContain("请勿填写客户个人信息、账号、密钥等敏感信息");
    expect(form).toContain("peer-focus-visible:outline-offset-[var(--lh-focus-offset)]");
    expect(form).toContain("peer-focus-visible:shadow-[var(--shadow-focus)]");
    expect(form).toContain('className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"');
    expect(form).toContain("data-lh-feedback-body");
    expect(form).toContain('className="mt-6 flex justify-end"');
    expect(form).not.toContain("CONTROL_CLASS");
    expect(form).not.toContain("FEEDBACK_URGENCY_OPTIONS");
    expect(form).not.toContain("feedback-source-path");
  });

  it("uses an operational h1 page header and returns the created Issue reference", () => {
    const page = readProjectFile("src/app/feedback/page.tsx");
    const route = readProjectFile("src/app/api/feedback/route.ts");

    expect(page).toContain("max-w-[760px]");
    expect(page).toContain("LhOperationalPageHeader");
    expect(page).not.toContain("LhSectionHeader");
    expect(page).not.toContain('eyebrow="站内反馈"');
    expect(route).toContain("const issue = await createDevOpsIssue");
    expect(route).toContain("submitted: true, issue");
  });
});
