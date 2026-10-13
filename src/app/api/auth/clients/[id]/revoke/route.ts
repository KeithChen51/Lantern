import { revokeClient } from "@/modules/auth/access-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return revokeClient(request, (await context.params).id);
}
