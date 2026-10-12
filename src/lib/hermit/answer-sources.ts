import { z } from "zod";
import type { KnowledgeHub } from "@/modules/knowledge-hub/service";

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/);
const lineNumber = z.number().int().min(1).max(2_000_000);
const offsetNumber = z.number().int().min(0).max(2_000_000);

/**
 * A server read that can be used as evidence for an answer citation or
 * recommendation.  The optional content fields are accepted only by the
 * internal recorder so callers can explicitly mark an empty tool result; they
 * are never retained in snapshots.
 */
export type AnswerSourceRead = {
  resourceId: string;
  versionId: string;
  title: string;
  source: string;
  startLine?: number;
  endLine?: number;
  path?: string;
  offset?: number;
  endOffset?: number;
  text?: string;
  markdown?: string;
  content?: string;
};

export type AnswerSourceCitation = {
  number: number;
  resourceId: string;
  versionId: string;
  title: string;
  source: string;
  startLine?: number;
  endLine?: number;
};

export type AnswerSourceRecommendation = {
  resourceId: string;
  versionId: string;
  title: string;
  source: string;
  reason: string;
};

export type AnswerSourceStatus = "complete" | "failed" | "cancelled";

export type AnswerSourceSnapshot = {
  mode: "progressive-index";
  status: AnswerSourceStatus;
  reads: Array<Omit<AnswerSourceRead, "text" | "markdown" | "content">>;
  citations: AnswerSourceCitation[];
  recommendations: AnswerSourceRecommendation[];
};

export type FinalizedAnswerSources = {
  status: "complete";
  text: string;
  citations: AnswerSourceCitation[];
  recommendations: AnswerSourceRecommendation[];
};

type AnswerSourceHub = Pick<KnowledgeHub, "get">;
type KnowledgeResource = Awaited<ReturnType<KnowledgeHub["get"]>>;

type Tool = {
  description: string;
  schema: z.ZodType;
  execute: (raw: unknown) => Promise<unknown>;
};

type StoredRead = Omit<AnswerSourceRead, "text" | "markdown" | "content"> & {
  fullDocument: boolean;
};

type CitationInput = {
  resourceId: string;
  versionId: string;
  startLine?: number;
  endLine?: number;
};

type CitationDeclaration = {
  declarationNumber: number;
  input: CitationInput;
};

type RecommendationDeclaration = {
  input: { resourceId: string; versionId: string; reason: string };
};

type ServerResource = {
  resource: KnowledgeResource;
  title: string;
  source: string;
};

type ResolvedCitation = {
  declaration: CitationDeclaration;
  metadata: ServerResource;
  read: StoredRead;
  startLine?: number;
  endLine?: number;
};

const readSchema = z.object({
  resourceId: identifier,
  versionId: identifier,
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(1_000),
  startLine: lineNumber.optional(),
  endLine: lineNumber.optional(),
  path: z.string().trim().min(1).max(240).optional(),
  offset: offsetNumber.optional(),
  endOffset: offsetNumber.optional(),
  text: z.string().optional(),
  markdown: z.string().optional(),
  content: z.string().optional(),
}).strict().superRefine((value, context) => {
  if (value.startLine !== undefined && value.endLine !== undefined && value.endLine < value.startLine) {
    context.addIssue({ code: "custom", path: ["endLine"], message: "endLine must be greater than or equal to startLine" });
  }
  if (value.offset !== undefined && value.endOffset !== undefined && value.endOffset < value.offset) {
    context.addIssue({ code: "custom", path: ["endOffset"], message: "endOffset must be greater than or equal to offset" });
  }
  if (value.path && (value.path.startsWith("/") || value.path.includes("\\") || value.path.includes(":"))) {
    context.addIssue({ code: "custom", path: ["path"], message: "path must be a relative package path" });
  }
});

const citeSchema = z.object({
  resourceId: identifier,
  versionId: identifier,
  startLine: lineNumber.optional(),
  endLine: lineNumber.optional(),
}).strict().superRefine((value, context) => {
  if (value.startLine !== undefined && value.endLine !== undefined && value.endLine < value.startLine) {
    context.addIssue({ code: "custom", path: ["endLine"], message: "endLine must be greater than or equal to startLine" });
  }
});

const recommendSchema = z.object({
  resourceId: identifier,
  versionId: identifier,
  reason: z.string().trim().min(1).max(240),
}).strict();

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function contentWasProvided(value: AnswerSourceRead) {
  return hasOwn(value, "text") || hasOwn(value, "markdown") || hasOwn(value, "content");
}

function contentIsNonEmpty(value: AnswerSourceRead) {
  return [value.text, value.markdown, value.content].some(candidate => typeof candidate === "string" && candidate.trim().length > 0);
}

function readKey(read: Pick<AnswerSourceRead, "resourceId" | "versionId" | "path" | "startLine" | "endLine" | "offset" | "endOffset">) {
  return [
    read.resourceId,
    read.versionId,
    read.path ?? "",
    read.startLine ?? "",
    read.endLine ?? "",
    read.offset ?? "",
    read.endOffset ?? "",
  ].join("|");
}

function resourceKey(resourceId: string, versionId: string) {
  return `${resourceId}|${versionId}`;
}

function lineCount(markdown: string) {
  return Math.max(1, markdown.split("\n").length);
}

function lineAtOffset(markdown: string, offset: number) {
  const bounded = Math.max(0, Math.min(offset, markdown.length));
  return markdown.slice(0, bounded).split("\n").length;
}

function publicRead(read: StoredRead): Omit<AnswerSourceRead, "text" | "markdown" | "content"> {
  const { fullDocument: _fullDocument, ...value } = read;
  void _fullDocument;
  return { ...value };
}

function metadataOf(resource: KnowledgeResource): ServerResource | null {
  if (!resource || resource.archived || resource.id.length === 0 || typeof resource.version?.markdown !== "string" || !resource.version.publishedAt) {
    return null;
  }
  const title = typeof resource.title === "string" ? resource.title.trim() : "";
  const source = typeof resource.source === "string" ? resource.source.trim() : "";
  if (!title || !source) return null;
  return { resource, title, source };
}

function accessibleExact(resource: KnowledgeResource | null | undefined, resourceId: string, versionId: string) {
  if (!resource || resource.id !== resourceId || resource.version?.id !== versionId) return null;
  return metadataOf(resource);
}

function lineBounds(read: StoredRead, markdown: string): [number, number] | null {
  if (read.path) return null;
  const total = lineCount(markdown);
  if (read.startLine !== undefined || read.endLine !== undefined) {
    const start = read.startLine ?? read.endLine ?? 1;
    const end = read.endLine ?? read.startLine ?? start;
    return [Math.max(1, start), Math.min(total, end)];
  }
  if (read.offset !== undefined || read.endOffset !== undefined) {
    const offset = read.offset ?? 0;
    const endOffset = read.endOffset ?? offset;
    const start = lineAtOffset(markdown, offset);
    const end = lineAtOffset(markdown, Math.max(offset, endOffset - (endOffset > offset ? 1 : 0)));
    return [start, end];
  }
  if (read.fullDocument) return [1, total];
  return null;
}

function resolveRange(input: CitationInput, read: StoredRead, markdown: string) {
  const bounds = lineBounds(read, markdown);
  if (!bounds || bounds[0] > bounds[1]) return null;
  const requestedStart = input.startLine ?? input.endLine ?? bounds[0];
  const requestedEnd = input.endLine ?? input.startLine ?? bounds[1];
  if (requestedStart < bounds[0] || requestedEnd > bounds[1] || requestedStart > requestedEnd) return null;
  if (requestedStart < 1 || requestedEnd > lineCount(markdown)) return null;
  return { startLine: requestedStart, endLine: requestedEnd };
}

function stripInternalCitationAnchors(value: string) {
  let result = value.replace(/\[([^\]]*)\]\(\s*#hermit-citation-[^)]*\)/gi, "$1");
  result = result.replace(/<a\b[^>]*\bhref\s*=\s*(["'])#hermit-citation-[^"']*\1[^>]*>([\s\S]*?)<\/a>/gi, "$2");
  result = result.replace(/<a\b[^>]*\bhref\s*=\s*(["'])#hermit-citation-[^"']*\1[^>]*>/gi, "");
  // A model may stop in the middle of a forged internal link.  Keep its
  // visible label while discarding the unfinished destination as well.
  result = result.replace(/\[([^\]\r\n]*)\]\(\s*#hermit-citation-[^\)\r\n]*$/gim, "$1");
  return result;
}

function pendingMarkdownLinkStart(value: string) {
  const match = /\[[^\]\r\n]*(?:\](?:\(\s*[^\)\r\n]*)?)?$/g.exec(value);
  return match?.index ?? -1;
}

function trailingCitationPrefixStart(value: string) {
  for (let start = value.length - 1; start >= 0; start -= 1) {
    if (value[start] !== "[") continue;
    const suffix = value.slice(start);
    if (suffix === "[" || /^\[\[(?:c|ci|cit|cite(?::[^)\r\n]*)?)?$/i.test(suffix)) return start;
  }
  return -1;
}

/** Remove source protocol markers before text is emitted during streaming. */
export function stripSourceMarkers(text: string) {
  let value = stripInternalCitationAnchors(String(text ?? ""));
  value = value.replace(/\[\[cite(?::[^\]\r\n]*)?\]\]/gi, "");
  value = value.replace(/\[\[cite(?::[^\]\r\n]*)?$/gim, "");
  // Hold an unfinished Markdown link until its closing `)` arrives.  This
  // keeps a split forged internal anchor (and ordinary Markdown links) from
  // shrinking already-emitted stream text when the next chunk completes it.
  const pendingLink = pendingMarkdownLinkStart(value);
  if (pendingLink >= 0) value = value.slice(0, pendingLink);
  // Hold back a possible marker prefix so a later chunk cannot turn an
  // already-emitted `[` or `[[cite:` into a visible protocol token.  The
  // completed answer is finalized separately and may retain an ordinary
  // trailing bracket if it never becomes a marker.
  while (true) {
    const start = trailingCitationPrefixStart(value);
    if (start < 0) break;
    value = value.slice(0, start);
  }
  return value;
}

type Fence = { end: number };

function fenceAt(text: string, index: number): Fence | null {
  if (index > 0 && text[index - 1] !== "\n") return null;
  const lineEnd = text.indexOf("\n", index);
  const openingLineEnd = lineEnd === -1 ? text.length : lineEnd + 1;
  const openingLine = text.slice(index, lineEnd === -1 ? text.length : lineEnd).replace(/\r$/, "");
  const indentation = openingLine.match(/^[ \t]{0,3}/)?.[0].length ?? 0;
  const character = openingLine[indentation];
  if (character !== "`" && character !== "~") return null;
  let length = 0;
  while (openingLine[indentation + length] === character) length += 1;
  if (length < 3) return null;

  let cursor = openingLineEnd;
  while (cursor <= text.length) {
    const candidateEnd = text.indexOf("\n", cursor);
    const candidateLineEnd = candidateEnd === -1 ? text.length : candidateEnd;
    const candidate = text.slice(cursor, candidateLineEnd).replace(/\r$/, "");
    const candidateIndentation = candidate.match(/^[ \t]{0,3}/)?.[0].length ?? 0;
    let closingLength = 0;
    while (candidate[candidateIndentation + closingLength] === character) closingLength += 1;
    if (closingLength >= length && candidate.slice(candidateIndentation + closingLength).trim() === "") {
      return { end: candidateEnd === -1 ? text.length : candidateEnd + 1 };
    }
    if (candidateEnd === -1) break;
    cursor = candidateEnd + 1;
  }
  return { end: text.length };
}

function replaceProseMarkers(text: string, onMarker: (declarationNumber: number) => string) {
  const output: string[] = [];
  let index = 0;
  while (index < text.length) {
    const fence = fenceAt(text, index);
    if (fence) {
      output.push(stripSourceMarkers(text.slice(index, fence.end)));
      index = fence.end;
      continue;
    }
    if (text[index] === "`") {
      let length = 1;
      while (text[index + length] === "`") length += 1;
      const close = text.indexOf("`".repeat(length), index + length);
      const end = close === -1 ? text.length : close + length;
      output.push(stripSourceMarkers(text.slice(index, end)));
      index = end;
      continue;
    }
    const remainder = text.slice(index);
    const valid = /^\[\[cite:(\d+)\]\]/i.exec(remainder);
    if (valid) {
      output.push(onMarker(Number(valid[1])));
      index += valid[0].length;
      continue;
    }
    const invalid = /^\[\[cite(?::[^\]\r\n]*)?\]\]/i.exec(remainder);
    if (invalid) {
      index += invalid[0].length;
      continue;
    }
    const partial = /^\[\[cite(?::[^\]\r\n]*)?$/i.exec(remainder);
    if (partial) {
      index = text.length;
      continue;
    }
    output.push(text[index]);
    index += 1;
  }
  return output.join("");
}

export function createAnswerSources(deps: { hub: AnswerSourceHub }) {
  const reads = new Map<string, StoredRead>();
  const citations = new Map<number, CitationDeclaration>();
  const recommendations = new Map<string, RecommendationDeclaration>();
  let finalized: FinalizedAnswerSources | null = null;

  const recordRead = (raw: AnswerSourceRead) => {
    const parsed = readSchema.safeParse(raw);
    if (!parsed.success) return false;
    const value = parsed.data;
    if (contentWasProvided(value) && !contentIsNonEmpty(value)) return false;
    if (value.path && value.offset !== undefined && value.endOffset !== undefined && value.offset === value.endOffset) return false;
    if (!value.path && value.startLine === undefined && value.endLine === undefined && value.offset === undefined && value.endOffset === undefined && contentWasProvided(value) && !contentIsNonEmpty(value)) return false;
    const { text: _text, markdown: _markdown, content: _content, ...metadata } = value;
    void _text; void _markdown; void _content;
    const stored: StoredRead = {
      ...metadata,
      fullDocument: !metadata.path && metadata.startLine === undefined && metadata.endLine === undefined && metadata.offset === undefined && metadata.endOffset === undefined,
    };
    const key = readKey(stored);
    if (!reads.has(key)) reads.set(key, stored);
    return true;
  };

  const findReads = (resourceId: string, versionId: string, markdownOnly: boolean) => {
    return [...reads.values()].filter(read => read.resourceId === resourceId && read.versionId === versionId && (!markdownOnly || !read.path));
  };

  const getServerResource = async (resourceId: string, versionId: string) => {
    try {
      const resource = await deps.hub.get(resourceId, versionId);
      return accessibleExact(resource, resourceId, versionId);
    } catch {
      return null;
    }
  };

  const resolveCitation = async (declaration: CitationDeclaration): Promise<ResolvedCitation | null> => {
    const metadata = await getServerResource(declaration.input.resourceId, declaration.input.versionId);
    if (!metadata) return null;
    const match = findReads(declaration.input.resourceId, declaration.input.versionId, true)
      .map(read => ({ read, range: resolveRange(declaration.input, read, metadata.resource.version.markdown) }))
      .find(candidate => candidate.range !== null);
    if (!match || !match.range) return null;
    return { declaration, metadata, read: match.read, ...match.range };
  };

  const resolveRecommendation = async (declaration: RecommendationDeclaration) => {
    const { resourceId, versionId } = declaration.input;
    if (!findReads(resourceId, versionId, false).length) return null;
    const metadata = await getServerResource(resourceId, versionId);
    if (!metadata) return null;
    return { metadata, reason: declaration.input.reason };
  };

  const tools: { knowledge_cite: Tool; knowledge_recommend: Tool } = {
    knowledge_cite: {
      description: "声明回答实际使用的已读取 Markdown 资料。必须先读取精确资源版本；返回的协议标记会在回答完成后转换为引用。",
      schema: citeSchema,
      execute: async (raw: unknown) => {
        const input = citeSchema.parse(raw);
        const resolved = await getServerResource(input.resourceId, input.versionId);
        if (!resolved) throw new Error("该资料版本不可访问或尚未发布。");
        const match = findReads(input.resourceId, input.versionId, true)
          .map(read => ({ read, range: resolveRange(input, read, resolved.resource.version.markdown) }))
          .find(candidate => candidate.range !== null);
        if (!match || !match.range) {
          if (!findReads(input.resourceId, input.versionId, true).length) throw new Error("只能引用本次回答实际读取过的 Markdown 资料。");
          throw new Error("引用行号不在本次读取的可信范围内。");
        }
        const range = match.range;
        const declarationKey = [input.resourceId, input.versionId, range.startLine, range.endLine].join("|");
        const existing = [...citations.values()].find(declaration => {
          const candidate = declaration.input;
          return [candidate.resourceId, candidate.versionId, candidate.startLine ?? "", candidate.endLine ?? ""].join("|") === declarationKey;
        });
        if (existing) return { marker: `[[cite:${existing.declarationNumber}]]` };
        const declarationNumber = citations.size + 1;
        citations.set(declarationNumber, { declarationNumber, input: { ...input, startLine: range.startLine, endLine: range.endLine } });
        return { marker: `[[cite:${declarationNumber}]]` };
      },
    },
    knowledge_recommend: {
      description: "把已经读取过的资料列为回答末尾的进一步阅读推荐。推荐不会自动因为读取而出现。",
      schema: recommendSchema,
      execute: async (raw: unknown) => {
        const input = recommendSchema.parse(raw);
        const resolved = await getServerResource(input.resourceId, input.versionId);
        if (!resolved) throw new Error("该资料版本不可访问或尚未发布。");
        if (!findReads(input.resourceId, input.versionId, false).length) throw new Error("只能推荐本次回答实际读取过的资料。");
        const key = resourceKey(input.resourceId, input.versionId);
        if (recommendations.has(key)) return { accepted: true, resourceId: input.resourceId, versionId: input.versionId, title: resolved.title, source: resolved.source, reason: input.reason };
        if (recommendations.size >= 6) throw new Error("本次回答最多推荐 6 份资料。");
        recommendations.set(key, { input });
        return { accepted: true, resourceId: input.resourceId, versionId: input.versionId, title: resolved.title, source: resolved.source, reason: input.reason };
      },
    },
  };

  const finalize = async (rawText: string): Promise<FinalizedAnswerSources> => {
    const resolvedCitations = new Map<number, ResolvedCitation>();
    for (const declaration of citations.values()) {
      const resolved = await resolveCitation(declaration);
      if (resolved) resolvedCitations.set(declaration.declarationNumber, resolved);
    }
    const resolvedRecommendations: AnswerSourceRecommendation[] = [];
    for (const declaration of recommendations.values()) {
      const resolved = await resolveRecommendation(declaration);
      if (!resolved) continue;
      resolvedRecommendations.push({
        resourceId: declaration.input.resourceId,
        versionId: declaration.input.versionId,
        title: resolved.metadata.title,
        source: resolved.metadata.source,
        reason: declaration.input.reason,
      });
    }

    const used = new Map<number, AnswerSourceCitation>();
    const text = replaceProseMarkers(stripInternalCitationAnchors(String(rawText ?? "")), declarationNumber => {
      const resolved = resolvedCitations.get(declarationNumber);
      if (!resolved) return "";
      let citation = used.get(declarationNumber);
      if (!citation) {
        citation = {
          number: used.size + 1,
          resourceId: resolved.declaration.input.resourceId,
          versionId: resolved.declaration.input.versionId,
          title: resolved.metadata.title,
          source: resolved.metadata.source,
          startLine: resolved.startLine,
          endLine: resolved.endLine,
        };
        used.set(declarationNumber, citation);
      }
      return `[${citation.number}](#hermit-citation-${citation.number})`;
    });
    const result: FinalizedAnswerSources = {
      status: "complete",
      text,
      citations: [...used.values()],
      recommendations: text.trim() ? resolvedRecommendations : [],
    };
    finalized = result;
    return result;
  };

  const snapshot = (status: AnswerSourceStatus): AnswerSourceSnapshot => ({
    mode: "progressive-index",
    status,
    reads: [...reads.values()].map(publicRead),
    citations: status === "complete" && finalized?.status === "complete" ? finalized.citations.map(citation => ({ ...citation })) : [],
    recommendations: status === "complete" && finalized?.status === "complete" ? finalized.recommendations.map(recommendation => ({ ...recommendation })) : [],
  });

  return { recordRead, tools, finalize, snapshot };
}

