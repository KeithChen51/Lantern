import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
const deps = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn() }));
vi.mock("@/components/auth/SessionContext", () => ({ useEmployeeSession: deps.session }));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: deps.fetch }));
import { EmployeeRankings } from "./EmployeeRankings";
const period = { startDate: "2026-10-01", endDate: "2026-10-31" };
const session = { kind: "employee", user: { id: "employee-a" }, capabilities: ["analytics:summary"], expiresAt: 1900000000000 };
beforeEach(() => {
  vi.clearAllMocks();
  deps.session.mockReturnValue(session);
});
function dataKey(props = period) {
  const view = EmployeeRankings({ period: props }) as ReactElement<{ children: ReactElement[] }>;
  return view.props.children.at(-1)?.key;
}
describe("automatic employee ranking entry", () => {
  it("renders the automatic loading state without reading names during server rendering", () => {
    const html = renderToStaticMarkup(<EmployeeRankings period={period} />);
    expect(html).toContain("正在加载员工榜单");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("查询事由");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...session, kind: "guest" },
    { ...session, capabilities: ["knowledge:manage"] },
    { ...session, capabilities: [] },
    { ...session, expiresAt: 0 },
  ])("does not mount named result loading for an unqualified session %j", current => {
    deps.session.mockReturnValue(current);
    const html = renderToStaticMarkup(<EmployeeRankings period={period} />);
    expect(html).toContain("有效的平台管理员");
    expect(html).not.toContain("正在加载员工榜单");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("remounts data when the employee, session expiry or date interval changes", () => {
    const first = dataKey();
    deps.session.mockReturnValue({ ...session, user: { id: "employee-b" } });
    expect(dataKey()).not.toBe(first);
    deps.session.mockReturnValue({ ...session, expiresAt: session.expiresAt + 1000 });
    expect(dataKey()).not.toBe(first);
    deps.session.mockReturnValue(session);
    expect(dataKey({ ...period, startDate: "2026-10-20" })).not.toBe(first);
  });
});
