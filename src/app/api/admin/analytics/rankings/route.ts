import { AccessError, assertWebMutation, authErrorResponse, requireAnalyticsSummary } from "@/modules/auth/access";
import { body } from "@/modules/auth/access-http";
import { getAuditedEmployeeRankings, validateEmployeeRankingPurpose } from "@/modules/analytics/employee-rankings";
import { parseReportPeriod } from "@/modules/analytics/report-period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "Vary": "Cookie" };

export function GET() {
  return Response.json({ error: { message: "请通过访问与使用看板加载员工榜单。" } }, { status: 405, headers: { ...PRIVATE, Allow: "POST" } });
}

export async function POST(request: Request) {
  let principal;
  try {
    principal = await requireAnalyticsSummary(request);
    assertWebMutation(request, principal);
  } catch (error) { return authErrorResponse(error); }

  let period;
  try {
    if (new URL(request.url).search) throw new Error("Unexpected query");
    const input = await body(request);
    if (Object.keys(input).some(key => !["start", "end", "purpose"].includes(key)) ||
        typeof input.start !== "string" || typeof input.end !== "string") throw new Error("Invalid ranking input");
    if (Object.hasOwn(input, "purpose")) validateEmployeeRankingPurpose(input.purpose);
    period = parseReportPeriod(new URLSearchParams({ preset: "custom", start: input.start, end: input.end }));
  } catch {
    return Response.json({ error: { message: "请选择有效的员工榜单统计日期。" } }, { status: 400, headers: PRIVATE });
  }
  try {
    const result = await getAuditedEmployeeRankings({
      principal, period,
      recheck: async () => {
        const current = await requireAnalyticsSummary(request);
        if (current.userId !== principal.userId || current.credentialId !== principal.credentialId) {
          throw new AccessError("查询授权已变更，请重新提交。", 403);
        }
      },
    });
    return Response.json(result, { headers: PRIVATE });
  } catch (error) {
    if (error instanceof AccessError) return authErrorResponse(error);
    return Response.json({ error: { message: "员工榜单暂不可用，请稍后重试。" } }, { status: 503, headers: PRIVATE });
  }
}
