import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatInput } from "./ChatInput";
import { AttachmentContext } from "./AttachmentContext";
import { ScenarioCards, HERMIT_SCENARIOS } from "./ScenarioCards";
import { RunFeedback } from "./RunFeedback";
import { ConversationHeader } from "./ConversationHeader";
import { ConversationSurface } from "./ConversationSurface";
import { HermitConversationView } from "./HermitConversationView";

describe("Hermit accessible composer components", () => {
  it("shares the conversation surface and identity header with saved read-only conversations", () => {
    const html = renderToStaticMarkup(<ConversationSurface readOnly label="历史问答">
      <ConversationHeader mode="read-only" title="对话回看" titleId="record-title" onClose={vi.fn()} />
    </ConversationSurface>);
    expect(html).toContain('data-read-only="true"');
    expect(html).toContain("data-lh-hermit-identity");
    expect(html).toContain('<h2 id="record-title"');
    expect(html).toContain("只读");
    expect(html).toContain('aria-label="关闭对话回看"');
    expect(html).not.toContain("新对话");
    expect(html).not.toContain("历史对话");
    expect(renderToStaticMarkup(<ConversationHeader title="当前会话" onNew={vi.fn()} onHistory={vi.fn()} />)).toContain("新对话");
  });
  it("owns the full conversation page in both live and read-only modes", () => {
    const messages = [{ id: "u", role: "user" as const, parts: [{ type: "text" as const, text: "保存的提问" }] }];
    const saved = renderToStaticMarkup(<HermitConversationView mode="read-only" fallbackTitle="对话回看" titleId="saved-title" onClose={vi.fn()} label="已保存的对话" messages={messages}
      beforeMessages={<details><summary>会话信息</summary>员工资料</details>}
      footer={<textarea aria-label="不应显示的输入" />} reader={<aside>不应显示的阅读器</aside>} />);
    expect(saved).toContain("data-lh-hermit-layout");
    expect(saved).toContain("data-lh-hermit-main");
    expect(saved).toContain("data-lh-chat-scroll-content");
    expect(saved).toContain("保存的提问");
    expect(saved).toContain("会话信息");
    expect(saved).toContain("回答供参考");
    expect(saved).not.toContain("不应显示");
    const live = renderToStaticMarkup(<HermitConversationView fallbackTitle="路引" label="当前对话" onNew={vi.fn()} onHistory={vi.fn()} messages={messages}
      footer={<textarea aria-label="继续提问" />} reader={<aside>已打开的文档</aside>} />);
    expect(live).toContain("data-lh-hermit-footer");
    expect(live).toContain("继续提问");
    expect(live).toContain("已打开的文档");
    expect(live).toContain('<h1 title="保存的提问">保存的提问</h1>');
    expect(saved).toContain('<h2 id="saved-title" title="保存的提问">保存的提问</h2>');
  });
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
