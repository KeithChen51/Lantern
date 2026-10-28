import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBubble } from "./MessageBubble";
import { messageContext } from "./message-context";
import type { UIMessage } from "ai";

const context = { attachments: [{ id: "file", name: "客户记录.txt", size: 1234 }], documentContext: { resourceId: "doc", versionId: "v1", title: "服务规范", source: "中台" }, skillContext: { resourceId: "skill", versionId: "s1", title: "复盘方法", source: "中台" } };
const message: UIMessage = { id: "user", role: "user", parts: [{ type: "text", text: "请结合材料分析" }], metadata: { hermitContext: context } };
describe("sent user message materials", () => {
  it("shows each material after the user's text, with a reader link and separate removal control", () => {
    const html = renderToStaticMarkup(<MessageBubble message={message} activeContext={context} onOpenDocument={vi.fn()} onRemoveContext={vi.fn()} />);
    expect(html.indexOf("本条消息引用的材料")).toBeGreaterThan(html.indexOf("请结合材料分析"));
    expect(html).toContain("客户记录.txt"); expect(html).toContain("复盘方法");
    expect(html).toContain('aria-label="查看引用材料：服务规范"');
    expect(html).toContain('aria-label="移除后续引用 服务规范"');
    const removed = renderToStaticMarkup(<MessageBubble message={message} />);
    expect(removed).toContain("服务规范"); expect(removed).not.toContain("移除后续引用");
  });
  it("does not invent materials for legacy or malformed messages, or read assistant metadata as user materials", () => {
    expect(messageContext({ ...message, metadata: null })).toBeNull();
    expect(messageContext({ ...message, role: "assistant" })).toBeNull();
    const unsafe = messageContext({ ...message, metadata: { hermitContext: { attachments: [{ id: "x", name: {}, size: 1 }], documentContext: { resourceId: "x" } } } });
    expect(unsafe).toEqual({ attachments: [], documentContext: null, skillContext: null });
  });
});
