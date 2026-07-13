import { describe, expect, it } from "vitest";
import { formatFeedbackIssue, readFeedbackInput } from "./service";

describe("feedback service", () => {
  it("requires a category, title, and description", () => {
    expect(() => readFeedbackInput({ category: "suggestion", title: "标题" })).toThrow(
      expect.objectContaining({ code: "validation_error" }),
    );
  });

  it("formats a stable Issue title and Markdown body", () => {
    const input = readFeedbackInput({
      category: "bug",
      title: "消息提醒无法关闭",
      description: "点击关闭后提醒仍然存在。",
      sourcePath: "/mirror",
      contact: "lin.zixuan@byd.com",
    });

    const issue = formatFeedbackIssue(input, new Date("2026-07-13T10:00:00.000Z"));

    expect(issue.title).toBe("[意见反馈][问题反馈] 消息提醒无法关闭");
    expect(issue.body).toContain("## 反馈类型\n问题反馈");
    expect(issue.body).toContain("## 反馈内容\n点击关闭后提醒仍然存在。");
    expect(issue.body).toContain("## 当前页面 / 模块\n/mirror");
    expect(issue.body).toContain("## 提交人 / 联系方式\nlin.zixuan@byd.com");
    expect(issue.body).not.toContain("## 紧急程度");
    expect(issue.body).toContain("2026-07-13T10:00:00.000Z");
  });

  it("rejects an invalid optional contact email", () => {
    expect(() => readFeedbackInput({
      category: "suggestion",
      title: "增加筛选",
      description: "希望镜鉴页面可以按模块筛选。",
      contact: "not-an-email",
    })).toThrow(expect.objectContaining({ code: "validation_error" }));
  });

  it("uses safe defaults for optional feedback metadata", () => {
    const input = readFeedbackInput({
      category: "other",
      title: "其他反馈",
      description: "补充一些使用建议。",
    });

    const issue = formatFeedbackIssue(input, new Date("2026-07-13T10:00:00.000Z"));

    expect(issue.body).toContain("## 当前页面 / 模块\n未提供");
    expect(issue.body).toContain("## 提交人 / 联系方式\n未提供");
    expect(issue.body).not.toContain("## 紧急程度");
  });
});
