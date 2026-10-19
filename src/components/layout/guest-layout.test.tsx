import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RootLayout from "@/app/layout";

const { visitor, requestHeaders, redirect, shell } = vi.hoisted(() => ({ visitor: vi.fn(), requestHeaders: vi.fn(), redirect: vi.fn(), shell: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireSiteVisitor: visitor }));
vi.mock("next/headers", () => ({ headers: requestHeaders }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/layout/AppShell", () => ({ AppShell: shell }));

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders.mockResolvedValue(new Headers({ "x-lighthouse-request-path": "/me" }));
  shell.mockImplementation(({ children }) => <div data-test-shell>{children}</div>);
  redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});

describe("site visitor root layout", () => {
  it.each(["guest", "employee"])("passes the %s identity and credentials to the shell", async kind => {
    visitor.mockResolvedValue({ kind, userId: `${kind}-fixture`, account: kind === "guest" ? "" : "000123", displayName: kind === "guest" ? "访客" : "测试员工", capabilities: ["hermit:chat"], csrfToken: "csrf-fixture", expiresAt: 1900000000000 });
    const html = renderToStaticMarkup(await RootLayout({ children: <p>内容</p> }));
    expect(html).toContain("内容");
    expect(shell.mock.calls[0][0].session).toMatchObject({ kind, user: { id: `${kind}-fixture` }, csrfToken: "csrf-fixture", capabilities: ["hermit:chat"], expiresAt: 1900000000000 });
  });

  it("keeps public login outside the business shell", async () => {
    requestHeaders.mockResolvedValue(new Headers({ "x-lighthouse-request-path": "/login" }));
    renderToStaticMarkup(await RootLayout({ children: <p>入口</p> }));
    expect(visitor).not.toHaveBeenCalled();
    expect(shell).not.toHaveBeenCalled();
  });

  it("retains strict unauthorized redirect and safe service failure", async () => {
    visitor.mockRejectedValueOnce({ status: 401 });
    await expect(RootLayout({ children: <p>protected</p> })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
    visitor.mockRejectedValueOnce(new Error("private secret"));
    const html = renderToStaticMarkup(await RootLayout({ children: <p>protected</p> }));
    expect(html).toContain("服务暂不可用");
    expect(html).not.toContain("private secret");
    expect(html).not.toContain("protected");
  });
});
