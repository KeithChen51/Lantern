import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackBoard, PublishSuggestion } from "./FeedbackBoard";
import { SuggestionDetailView } from "./SuggestionDetailView";
import { useBoardResource } from "./board-client";
import type { SuggestionDetail } from "@/modules/feedback/board-types";

vi.mock("./board-client", () => ({ useBoardResource: vi.fn(), boardRequest: vi.fn() }));
const viewer = { userId: "employee-1", displayName: "员工甲", csrfToken: "private-token", canManage: false };
const detail: SuggestionDetail = {
  id: "idea-1", title: "改进检索 <img src=x>", content: "第一行\n<script>alert(1)</script>", category: "knowledge", status: "reviewing",
  author: { id: "employee-1", name: "员工甲" }, createdAt: "2026-11-04T01:00:00Z", updatedAt: "2026-11-04T02:00:00Z",
  excerpt: "建议摘要 <script>纯文本</script>", latestResponse: { note: "最新处理摘要", actor: { id: "admin", name: "管理员" }, createdAt: "2026-11-04T02:00:00Z" },
  likeCount: 3, commentCount: 2, likedByMe: true, nextCommentCursor: "next-comments",
  comments: [
    { id: "comment-1", author: { id: "employee-2", name: "员工乙" }, content: "已隐藏的敏感内容", createdAt: "2026-11-04T01:10:00Z", replyToId: null, replyToAuthorName: null, hidden: true },
    { id: "comment-2", author: { id: "employee-3", name: "员工丙" }, content: "建议 <iframe>\n补充", createdAt: "2026-11-04T01:20:00Z", replyToId: "comment-1", replyToAuthorName: "员工乙", hidden: false },
  ],
  events: [
    { id: "event-1", actor: { id: "admin", name: "管理员" }, note: "早期回应", createdAt: "2026-11-04T01:15:00Z", fromStatus: "pending", toStatus: "pending" },
    { id: "event-2", actor: { id: "admin", name: "管理员" }, note: "正在评估 <b>方案</b>", createdAt: "2026-11-04T02:00:00Z", fromStatus: "pending", toStatus: "reviewing" },
  ], relatedSuggestion: { id: "idea-2", title: "另一条相关建议" },
};
const resource = (data?: unknown, error?: string, loading = false) => ({ data, error, loading, reload: vi.fn(), update: vi.fn() });
beforeEach(() => { vi.mocked(useBoardResource).mockReset(); });

describe("suggestion board rendered states", () => {
  it("shows the feed first with author, category, status, counts and pagination", () => {
    vi.mocked(useBoardResource).mockImplementation((url) => url.includes("notifications") ? resource({ items: [], unreadCount: 4, nextCursor: null }) : resource({ items: [detail], total: 26, page: 1, pageSize: 20 }));
    const html = renderToStaticMarkup(<FeedbackBoard viewer={viewer} />);
    for (const text of ["员工甲", "内容与知识", "评估中", "已赞同", "评论", "只看我发起的", "最新", "热门", "我参与的", "建议摘要 &lt;script&gt;纯文本&lt;/script&gt;", "最新处理摘要", "下一页", "4 条未读"]) expect(html).toContain(text);
    expect(html).toContain('href="/feedback/idea-1"');
    expect(html).not.toContain("private-token");
    expect(html).not.toContain("确认发布");
  });

  it.each(["loading", "error", "empty"])("offers a useful %s feed state", (state) => {
    vi.mocked(useBoardResource).mockImplementation((url) => url.includes("notifications") ? resource({ items: [], unreadCount: 0 }) : state === "loading" ? resource(undefined, undefined, true) : state === "error" ? resource(undefined, "网络断开，请重试") : resource({ items: [], total: 0, page: 1, pageSize: 20 }));
    const html = renderToStaticMarkup(<FeedbackBoard viewer={viewer} />);
    expect(html).toContain(state === "loading" ? "正在加载" : state === "error" ? "网络断开，请重试" : "暂无建议");
    if (state === "error") expect(html).toContain(">重试</button>");
  });

  it("publishes only category, title and plain text content", () => {
    const html = renderToStaticMarkup(<PublishSuggestion viewer={viewer} onPublished={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain("建议分类");
    expect(html).toContain('maxLength="100"');
    expect(html).toContain('maxLength="4000"');
    expect(html).toContain("仅支持文字");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("邮箱");
  });

  it("escapes employee text and renders comment tombstones, replies and ordered responses", () => {
    vi.mocked(useBoardResource).mockReturnValue(resource(detail));
    const html = renderToStaticMarkup(<SuggestionDetailView id="idea-1" viewer={viewer} />);
    expect(html).toContain("第一行\n&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("此评论已被管理员隐藏");
    expect(html).not.toContain("已隐藏的敏感内容");
    expect(html).toContain("回复 员工乙");
    expect(html).toContain("建议 &lt;iframe&gt;\n补充");
    expect(html.indexOf("正在评估 &lt;b&gt;方案&lt;/b&gt;")).toBeLessThan(html.indexOf("早期回应"));
    expect(html).toContain("查看 1 条历史回应");
    expect(html).toContain('href="/feedback/idea-2"');
    expect(html).toContain("加载更多评论");
    expect(html).toContain('id="discussion"');
    expect(html).not.toContain("处理建议");
    expect(html).not.toContain("隐藏评论</button>");
  });

  it("exposes management only for the dedicated capability, including every target state and a required explanation", () => {
    vi.mocked(useBoardResource).mockImplementation((url) => url.includes("?sort=") ? resource({ items: [detail], total: 1, page: 1, pageSize: 20 }) : resource(detail));
    const html = renderToStaticMarkup(<SuggestionDetailView id="idea-1" viewer={{ ...viewer, canManage: true }} />);
    for (const text of ["处理建议", "待回应", "评估中", "已采纳", "推进中", "已落实", "不采纳", "搜索关联建议", "回应说明", "保存回应", "隐藏评论"]) expect(html).toContain(text);
    expect(html).toMatch(/<textarea[^>]*id="manager-note"[^>]*required/);
    expect(html.indexOf('id="discussion"')).toBeLessThan(html.indexOf("管理员处理 ·"));
    expect(html).toMatch(/<details[^>]*><summary>管理员处理/);
    expect(html).not.toContain("private-token");
  });
});
