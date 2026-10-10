import JSZip from "jszip";
import { requireAdminPortalFromHeaders, adminJsonError } from "../../../../_admin";
import { getKnowledgeHub } from "@/modules/knowledge-hub/runtime";
import { createKnowledgeManager, knowledgeManagerErrorResponse } from "@/modules/knowledge-hub/manager";
import { safePackagePath } from "@/modules/knowledge-hub/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdminPortalFromHeaders(request.headers);
    const { id } = await context.params;
    const versionId = new URL(request.url).searchParams.get("version") || await createKnowledgeManager().latestVersionId(id);
    if (!versionId) return Response.json({ error: "资源没有可下载的版本。" }, { status: 404 });
    const resource = await getKnowledgeHub().get(id, versionId, true);
    const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    if (resource.type === "skill" || resource.version.files.length) {
      const zip = new JSZip();
      for (const file of resource.version.files) zip.file(safePackagePath(file.path), file.contentBase64, { base64: true });
      const mainName = resource.type === "skill" ? "SKILL.md" : "document.md";
      if (!zip.file(mainName)) zip.file(mainName, resource.version.markdown);
      headers.set("Content-Type", "application/zip");
      headers.set("Content-Disposition", `attachment; filename="${id}.zip"`);
      return new Response(new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })), { headers });
    }
    headers.set("Content-Type", "text/markdown; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="${id}.md"`);
    return new Response(resource.version.markdown, { headers });
  } catch (error) { return knowledgeManagerErrorResponse(error) ?? adminJsonError(error); }
}
