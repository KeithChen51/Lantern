import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./AppShell";

const location = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));
vi.mock("./Header", () => ({ Header: () => null }));
vi.mock("./Navigation", () => ({ Navigation: () => null }));
vi.mock("@/components/watermark/EmployeeWatermark", () => ({ EmployeeWatermark: () => null }));
vi.mock("@/components/analytics/VisitTracker", () => ({ VisitTracker: () => null }));

const session = {
  kind: "employee" as const,
  user: { id: "arrival-fixture", account: "TEST_001", displayName: "测试员工" },
  capabilities: ["hermit:chat"],
  csrfToken: "fixture",
  expiresAt: 1900000000000,
};

afterEach(() => { location.pathname = "/"; });

describe("successful login arrival", () => {
  it.each(["/", "/heart"])("renders the home arrival in the first server frame at %s", pathname => {
    location.pathname = pathname;
    const html = renderToStaticMarkup(<AppShell session={session} loginArrivalPath={pathname}><h1>本心</h1></AppShell>);
    expect(html).toContain('data-lh-login-arrival="home"');
    expect(html).toContain("data-lh-login-curtain");
    expect(html).toContain("<h1>本心</h1>");
  });

  it("uses the short curtain for a non-home login destination", () => {
    location.pathname = "/hermit";
    const html = renderToStaticMarkup(<AppShell session={session} loginArrivalPath="/hermit"><h1>路引</h1></AppShell>);
    expect(html).toContain('data-lh-login-arrival="page"');
    expect(html).toContain("<h1>路引</h1>");
  });

  it("does not replay the login destination marker on another route", () => {
    location.pathname = "/me";
    const html = renderToStaticMarkup(<AppShell session={session} loginArrivalPath="/"><h1>我的</h1></AppShell>);
    expect(html).not.toContain("data-lh-login-arrival");
    expect(html).not.toContain("data-lh-login-curtain");
  });

  it("shows normal content immediately when there is no successful login marker", () => {
    const html = renderToStaticMarkup(<AppShell session={session}><h1>本心</h1></AppShell>);
    expect(html).not.toContain("data-lh-login-arrival");
    expect(html).not.toContain("data-lh-login-curtain");
    expect(html).toContain("<h1>本心</h1>");
  });
});
