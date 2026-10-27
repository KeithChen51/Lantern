import { streamText, UIMessage, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, tool, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import {
  createHermitProvider,
  readHermitModelName,
  resolveHermitProviderSettings,
  selectHermitLanguageModel,
} from "@/lib/hermit/model-provider";
import { buildSystemPrompt } from "@/lib/hermit/system-prompt";
import { requireSiteVisitor, enforceGuestRequestLimit, assertWebMutation, authErrorResponse, type Principal } from "@/modules/auth/access";
import { assertHermitPrincipal } from "@/modules/hermit/access";
import { AppError, toErrorResponse } from "@/shared/errors";
import {
  createHermitChatService,
  hermitChatRepository,
  type HermitChatParticipant,
  type HermitChatOwner,
} from "@/modules/hermit";
import { getSiteKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { createHermitAgentTools, documentContextSchema, type HermitDocument, type HermitAgentTool } from "@/lib/hermit/agent-tools";
import { runDshTurn, verifyDshInstallation } from "@/lib/hermit/dsh-runtime";
import { createAnswerSources, stripSourceMarkers, type FinalizedAnswerSources } from "@/lib/hermit/answer-sources";
import { resolveHermitAttachments } from "@/lib/hermit/attachments";
import type { HermitProgressStage } from "@/lib/hermit/conversation-contract";

export const runtime = "nodejs";

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
  }).passthrough()).min(1).max(200),
  attachmentIds: z.array(z.string().min(1).max(120)).max(5).default([]),
  documentContext: documentContextSchema.optional(),
}).passthrough();

async function readChatBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty request");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      request.signal.throwIfAborted();
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

function chatParticipant(principal: Principal): HermitChatParticipant {
  const owner: HermitChatOwner = principal.kind === "guest" ? { userId: null, guestId: principal.userId } : { userId: principal.userId, guestId: null };
  return { ...owner, brandId: null, regionId: null, dealerId: null, storeId: null };
}

function errorResponse(error: unknown) {
  if (!(error instanceof AppError)) return authErrorResponse(error);
  const result = toErrorResponse(error);
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

async function persistChat(phase: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (err) {
    console.warn(`[Hermit] Chat persistence failed during ${phase}:`, err);
  }
}

export async function POST(req: Request) {
  let principal: Principal;
  try {
    principal = await requireSiteVisitor(req);
    assertHermitPrincipal(principal, "hermit:chat");
    assertWebMutation(req, principal);
    await enforceGuestRequestLimit(principal, "chat");
  } catch (error) { return errorResponse(error); }
  const recheckAccess = async () => {
    const current = await requireSiteVisitor(req);
    assertHermitPrincipal(current, "hermit:chat");
    assertWebMutation(req, current);
    if ((current.kind ?? "employee") !== (principal.kind ?? "employee") || current.userId !== principal.userId || current.grantId !== principal.grantId || current.credentialId !== principal.credentialId) {
      throw new AppError("unauthorized", "请重新登录。", 401);
    }
  };
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
  const participant = chatParticipant(principal);
  // This must fail closed before attachments, hub reads or model setup. A
  // client-selected ID cannot adopt another visitor's or a legacy session.
  try { await hermitChatRepository.upsertSession({ id: sessionId, ...participant, title: null }); }
  catch (error) { return errorResponse(error); }
  const useDsh = process.env.HERMIT_RUNTIME === "dsh";
  const hub = isKnowledgeHubEnabled() ? getSiteKnowledgeHub() : null;
  if (!hub && (useDsh || body.documentContext || body.attachmentIds.length)) return Response.json({ error: "请先启用并初始化知识中台。" }, { status: 503 });
  if (useDsh) {
    try { await verifyDshInstallation(); }
    catch { return Response.json({ error: "路引 Agent 运行环境尚未准备好，请联系维护人员。" }, { status: 503 }); }
  }
  let attachments: Awaited<ReturnType<typeof resolveHermitAttachments>> = [];
  try { attachments = body.attachmentIds.length ? await resolveHermitAttachments(principal, body.attachmentIds) : []; }
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
  const providerSettings = resolveHermitProviderSettings();
  const model = readHermitModelName();
  const context = `当前选中文档索引（参考数据，正文须按需读取）：${JSON.stringify(selectedDocument)}\n当前用户附件索引：${JSON.stringify(attachments.map(({ id, name, size }) => ({ id, name, size })))}`;
  const system = `${buildSystemPrompt()}\n${hub ? "知识中台已启用，请通过工具逐层读取。" : "知识中台未启用，不能查阅或引用平台文件。明确说明此限制，不要声称已查阅资料。"}\n${context}`;
  const turnContext = { attachments: attachments.map(({ id, name, size }) => ({ id, name, size })), documentContext: selectedDocument };
  try {
    await recheckAccess();
    await hermitChatService.persistIncomingMessages({ sessionId, participant, messages, modelName: model, turnContext });
  } catch (error) { return errorResponse(error); }
  const stream = createUIMessageStream({ originalMessages: messages,
    onError: () => "路引暂时未能完成回答，请稍后重试。",
    execute: async ({ writer }) => {
      let progressStage: HermitProgressStage | undefined;
      const progress = (stage: HermitProgressStage) => {
        if (stage === progressStage) return;
        progressStage = stage;
        const labels = { connecting: "正在连接路引", searching: "正在查找资料", reading: "正在阅读资料", answering: "正在生成回答" };
        writer.write({ type: "data-hermit-progress", id: "hermit-progress", data: { stage, label: labels[stage] } });
      };
      const revoked = new AbortController();
      const signal = AbortSignal.any([req.signal, revoked.signal, AbortSignal.timeout(180_000)]);
      // Local revocation interrupts an otherwise quiet long model request.
      // Serial polling avoids overlapping database checks and is always cleared.
      let closed = false;
      let revocationTimer: ReturnType<typeof setTimeout> | undefined;
      const pollAccess = async () => {
        if (closed || signal.aborted) return;
        try { await recheckAccess(); }
        catch { revoked.abort(); return; }
        if (!closed) { revocationTimer = setTimeout(() => void pollAccess(), 5_000); revocationTimer.unref?.(); }
      };
      const sources = hub ? createAnswerSources({ hub }) : null;
      const capabilities: Record<string, HermitAgentTool> | null = hub ? createHermitAgentTools({ hub, attachments, signal,
        onDocument: document => sources!.recordRead(document), additionalTools: sources!.tools,
      }) : null;
      if (capabilities) for (const [name, capability] of Object.entries(capabilities)) {
        const execute = capability.execute;
        capability.execute = async raw => {
          await recheckAccess(); signal.throwIfAborted();
          const parsed = capability.schema.parse(raw);
          if (["knowledge_browse", "knowledge_search", "knowledge_outline", "knowledge_files"].includes(name)) progress("searching");
          if (["knowledge_read", "knowledge_file_read", "attachment_read"].includes(name)) progress("reading");
          return execute(parsed);
        };
      }
      const messageId = crypto.randomUUID();
      const textId = crypto.randomUUID();
      let rawText = "";
      let visibleText = "";
      let finalText = "";
      let answerSources: FinalizedAnswerSources | undefined;
      let status: "complete" | "failed" | "cancelled" = "failed";
      const onText = (delta: string) => {
        signal.throwIfAborted();
        rawText += delta;
        const next = stripSourceMarkers(rawText);
        const suffix = next.slice(visibleText.length);
        if (suffix) { if (suffix.trim()) progress("answering"); writer.write({ type: "text-delta", id: textId, delta: suffix }); }
        visibleText = next;
      };
      writer.write({ type: "start", messageId });
      writer.write({ type: "text-start", id: textId });
      progress("connecting");
      try {
        revocationTimer = setTimeout(() => void pollAccess(), 5_000); revocationTimer.unref?.();
        await recheckAccess();
        signal.throwIfAborted();
        if (useDsh && capabilities) {
          await runDshTurn({ model, provider: providerSettings, tools: capabilities, signal, system,
            prompt: `以下 JSON 是用户与路引的历史对话，请回答最后一个用户问题：\n${JSON.stringify(history)}\n需要具体资料时先浏览目录或查询索引，再读取指定版本。不要把工具调用协议写成回答正文。`,
            onText, assertAccess: recheckAccess,
          });
        } else {
          const tools: ToolSet = {};
          if (capabilities) for (const [name, capability] of Object.entries(capabilities)) {
            tools[name] = tool<unknown, unknown>({ description: capability.description, inputSchema: capability.schema, execute: async raw => {
              try { return await capability.execute(raw); }
              catch { throw new Error("无法读取所请求的参考资料，请核对资源版本、读取范围或剩余调用额度。"); }
            } });
          }
          const result = streamText({
            model: selectHermitLanguageModel(createHermitProvider(providerSettings), model, providerSettings.apiMode),
            system, messages: await convertToModelMessages(messages), tools,
            stopWhen: stepCountIs(MAX_TOOL_STEPS), abortSignal: signal,
            prepareStep: async ({ stepNumber }) => {
              await recheckAccess(); signal.throwIfAborted();
              return stepNumber >= MAX_TOOL_STEPS - 1 ? { toolChoice: "none" as const } : {};
            },
          });
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") onText(part.text);
            if (part.type === "error") throw part.error;
            if (part.type === "abort") throw new Error("Generation aborted");
          }
          if (await result.finishReason !== "stop") throw new Error("Generation incomplete");
        }
        signal.throwIfAborted();
        if (!visibleText.trim()) throw new Error("Empty answer");
        await recheckAccess();
        const finalized = sources ? await sources.finalize(rawText) : { status: "complete" as const, text: visibleText, citations: [], recommendations: [] };
        signal.throwIfAborted();
        finalText = finalized.text;
        answerSources = { ...finalized, text: finalized.text.trim() };
        writer.write({ type: "data-answer-sources", data: finalized });
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish", finishReason: "stop", messageMetadata: { hermitStatus: "complete" } });
        status = "complete";
      } catch (error) {
        status = req.signal.aborted ? "cancelled" : "failed";
        writer.write({ type: "message-metadata", messageMetadata: { hermitStatus: status } });
        throw error;
      } finally {
        closed = true;
        if (revocationTimer) clearTimeout(revocationTimer);
        const snapshot = sources?.snapshot(status) ?? { mode: "progressive-index", status, reads: [], citations: [], recommendations: [] };
        await persistChat("assistant response", () => hermitChatService.persistAssistantResponse({
          sessionId, participant, modelName: model,
          responseMessage: { id: messageId, role: "assistant", parts: [{ type: "text", text: finalText || visibleText }], metadata: { status, hermitStatus: status,
            hermit: { version: 1, ...turnContext, ...(status === "complete" && answerSources ? { answerSources } : {}) } } },
          retrieval: { query, contextText: "", topK: snapshot.reads.length, sourceSnapshot: snapshot },
        }));
      }
    },
  });
  return createUIMessageStreamResponse({ stream, headers: { "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
