import { prisma } from "@/infrastructure/db";
import { readSiteAccessConfig } from "@/modules/auth/site-access-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    readSiteAccessConfig();
    // Also verify migration availability, not just database connectivity.
    await prisma.accessRecord.findFirst({ select: { id: true } });
    await prisma.hubVersion.findFirst({ select: { id: true, metadata: true } });
    await prisma.chatSession.findFirst({ select: { id: true, guestId: true } });
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
