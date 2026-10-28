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
});
