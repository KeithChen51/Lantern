import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
const deps = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn() }));
vi.mock("@/components/auth/SessionContext", () => ({ useEmployeeSession: deps.session }));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: deps.fetch }));
import { EmployeeRankings } from "./EmployeeRankings";
const period = { startDate: "2026-10-01", endDate: "2026-10-31" };
beforeEach(() => {
  vi.clearAllMocks();
  deps.session.mockReturnValue({ kind: "employee", user: { id: "employee-a" }, expiresAt: 1900000000000 });
});
function queryKey() {
  const view = EmployeeRankings({ period, canView: true }) as ReactElement<{ children: ReactElement[] }>;
  return view.props.children.at(-1)?.key;
}
describe("protected employee ranking entry", () => {
  it("keeps named results behind an explicit reasoned query", () => {
    const html = renderToStaticMarkup(<EmployeeRankings period={period} canView />);
    expect(html).toContain("查询员工榜单");
    expect(html).toContain("查询事由");
    expect(html).toContain('minLength="4"');
    expect(html).not.toContain("<table");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("shows the authorization explanation without a query action for summary-only viewers", () => {
    const html = renderToStaticMarkup(<EmployeeRankings period={period} canView={false} />);
    expect(html).toContain("专项授权");
    expect(html).not.toContain("<form");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("remounts the result owner when either the employee or the date interval changes", () => {
    const first = queryKey();
    deps.session.mockReturnValue({ kind: "employee", user: { id: "employee-b" } });
    expect(queryKey()).not.toBe(first);
    const secondView = EmployeeRankings({ period: { ...period, startDate: "2026-10-20" }, canView: true }) as ReactElement<{ children: ReactElement[] }>;
    expect(secondView.props.children.at(-1)?.key).not.toBe(queryKey());
  });
  it("renders no query action for a guest even with stale page props", () => {
    deps.session.mockReturnValue({ kind: "guest", user: { id: "guest" } });
    expect(renderToStaticMarkup(<EmployeeRankings period={period} canView />)).not.toContain("<form");
  });
});

