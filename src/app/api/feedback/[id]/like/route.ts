import { setSuggestionLike } from "@/modules/feedback/board-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return setSuggestionLike(request, (await context.params).id); }
