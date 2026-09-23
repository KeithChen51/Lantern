import { describe, expect, it } from "vitest";
import { articleOutline, plainMarkdown, resourceSourceLabel } from "./presentation";

describe("resource reading presentation", () => {
  it("keeps section anchors on original lines while excluding the title and fenced examples", () => {
    const source = "# 原文标题\n\n## **第一章**\n内容\n```md\n## 示例不是目录\n```\n### 后续章节";
    expect(articleOutline(source)).toEqual({ titleLine: 1, headings: [
      { line: 3, depth: 2, text: "第一章", id: "section-3" },
      { line: 8, depth: 3, text: "后续章节", id: "section-8" },
    ] });
  });
  it("leaves a document without a level-one title intact", () => {
    expect(articleOutline("开场\n## 正文")).toEqual({ titleLine: null, headings: [{ line: 2, depth: 2, text: "正文", id: "section-2" }] });
  });
  it("presents readable snippets and source labels without changing source metadata", () => {
    expect(plainMarkdown("## **客户等待**\n参考[服务指引](https://example.test) ![图片](photo.png)")).toBe("客户等待 参考服务指引");
    expect(resourceSourceLabel("docs/brand/白皮书.md")).toBe("精诚服务 · 品牌文档");
  });
});
