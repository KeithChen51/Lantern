import { z } from "zod";
import { requireAdminPortalFromHeaders, adminJsonError } from "../../../_admin";
import { AppError } from "@/shared/errors";
import { HubError } from "@/modules/knowledge-hub/service";
import { importManagedResource } from "@/modules/knowledge-hub/manager";
import { MAX_UPLOAD_BYTES, markdownInput, readSkillZip, skillInput, type UploadEntry } from "@/modules/knowledge-hub/upload";
import { resourceTypes } from "@/modules/knowledge-hub/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof HubError) return { error: error.message, code: error.code };
  if (error instanceof z.ZodError) return { error: "资料字段不符合要求：" + error.issues.map(i => `${i.path.join(".")} ${i.message}`).join("；"), code: "invalid" };
  console.error("[Knowledge upload] Import failed", error instanceof Error ? error.name : "Unknown error");
  return { error: "导入失败，请检查数据库状态后重试。", code: "unavailable" };
}
async function limitedForm(request: Request) {
  const limit = MAX_UPLOAD_BYTES + 1_000_000;
  if (Number(request.headers.get("content-length")) > limit) throw new HubError("invalid", "上传合计超过 12 MB。");
  const reader = request.body?.getReader();
  if (!reader) throw new HubError("invalid", "没有上传内容。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new HubError("invalid", "上传合计超过 12 MB。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw new HubError("invalid", "上传格式无效，请重新选择文件。"); }
}
export async function POST(request: Request) {
  try {
    requireAdminPortalFromHeaders(request.headers);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AppError("forbidden", "不接受跨站上传。", 403);
    const form = await limitedForm(request);
    const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
    if (!files.length || files.length > 100) throw new HubError("invalid", "请选择 1–100 个文件。");
    if (files.reduce((sum, f) => sum + f.size, 0) > MAX_UPLOAD_BYTES) throw new HubError("invalid", "上传合计超过 12 MB。");
    const type = z.enum(resourceTypes).parse(form.get("type") || "document");
    const conflict = z.enum(["ask", "overwrite", "rename", "skip"]).parse(form.get("conflict") || "ask");
    const folderId = z.string().max(120).nullable().parse(form.get("folderId") || null);
    let paths: string[] = files.map(f => f.name);
    if (form.get("paths")) {
      try { paths = z.array(z.string()).length(files.length).parse(JSON.parse(String(form.get("paths")))); }
      catch { throw new HubError("invalid", "上传文件路径与文件数量不一致。"); }
    }
    const entries: UploadEntry[] = await Promise.all(files.map(async (file, i) => ({ path: paths[i], bytes: new Uint8Array(await file.arrayBuffer()) })));
    if (type === "skill") {
      const isZip = files.length === 1 && /\.zip$/i.test(files[0].name);
      const unpacked = isZip ? await readSkillZip(entries[0].bytes) : { entries, excluded: [] as string[] };
      const name = isZip ? files[0].name.replace(/\.zip$/i, "") : paths[0].includes("/") ? paths[0].split("/")[0] : "Skill";
      const { request: input, excluded } = skillInput(unpacked.entries, name);
      try {
        const result = await importManagedResource(input, folderId, name, conflict);
        return Response.json({ results: [result], excluded: [...unpacked.excluded, ...excluded] });
      } catch (error) { return Response.json({ results: [{ name, ...failure(error) }] }); }
    }
    const results = [];
    for (const entry of entries) {
      const name = entry.path.split("/").at(-1)!;
      try { results.push({ ...await importManagedResource(markdownInput(entry, type), folderId, name, conflict), path: entry.path }); }
      catch (error) { results.push({ name, path: entry.path, ...failure(error) }); }
    }
    return Response.json({ results });
  } catch (error) {
    if (error instanceof HubError || error instanceof z.ZodError) return Response.json(failure(error), { status: 400 });
    return adminJsonError(error);
  }
}
