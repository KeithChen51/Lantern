import { clientResourceGet } from "@/modules/knowledge-hub/client-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return clientResourceGet(request, "browse");
}
