import { authErrorResponse, requireAnalyticsSummary } from "@/modules/auth/access";
import { getVisitTrend, parseVisitTrendRange } from "@/modules/analytics/visit-trend";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "Vary": "Cookie", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request) {
  try { await requireAnalyticsSummary(request); }
  catch (error) {
    const response = authErrorResponse(error);
    for (const [key, value] of Object.entries(HEADERS)) response.headers.set(key, value);
    return response;
  }
  let range;
  try { range = parseVisitTrendRange(new URL(request.url).searchParams); }
  catch {
    return Response.json({ error: { code: "bad_request", message: "请选择最近 7 天、最近 30 天或全部。" } }, { status: 400, headers: HEADERS });
  }
  try { return Response.json(await getVisitTrend(range), { headers: HEADERS }); }
  catch {
    return Response.json({ error: { code: "analytics_unavailable", message: "访问趋势暂不可用，请稍后重试。" } }, { status: 503, headers: HEADERS });
  }
}
