import { createOpenAI } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { headers } from "next/headers";
import { buildSystemPrompt } from "@/lib/hermit/system-prompt";
import { searchKnowledge } from "@/lib/hermit/rag";
import { authRepository, createAuthService } from "@/modules/auth";
import {
  createHermitChatService,
  hermitChatRepository,
  type HermitChatParticipant,
} from "@/modules/hermit";
import { createTenantService, tenantRepository } from "@/modules/tenant";

const authService = createAuthService(authRepository);
const tenantService = createTenantService(tenantRepository);
const hermitChatService = createHermitChatService(hermitChatRepository);
const RAG_TOP_K = 3;

/**
 * Create an OpenAI-compatible provider with configurable baseURL.
 */
function getProvider() {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
}

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
  const participant = await resolveChatParticipant();

  // RAG: search knowledge base for relevant context
  let ragContext = "";
  try {
    ragContext = await searchKnowledge(query, RAG_TOP_K);
  } catch (err) {
    console.warn("[Hermit] RAG search failed, continuing without context:", err);
  }

  const provider = getProvider();
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  await persistChat("incoming messages", () =>
    hermitChatService.persistIncomingMessages({
      sessionId,
      participant,
      messages,
      modelName: model,
    }),
  );

  const result = streamText({
    model: provider(model),
    system: buildSystemPrompt(ragContext),
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
          },
        }),
      );
    },
  });
}
