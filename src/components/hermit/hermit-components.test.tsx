import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatInput } from "./ChatInput";
import { AttachmentContext } from "./AttachmentContext";
import { ScenarioCards, HERMIT_SCENARIOS } from "./ScenarioCards";
import { RunFeedback } from "./RunFeedback";

describe("Hermit accessible composer components", () => {
  it("keeps the next draft editable while generation exposes only stop", () => {
    const html = renderToStaticMarkup(<ChatInput value="下一句草稿" onChange={vi.fn()} onSubmit={vi.fn()} onStop={vi.fn()} isLoading isUploading={false} attachments={[]} onFilesSelected={vi.fn()} onRemoveAttachment={vi.fn()} onRetryAttachment={vi.fn()} onClearDocumentContext={vi.fn()} />);
    expect(html).toContain("下一句草稿");
    expect(html.match(/<textarea[^>]*>/)?.[0]).not.toContain("disabled");
    expect(html).toContain('aria-label="停止生成"');
    expect(html).toContain('aria-label="添加文件和更多内容"');
    expect(html).toContain('popover="auto"');
    expect(html).toContain("本地文件每个最多 10 MB");
  });
  it("scenario selection only provides an editable draft to its caller", () => {
    const onSelect = vi.fn();
    const view = ScenarioCards({ onSelect });
    const cards = view.props.children;
    cards[0].props.onClick();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(HERMIT_SCENARIOS[0].draft);
    expect(renderToStaticMarkup(view)).toContain("对照相似案例");
  });
  it("only shows pending attachment tiles in the composer and keeps cancel/retry/remove accessible", () => {
    const props = { attachments: [{ localId: "pending", name: "待发送.txt", size: 10, status: "uploading" as const }, { localId: "sent", id: "sent", name: "已发送.txt", size: 10, status: "ready" as const, sent: true }, { localId: "failed", name: "失败.txt", size: 10, status: "error" as const, file: new File(["x"], "失败.txt") }], isUploading: false, onRemove: vi.fn(), onRetry: vi.fn(), onClearDocument: vi.fn() };
    const tiles = renderToStaticMarkup(<AttachmentContext {...props} variant="pending" />);
    expect(tiles).toContain('aria-label="待发送附件"');
    expect(tiles).toContain('aria-label="取消上传 待发送.txt"');
    expect(tiles).toContain('aria-label="重试上传 失败.txt"');
    expect(tiles).not.toContain("已发送.txt");
    const context = renderToStaticMarkup(<AttachmentContext {...props} />);
    expect(context).not.toContain("已发送.txt");
    expect(context).not.toContain("待发送.txt");
  });
  it("shows real progress labels and explicit terminal states without answer action toolbars", () => {
    expect(renderToStaticMarkup(<RunFeedback loading progress="正在查找灯塔知识" />)).toContain("正在查找灯塔知识");
    expect(renderToStaticMarkup(<RunFeedback cancelled />)).toContain("已停止生成");
    expect(renderToStaticMarkup(<RunFeedback error="网络故障" onRetry={vi.fn()} />)).toContain('role="alert"');
  });
});
