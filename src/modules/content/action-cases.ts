import path from "node:path";
import matter from "gray-matter";
import { ContentSourceType, ContentStatus, ContentType, VisibilityScope, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";

export type ActionCaseStatus = "draft" | "published" | "archived";

export type ActionCaseCoverImage = {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type ParsedActionCaseMarkdown = {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  importedStatus: ActionCaseStatus;
  summary: string;
  markdown: string;
  headings: Array<{ level: number; title: string }>;
  sourceFileName: string | null;
};

export type SaveActionCaseDraftInput = {
  id?: string | null;
  slug: string;
  title: string;
  date: string;
  tags: string[];
  summary: string;
  markdown: string;
  sourceFileName?: string | null;
  coverImage?: ActionCaseCoverImage | null;
};

export type ActionCaseRecord = {
  id: string;
  slug: string;
  publishedSlug: string | null;
  href: string;
  title: string;
  date: string;
  tags: string[];
  summary: string;
  status: ActionCaseStatus;
  markdown: string;
  headings: Array<{ level: number; title: string }>;
  coverImage: ActionCaseCoverImage | null;
  currentVersionNo: number | null;
  publishedVersionNo: number | null;
  updatedAt: Date;
  publishedAt: Date | null;
};

type ActionCaseBodyJson = {
  schemaVersion: 1;
  title: string;
  date: string;
  tags: string[];
  summary: string;
  headings: Array<{ level: number; title: string }>;
  coverImage: ActionCaseCoverImage | null;
  sourceFileName: string | null;
};

type ActionCaseMetadataJson = {
  date: string;
  tags: string[];
  coverImage: ActionCaseCoverImage | null;
  sourceFileName: string | null;
};

const actionCaseInclude = {
  currentVersion: true,
  publishedVersion: true,
} satisfies Prisma.ContentItemInclude;

type PrismaActionCaseItem = Prisma.ContentItemGetPayload<{ include: typeof actionCaseInclude }>;

export interface ActionCaseRepository {
  listAdmin(): Promise<ActionCaseRecord[]>;
  listPublished(): Promise<ActionCaseRecord[]>;
  findPublishedBySlug(slug: string): Promise<ActionCaseRecord | null>;
  findAdminById(id: string): Promise<ActionCaseRecord | null>;
  saveDraft(input: SaveActionCaseDraftInput): Promise<ActionCaseRecord>;
  publish(id: string): Promise<ActionCaseRecord>;
  listVersions(id: string): Promise<Array<{ id: string; versionNo: number; title: string; createdAt: Date; changeNote: string | null }>>;
}

function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown, now = new Date()) {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIsoDate(now);
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  const raw = cleanText(value);
  if (!raw) return [];
  return raw
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeStatus(value: unknown): ActionCaseStatus {
  const status = cleanText(value).toLowerCase();
  return status === "published" || status === "archived" ? status : "draft";
}

export function generateActionCaseSlug(title: string, date = todayIsoDate()) {
  const ascii = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii.slice(0, 72);
  const compactDate = date.replace(/-/g, "");
  return `action-case-${compactDate}`;
}

function extractFirstHeading(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function extractHeadings(markdown: string) {
  return [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1].length,
    title: match[2].trim(),
  }));
}

function stripMarkdownInline(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`>#-]/g, "")
    .trim();
}

function extractSummary(markdown: string) {
  const paragraph = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#"));
  return stripMarkdownInline(paragraph ?? "").slice(0, 160);
}

function fallbackTitleFromFile(fileName?: string | null) {
  if (!fileName) return "";
  return path.basename(fileName, path.extname(fileName)).trim();
}

export function parseActionCaseMarkdown(markdown: string, options: { fileName?: string | null; now?: Date } = {}): ParsedActionCaseMarkdown {
  const rawMarkdown = markdown.trim();
  if (!rawMarkdown) {
    throw new AppError("validation_error", "Markdown content is required.", 422);
  }

  const parsed = matter(rawMarkdown);
  const content = parsed.content.trim();
  const title = cleanText(parsed.data.title) || extractFirstHeading(content) || fallbackTitleFromFile(options.fileName) || "未命名笃行案例";
  const date = normalizeDate(parsed.data.date, options.now);
  const slug = cleanText(parsed.data.slug) || generateActionCaseSlug(title, date);
  const summary = cleanText(parsed.data.summary) || extractSummary(content);

  return {
    slug,
    title,
    date,
    tags: normalizeTags(parsed.data.tags),
    importedStatus: normalizeStatus(parsed.data.status),
    summary,
    markdown: content,
    headings: extractHeadings(content),
    sourceFileName: options.fileName ?? null,
  };
}

function assertSlug(value: string) {
  const slug = value.trim();
  if (!/^[a-z0-9][a-z0-9-]{1,100}$/.test(slug)) {
    throw new AppError("validation_error", "Slug must use lowercase letters, numbers, and hyphens.", 422);
  }
  return slug;
}

function buildBodyJson(input: SaveActionCaseDraftInput): ActionCaseBodyJson {
  return {
    schemaVersion: 1,
    title: input.title.trim(),
    date: input.date,
    tags: input.tags,
    summary: input.summary.trim(),
    headings: extractHeadings(input.markdown),
    coverImage: input.coverImage ?? null,
    sourceFileName: input.sourceFileName ?? null,
  };
}

function buildMetadataJson(input: SaveActionCaseDraftInput): ActionCaseMetadataJson {
  return {
    date: input.date,
    tags: input.tags,
    coverImage: input.coverImage ?? null,
    sourceFileName: input.sourceFileName ?? null,
  };
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readCoverImage(value: unknown): ActionCaseCoverImage | null {
  const coverImage = readObject(value);
  return cleanText(coverImage.url) && cleanText(coverImage.fileName)
    ? {
        url: cleanText(coverImage.url),
        fileName: cleanText(coverImage.fileName),
        mimeType: cleanText(coverImage.mimeType),
        size: Number(coverImage.size) || 0,
        uploadedAt: cleanText(coverImage.uploadedAt) || new Date(0).toISOString(),
      }
    : null;
}

function readMetadata(value: unknown): ActionCaseMetadataJson {
  const object = readObject(value);
  return {
    date: cleanText(object.date) || todayIsoDate(),
    tags: normalizeTags(object.tags),
    coverImage: readCoverImage(object.coverImage),
    sourceFileName: cleanText(object.sourceFileName) || null,
  };
}

function readBodyJson(value: unknown, metadata: ActionCaseMetadataJson): ActionCaseBodyJson {
  const object = readObject(value);
  const bodyCoverImage = readCoverImage(object.coverImage);
  return {
    schemaVersion: 1,
    title: cleanText(object.title),
    date: cleanText(object.date) || metadata.date,
    tags: normalizeTags(object.tags).length > 0 ? normalizeTags(object.tags) : metadata.tags,
    summary: cleanText(object.summary),
    headings: Array.isArray(object.headings)
      ? object.headings
          .map((item) => readObject(item))
          .map((item) => ({ level: Number(item.level) || 2, title: cleanText(item.title) }))
          .filter((item) => item.title)
      : [],
    coverImage: bodyCoverImage ?? metadata.coverImage,
    sourceFileName: cleanText(object.sourceFileName) || metadata.sourceFileName,
  };
}

function mapStatus(status: ContentStatus): ActionCaseStatus {
  if (status === ContentStatus.PUBLISHED) return "published";
  if (status === ContentStatus.ARCHIVED) return "archived";
  return "draft";
}

function isPrismaUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

function mapActionCase(item: PrismaActionCaseItem, prefer: "current" | "published"): ActionCaseRecord {
  const metadata = readMetadata(item.metadataJson);
  const version = prefer === "published" ? item.publishedVersion ?? item.currentVersion : item.currentVersion ?? item.publishedVersion;
  const body = readBodyJson(version?.bodyJson, metadata);
  const publishedSlug = item.publishedSlug ?? null;
  const slug = prefer === "published" ? publishedSlug ?? item.slug ?? item.id : item.slug ?? item.id;

  return {
    id: item.id,
    slug,
    publishedSlug,
    href: `/action/${slug}`,
    title: version?.title ?? item.title,
    date: body.date,
    tags: body.tags,
    summary: body.summary || item.summary || "",
    status: prefer === "published" && item.publishedVersionId ? "published" : mapStatus(item.status),
    markdown: version?.bodyMarkdown ?? "",
    headings: body.headings,
    coverImage: body.coverImage,
    currentVersionNo: item.currentVersion?.versionNo ?? null,
    publishedVersionNo: item.publishedVersion?.versionNo ?? null,
    updatedAt: item.updatedAt,
    publishedAt: item.publishedAt,
  };
}

function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new AppError("bad_request", "Database is not configured.", 503);
  }
}

export class PrismaActionCaseRepository implements ActionCaseRepository {
  async listAdmin() {
    assertDatabaseConfigured();
    const items = await prisma.contentItem.findMany({
      where: { contentType: ContentType.ACTION_CASE },
      include: actionCaseInclude,
      orderBy: { updatedAt: "desc" },
    });
    return items.map((item) => mapActionCase(item, "current"));
  }

  async listPublished() {
    if (!process.env.DATABASE_URL) return [];
    const items = await prisma.contentItem.findMany({
      where: {
        contentType: ContentType.ACTION_CASE,
        publishedVersionId: { not: null },
        status: { not: ContentStatus.ARCHIVED },
      },
      include: actionCaseInclude,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    });
    return items.map((item) => mapActionCase(item, "published"));
  }

  async findPublishedBySlug(slug: string) {
    if (!process.env.DATABASE_URL) return null;
    const item = await prisma.contentItem.findFirst({
      where: {
        contentType: ContentType.ACTION_CASE,
        publishedVersionId: { not: null },
        status: { not: ContentStatus.ARCHIVED },
        OR: [
          { publishedSlug: slug },
          {
            publishedSlug: null,
            slug,
          },
        ],
      },
      include: actionCaseInclude,
    });
    return item ? mapActionCase(item, "published") : null;
  }

  async findAdminById(id: string) {
    assertDatabaseConfigured();
    const item = await prisma.contentItem.findUnique({ where: { id }, include: actionCaseInclude });
    return item?.contentType === ContentType.ACTION_CASE ? mapActionCase(item, "current") : null;
  }

  async saveDraft(input: SaveActionCaseDraftInput) {
    assertDatabaseConfigured();
    const slug = assertSlug(input.slug);
    const bodyJson = buildBodyJson({ ...input, slug });
    const metadataJson = buildMetadataJson({ ...input, slug });

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = input.id
          ? await tx.contentItem.findUnique({ where: { id: input.id }, include: actionCaseInclude })
          : await tx.contentItem.findFirst({
              where: {
                contentType: ContentType.ACTION_CASE,
                OR: [{ slug }, { publishedSlug: slug }],
              },
              include: actionCaseInclude,
            });

        if (input.id) {
          const conflict = await tx.contentItem.findFirst({
            where: {
              contentType: ContentType.ACTION_CASE,
              id: { not: input.id },
              OR: [{ slug }, { publishedSlug: slug }],
            },
          });
          if (conflict) {
            throw new AppError("validation_error", "Slug already belongs to another Action case.", 422);
          }
        }

        const contentItem =
          existing ??
          (await tx.contentItem.create({
            data: {
              contentType: ContentType.ACTION_CASE,
              slug,
              title: input.title.trim(),
              summary: input.summary.trim(),
              status: ContentStatus.DRAFT,
              visibilityScope: VisibilityScope.GLOBAL,
              sourceType: ContentSourceType.IMPORT,
              metadataJson,
            },
            include: actionCaseInclude,
          }));

        if (contentItem.contentType !== ContentType.ACTION_CASE) {
          throw new AppError("validation_error", "Content item is not an Action case.", 422);
        }

        const latestVersion = await tx.contentVersion.findFirst({
          where: { contentItemId: contentItem.id },
          orderBy: { versionNo: "desc" },
        });
        const version = await tx.contentVersion.create({
          data: {
            contentItemId: contentItem.id,
            versionNo: (latestVersion?.versionNo ?? 0) + 1,
            title: input.title.trim(),
            bodyMarkdown: input.markdown.trim(),
            bodyJson,
            changeNote: "Admin Markdown import draft.",
          },
        });

        const next = await tx.contentItem.update({
          where: { id: contentItem.id },
          data: {
            slug,
            title: input.title.trim(),
            summary: input.summary.trim(),
            status:
              contentItem.status === ContentStatus.ARCHIVED
                ? ContentStatus.ARCHIVED
                : contentItem.publishedVersionId
                  ? ContentStatus.PUBLISHED
                  : ContentStatus.DRAFT,
            sourceType: ContentSourceType.IMPORT,
            currentVersionId: version.id,
            metadataJson,
          },
          include: actionCaseInclude,
        });
        return mapActionCase(next, "current");
      });
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        throw new AppError("validation_error", "Action case was updated at the same time. Please reload and retry.", 422);
      }
      throw error;
    }
  }

  async publish(id: string) {
    assertDatabaseConfigured();
    const item = await prisma.contentItem.findUnique({ where: { id }, include: actionCaseInclude });
    if (!item || item.contentType !== ContentType.ACTION_CASE) {
      throw new AppError("not_found", "Action case was not found.", 404);
    }
    if (!item.currentVersionId) {
      throw new AppError("validation_error", "Action case has no draft version to publish.", 422);
    }

    try {
      const next = await prisma.contentItem.update({
        where: { id },
        data: {
          status: ContentStatus.PUBLISHED,
          publishedVersionId: item.currentVersionId,
          publishedSlug: item.slug,
          publishedAt: new Date(),
        },
        include: actionCaseInclude,
      });
      return mapActionCase(next, "published");
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        throw new AppError("validation_error", "Published slug already belongs to another Action case.", 422);
      }
      throw error;
    }
  }

  async listVersions(id: string) {
    assertDatabaseConfigured();
    return prisma.contentVersion.findMany({
      where: { contentItemId: id },
      orderBy: { versionNo: "desc" },
      select: {
        id: true,
        versionNo: true,
        title: true,
        createdAt: true,
        changeNote: true,
      },
    });
  }
}

export class ActionCaseService {
  constructor(private readonly repository: ActionCaseRepository = new PrismaActionCaseRepository()) {}

  parseMarkdown(markdown: string, options?: { fileName?: string | null; now?: Date }) {
    return parseActionCaseMarkdown(markdown, options);
  }

  async listAdminActionCases() {
    return this.repository.listAdmin();
  }

  async listPublishedActionCases() {
    return this.repository.listPublished();
  }

  async getPublishedActionCaseBySlug(slug: string) {
    return this.repository.findPublishedBySlug(slug);
  }

  async getAdminActionCase(id: string) {
    return this.repository.findAdminById(id);
  }

  async saveDraft(input: SaveActionCaseDraftInput) {
    const title = input.title.trim();
    const markdown = input.markdown.trim();
    if (!title) throw new AppError("validation_error", "Title is required.", 422);
    if (!markdown) throw new AppError("validation_error", "Markdown content is required.", 422);
    const slug = assertSlug(input.slug);
    return this.repository.saveDraft({
      ...input,
      slug,
      title,
      markdown,
      date: normalizeDate(input.date),
      tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
      summary: input.summary.trim() || extractSummary(markdown),
    });
  }

  async publish(id: string) {
    return this.repository.publish(id);
  }

  async listVersions(id: string) {
    return this.repository.listVersions(id);
  }
}

export const actionCaseService = new ActionCaseService();
