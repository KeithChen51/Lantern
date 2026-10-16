import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MyPage from "./page";
import { classifyAccessPath, isPublicAuthPage } from "@/modules/auth/page-access";

const { employee, requestHeaders } = vi.hoisted(() => ({ employee: vi.fn(), requestHeaders: new Headers({ cookie: "fixture" }) }));
vi.mock("@/modules/auth/access", () => ({ requireEmployee: employee }));
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
    expect(html).toContain('href="/auth/tools"');
    expect(html).toContain('action="/api/auth/logout"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="csrfToken" value="csrf-fixture"');
    expect(html).not.toContain("never-render-");
  });

  it("does not render profile data without an employee principal", async () => {
    const denied = { status: 401 };
    employee.mockRejectedValue(denied);
    await expect(MyPage()).rejects.toBe(denied);
    expect(classifyAccessPath("/me")).toBe("page");
    expect(isPublicAuthPage("/me")).toBe(false);
  });
});
