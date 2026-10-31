import { authErrorResponse, requireAnalyticsSummary } from "@/modules/auth/access";
import { getAnalyticsSummary } from "@/modules/analytics/summary";
import { parseReportPeriod } from "@/modules/analytics/report-period";
import { getUsageReport } from "@/modules/analytics/report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAnalyticsSummary(request);
  } catch (error) { return authErrorResponse(error); }

  const params = new URL(request.url).searchParams;
  let period;
  if (params.has("days")) {
    const values = params.getAll("days");
    if ([...params.keys()].some(key => key !== "days") || values.length !== 1 || !["7", "30"].includes(values[0])) {
      return Response.json({ error: { code: "bad_request", message: "统计时间参数无效。" } }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
  } else {
    try { period = parseReportPeriod(params); }
    catch (error) {
      return Response.json({ error: { code: "bad_request", message: error instanceof RangeError ? error.message : "统计时间参数无效。" } }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
  }
  try {
    const summary = period ? await getUsageReport(period) : await getAnalyticsSummary(params.get("days") === "30" ? 30 : 7);
    return Response.json(summary, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "Referrer-Policy": "no-referrer" } });
  } catch {
    return Response.json({ error: { code: "analytics_unavailable", message: "访问统计暂不可用，请稍后重试。" } }, { status: 503, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }
}
