import { getSuggestion, updateSuggestion } from "@/modules/feedback/board-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return getSuggestion(request, (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return updateSuggestion(request, (await context.params).id); }
