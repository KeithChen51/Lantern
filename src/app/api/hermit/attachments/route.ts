import {
  buildHermitAttachmentOwnerCookie,
  deleteHermitAttachment,
  HERMIT_ATTACHMENT_MAX_REQUEST_BYTES,
  saveHermitAttachment,
} from "@/lib/hermit/attachments";
import { AppError, toErrorResponse } from "@/shared/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readBoundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("bad_request", "请求内容为空。", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError("validation_error", "请求内容超过大小限制。", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

function jsonError(error: unknown) {
  const response = toErrorResponse(error);
  const result = Response.json(response.body, { status: response.status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = Response.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function withOwnerCookie(response: Response, ownerId: string, shouldSetOwnerCookie: boolean) {
  response.headers.set("Cache-Control", "no-store");
  if (shouldSetOwnerCookie) response.headers.set("Set-Cookie", buildHermitAttachmentOwnerCookie(ownerId));
  return response;
}

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > HERMIT_ATTACHMENT_MAX_REQUEST_BYTES) {
      return jsonNoStore({ error: { code: "validation_error", message: "本次上传请求不能超过 12MB。" } }, { status: 413 });
    }

    let formData: FormData;
    try {
      const body = await readBoundedBody(request, HERMIT_ATTACHMENT_MAX_REQUEST_BYTES);
      formData = await new Request(request.url, { method: "POST", headers: request.headers, body }).formData();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("bad_request", "上传请求格式无效。", 400);
    }
    const files = formData.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) {
      return jsonNoStore({ error: { code: "validation_error", message: "请在 file 字段上传一个附件。" } }, { status: 422 });
    }

    const result = await saveHermitAttachment(request, files[0]);
    return withOwnerCookie(Response.json(result.summary, { status: 201 }), result.ownerId, result.shouldSetOwnerCookie);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    let body: { id?: unknown };
    try {
      body = JSON.parse((await readBoundedBody(request, 1024)).toString("utf8")) as { id?: unknown };
      if (!body || typeof body !== "object") throw new Error("invalid body");
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("bad_request", "删除请求格式无效。", 400);
    }
    const result = await deleteHermitAttachment(request, typeof body.id === "string" ? body.id : "");
    return jsonNoStore(result);
  } catch (error) {
    return jsonError(error);
  }
}
