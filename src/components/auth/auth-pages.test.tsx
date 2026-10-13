import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "@/app/login/page";
import ConfirmLoginPage from "@/app/auth/confirm/page";
import DeviceApprovalPage from "@/app/auth/device/page";

const { config, pending, device, employee } = vi.hoisted(() => ({ config: vi.fn(), pending: vi.fn(), device: vi.fn(), employee: vi.fn() }));
vi.mock("@/modules/auth/access-config", () => ({ readAccessConfig: config }));
vi.mock("@/modules/auth/access", () => ({ getPendingLogin: pending, getDeviceRequest: device, requireEmployee: employee }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
beforeEach(() => { config.mockReset(); pending.mockReset(); device.mockReset(); employee.mockReset(); });
afterEach(() => vi.clearAllMocks());
describe("native employee entry and approval pages", () => {
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
