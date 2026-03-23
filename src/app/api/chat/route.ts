import { createOpenAI } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { buildSystemPrompt } from "@/lib/hermit/system-prompt";
import { searchKnowledge } from "@/lib/hermit/rag";

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

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  // Extract the latest user message for RAG retrieval
  const query = getLastUserText(messages);

  // RAG: search knowledge base for relevant context
  let ragContext = "";
  try {
    ragContext = await searchKnowledge(query, 3);
  } catch (err) {
    console.warn("[Hermit] RAG search failed, continuing without context:", err);
  }

  const provider = getProvider();
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  const result = streamText({
    model: provider(model),
    system: buildSystemPrompt(ragContext),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
