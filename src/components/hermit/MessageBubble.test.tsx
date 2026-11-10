import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";

describe("completed answer reading entry points", () => {
  it("renders citation and recommendation buttons when a verified legacy source label is empty", () => {
    const resource = { resourceId: "legacy-case", versionId: "v1", title: "参悟案例", source: "" };
    const message = { id: "answer", role: "assistant", parts: [{ type: "data-answer-sources", data: {
      status: "complete", text: "可以参考这个案例 [1](#hermit-citation-1)。",
      citations: [{ ...resource, number: 1 }], recommendations: [{ ...resource, reason: "查看实际处理过程。" }],
    } }] } as unknown as UIMessage;
    const html = renderToStaticMarkup(<MessageBubble message={message} onOpenDocument={() => {}} />);
    expect(html).toContain('aria-label="打开引用 1：参悟案例"');
    expect(html).toContain('aria-label="打开文档：参悟案例"');
    expect(html).toContain('data-lh-hermit-recommendation="legacy-case:v1"');
  });

  it("uses the same message markup for plain saved and live questions and answers", () => {
    for (const role of ["user", "assistant"] as const) {
      const message: UIMessage = { id: role, role, parts: [{ type: "text", text: "共同的段落。\n\n**重点**" }] };
      expect(renderToStaticMarkup(<MessageBubble readOnly message={message} />))
        .toBe(renderToStaticMarkup(<MessageBubble message={message} />));
    }
  });

  it("keeps saved citations and GFM formatting while disabling external content and document actions", () => {
    const resource = { resourceId: "resource", versionId: "v1", title: "资料", source: "灯塔" };
    const message = { id: "saved", role: "assistant", parts: [{ type: "data-answer-sources", data: {
      status: "complete", text: "| 项目 | 数值 |\n| — | — |\n| 甲 | 1 |\n\n[引用](#hermit-citation-1) [外链](https://private.invalid) ![图片](https://tracker.invalid/pixel)\n\n<script>privateScript()</script>",
      citations: [{ ...resource, number: 1 }], recommendations: [{ ...resource, reason: "参照。" }],
    } }] } as unknown as UIMessage;
    const html = renderToStaticMarkup(<MessageBubble readOnly message={message} onOpenDocument={() => {}} />);
    expect(html).toContain("data-lh-message-table");
    expect(html).toContain("data-lh-hermit-identity");
    expect(html).toContain("[1]");
    expect(html).toContain("外链");
    expect(html).not.toMatch(/<a |<img|<script|privateScript|private\.invalid|tracker\.invalid|<button/);
    expect(html).not.toContain("推荐阅读");
  });
});
