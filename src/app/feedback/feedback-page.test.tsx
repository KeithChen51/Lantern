import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FeedbackPage from "./page";
import FeedbackDetailPage from "./[id]/page";

const { requirePage, renderBoard, renderDetail } = vi.hoisted(() => ({ requirePage: vi.fn(), renderBoard: vi.fn(), renderDetail: vi.fn() }));
vi.mock("@/modules/feedback/board-access", () => ({ requireFeedbackPage: requirePage }));
vi.mock("./FeedbackBoard", () => ({ FeedbackBoard: (props: unknown) => { renderBoard(props); return <div>employee-board</div>; } }));
vi.mock("./SuggestionDetailView", () => ({ SuggestionDetailView: (props: unknown) => { renderDetail(props); return <div>employee-detail</div>; } }));

const viewer = { userId: "employee-id", displayName: "员工甲", csrfToken: "private-csrf", canManage: false };
beforeEach(() => vi.clearAllMocks());

describe("employee suggestion board page guards", () => {
  it.each([401, 403, 503])("renders an employee-only notice without mounting either data client when access fails (%s)", async (status) => {
    requirePage.mockRejectedValue({ status });
    const board = renderToStaticMarkup(await FeedbackPage());
    const detail = renderToStaticMarkup(await FeedbackDetailPage({ params: Promise.resolve({ id: "sensitive-id" }) }));
    for (const html of [board, detail]) {
      expect(html).toContain("仅员工可查看与参与");
      expect(html).toContain('href="/me"');
      expect(html).not.toContain("private-csrf");
      expect(html).not.toContain("sensitive-id");
    }
    expect(renderBoard).not.toHaveBeenCalled();
    expect(renderDetail).not.toHaveBeenCalled();
  });

  it("passes only the verified employee viewer to the board", async () => {
    requirePage.mockResolvedValue(viewer);
    const html = renderToStaticMarkup(await FeedbackPage());
    expect(html).toContain("employee-board");
    expect(renderBoard).toHaveBeenCalledWith({ viewer });
    expect(html).not.toContain("private-csrf");
  });

  it("resolves the detail route only after verifying the employee", async () => {
    requirePage.mockResolvedValue({ ...viewer, canManage: true });
    const html = renderToStaticMarkup(await FeedbackDetailPage({ params: Promise.resolve({ id: "suggestion-42" }) }));
    expect(html).toContain("employee-detail");
    expect(renderDetail).toHaveBeenCalledWith({ id: "suggestion-42", viewer: { ...viewer, canManage: true } });
  });
});
