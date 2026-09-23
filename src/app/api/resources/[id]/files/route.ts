import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { hubHttpError } from "@/modules/knowledge-hub/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isKnowledgeHubEnabled()) return Response.json({ error: "知识服务尚未启用。" }, { status: 503 });
  try {
    const { id } = await context.params, query = new URL(request.url).searchParams;
    const resource = await getKnowledgeHub().get(id, query.get("version") || undefined);
    const file = resource.version.files.find(f => f.path === query.get("path"));
    if (!file) return Response.json({ error: "附件不存在。" }, { status: 404 });
    // Active formats (HTML/SVG/scripts) are downloads, never executable same-origin documents.
    const inline = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mediaType);
    return new Response(Buffer.from(file.contentBase64, "base64"), { headers: { "Content-Type": inline ? file.mediaType : "application/octet-stream", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.path.split("/").at(-1)!)}`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return hubHttpError(error); }
}
