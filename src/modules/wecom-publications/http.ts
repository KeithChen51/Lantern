import { z } from "zod";
import { assertWebMutation, requirePublicationAdmin, requirePublicationClient } from "@/modules/auth/access";
import { json } from "@/modules/auth/access-http";
import { AppError } from "@/shared/errors";
import { parsePublicationDraft, publicationPreview } from "./article";
import { publicationEnabled, getPublicationChannelInfo } from "./configuration";
import {
  MAX_PUBLICATION_UPLOAD_BYTES, PUBLICATION_RECIPIENTS, publicationChannels, type NewPublicationDraft, type PublicationActor,
  type PublicationChannel,
} from "./contracts";
import {
  getPublicationTask, listPublicationTasks, loadPublicationDraft, retryPublicationDelivery,
  savePublicationDraft, schedulePublication,
} from "./service";

type IdContext = { params: Promise<{ id: string }> };

const uuid = z.uuid();
const channelSchema = z.enum(publicationChannels);
const audienceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("members"), ids: z.array(z.string().regex(PUBLICATION_RECIPIENTS.members.pattern)).min(1).max(PUBLICATION_RECIPIENTS.members.max) }),
  z.strictObject({ kind: z.literal("departments"), ids: z.array(z.string().regex(PUBLICATION_RECIPIENTS.departments.pattern)).min(1).max(PUBLICATION_RECIPIENTS.departments.max) }),
  z.strictObject({ kind: z.literal("all") }),
]);
const scheduleSchema = z.strictObject({
  draftId: uuid,
  scheduledAt: z.string().max(25),
  requestId: uuid,
  targets: z.array(z.strictObject({ channel: channelSchema, audience: audienceSchema })).min(1).max(2),
});
const retrySchema = z.strictObject({ channel: channelSchema, requestId: uuid });

async function publicationResponse(request: Request, operation: (actor: PublicationActor) => Promise<Response>) {
  try {
    const tool = request.headers.has("authorization");
    const principal = tool ? await requirePublicationClient(request) : await requirePublicationAdmin(request);
    if (!tool && !["GET", "HEAD"].includes(request.method)) assertWebMutation(request, principal);
    if (!publicationEnabled()) throw new AppError("integration_error", "此环境尚未启用企微发布。", 503);
    return await operation({ userId: principal.userId, account: principal.account, channel: principal.channel });
  } catch (error) {
    if (error instanceof AppError) return json({ error: { code: error.code, message: error.message } }, error.status);
    console.error("WeCom publication request failed", error instanceof Error ? error.name : "Unknown error");
    return json({ error: { code: "integration_error", message: "企微发布服务暂不可用。" } }, 503);
  }
}

async function readInput(request: Request, maxBytes: number) {
  if (!request.body) throw new AppError("bad_request", "请求内容为空。");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new AppError("bad_request", "上传内容超过大小限制。", 413);
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, total);
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError("bad_request", "上传内容超过大小限制。", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

async function readJson<Output>(request: Request, schema: z.ZodType<Output>): Promise<Output> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    throw new AppError("bad_request", "请求必须使用 JSON。", 415);
  }
  const raw = await readInput(request, 512 * 1024);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
  catch { throw new AppError("bad_request", "JSON 格式无效。"); }
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError("validation_error", "发布参数无效，请核对稿件、收件范围和排期。", 422);
  return result.data;
}

function publicationId(id: string) {
  if (!uuid.safeParse(id).success) throw new AppError("not_found", "记录不存在。", 404);
  return id;
}

export function parseBeijingSchedule(value: string): Date {
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?\+08:00$/.exec(value);
  if (parts) {
    const clock = parts[1] + ":" + (parts[2] ?? "00");
    const time = new Date(clock + "+08:00");
    if (Number.isFinite(time.getTime())) {
      const local = new Date(time.getTime() + 8 * 60 * 60 * 1000);
      if (local.toISOString().slice(0, 19) === clock) return time;
    }
  }
  throw new AppError("validation_error", "请输入有效的北京时间。", 422);
}

function availableChannel(id: PublicationChannel) {
  const channel = getPublicationChannelInfo().find(item => item.id === id);
  if (!channel) throw new AppError("validation_error", "所选企微应用暂不可用。", 422);
  return channel;
}

function checkChannelMedia(id: PublicationChannel, draft: NewPublicationDraft) {
  const channel = availableChannel(id);
  if (draft.cover.bytes.byteLength > channel.coverLimit || draft.images.some(image => image.bytes.byteLength > channel.bodyImageLimit)) {
    throw new AppError("validation_error", "稿件的图片超过 " + channel.label + " 的素材大小限制。", 422);
  }
}

export function createPublicationDraftHttp(request: Request) {
  return publicationResponse(request, async actor => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      throw new AppError("bad_request", "请使用文件上传。", 415);
    }
    const bytes = await readInput(request, MAX_PUBLICATION_UPLOAD_BYTES);
    let form: FormData;
    try { form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new AppError("bad_request", "无法读取上传文件。"); }
    const draft = await savePublicationDraft(await parsePublicationDraft(form), actor);
    return json({ draft }, 201);
  });
}

export function previewPublicationDraftHttp(request: Request, context: IdContext) {
  return publicationResponse(request, async () => {
    const draft = await loadPublicationDraft(publicationId((await context.params).id));
    return json(publicationPreview(draft));
  });
}

export function schedulePublicationHttp(request: Request) {
  return publicationResponse(request, async actor => {
    const input = await readJson(request, scheduleSchema);
    const scheduledAt = parseBeijingSchedule(input.scheduledAt);
    if (new Set(input.targets.map(target => target.channel)).size !== input.targets.length) {
      throw new AppError("validation_error", "同一应用只能设置一份收件范围。", 422);
    }
    for (const { audience } of input.targets) {
      if (audience.kind !== "all" && new Set(audience.ids.map(id => id.toLowerCase())).size !== audience.ids.length) {
        throw new AppError("validation_error", "收件范围中存在重复的账号或部门。", 422);
      }
    }
    const draft = await loadPublicationDraft(input.draftId);
    for (const { channel } of input.targets) checkChannelMedia(channel, draft);
    const task = await schedulePublication({ ...input, scheduledAt }, actor);
    return json({ task }, 201);
  });
}

export function listPublicationTasksHttp(request: Request) {
  return publicationResponse(request, async () => json({ tasks: await listPublicationTasks() }));
}

export function getPublicationTaskHttp(request: Request, context: IdContext) {
  return publicationResponse(request, async () => {
    const task = await getPublicationTask(publicationId((await context.params).id));
    return json({ task });
  });
}

export function retryPublicationDeliveryHttp(request: Request, context: IdContext) {
  return publicationResponse(request, async actor => {
    const { channel, requestId } = await readJson(request, retrySchema);
    availableChannel(channel);
    const task = await retryPublicationDelivery(publicationId((await context.params).id), channel, requestId, actor);
    return json({ task });
  });
}
