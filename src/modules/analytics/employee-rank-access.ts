import { AccessError, type Principal } from "@/modules/auth/access";

const ACCOUNT = /^[A-Za-z0-9._-]{1,80}$/;
const APPROVAL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
type ApprovalEnvironment = Record<string, string | undefined>;

/** Each configured entry must name the platform owner's recorded approval. */
export function employeeRankingGrants(raw: string | undefined): ReadonlyMap<string, string> {
  if (!raw || raw.length > 32_768 || raw.includes("\\")) return new Map();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    const entries = Object.entries(parsed);
    const writtenKeys = [...raw.matchAll(/"([^"]*)"\s*:/g)].map(match => match[1]);
    if (entries.length > 100 || writtenKeys.length !== entries.length || new Set(writtenKeys).size !== writtenKeys.length) return new Map();
    if (entries.some(([account, approval]) => !ACCOUNT.test(account) || ["__proto__", "constructor", "prototype"].includes(account) || typeof approval !== "string" || !APPROVAL.test(approval))) return new Map();
    return new Map(entries as Array<[string, string]>);
  } catch { return new Map(); }
}

export function employeeRankingApproval(principal: Principal, env: ApprovalEnvironment = process.env): string | null {
  if (principal.kind === "guest" || principal.channel !== "web" || !principal.capabilities.includes("analytics:summary")) return null;
  return employeeRankingGrants(env.LIGHTHOUSE_ANALYTICS_PERSON_GRANTS).get(principal.account) ?? null;
}

export function hasEmployeeRankingGrant(principal: Principal, env: ApprovalEnvironment = process.env): boolean {
  return employeeRankingApproval(principal, env) !== null;
}

export function requireEmployeeRankingGrant(principal: Principal, env: ApprovalEnvironment = process.env): string {
  const approval = employeeRankingApproval(principal, env);
  if (!approval) throw new AccessError("当前账号没有员工榜单专项授权。", 403);
  return approval;
}

