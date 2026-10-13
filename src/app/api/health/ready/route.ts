import { prisma } from "@/infrastructure/db";
import { readAccessConfig } from "@/modules/auth/access-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    readAccessConfig();
    // Also verify migration availability, not just database connectivity.
    await prisma.accessRecord.findFirst({ select: { id: true } });
    await prisma.hubVersion.findFirst({ select: { id: true, metadata: true } });
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
