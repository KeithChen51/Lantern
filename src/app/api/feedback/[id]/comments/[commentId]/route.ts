import { hideSuggestionComment } from "@/modules/feedback/board-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await context.params;
  return hideSuggestionComment(request, id, commentId);
}
