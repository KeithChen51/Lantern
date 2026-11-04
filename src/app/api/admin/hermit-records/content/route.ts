import { AccessError, assertWebMutation, requireAnalyticsSummary } from "@/modules/auth/access";
import { getAuditedHermitRecord, validateHermitRecordCursor,
  validateHermitRecordId } from "@/modules/hermit/admin-records-access";
import { AppError } from "@/shared/errors";
import { isHermitRecordsEnabled } from "@/config/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", Vary: "Cookie" };

async function contentBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json" ||
      Number(request.headers.get("content-length") || 0) > 16_384 || !request.body) {
    throw new AccessError("正文查看请求格式无效。", 400);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 16_384) throw new Error("Request too large");
      chunks.push(item.value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const input: unknown = JSON.parse(text);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.values(input).some(value => typeof value !== "string")) throw new Error("Expected string fields");
    // Decode key escapes before comparing so "id" and "\u0069d" are the same selector.
    const strings = text.match(/"(?:\\.|[^"\\])*"/g) ?? [];
    const keys = strings.filter((_, index) => index % 2 === 0).map(key => JSON.parse(key) as string);
    if (new Set(keys).size !== keys.length) throw new Error("Duplicate fields");
    return input as Record<string, unknown>;
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new AccessError("正文查看请求格式无效。", 400);
  } finally { reader.releaseLock(); }
}

export function GET() {
  if (!isHermitRecordsEnabled()) {
    return Response.json({ error: { message: "路引记录已关闭。" } }, { status: 404, headers: PRIVATE });
  }
  return Response.json({ error: { message: "请从路引记录页面打开对话。" } }, {
    status: 405, headers: { ...PRIVATE, Allow: "POST" },
  });
}

export async function POST(request: Request) {
  if (!isHermitRecordsEnabled()) {
    return Response.json({ error: { message: "路引记录已关闭。" } }, { status: 404, headers: PRIVATE });
  }
  try {
    const principal = await requireAnalyticsSummary(request);
    assertWebMutation(request, principal);
    if (new URL(request.url).search) throw new AccessError("正文请求不接受查询参数。", 400);
    const input = await contentBody(request);
    if (Object.keys(input).some(key => !["id", "cursor"].includes(key))) {
      throw new AccessError("正文查看参数无效。", 400);
    }
    const id = validateHermitRecordId(input.id);
    const cursor = validateHermitRecordCursor(input.cursor);
    const result = await getAuditedHermitRecord({
      principal, id, cursor,
      recheck: async () => {
        const current = await requireAnalyticsSummary(request);
        if (current.userId !== principal.userId || current.credentialId !== principal.credentialId) {
          throw new AccessError("对话正文授权已变更，请重新打开记录。", 403);
        }
      },
    });
    return Response.json(result, { headers: PRIVATE });
  } catch (error) {
    const status = error instanceof AppError && [400, 401, 403, 404].includes(error.status) ? error.status : 503;
    const message = status === 401 ? "请先使用员工账号登录。" : status === 403 ? "当前账号没有对话正文查看权限。"
      : status === 400 ? "会话编号或分页标识无效。" : status === 404 ? "该会话已不存在或不可查看。"
        : "对话内容暂不可用，请稍后重试。";
    return Response.json({ error: { message } }, { status, headers: PRIVATE });
  }
}
