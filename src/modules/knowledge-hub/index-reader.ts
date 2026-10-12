import type { KnowledgeHub } from "./service";
import { HubError } from "./service";
import type { ResourceType } from "./types";
import { baseFolders } from "./base-folders";
import { z } from "zod";

/**
 * The agent-facing view of the manager's file tree.  The manager is backed by
 * MySQL, while the standalone SQLite store intentionally has no folder tables.
 * Keeping this shape here lets the reader use the real tree when one is
 * available and an explicit logical tree otherwise.
 */
export type KnowledgeIndexListing = {
  folders: Array<{ id: string; name: string; parentId: string | null; deleted: boolean }>;
  resources: Array<{
    id: string;
    name: string;
    folderId: string | null;
    type: string;
    title: string;
    visibility: string;
    archived: boolean;
    publishedVersionId: string | null;
    latestVersionId: string | null;
    updatedAt: string;
  }>;
};

export type KnowledgeIndexBrowse = () => Promise<KnowledgeIndexListing>;
export type KnowledgeIndexHub = Pick<KnowledgeHub, "get" | "search">;

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/);
const resourceContext = z.object({ resourceId: identifier, versionId: identifier }).strict();
export const MAX_KNOWLEDGE_READ_CHARS = 12_000;
export const MAX_KNOWLEDGE_READ_LINES = 120;
export const MAX_SKILL_READ_CHARS = 12_000;
export const MAX_INDEX_SUMMARY_CHARS = 600;
export const MAX_INDEX_SCAN_ITEMS = 5_000;
export const MAX_OUTLINE_SECTIONS = 100;
export const MAX_OUTLINE_FILES = 100;

export const browseInputSchema = z.object({
  folderId: z.string().trim().min(1).max(120).nullable().default(null),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();

export const indexSearchInputSchema = z.object({
  query: z.string().trim().max(500).default(""),
  type: z.enum(["notice", "case", "document", "skill", "tool"]).optional(),
  tag: z.string().trim().min(1).max(80).optional(),
  visibility: z.enum(["public", "internal"]).optional(),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();

export const outlineInputSchema = resourceContext.extend({
  sectionOffset: z.number().int().min(0).max(100_000).default(0),
  sectionLimit: z.number().int().min(1).max(MAX_OUTLINE_SECTIONS).default(MAX_OUTLINE_SECTIONS),
  fileOffset: z.number().int().min(0).max(100_000).default(0),
  fileLimit: z.number().int().min(1).max(MAX_OUTLINE_FILES).default(MAX_OUTLINE_FILES),
}).strict();

const readInputBase = resourceContext.extend({
  offset: z.number().int().min(0).max(2_000_000).optional(),
  startLine: z.number().int().min(1).max(2_000_000).optional(),
  lineCount: z.number().int().min(1).max(120).default(120),
}).strict().superRefine((value, context) => {
  if (value.offset !== undefined && value.startLine !== undefined) {
    context.addIssue({ code: "custom", path: ["offset"], message: "offset 与 startLine 只能选择一个。" });
  }
});
export const readInputSchema = readInputBase;

export const skillFilesInputSchema = resourceContext.extend({
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();
export const skillReadInputSchema = resourceContext.extend({
  path: z.string().min(1).max(240)
    .refine(value => !value.startsWith("/") && !value.includes("\\") && !value.includes(":"), "必须使用 Skill 包内的相对路径。")
    .refine(value => value.split("/").every(part => part && part !== "." && part !== ".." && !/[\u0000-\u001f\u007f]/.test(part)), "文件路径不安全。"),
  offset: z.number().int().min(0).max(2_000_000).default(0),
}).strict();

export type KnowledgeIndexResource = {
  id: string;
  name?: string;
  title: string;
  type: ResourceType;
  summary: string;
  source: string;
  tags: string[];
  visibility: "public" | "internal";
  versionId: string;
  version: number;
  publishedAt: string;
  updatedAt: string;
  validity: string;
  path?: string;
};

export type KnowledgeIndexBrowseResult = {
  mode: "mysql" | "logical";
  folderId: string | null;
  path: string;
  folders: Array<{ id: string; name: string; parentId: string | null; path: string }>;
  resources: KnowledgeIndexResource[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type KnowledgeIndexSearchResult = {
  query: string;
  items: KnowledgeIndexResource[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type KnowledgeIndexOutline = {
  resourceId: string;
  versionId: string;
  title: string;
  type: ResourceType;
  summary: string;
  source: string;
  visibility: "public" | "internal";
  validity: string;
  version: number;
  publishedAt: string | null;
  sections: Array<{ id: string; heading: string; startLine: number; endLine: number }>;
  sectionOffset: number;
  sectionLimit: number;
  sectionsTotal: number;
  sectionsHasMore: boolean;
  files: Array<{ path: string; mediaType: string; checksum: string; size: number; isText: boolean }>;
  fileOffset: number;
  fileLimit: number;
  filesTotal: number;
  filesHasMore: boolean;
};

export type KnowledgeReadResult = KnowledgeIndexOutline & {
  markdown: string;
  offset: number;
  startLine: number;
  endLine: number;
  nextOffset: number | null;
  nextLine: number | null;
  truncated: boolean;
};

export type KnowledgeSkillFile = { path: string; mediaType: string; checksum: string; size: number; isText: boolean };
export type KnowledgeSkillReadResult = KnowledgeSkillFile & {
  resourceId: string;
  versionId: string;
  title: string;
  source: string;
  offset: number;
  text: string;
  nextOffset: number | null;
  truncated: boolean;
};

const logicalFolders: Array<{ id: string; name: string; type: ResourceType }> = [
  { id: "logical:notice", name: "通知与规范", type: "notice" },
  { id: "logical:case", name: "参悟案例", type: "case" },
  { id: "logical:document", name: "知识文档", type: "document" },
  { id: "logical:skill", name: "Skill", type: "skill" },
  { id: "logical:tool", name: "工具", type: "tool" },
];

const textMediaTypes = new Set([
  "application/ecmascript", "application/javascript", "application/json", "application/ld+json",
  "application/sql", "application/typescript", "application/xml", "application/yaml", "application/x-yaml",
]);
const textExtensions = new Set([
  "c", "cc", "css", "csv", "h", "html", "ini", "js", "json", "jsx", "md", "mjs", "mts", "py",
  "sh", "sql", "svg", "toml", "ts", "tsx", "txt", "xml", "yaml", "yml",
]);

function isTextFile(mediaType: string, path: string) {
  if (mediaType.toLowerCase().startsWith("text/")) return true;
  if (textMediaTypes.has(mediaType.toLowerCase())) return true;
  return textExtensions.has(path.split(".").at(-1)?.toLowerCase() ?? "");
}

function decodeSize(contentBase64: string) {
  return Buffer.from(contentBase64, "base64").byteLength;
}

function resourceMetadata(resource: Awaited<ReturnType<KnowledgeHub["get"]>>, extra: Partial<KnowledgeIndexResource> = {}): KnowledgeIndexResource {
  return {
    id: resource.id,
    title: resource.title,
    type: resource.type,
    summary: resource.summary,
    source: resource.source,
    tags: resource.tags,
    visibility: resource.visibility,
    versionId: resource.version.id,
    version: resource.version.number,
    publishedAt: resource.version.publishedAt ?? "",
    updatedAt: resource.updatedAt,
    validity: resource.validity,
    ...extra,
  };
}

function folderPath(id: string | null, folders: Map<string, KnowledgeIndexListing["folders"][number]>) {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = id;
  while (current) {
    if (seen.has(current)) throw new HubError("invalid", "知识目录存在循环，无法读取。" );
    seen.add(current);
    const folder = folders.get(current);
    if (!folder) throw new HubError("not_found", `文件夹不存在：${current}`);
    names.unshift(folder.name);
    current = folder.parentId;
  }
  return names.join("/");
}

function paged<T>(items: T[], offset: number, limit: number) {
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit, hasMore: offset + limit < items.length };
}

function endLineForText(startLine: number, text: string) {
  if (!text) return startLine;
  const newlineCount = text.split("\n").length - 1;
  return startLine + newlineCount - (text.endsWith("\n") ? 1 : 0);
}

function compactMetadata<T extends { summary: string; source: string; tags: string[] }>(item: T) {
  return { ...item, summary: item.summary.slice(0, MAX_INDEX_SUMMARY_CHARS), source: item.source.slice(0, 400), tags: item.tags.slice(0, 20) };
}

function metadataOnly<T extends { summary: string; source: string; tags: string[]; excerpt?: unknown; citation?: unknown }>(item: T) {
  const { excerpt: _excerpt, citation: _citation, ...metadata } = item;
  void _excerpt; void _citation;
  return compactMetadata(metadata);
}

/**
 * Reads the published knowledge index progressively.  It never returns
 * excerpts from search or outline calls.  Full Markdown and Skill files are
 * available only through the bounded read methods below.
 */
export class KnowledgeIndexReader {
  constructor(private readonly hub: KnowledgeIndexHub, private readonly browseAdapter?: KnowledgeIndexBrowse) {}

  private async collectSearchPages(input: { query: string; type?: ResourceType; sort: "relevance" | "published" | "updated" }) {
    type Item = Awaited<ReturnType<KnowledgeHub["search"]>>["items"][number];
    const items: Item[] = [];
    let offset = 0;
    let total = 0;
    let complete = true;
    while (items.length < MAX_INDEX_SCAN_ITEMS) {
      const page = await this.hub.search({ ...input, offset, limit: 100 });
      total = page.total;
      items.push(...page.items);
      if (!page.items.length || items.length >= page.total || page.items.length < 100) break;
      offset += page.items.length;
    }
    if (items.length < total) complete = false;
    return { items, total, complete };
  }

  async search(raw: unknown = {}): Promise<KnowledgeIndexSearchResult> {
    const input = indexSearchInputSchema.parse(raw);
    const filtered = input.tag !== undefined || input.visibility !== undefined;
    const result = filtered
      ? await this.collectSearchPages({ query: input.query, type: input.type, sort: "relevance" })
      : { ...(await this.hub.search({ query: input.query, type: input.type, offset: input.offset, limit: input.limit, sort: "relevance" })), complete: true };
    const matched = filtered ? result.items.filter(item => (!input.tag || item.tags.some(tag => tag.toLocaleLowerCase() === input.tag!.toLocaleLowerCase())) && (!input.visibility || item.visibility === input.visibility)) : result.items;
    const items = filtered ? matched.slice(input.offset, input.offset + input.limit) : matched;
    return {
      query: input.query,
      items: items.map(item => metadataOnly(item)),
      total: filtered ? (result.complete ? matched.length : Math.max(matched.length, result.total)) : result.total,
      offset: input.offset,
      limit: input.limit,
      hasMore: input.offset + input.limit < (filtered ? (result.complete ? matched.length : Math.max(matched.length, result.total)) : result.total) || (filtered && !result.complete),
    };
  }

  async browse(raw: unknown = {}): Promise<KnowledgeIndexBrowseResult> {
    const input = browseInputSchema.parse(raw);
    if (!this.browseAdapter) return this.browseLogical(input);
    const listing = await this.browseAdapter();
    const published = await this.collectSearchPages({ query: "", sort: "updated" });
    const publishedById = new Map(published.items.map(item => [`${item.id}:${item.versionId}`, item]));
    const folders = listing.folders.filter(folder => !folder.deleted);
    const folderMap = new Map(folders.map(folder => [folder.id, folder]));
    if (input.folderId && !folderMap.has(input.folderId)) throw new HubError("not_found", `文件夹不存在：${input.folderId}`);
    const listedResources = listing.resources.filter(resource => !resource.archived && !!resource.publishedVersionId && publishedById.has(`${resource.id}:${resource.publishedVersionId}`));
    // The four managed base folders are part of the public root contract even
    // when they are empty. Other folders remain visible only through a current
    // published resource, so draft/archive-only names cannot leak here.
    const canonicalNames = new Set(baseFolders.map(folder => folder.name));
    const canonicalRootIds = folders
      .filter(folder => folder.parentId === null && canonicalNames.has(folder.name))
      .map(folder => folder.id);
    const visibleFolderIds = new Set<string>([...baseFolders.map(folder => folder.id), ...canonicalRootIds]);
    for (const resource of listedResources) {
      let current = resource.folderId;
      while (current) {
        if (visibleFolderIds.has(current)) break;
        visibleFolderIds.add(current);
        current = folderMap.get(current)?.parentId ?? null;
      }
    }
    if (input.folderId && !visibleFolderIds.has(input.folderId)) throw new HubError("not_found", `文件夹不存在：${input.folderId}`);
    const activeFolder = (id: string | null) => {
      if (!id) return true;
      const seen = new Set<string>();
      let current: string | null = id;
      while (current) {
        if (seen.has(current)) throw new HubError("invalid", "知识目录存在循环，无法读取。" );
        seen.add(current);
        const folder = folderMap.get(current);
        if (!folder || folder.deleted) return false;
        current = folder.parentId;
      }
      return true;
    };
    const childFolders = folders.filter(folder => folder.parentId === input.folderId && visibleFolderIds.has(folder.id)).map(folder => ({ ...folder, path: folderPath(folder.id, folderMap) }));
    const resources = listedResources.filter(resource => (resource.folderId ?? null) === input.folderId && activeFolder(resource.folderId)).map(resource => {
      const metadata = publishedById.get(`${resource.id}:${resource.publishedVersionId!}`)!;
      return { ...metadataOnly(metadata), name: resource.name, path: [folderPath(resource.folderId, folderMap), resource.name].filter(Boolean).join("/") };
    });
    const page = paged([...childFolders, ...resources] as Array<typeof childFolders[number] | typeof resources[number]>, input.offset, input.limit);
    return {
      mode: "mysql",
      folderId: input.folderId,
      path: folderPath(input.folderId, folderMap),
      folders: page.items.filter((item): item is typeof childFolders[number] => "parentId" in item),
      resources: page.items.filter((item): item is typeof resources[number] => "versionId" in item),
      total: page.total,
      offset: page.offset,
      limit: page.limit,
      hasMore: page.hasMore,
    };
  }

  private async browseLogical(input: z.infer<typeof browseInputSchema>): Promise<KnowledgeIndexBrowseResult> {
    const logical = new Map(logicalFolders.map(folder => [folder.id, folder]));
    if (!input.folderId) {
      const page = paged(logicalFolders.map(folder => ({ id: folder.id, name: folder.name, parentId: null, path: folder.name })), input.offset, input.limit);
      return { mode: "logical", folderId: null, path: "", folders: page.items, resources: [], total: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore };
    }
    const target = logical.get(input.folderId);
    if (!target) throw new HubError("not_found", `逻辑文件夹不存在：${input.folderId}`);
    const result = await this.hub.search({ query: "", type: target.type, offset: input.offset, limit: input.limit, sort: "updated" });
    const resources = result.items.map(item => {
      return { ...metadataOnly(item), path: `${target.name}/${item.title}` };
    });
    return {
      mode: "logical",
      folderId: target.id,
      path: target.name,
      folders: [],
      resources,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.offset + result.items.length < result.total,
    };
  }

  async outline(raw: unknown): Promise<KnowledgeIndexOutline> {
    const input = outlineInputSchema.parse(raw);
    const resource = await this.hub.get(input.resourceId, input.versionId);
    return this.outlineResource(resource, input);
  }

  private outlineResource(
    resource: Awaited<ReturnType<KnowledgeHub["get"]>>,
    window: { sectionOffset: number; sectionLimit: number; fileOffset: number; fileLimit: number } = {
      sectionOffset: 0,
      sectionLimit: MAX_OUTLINE_SECTIONS,
      fileOffset: 0,
      fileLimit: MAX_OUTLINE_FILES,
    },
  ): KnowledgeIndexOutline {
    const sections = resource.version.citations.map(({ id, heading, startLine, endLine }) => ({ id, heading, startLine, endLine }));
    const files = resource.version.files.map(file => ({ path: file.path, mediaType: file.mediaType, checksum: file.checksum, size: decodeSize(file.contentBase64), isText: isTextFile(file.mediaType, file.path) }));
    const sectionPage = paged(sections, window.sectionOffset, window.sectionLimit);
    const filePage = paged(files, window.fileOffset, window.fileLimit);
    return {
      ...resourceMetadata(resource),
      resourceId: resource.id,
      publishedAt: resource.version.publishedAt,
      sections: sectionPage.items,
      sectionOffset: sectionPage.offset,
      sectionLimit: sectionPage.limit,
      sectionsTotal: sectionPage.total,
      sectionsHasMore: sectionPage.hasMore,
      files: filePage.items,
      fileOffset: filePage.offset,
      fileLimit: filePage.limit,
      filesTotal: filePage.total,
      filesHasMore: filePage.hasMore,
    };
  }

  async read(raw: unknown): Promise<KnowledgeReadResult> {
    const input = readInputSchema.parse(raw);
    const resource = await this.hub.get(input.resourceId, input.versionId);
    const markdown = resource.version.markdown;
    const lines = markdown.split("\n");
    const lineCount = Math.min(input.lineCount, MAX_KNOWLEDGE_READ_LINES);
    let offset = input.offset ?? 0;
    let startLine = input.startLine ?? (offset === 0 ? 1 : markdown.slice(0, offset).split("\n").length);
    let text: string;
    let endLine: number;
    let nextOffset: number | null = null;
    let nextLine: number | null = null;
    if (input.startLine !== undefined) {
      const startIndex = Math.min(input.startLine - 1, lines.length);
      const fullBlock = lines.slice(startIndex, startIndex + lineCount).join("\n");
      text = fullBlock.slice(0, MAX_KNOWLEDGE_READ_CHARS);
      startLine = input.startLine;
      offset = startIndex >= lines.length ? markdown.length : lines.slice(0, startIndex).join("\n").length + (startIndex > 0 ? 1 : 0);
      if (text.length < fullBlock.length) {
        endLine = endLineForText(startLine, text);
        nextOffset = offset + text.length < markdown.length ? offset + text.length : null;
      } else {
        endLine = Math.min(lines.length, startIndex + lineCount);
        if (endLine < lines.length) nextLine = endLine + 1;
      }
    } else {
      offset = Math.min(offset, markdown.length);
      const rawText = markdown.slice(offset, offset + MAX_KNOWLEDGE_READ_CHARS);
      const rawLines = rawText.split("\n");
      text = rawLines.slice(0, lineCount).join("\n");
      // An offset may point at the newline separating two lines. Returning an
      // empty string would repeat the same offset forever, so consume that
      // separator and let the next offset continue with the next line.
      if (!text && rawText.length) text = rawText.slice(0, 1);
      startLine = offset === 0 ? 1 : markdown.slice(0, offset).split("\n").length;
      endLine = endLineForText(startLine, text);
      if (offset + text.length < markdown.length) nextOffset = offset + text.length;
    }
    const truncated = (nextOffset !== null || nextLine !== null);
    const citations = resource.version.citations;
    const outline = this.outlineResource(resource, { sectionOffset: 0, sectionLimit: MAX_OUTLINE_SECTIONS, fileOffset: 0, fileLimit: 0 });
    const relevantSections = citations
      .filter(citation => citation.endLine >= startLine && citation.startLine <= endLine)
      .map(({ id, heading, startLine: citationStart, endLine: citationEnd }) => ({ id, heading, startLine: citationStart, endLine: citationEnd }));
    return {
      ...outline,
      markdown: text,
      offset,
      startLine,
      endLine,
      nextOffset,
      nextLine,
      truncated,
      sections: relevantSections.slice(0, MAX_OUTLINE_SECTIONS),
      sectionOffset: 0,
      sectionLimit: MAX_OUTLINE_SECTIONS,
      sectionsTotal: relevantSections.length,
      sectionsHasMore: relevantSections.length > MAX_OUTLINE_SECTIONS,
    };
  }

  async skillFiles(raw: unknown): Promise<{ resourceId: string; versionId: string; title: string; source: string; files: KnowledgeSkillFile[]; offset: number; limit: number; total: number; hasMore: boolean }> {
    const input = skillFilesInputSchema.parse(raw);
    const resource = await this.hub.get(input.resourceId, input.versionId);
    if (resource.type !== "skill") throw new HubError("invalid", "只有 Skill 资源可以读取包内文件。" );
    const files = resource.version.files.map(file => ({ path: file.path, mediaType: file.mediaType, checksum: file.checksum, size: decodeSize(file.contentBase64), isText: isTextFile(file.mediaType, file.path) }));
    const page = paged(files, input.offset, input.limit);
    return {
      resourceId: resource.id,
      versionId: resource.version.id,
      title: resource.title,
      source: resource.source,
      files: page.items,
      offset: page.offset,
      limit: page.limit,
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  async skillRead(raw: unknown): Promise<KnowledgeSkillReadResult> {
    const input = skillReadInputSchema.parse(raw);
    const resource = await this.hub.get(input.resourceId, input.versionId);
    if (resource.type !== "skill") throw new HubError("invalid", "只有 Skill 资源可以读取包内文件。" );
    const file = resource.version.files.find(candidate => candidate.path === input.path);
    if (!file) throw new HubError("not_found", `Skill 文件不存在：${input.path}`);
    const textFile = isTextFile(file.mediaType, file.path);
    if (!textFile) throw new HubError("invalid", "为避免执行或泄露二进制内容，只能读取 Skill 中的文本文件。" );
    const text = Buffer.from(file.contentBase64, "base64").toString("utf8");
    const value = text.slice(input.offset, input.offset + MAX_SKILL_READ_CHARS);
    return {
      resourceId: resource.id,
      versionId: resource.version.id,
      title: resource.title,
      source: resource.source,
      path: file.path,
      mediaType: file.mediaType,
      checksum: file.checksum,
      size: Buffer.byteLength(text),
      isText: true,
      offset: input.offset,
      text: value,
      nextOffset: input.offset + value.length < text.length ? input.offset + value.length : null,
      truncated: input.offset + value.length < text.length,
    };
  }
}

export function createKnowledgeIndexReader(hub: KnowledgeIndexHub, browseAdapter?: KnowledgeIndexBrowse) {
  return new KnowledgeIndexReader(hub, browseAdapter);
}

/**
 * Use the manager's real MySQL folder tree when the application runs with the
 * MySQL driver.  Standalone SQLite has no manager tables, so leaving the
 * adapter undefined deliberately selects the logical type folders above.
 */
export function createRuntimeKnowledgeIndexReader(hub: KnowledgeIndexHub, overrideBrowseAdapter?: KnowledgeIndexBrowse) {
  const driver = process.env.KNOWLEDGE_HUB_DRIVER || "mysql";
  const browseAdapter = overrideBrowseAdapter ?? (driver === "sqlite" ? undefined : async () => {
    const { createKnowledgeManager } = await import("./manager");
    return createKnowledgeManager().list();
  });
  return createKnowledgeIndexReader(hub, browseAdapter);
}
