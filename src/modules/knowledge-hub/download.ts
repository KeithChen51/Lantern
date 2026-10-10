import JSZip from "jszip";
import type { KnowledgeHub } from "./service";
import { safePackagePath } from "./upload";

export async function knowledgeDownload(resource: Awaited<ReturnType<KnowledgeHub["get"]>>) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (resource.type === "skill" || resource.version.files.length) {
    const zip = new JSZip();
    for (const file of resource.version.files) zip.file(safePackagePath(file.path), file.contentBase64, { base64: true });
    const mainName = resource.type === "skill" ? "SKILL.md" : "document.md";
    if (!zip.file(mainName)) zip.file(mainName, resource.version.markdown);
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Disposition", `attachment; filename="${resource.id}.zip"`);
    return new Response(new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })), { headers });
  }
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.set("Content-Disposition", `attachment; filename="${resource.id}.md"`);
  return new Response(resource.version.markdown, { headers });
}
