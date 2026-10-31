import { describe, expect, it } from "vitest";
import type { Principal } from "@/modules/auth/access";
import { employeeRankingGrants, employeeRankingApproval, hasEmployeeRankingGrant, requireEmployeeRankingGrant } from "./employee-rank-access";

const principal: Principal = { userId: "user-1", account: "0007", displayName: "测试员工", grantId: "grant", credentialId: "session", channel: "web", capabilities: ["analytics:summary"], expiresAt: 1900000000000 };
describe("employee ranking approvals", () => {
  it("requires a distinct configured approval reference for the current platform employee", () => {
    const env = { LIGHTHOUSE_ANALYTICS_PERSON_GRANTS: '{"0007":"APPROVAL/107"}' };
    expect(employeeRankingApproval(principal, env)).toBe("APPROVAL/107");
    expect(hasEmployeeRankingGrant(principal, env)).toBe(true);
    expect(hasEmployeeRankingGrant({ ...principal, account: "0008" }, env)).toBe(false);
    expect(() => requireEmployeeRankingGrant(principal, {})).toThrow("专项授权");
  });
  it.each([undefined, "", "[]", "null", "1", "{}", '{"0007":true}', '{"0007":""}', '{"0007":"ok","0007":"other"}', '{"__proto__":"ok"}', '{"0007":"approval with space"}', '{"0007":"APPROVAL\\u002f107"}'])("fails closed on missing or malformed grants %s", raw => {
    expect(employeeRankingGrants(raw).size).toBe(0);
  });
  it.each([
    { kind: "guest" }, { channel: "mcp" }, { channel: "cli" }, { capabilities: ["knowledge:manage"] },
  ])("does not turn other access into an employee approval %j", change => {
    expect(hasEmployeeRankingGrant({ ...principal, ...change } as Principal, { LIGHTHOUSE_ANALYTICS_PERSON_GRANTS: '{"0007":"APPROVAL-107"}' })).toBe(false);
  });
});
