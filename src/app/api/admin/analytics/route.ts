import { authErrorResponse, requireAnalyticsSummary } from "@/modules/auth/access";
import { getAnalyticsSummary } from "@/modules/analytics/summary";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAnalyticsSummary(request);
  } catch (error) { return authErrorResponse(error); }

  const params = new URL(request.url).searchParams;
  const daysValues = params.getAll("days");
  if ([...params.keys()].some(key => key !== "days") || daysValues.length > 1 || daysValues.length === 1 && !["7", "30"].includes(daysValues[0])) {
    return Response.json({ error: { code: "bad_request", message: "统计范围仅支持最近 7 天或 30 天。" } }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const summary = await getAnalyticsSummary(daysValues[0] === "30" ? 30 : 7);
    return Response.json(summary, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "Referrer-Policy": "no-referrer" } });
  } catch {
    return Response.json({ error: { code: "analytics_unavailable", message: "访问统计暂不可用，请稍后重试。" } }, { status: 503, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }
}
