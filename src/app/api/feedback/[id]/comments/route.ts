import { createSuggestionComment, listSuggestionComments } from "@/modules/feedback/board-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return listSuggestionComments(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return createSuggestionComment(request, (await context.params).id); }
