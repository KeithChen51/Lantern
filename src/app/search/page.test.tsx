import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { visitor, search } = vi.hoisted(() => ({ visitor: vi.fn(), search: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/auth/access", () => ({ requireSiteVisitor: visitor }));
vi.mock("@/modules/knowledge-hub/runtime", () => ({ isKnowledgeHubEnabled: () => true, getSiteKnowledgeHub: () => ({ search }) }));
import SearchPage from "./page";

beforeEach(() => { visitor.mockReset(); search.mockReset(); search.mockResolvedValue({ total: 0, items: [] }); });
describe("search management entry", () => {
  it.each(["guest", "employee"])("hides backend maintenance from %s visitors", async kind => {
    visitor.mockResolvedValue({ kind, capabilities: ["content:read", "knowledge:read"] });
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "客户" }) }));
    expect(html).not.toContain("/admin/knowledge");
    expect(html).toContain("知识资源");
  });
  it("shows maintenance only when the server principal has knowledge:manage", async () => {
    visitor.mockResolvedValue({ capabilities: ["knowledge:manage"] });
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/admin/knowledge"');
  });
});
