import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MyPage from "./page";
import { classifyAccessPath, isPublicAuthPage } from "@/modules/auth/page-access";
import { useReleaseUnread } from "@/components/layout/release-read-state";

const { employee, dealerOrganization, accessConfig, requestHeaders } = vi.hoisted(() => ({
  employee: vi.fn(), dealerOrganization: vi.fn(), accessConfig: vi.fn(), requestHeaders: new Headers({ cookie: "fixture" }),
}));
vi.mock("@/modules/auth/access", () => ({ requireSiteVisitor: employee }));
vi.mock("@/modules/auth/access-config", () => ({ readAccessConfig: accessConfig }));
vi.mock("@/modules/auth/wecom-auto-runtime", () => ({ readWecomAutoOrganization: dealerOrganization }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/components/layout/release-read-state", () => ({ useReleaseUnread: vi.fn(() => false) }));

beforeEach(() => {
  employee.mockReset();
  dealerOrganization.mockReset();
  accessConfig.mockReset().mockReturnValue({ origin: "https://lighthouse.example" });
  vi.mocked(useReleaseUnread).mockReturnValue(false);
});

describe("my employee page", () => {
  it("renders verified employee identity and the existing CSRF logout form", async () => {
    employee.mockResolvedValue({ displayName: "测试员工", account: "000123", csrfToken: "csrf-fixture", grantId: "never-render-grant", credentialId: "never-render-session" });
    const html = renderToStaticMarkup(await MyPage());

    expect(employee).toHaveBeenCalledWith(requestHeaders);
    expect(html).toMatch(/<h1[^>]*>测试员工<\/h1>/);
    expect(html).toContain("000123");
    expect(html).toContain("已登录");
    expect(html).toContain("暂未提供");
    expect(html).toContain("测试员工的头像");
    expect(html).toContain('href="/updates"');
    expect(html).toContain("版本消息");
    expect(html).toContain('href="/feedback"');
    expect(html).toContain("建议广场");
    expect(html).toContain('href="/auth/tools"');
    expect(html).toContain('action="/api/auth/logout"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="csrfToken" value="csrf-fixture"');
    expect(html).not.toContain("never-render-");
  });

  it("offers employees an installation prompt for the configured deployment origin", async () => {
    employee.mockResolvedValue({ displayName: "测试员工", account: "hidden-account-in-prompt", csrfToken: "hidden-csrf-in-prompt" });
    const html = renderToStaticMarkup(await MyPage());
    const prompt = html.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/)?.[1];

    expect(html).toContain("复制安装提示词");
    expect(prompt).toContain("https://lighthouse.example/install/lighthouse-ai.zip");
    expect(prompt).toContain("knowledge_search");
    expect(prompt).toContain("比亚迪集团员工");
    expect(prompt).not.toContain("hidden-account-in-prompt");
    expect(prompt).not.toContain("hidden-csrf-in-prompt");
  });

  it("does not offer employee tools that require HTTPS on an HTTP test deployment", async () => {
    employee.mockResolvedValue({ displayName: "测试员工", account: "000123" });
    accessConfig.mockReturnValue({ origin: "http://192.168.0.10" });
    const html = renderToStaticMarkup(await MyPage());

    expect(html).toContain("使用其他 AI 接入灯塔");
    expect(html).not.toContain("复制安装提示词");
    expect(html).not.toContain("/install/lighthouse-ai.zip");
  });

  it("renders available employee avatar and organization", async () => {
    employee.mockResolvedValue({ displayName: "测试员工", account: "000123", csrfToken: "csrf-fixture", avatarUrl: "https://images.example.invalid/employee.png", organization: "服务中心 / 售后服务部" });
    const html = renderToStaticMarkup(await MyPage());
    expect(html).toContain('src="https://images.example.invalid/employee.png"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain("服务中心 / 售后服务部");
    expect(html).not.toContain("暂未提供");
    expect(dealerOrganization).not.toHaveBeenCalled();
  });

  it.each(["售后服务 / 区域服务部 / 试点门店", undefined])("renders the dealer's department or a fallback", async organization => {
    const dealer = { kind: "dealer", channel: "web", displayName: "测试经销商", account: "dealer-fixture", csrfToken: "dealer-csrf" };
    employee.mockResolvedValue(dealer);
    dealerOrganization.mockResolvedValue(organization);
    const html = renderToStaticMarkup(await MyPage());
    expect(dealerOrganization).toHaveBeenCalledWith(dealer);
    expect(html).toContain("所属部门");
    expect(html).toContain(organization ?? "暂未提供");
    expect(html).toContain("企微账号");
    expect(html).toContain('href="/auth/tools"');
    expect(html).toContain("复制安装提示词");
    expect(html).not.toContain('href="/feedback"');
    const prompt = html.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
    expect(prompt).toContain("比亚迪汽车经销商");
    expect(prompt).toContain("https://lighthouse.example/install/lighthouse-ai.zip");
    expect(prompt).not.toContain(dealer.account);
    expect(prompt).not.toContain(dealer.csrfToken);
  });

  it("keeps an account-only legacy profile out of the name field and heading", async () => {
    employee.mockResolvedValue({ displayName: "000123", account: "000123", csrfToken: "csrf-fixture" });
    const html = renderToStaticMarkup(await MyPage());
    expect(html).toContain("姓名暂未获取");
    expect(html.match(/000123/g)).toHaveLength(1);
    expect(html).toMatch(/工号<\/dt><dd[^>]*>000123<\/dd>/);
  });

  it("shows guest mode without employee identity or privileged account actions", async () => {
    employee.mockResolvedValue({ kind: "guest", userId: "opaque-guest-id", displayName: "must-not-render-name", account: "must-not-render-account", organization: "must-not-render-organization", csrfToken: "must-not-render-csrf" });
    const html = renderToStaticMarkup(await MyPage());
    expect(html).toMatch(/<h1[^>]*>访客<\/h1>/);
    expect(html).toContain("访客模式");
    expect(html).not.toContain("建议广场");
    expect(html).not.toContain("复制安装提示词");
    expect(html).toContain("路引 AI 问答");
    expect(html).toContain('href="/updates"');
    expect(html).not.toContain('href="/feedback"');
    expect(html).not.toContain("must-not-render-");
    expect(html).not.toContain("opaque-guest-id");
    expect(dealerOrganization).not.toHaveBeenCalled();
    for (const text of ["姓名", "工号", "组织架构", "已登录", "退出登录", "工具授权", "/admin", "/api/auth/logout"]) expect(html).not.toContain(text);
  });

  it.each([true, false])("reflects the shared unread state (%s) on the release link", async (unread) => {
    employee.mockResolvedValue({ kind: "guest" });
    vi.mocked(useReleaseUnread).mockReturnValue(unread);
    const html = renderToStaticMarkup(await MyPage());
    const releaseLink = html.match(/<a\b[^>]*href="\/updates"[^>]*>[\s\S]*?<\/a>/)?.[0];
    expect(releaseLink?.includes(">NEW<")).toBe(unread);
    expect(releaseLink?.includes("有未读版本消息")).toBe(unread);
  });

  it("does not render profile data without an employee principal", async () => {
    const denied = { status: 401 };
    employee.mockRejectedValue(denied);
    await expect(MyPage()).rejects.toBe(denied);
    expect(classifyAccessPath("/me")).toBe("page");
    expect(isPublicAuthPage("/me")).toBe(false);
  });
});
