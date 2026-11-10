import { getHermitConversation } from "@/modules/hermit/history-api";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return getHermitConversation(request, (await context.params).id);
}
