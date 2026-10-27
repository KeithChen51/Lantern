import { assertWebMutation, authErrorResponse, requireEmployee } from "@/modules/auth/access";
import { readWatermarkConfig, WatermarkError } from "@/modules/watermark/config";
import { requestWebWatermark } from "@/modules/watermark/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

export async function POST(request: Request): Promise<Response> {
  let principal;
  try {
    principal = await requireEmployee(request);
    assertWebMutation(request, principal);
  } catch (error) { return authErrorResponse(error); }
  try {
    if (principal.kind === "guest" || !principal.account || principal.expiresAt <= Date.now()) throw new WatermarkError("watermark_unavailable", 503);
    const config = readWatermarkConfig();
    // Deliberately ignore the request body: identity, type, template and target
    // URL come only from the authenticated session / server configuration.
    const data = await requestWebWatermark(config, principal.account, request.signal);
    if (principal.expiresAt <= Date.now() || request.signal.aborted) throw new WatermarkError("watermark_unavailable", 503);
    return Response.json({ data, owner: { userId: principal.userId, account: principal.account }, expiresAt: principal.expiresAt }, { headers });
  } catch (error) {
    const safe = error instanceof WatermarkError ? error : new WatermarkError("watermark_unavailable", 503);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status, headers });
  }
}
