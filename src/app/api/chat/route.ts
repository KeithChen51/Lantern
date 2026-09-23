import { streamText, UIMessage, convertToModelMessages } from "ai";
import { headers } from "next/headers";
import {
  createHermitProvider,
  readHermitModelName,
  resolveHermitProviderSettings,
  selectHermitLanguageModel,
} from "@/lib/hermit/model-provider";
import { buildSystemPrompt } from "@/lib/hermit/system-prompt";
import { searchKnowledgeDetailed, type RagSearchResult } from "@/lib/hermit/rag";
import { authRepository, createAuthService } from "@/modules/auth";
import {
  createHermitChatService,
  hermitChatRepository,
  type HermitChatParticipant,
} from "@/modules/hermit";
import { createTenantService, tenantRepository } from "@/modules/tenant";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { searchHubForHermit } from "@/modules/knowledge-hub/hermit";

const authService = createAuthService(authRepository);
const tenantService = createTenantService(tenantRepository);
const hermitChatService = createHermitChatService(hermitChatRepository);
const RAG_TOP_K = 3;

/**
 * Extract the last user text from UIMessages for RAG retrieval.
 */
function getLastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  return lastUser.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

function readMessages(value: unknown): UIMessage[] {
  return Array.isArray(value) ? (value as UIMessage[]) : [];
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
  const body = (await req.json()) as { id?: unknown; messages?: unknown };
  const sessionId = readSessionId(body.id);
  const messages = readMessages(body.messages);

  // Extract the latest user message for RAG retrieval
  const query = getLastUserText(messages);
  if (!query.trim()) return Response.json({ error: "请输入问题。" }, { status: 400 });
  const participant = await resolveChatParticipant();

  // RAG: search knowledge base for relevant context
  let ragResult: RagSearchResult | null = null;
  let ragContext = "";
  let heartValues: string | undefined;
  try {
    if (isKnowledgeHubEnabled()) heartValues = (await getKnowledgeHub().get("knowledge-heart-values")).version.markdown;
    ragResult = isKnowledgeHubEnabled()
      ? await searchHubForHermit(query, RAG_TOP_K)
      : await searchKnowledgeDetailed(query, RAG_TOP_K);
    ragContext = ragResult.contextText;
  } catch (err) {
    if (isKnowledgeHubEnabled()) {
      console.warn("[Hermit] Knowledge service unavailable:", err);
      return Response.json({ error: "知识服务暂不可用，请稍后重试。" }, { status: 503 });
    }
    console.warn("[Hermit] RAG search failed, continuing without context:", err);
  }

  const providerSettings = resolveHermitProviderSettings();
  const provider = createHermitProvider(providerSettings);
  const model = readHermitModelName();

  await persistChat("incoming messages", () =>
    hermitChatService.persistIncomingMessages({
      sessionId,
      participant,
      messages,
      modelName: model,
    }),
  );

  const result = streamText({
    model: selectHermitLanguageModel(provider, model, providerSettings.apiMode),
    system: buildSystemPrompt(ragContext, heartValues),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    onFinish: async ({ responseMessage }) => {
      await persistChat("assistant response", () =>
        hermitChatService.persistAssistantResponse({
          sessionId,
          participant,
          responseMessage,
          modelName: model,
          retrieval: {
            query,
            contextText: ragContext,
            topK: RAG_TOP_K,
            sourceSnapshot: ragResult?.sourceSnapshot,
          },
        }),
      );
    },
  });
}
