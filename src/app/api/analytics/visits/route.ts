import { equalSecret } from "@/modules/auth/access-crypto";
import { assertWebMutation, authErrorResponse, requireSiteVisitor } from "@/modules/auth/access";
import { AccessError } from "@/modules/auth/access-types";
import { visitCoverageStart } from "@/modules/analytics/policy";
import { captureVisit, parseVisitInput } from "@/modules/analytics/visit-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

async function boundedBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json" || !request.body ||
      Number(request.headers.get("content-length") ?? 0) > 1024) throw new AccessError("访问记录格式无效。", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024) throw new AccessError("访问记录过大。", 400);
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AccessError) throw error;
    throw new AccessError("访问记录格式无效。", 400);
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  if (!visitCoverageStart()) return new Response(null, { status: 204, headers: HEADERS });
  try {
    const principal = await requireSiteVisitor(request);
    assertWebMutation(request, principal);
    const input = parseVisitInput(await boundedBody(request));
    // This additional binding rejects a stale page after the browser cookie has
    // switched identity, even if a transport refreshes the header automatically.
    if (!principal.csrfToken || !equalSecret(input.csrfToken, principal.csrfToken)) throw new AccessError("访问记录所属会话已更新。", 403);
    await captureVisit(principal, input);
    return new Response(null, { status: 204, headers: HEADERS });
  } catch (error) { return authErrorResponse(error); }
}
