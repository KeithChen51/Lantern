import { AccessError, requireAnalyticsSummary } from "@/modules/auth/access";
import { getAuditedHermitRecords, validateHermitRecordCursor, validateHermitRecordId } from "@/modules/hermit/admin-records-access";
import { AppError } from "@/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", Vary: "Cookie" };

export async function GET(request: Request) {
  try {
    const principal = await requireAnalyticsSummary(request);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !["start", "end", "actor", "id", "cursor"].includes(key) || params.getAll(key).length !== 1)) {
      throw new AppError("bad_request", "筛选参数无效。", 400);
    }
    const start = params.get("start") ?? undefined;
    const end = params.get("end") ?? undefined;
    const actor = params.get("actor") ?? undefined;
    if (actor !== undefined && actor !== "employee" && actor !== "guest" && actor !== "unknown") {
      throw new AppError("bad_request", "会话身份类别无效。", 400);
    }
    if ([start, end].some(value => value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      throw new AppError("bad_request", "请选择有效的筛选日期。", 400);
    }
    const id = params.has("id") ? validateHermitRecordId(params.get("id")) : undefined;
    const cursor = validateHermitRecordCursor(params.get("cursor") ?? undefined);
    const result = await getAuditedHermitRecords({
      principal, filters: { start, end, actor, id, cursor },
      recheck: async () => {
        const current = await requireAnalyticsSummary(request);
        if (current.userId !== principal.userId || current.credentialId !== principal.credentialId) {
          throw new AccessError("会话授权已变更，请重新加载路引记录。", 403);
        }
      },
    });
    return Response.json(result, { headers: PRIVATE });
  } catch (error) {
    const status = error instanceof AppError && [400, 401, 403].includes(error.status) ? error.status : 503;
    const message = status === 401 ? "请先使用员工账号登录。" : status === 403 ? "当前账号没有路引记录查看权限。"
      : status === 400 ? "请选择有效的筛选条件。" : "路引记录暂不可用，请稍后重试。";
    return Response.json({ error: { message } }, { status, headers: PRIVATE });
  }
}
