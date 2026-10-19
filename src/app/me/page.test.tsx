import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MyPage from "./page";
import { classifyAccessPath, isPublicAuthPage } from "@/modules/auth/page-access";

const { employee, requestHeaders } = vi.hoisted(() => ({ employee: vi.fn(), requestHeaders: new Headers({ cookie: "fixture" }) }));
vi.mock("@/modules/auth/access", () => ({ requireSiteVisitor: employee }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

beforeEach(() => { employee.mockReset(); });

describe("my employee page", () => {
  it("renders verified employee identity and the existing CSRF logout form", async () => {
    employee.mockResolvedValue({ displayName: "测试员工", account: "000123", csrfToken: "csrf-fixture", grantId: "never-render-grant", credentialId: "never-render-session" });
    const html = renderToStaticMarkup(await MyPage());

    expect(employee).toHaveBeenCalledWith(requestHeaders);
    expect(html).toContain("测试员工");
    expect(html).toContain("000123");
    expect(html).toContain("已登录");
    expect(html).toContain("暂未提供");
    expect(html).toContain("测试员工的头像");
    expect(html).toContain('href="/updates"');
    expect(html).toContain("版本消息");
    expect(html).toContain('href="/feedback"');
    expect(html).toContain("建议反馈");
    expect(html).toContain('href="/auth/tools"');
    expect(html).toContain('action="/api/auth/logout"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="csrfToken" value="csrf-fixture"');
    expect(html).not.toContain("never-render-");
  });

  it("renders available employee avatar and organization", async () => {
    employee.mockResolvedValue({ displayName: "测试员工", account: "000123", csrfToken: "csrf-fixture", avatarUrl: "https://images.example.invalid/employee.png", organization: "服务中心 / 售后服务部" });
    const html = renderToStaticMarkup(await MyPage());
    expect(html).toContain('src="https://images.example.invalid/employee.png"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain("服务中心 / 售后服务部");
    expect(html).not.toContain("暂未提供");
  });

  it("shows guest mode without employee identity or privileged account actions", async () => {
    employee.mockResolvedValue({ kind: "guest", userId: "opaque-guest-id", displayName: "must-not-render-name", account: "must-not-render-account", organization: "must-not-render-organization", csrfToken: "must-not-render-csrf" });
    const html = renderToStaticMarkup(await MyPage());
    expect(html).toContain("访客模式");
    expect(html).toContain("路引 AI 问答");
    expect(html).toContain('href="/updates"');
    expect(html).toContain('href="/feedback"');
    expect(html).not.toContain("must-not-render-");
    expect(html).not.toContain("opaque-guest-id");
    for (const text of ["姓名", "工号", "组织架构", "已登录", "退出登录", "工具授权", "/admin", "/api/auth/logout"]) expect(html).not.toContain(text);
  });

  it("does not render profile data without an employee principal", async () => {
    const denied = { status: 401 };
    employee.mockRejectedValue(denied);
    await expect(MyPage()).rejects.toBe(denied);
    expect(classifyAccessPath("/me")).toBe("page");
    expect(isPublicAuthPage("/me")).toBe(false);
  });
});
