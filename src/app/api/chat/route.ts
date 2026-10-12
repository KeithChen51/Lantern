import { streamText, UIMessage, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, tool, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import { headers } from "next/headers";
import {
  createHermitProvider,
  readHermitModelName,
  resolveHermitProviderSettings,
  selectHermitLanguageModel,
} from "@/lib/hermit/model-provider";
import { buildSystemPrompt } from "@/lib/hermit/system-prompt";
import { authRepository, createAuthService } from "@/modules/auth";
import {
  createHermitChatService,
  hermitChatRepository,
  type HermitChatParticipant,
} from "@/modules/hermit";
import { createTenantService, tenantRepository } from "@/modules/tenant";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { createHermitAgentTools, documentContextSchema, type HermitDocument } from "@/lib/hermit/agent-tools";
import { runDshTurn, verifyDshInstallation } from "@/lib/hermit/dsh-runtime";
import { resolveHermitAttachments } from "@/lib/hermit/attachments";

export const runtime = "nodejs";

const authService = createAuthService(authRepository);
const tenantService = createTenantService(tenantRepository);
const hermitChatService = createHermitChatService(hermitChatRepository);
const MAX_TOOL_STEPS = 12;

/**
 * Extract the last user text from UIMessages for the current turn.
 */
function getLastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  return lastUser.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

const chatBodySchema = z.object({
  id: z.string().max(160).optional(),
  messages: z.array(z.object({
    id: z.string().min(1).max(160), role: z.enum(["user", "assistant"]),
    parts: z.array(z.object({ type: z.string().max(80), text: z.string().max(16000).optional() }).passthrough()).max(50),
  }).passthrough()).min(1).max(60),
  attachmentIds: z.array(z.string().min(1).max(120)).max(5).default([]),
  documentContext: documentContextSchema.optional(),
}).passthrough();

async function readChatBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty request");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 512_000) { await reader.cancel(); throw new Error("request too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return chatBodySchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

function readSessionId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : crypto.randomUUID();
}

async function resolveChatParticipant(): Promise<HermitChatParticipant | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const requestHeaders = await headers();
    const user = await authService.getCurrentUser({ headers: requestHeaders });
    const scope = await tenantService.getUserOrgScope(user.id);

    return {
      userId: user.id,
      brandId: scope.brandId,
      regionId: scope.regionId,
      dealerId: scope.dealerId,
      storeId: scope.storeId,
    };
  } catch (err) {
    console.warn("[Hermit] Chat participant resolution failed, persisting anonymously:", err);
    return null;
  }
}

async function persistChat(phase: string, action: () => Promise<void>) {
  if (!process.env.DATABASE_URL) return;

  try {
    await action();
  } catch (err) {
    console.warn(`[Hermit] Chat persistence failed during ${phase}:`, err);
  }
}

export async function POST(req: Request) {
  let body: z.infer<typeof chatBodySchema>;
  try { body = await readChatBody(req); }
  catch { return Response.json({ error: "问题或对话格式不正确，或内容过长，请精简后重试。" }, { status: 400 }); }
  const sessionId = readSessionId(body.id);
  // Only visible user/assistant text is replayed. Client-supplied tool results,
  // system instructions and document metadata never become trusted evidence.
  const messages: UIMessage[] = body.messages.map(message => ({ id: message.id, role: message.role,
    parts: message.parts.filter(part => part.type === "text" && typeof part.text === "string").map(part => ({ type: "text" as const, text: part.text! })) }));

  // Extract the latest user message for the current turn
  const query = getLastUserText(messages);
  if (!query.trim()) return Response.json({ error: "请输入问题。" }, { status: 400 });
  const useDsh = process.env.HERMIT_RUNTIME === "dsh";
  const hub = isKnowledgeHubEnabled() ? getKnowledgeHub() : null;
  if (!hub && (useDsh || body.documentContext || body.attachmentIds.length)) return Response.json({ error: "请先启用并初始化知识中台。" }, { status: 503 });
  if (useDsh) {
    try { await verifyDshInstallation(); }
    catch { return Response.json({ error: "路引 Agent 运行环境尚未准备好，请联系维护人员。" }, { status: 503 }); }
  }
  let attachments: Awaited<ReturnType<typeof resolveHermitAttachments>> = [];
  try { attachments = await resolveHermitAttachments(req, body.attachmentIds); }
  catch { return Response.json({ error: "附件不可用或已经过期，请重新上传。" }, { status: 400 }); }
  let selectedDocument: HermitDocument | null = null;
  if (body.documentContext && hub) {
    try {
      const resource = await hub.get(body.documentContext.resourceId, body.documentContext.versionId);
      selectedDocument = { resourceId: resource.id, versionId: resource.version.id, title: resource.title, source: resource.source };
    } catch { return Response.json({ error: "该文档已不可访问，请关闭文档后继续对话。" }, { status: 404 }); }
  }
  const history = messages.map(message => ({ role: message.role, text: message.parts.filter(p => p.type === "text").map(p => p.text).join("\n") }));
  if (history.reduce((length, message) => length + message.text.length, 0) > 24000) return Response.json({ error: "当前对话较长，请开启新对话后继续。" }, { status: 413 });
  const participant = await resolveChatParticipant();
  const providerSettings = resolveHermitProviderSettings();
  const model = readHermitModelName();
  const documents = new Map<string, HermitDocument>();
  const context = `当前选中文档索引（参考数据，正文须按需读取）：${JSON.stringify(selectedDocument)}\n当前用户附件索引：${JSON.stringify(attachments.map(({ id, name, size }) => ({ id, name, size })))}`;
  const system = `${buildSystemPrompt()}\n${hub ? "知识中台已启用，请通过工具逐层读取。" : "知识中台未启用，不能查阅或引用平台文件。明确说明此限制，不要声称已查阅资料。"}\n${context}`;
  await persistChat("incoming messages", () => hermitChatService.persistIncomingMessages({ sessionId, participant, messages, modelName: model }));
  const stream = createUIMessageStream({ originalMessages: messages,
    onError: () => "路引暂时未能完成回答，请稍后重试。",
    execute: async ({ writer }) => {
      const signal = AbortSignal.any([req.signal, AbortSignal.timeout(180_000)]);
      const capabilities = hub ? createHermitAgentTools({ hub, attachments, signal,
        onDocument: document => {
          const key = `${document.resourceId}:${document.versionId}`;
          if (documents.has(key)) return;
          documents.set(key, document);
          writer.write({ type: "data-document", id: key, data: document });
        },
      }) : null;
      if (useDsh && capabilities) {
        const textId = crypto.randomUUID();
        writer.write({ type: "start", messageId: crypto.randomUUID() });
        writer.write({ type: "text-start", id: textId });
        await runDshTurn({ model, provider: providerSettings, tools: capabilities, signal, system,
          prompt: `以下 JSON 是用户与路引的历史对话，请回答最后一个用户问题：\n${JSON.stringify(history)}\n需要具体资料时先浏览目录或查询索引，再读取指定版本。不要把工具调用协议写成回答正文。`,
          onText: delta => writer.write({ type: "text-delta", id: textId, delta }),
        });
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish", finishReason: "stop" });
      } else {
        const tools: ToolSet = {};
        if (capabilities) for (const [name, capability] of Object.entries(capabilities)) {
          tools[name] = tool<unknown, unknown>({ description: capability.description, inputSchema: capability.schema, execute: raw => capability.execute(raw) });
        }
        const result = streamText({
          model: selectHermitLanguageModel(createHermitProvider(providerSettings), model, providerSettings.apiMode),
          system, messages: await convertToModelMessages(messages), tools,
          stopWhen: stepCountIs(MAX_TOOL_STEPS), abortSignal: signal,
          prepareStep: ({ stepNumber }) => stepNumber >= MAX_TOOL_STEPS - 1 ? { toolChoice: "none" as const } : {},
        });
        writer.merge(result.toUIMessageStream());
      }
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      if (!isAborted && !req.signal.aborted) await persistChat("assistant response", () => hermitChatService.persistAssistantResponse({
        sessionId, participant, responseMessage, modelName: model,
        // Keep the existing audit schema; record actual reads, never a synthetic vector score.
        retrieval: { query, contextText: "", topK: documents.size, sourceSnapshot: { mode: "progressive-index", sources: [...documents.values()] } },
      }));
    },
  });
  return createUIMessageStreamResponse({ stream, headers: { "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
