import type { KnowledgeHub } from "./service";
import { HubError } from "./service";
import type { ResourceType } from "./types";
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

export const outlineInputSchema = resourceContext;

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

export const skillFilesInputSchema = resourceContext;
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
  files: Array<{ path: string; mediaType: string; checksum: string; size: number; isText: boolean }>;
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

export const MAX_KNOWLEDGE_READ_CHARS = 12_000;
export const MAX_KNOWLEDGE_READ_LINES = 120;
export const MAX_SKILL_READ_CHARS = 12_000;
export const MAX_INDEX_SUMMARY_CHARS = 600;

const logicalFolders: Array<{ id: string; name: string; type: ResourceType }> = [
  { id: "logical:notice", name: "白皮书", type: "notice" },
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

function compactMetadata<T extends { summary: string; source: string; tags: string[] }>(item: T) {
  return { ...item, summary: item.summary.slice(0, MAX_INDEX_SUMMARY_CHARS), source: item.source.slice(0, 400), tags: item.tags.slice(0, 20) };
}

/**
 * Reads the published knowledge index progressively.  It never returns
 * excerpts from search or outline calls.  Full Markdown and Skill files are
 * available only through the bounded read methods below.
 */
export class KnowledgeIndexReader {
  constructor(private readonly hub: KnowledgeIndexHub, private readonly browseAdapter?: KnowledgeIndexBrowse) {}

  async search(raw: unknown = {}): Promise<KnowledgeIndexSearchResult> {
    const input = indexSearchInputSchema.parse(raw);
    const filtered = input.tag !== undefined || input.visibility !== undefined;
    const result = await this.hub.search({ query: input.query, type: input.type, offset: filtered ? 0 : input.offset, limit: filtered ? 100 : input.limit, sort: "relevance" });
    const matched = filtered ? result.items.filter(item => (!input.tag || item.tags.some(tag => tag.toLocaleLowerCase() === input.tag!.toLocaleLowerCase())) && (!input.visibility || item.visibility === input.visibility)) : result.items;
    const items = filtered ? matched.slice(input.offset, input.offset + input.limit) : matched;
    return {
      query: input.query,
      items: items.map(item => {
        const { excerpt: _excerpt, citation: _citation, ...metadata } = item;
        void _excerpt; void _citation;
        return compactMetadata(metadata);
      }),
      total: filtered ? matched.length : result.total,
      offset: input.offset,
      limit: input.limit,
      hasMore: input.offset + input.limit < (filtered ? matched.length : result.total),
    };
  }

  async browse(raw: unknown = {}): Promise<KnowledgeIndexBrowseResult> {
    const input = browseInputSchema.parse(raw);
    if (!this.browseAdapter) return this.browseLogical(input);
    const listing = await this.browseAdapter();
    const folders = listing.folders.filter(folder => !folder.deleted);
    const folderMap = new Map(folders.map(folder => [folder.id, folder]));
    if (input.folderId && !folderMap.has(input.folderId)) throw new HubError("not_found", `文件夹不存在：${input.folderId}`);
    const listedResources = listing.resources.filter(resource => !resource.archived && !!resource.publishedVersionId);
    const visibleFolderIds = new Set<string>();
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
    const resources = listedResources.filter(resource => (resource.folderId ?? null) === input.folderId && activeFolder(resource.folderId)).map(resource => ({
      id: resource.id,
      name: resource.name,
      title: resource.title,
      type: resource.type as ResourceType,
      summary: "",
      source: "灯塔知识中台",
      tags: [],
      visibility: resource.visibility as "public" | "internal",
      versionId: resource.publishedVersionId!,
      version: 0,
      publishedAt: "",
      updatedAt: resource.updatedAt,
      validity: "unknown",
      path: [folderPath(resource.folderId, folderMap), resource.name].filter(Boolean).join("/"),
    }));
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
    const result = await this.hub.search({ query: "", type: target.type, offset: 0, limit: 100, sort: "updated" });
    const resources = result.items.map(item => {
      const { excerpt: _excerpt, citation: _citation, ...metadata } = item;
      void _excerpt; void _citation;
      return { ...compactMetadata(metadata), path: `${target.name}/${item.title}` };
    });
    const page = paged(resources, input.offset, input.limit);
    return { mode: "logical", folderId: target.id, path: target.name, folders: [], resources: page.items, total: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore };
  }

  async outline(raw: unknown): Promise<KnowledgeIndexOutline> {
    const input = outlineInputSchema.parse(raw);
    const resource = await this.hub.get(input.resourceId, input.versionId);
    return this.outlineResource(resource);
  }

  private outlineResource(resource: Awaited<ReturnType<KnowledgeHub["get"]>>): KnowledgeIndexOutline {
    return {
      ...resourceMetadata(resource),
      resourceId: resource.id,
      publishedAt: resource.version.publishedAt,
      sections: resource.version.citations.map(({ id, heading, startLine, endLine }) => ({ id, heading, startLine, endLine })),
      files: resource.version.files.map(file => ({ path: file.path, mediaType: file.mediaType, checksum: file.checksum, size: decodeSize(file.contentBase64), isText: isTextFile(file.mediaType, file.path) })),
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
      const startIndex = input.startLine - 1;
      text = lines.slice(startIndex, startIndex + lineCount).join("\n").slice(0, MAX_KNOWLEDGE_READ_CHARS);
      startLine = input.startLine;
      endLine = Math.min(lines.length, startIndex + lineCount);
      if (endLine < lines.length || text.length < lines.slice(startIndex, startIndex + lineCount).join("\n").length) nextLine = endLine + 1;
      offset = lines.slice(0, startIndex).join("\n").length + (startIndex > 0 ? 1 : 0);
    } else {
      offset = Math.min(offset, markdown.length);
      const rawText = markdown.slice(offset, offset + MAX_KNOWLEDGE_READ_CHARS);
      const rawLines = rawText.split("\n");
      text = rawLines.slice(0, lineCount).join("\n");
      startLine = offset === 0 ? 1 : markdown.slice(0, offset).split("\n").length;
      endLine = Math.min(lines.length, startLine + rawLines.slice(0, lineCount).length - 1);
      if (offset + text.length < markdown.length) nextOffset = offset + text.length;
      if (endLine < lines.length && text.length >= rawText.length) nextLine = endLine + 1;
    }
    const truncated = (nextOffset !== null || nextLine !== null);
    const citations = resource.version.citations;
    const outline = this.outlineResource(resource);
    return {
      ...outline,
      markdown: text,
      offset,
      startLine,
      endLine,
      nextOffset,
      nextLine,
      truncated,
      sections: citations.filter(citation => citation.endLine >= startLine && citation.startLine <= endLine).map(({ id, heading, startLine: citationStart, endLine: citationEnd }) => ({ id, heading, startLine: citationStart, endLine: citationEnd })),
    };
  }

  async skillFiles(raw: unknown): Promise<{ resourceId: string; versionId: string; title: string; source: string; files: KnowledgeSkillFile[] }> {
    const input = skillFilesInputSchema.parse(raw);
    const resource = await this.hub.get(input.resourceId, input.versionId);
    if (resource.type !== "skill") throw new HubError("invalid", "只有 Skill 资源可以读取包内文件。" );
    return {
      resourceId: resource.id,
      versionId: resource.version.id,
      title: resource.title,
      source: resource.source,
      files: resource.version.files.map(file => ({ path: file.path, mediaType: file.mediaType, checksum: file.checksum, size: decodeSize(file.contentBase64), isText: isTextFile(file.mediaType, file.path) })),
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
