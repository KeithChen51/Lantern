import { AccessError, assertWebMutation, requireAnalyticsSummary } from "@/modules/auth/access";
import { body } from "@/modules/auth/access-http";
import { getAuditedHermitRecord, getHermitContentGrant, validateHermitRecordCursor,
  validateHermitRecordId, validateHermitRecordPurpose } from "@/modules/hermit/admin-records-access";
import { AppError } from "@/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", Vary: "Cookie" };

export function GET() {
  return Response.json({ error: { message: "请在路引记录窗口内提交查看事由。" } }, {
    status: 405, headers: { ...PRIVATE, Allow: "POST" },
  });
}

export async function POST(request: Request) {
  try {
    const principal = await requireAnalyticsSummary(request);
    assertWebMutation(request, principal);
    const approvalRef = getHermitContentGrant(principal);
    if (!approvalRef) throw new AccessError("当前账号没有对话正文查看权限。", 403);
    if (new URL(request.url).search) throw new AccessError("正文请求不接受查询参数。", 400);
    const input = await body(request);
    if (Object.keys(input).some(key => !["id", "purpose", "cursor"].includes(key))) {
      throw new AccessError("正文查看参数无效。", 400);
    }
    const id = validateHermitRecordId(input.id);
    const purpose = validateHermitRecordPurpose(input.purpose);
    const cursor = validateHermitRecordCursor(input.cursor);
    const result = await getAuditedHermitRecord({
      principal, approvalRef, id, purpose, cursor,
      recheck: async () => {
        const current = await requireAnalyticsSummary(request);
        if (current.userId !== principal.userId || current.credentialId !== principal.credentialId ||
            getHermitContentGrant(current) !== approvalRef) {
          throw new AccessError("对话正文授权已变更，请重新打开记录。", 403);
        }
      },
    });
    return Response.json(result, { headers: PRIVATE });
  } catch (error) {
    const status = error instanceof AppError && [400, 401, 403, 404].includes(error.status) ? error.status : 503;
    const message = status === 401 ? "请先使用员工账号登录。" : status === 403 ? "当前账号没有对话正文查看权限。"
      : status === 400 ? "请填写有效的会话编号与查看事由。" : status === 404 ? "该会话已不存在或不可查看。"
        : "对话内容暂不可用，请稍后重试。";
    return Response.json({ error: { message } }, { status, headers: PRIVATE });
  }
}
