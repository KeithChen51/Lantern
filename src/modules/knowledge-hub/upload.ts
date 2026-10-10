import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { parseDocument } from "yaml";
import { HubError, importSchema } from "./service";
import type { ResourceType } from "./types";

export const MAX_UPLOAD_BYTES = 12_000_000;
export type UploadEntry = { path: string; bytes: Uint8Array };
const excludedDirectories = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".cache", ".venv", "venv", "__macosx", ".aws", ".ssh", ".azure"]);
export function safePackagePath(value: string) {
  if (!value || value.length > 240 || /[\\:\x00-\x1f]/.test(value) || value.split("/").some(p => !p || p === "." || p === "..")) {
    throw new HubError("invalid", "文件路径不合法，请保留包内相对路径。");
  }
  return value;
}
export function excludedPath(path: string) {
  const parts = path.toLowerCase().split("/");
  const name = parts.at(-1)!;
  return parts.some(p => excludedDirectories.has(p)) || /^\.env(?:\.|$)/.test(name)
    || /^(?:credentials?|secrets?|tokens?)(?:\.(?:json|ya?ml|toml|ini|conf)|$)/.test(name)
    || /\.(?:pem|key|p12|pfx|keystore|pyc)$/i.test(name)
    || /^(?:id_rsa|id_ed25519|\.npmrc|\.pypirc|\.ds_store|thumbs\.db)$/.test(name);
}
function decode(bytes: Uint8Array) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"); }
  catch { throw new HubError("invalid", "Markdown 必须使用 UTF-8 编码。"); }
}
export async function readSkillZip(bytes: Uint8Array) {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new HubError("invalid", "ZIP 超过 12 MB。");
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); }
  catch { throw new HubError("invalid", "ZIP 无法读取，请使用未加密的普通 ZIP 文件。"); }
  const entries = Object.values(zip.files);
  if (entries.length > 500) throw new HubError("invalid", "ZIP 条目过多，请先移除依赖和缓存。");
  const result: UploadEntry[] = [], excluded: string[] = [];
  let total = 0;
  for (const entry of entries) {
    const original = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
    safePackagePath(original.replace(/\/$/, ""));
    const permissions = typeof entry.unixPermissions === "string" ? parseInt(entry.unixPermissions, 8) : entry.unixPermissions ?? 0;
    if ((permissions & 0o170000) === 0o120000) throw new HubError("invalid", "Skill 包不能包含符号链接。");
    if (entry.dir) continue;
    if (excludedPath(original)) { excluded.push(original); continue; }
    if (result.length >= 50) throw new HubError("invalid", "一个 Skill 最多包含 50 个文件。");
    const chunks: Buffer[] = [];
    // Stream inflation so a small compressed archive cannot allocate unbounded output.
    for await (const chunk of new Readable().wrap(entry.nodeStream())) {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) throw new HubError("invalid", "Skill 解压后超过 12 MB。");
      chunks.push(chunk);
    }
    result.push({ path: original, bytes: Buffer.concat(chunks) });
  }
  return { entries: result, excluded };
}
function metadata(text: string) {
  if (!text.startsWith("---\n")) return { data: {} as Record<string, unknown>, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new HubError("invalid", "Markdown 的 YAML 元信息缺少结束分隔符。");
  const yaml = parseDocument(text.slice(4, end), { uniqueKeys: true });
  if (yaml.errors.length) throw new HubError("invalid", "Markdown 的 YAML 元信息格式有误。");
  let data: unknown;
  try { data = yaml.toJS({ maxAliasCount: 20 }); } catch { throw new HubError("invalid", "YAML 别名过多。"); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HubError("invalid", "YAML 元信息必须是字段对象。");
  return { data: data as Record<string, unknown>, body: text.slice(end + 5) };
}
export function markdownInput(entry: UploadEntry, type: ResourceType) {
  safePackagePath(entry.path);
  if (!/\.md$/i.test(entry.path)) throw new HubError("invalid", "普通知识资料仅支持 Markdown（.md）。");
  if (entry.bytes.length > MAX_UPLOAD_BYTES) throw new HubError("invalid", "文件超过 12 MB。");
  const { data, body } = metadata(decode(entry.bytes));
  if (data.type && data.type !== type) throw new HubError("invalid", "文档类型与上传选择不一致，请核对后重试。");
  // Browser uploads cannot select another resource by supplying an ID in frontmatter.
  // Replacements are resolved by the manager using the visible folder/name conflict.
  return importSchema.parse({
    id: randomUUID(), type, markdown: body,
    title: data.title ?? body.match(/^#\s+(.+)$/m)?.[1] ?? entry.path.split("/").at(-1)!.replace(/\.md$/i, ""),
    summary: data.summary ?? "", tags: data.tags ?? [], source: data.source ?? entry.path,
    businessScope: data.businessScope ?? "", changeNote: data.changeNote ?? "",
    validity: data.validity ?? "unknown", effectiveFrom: data.effectiveFrom ?? null, effectiveTo: data.effectiveTo ?? null,
  });
}
function mediaType(path: string) {
  const ext = path.split(".").at(-1)?.toLowerCase();
  return ({ md: "text/markdown", txt: "text/plain", json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}
export function skillInput(input: UploadEntry[], packageName: string) {
  if (!input.length) throw new HubError("invalid", "Skill 包为空。");
  const excluded: string[] = [];
  let entries = input.filter(entry => {
    safePackagePath(entry.path);
    if (excludedPath(entry.path)) { excluded.push(entry.path); return false; }
    return true;
  });
  if (entries.length > 50 || entries.reduce((sum, entry) => sum + entry.bytes.length, 0) > MAX_UPLOAD_BYTES) throw new HubError("invalid", "Skill 最多 50 个文件，合计不超过 12 MB。");
  // Strip exactly one wrapper folder, preserving all paths within the Skill.
  const prefix = entries[0]?.path.split("/")[0];
  if (prefix && entries.every(entry => entry.path.startsWith(`${prefix}/`))) entries = entries.map(entry => ({ ...entry, path: entry.path.slice(prefix.length + 1) }));
  if (new Set(entries.map(e => e.path.toLowerCase())).size !== entries.length) throw new HubError("invalid", "Skill 包内包含重复文件路径。");
  const main = entries.find(entry => entry.path === "SKILL.md");
  if (!main) throw new HubError("invalid", "Skill 根目录必须包含 SKILL.md（可放在 ZIP 的单个外层文件夹内）。");
  const text = decode(main.bytes);
  const { data, body } = metadata(text);
  const files = entries.map(entry => {
    const content = Buffer.from(entry.bytes);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content.toString("utf8"))) throw new HubError("invalid", `文件含私钥，未导入：${entry.path}`);
    return { path: entry.path, mediaType: mediaType(entry.path), contentBase64: content.toString("base64") };
  });
  const request = importSchema.parse({ id: randomUUID(), type: "skill", title: data.title ?? data.name ?? body.match(/^#\s+(.+)$/m)?.[1] ?? packageName, summary: data.description ?? data.summary ?? "", markdown: body, source: packageName, files });
  return { request, excluded };
}
