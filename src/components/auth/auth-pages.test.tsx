import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "@/app/login/page";
import ConfirmLoginPage from "@/app/auth/confirm/page";
import DeviceApprovalPage from "@/app/auth/device/page";

const { config, siteConfig, redirect, pending, device, employee } = vi.hoisted(() => ({ config: vi.fn(), siteConfig: vi.fn(), redirect: vi.fn(), pending: vi.fn(), device: vi.fn(), employee: vi.fn() }));
vi.mock("@/modules/auth/access-config", () => ({ readAccessConfig: config }));
vi.mock("@/modules/auth/site-access-config", () => ({ readSiteAccessConfig: siteConfig }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/modules/auth/access", () => ({ getPendingLogin: pending, getDeviceRequest: device, requireEmployee: employee }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
beforeEach(() => { config.mockReset(); siteConfig.mockReset().mockReturnValue({ mode: "iam" }); redirect.mockReset().mockImplementation(() => { throw new Error("NEXT_REDIRECT"); }); pending.mockReset(); device.mockReset(); employee.mockReset(); });
afterEach(() => vi.clearAllMocks());
describe("native employee entry and approval pages", () => {
  it("takes guests home without loading employee configuration or showing OA login", async () => {
    siteConfig.mockReturnValue({ mode: "guest" });
    await expect(LoginPage({ searchParams: Promise.resolve({ error: "unavailable" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(config).not.toHaveBeenCalled();
  });
  it("keeps the OA employee login entry in IAM mode", async () => {
    config.mockReturnValue({ mode: "iam" });
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("OA 登录");
    expect(html).toContain('action="/api/auth/start"');
    expect(html).toContain("欢迎来到灯塔");
    expect(html).toContain('src="/lighthouse-home-hero-bg-v2-realistic-shore.png"');
    expect(redirect).not.toHaveBeenCalled();
  });
  it.each([
    [{ mode: "portal", portalLoginMode: "card" }, { error: "unavailable" }, "前往统一门户", "统一登录服务暂不可用"],
    [{ mode: "portal", portalLoginMode: "callback" }, { error: "invalid" }, "前往统一登录", "登录未完成"],
    [{ mode: "iam" }, { loggedOut: "1" }, "OA 登录", "你已退出灯塔"],
  ])("preserves the entry action and recovery message for %j", async (settings, params, button, notice) => {
    config.mockReturnValue(settings);
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ ...params, returnTo: "https://outside.invalid" }) }));
    expect(html).toContain(button);
    expect(html).toContain(notice);
    expect(html).toContain('name="returnTo" value="/"');
    expect(html).toContain('method="post"');
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("data-lh-sidebar");
  });
  it("renders a native login POST and preserves a direct device link without business shell", async () => {
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ returnTo: "/auth/device?user_code=ABCD-EFGH" }) }));
    expect(html).toContain('action="/api/auth/start"'); expect(html).toContain('method="post"');
    expect(html).toContain('/auth/device?user_code=ABCD-EFGH'); expect(html).not.toContain("data-lh-sidebar"); expect(html).not.toContain("交车时间未定");
  });
  it("disables login and displays a safe configuration error", async () => {
    config.mockImplementation(() => { throw new Error("private secret"); });
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("尚未完成配置"); expect(html).toContain("disabled"); expect(html).not.toContain("private secret");
  });
  it("renders only the returned employee identity and a pending CSRF form", async () => {
    pending.mockResolvedValue({ account: "employee-fixture", displayName: "测试员工", csrfToken: "pending-csrf-fixture", token: "never-render-upstream-token" });
    const html = renderToStaticMarkup(await ConfirmLoginPage());
    expect(html).toContain("测试员工"); expect(html).toContain("employee-fixture"); expect(html).toContain('action="/api/auth/portal-login"'); expect(html).toContain('name="csrfToken"'); expect(html).not.toContain("never-render-upstream-token");
  });
  it("shows an expired pending confirmation state with a login path", async () => {
    pending.mockRejectedValue(new Error("expired"));
    const html = renderToStaticMarkup(await ConfirmLoginPage()); expect(html).toContain("已过期"); expect(html).toContain('href="/login"');
  });
  it("keeps the verified pending destination when choosing another account", async () => {
    pending.mockResolvedValue({ account: "employee", displayName: "测试员工", csrfToken: "nonce", returnTo: "/auth/device?user_code=ABCD-EFGH" });
    const html = renderToStaticMarkup(await ConfirmLoginPage());
    expect(html).toContain('href="/login?returnTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-EFGH"');
    pending.mockResolvedValue({ account: "employee", displayName: "测试员工", csrfToken: "nonce", returnTo: "//evil.invalid" });
    expect(renderToStaticMarkup(await ConfirmLoginPage())).toContain('href="/login"');
  });
  it("shows employee, client and knowledge-only scope with separate approve/refuse native controls", async () => {
    employee.mockResolvedValue({ displayName: "测试员工", account: "employee-fixture", csrfToken: "csrf-fixture" });
    device.mockResolvedValue({ userCode: "ABCD-EFGH", clientName: "测试工具", scope: "knowledge:read", expiresAt: 1800000000000, deviceCode: "never-render-device-token" });
    const html = renderToStaticMarkup(await DeviceApprovalPage({ searchParams: Promise.resolve({ user_code: "ABCD-EFGH" }) }));
    expect(html).toContain("测试工具"); expect(html).toContain("knowledge:read"); expect(html).toContain('value="true" name="approve"'); expect(html).toContain('value="false" name="approve"'); expect(html).not.toContain("never-render-device-token");
  });
  it("disables approval when the request is expired or unavailable", async () => {
    employee.mockResolvedValue({ displayName: "测试员工", account: "employee-fixture" }); device.mockRejectedValue({ status: 503 });
    const html = renderToStaticMarkup(await DeviceApprovalPage({ searchParams: Promise.resolve({ user_code: "ABCD-EFGH" }) }));
    expect(html).toContain("服务暂不可用"); expect(html).toContain("disabled"); expect(html).not.toContain('action="/api/auth/device/decision"');
  });
});
