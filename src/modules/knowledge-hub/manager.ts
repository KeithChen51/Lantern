import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z, ZodError } from "zod";
import { prisma } from "@/infrastructure/db";
import { createPrismaHubTransaction } from "./prisma-store";
import { HubError, importSchema, KnowledgeHub } from "./service";

/** Resources that are required by the public Heart page or the Hermit agent. */
export const protectedKnowledgeIds = ["brand-whitepaper", "knowledge-heart-values"] as const;

export type ManagedImportConflict = "ask" | "overwrite" | "rename" | "skip";
export type ManagedImportInput = z.infer<typeof importSchema>;

export class KnowledgeManagerError extends HubError {
  constructor(
    public readonly code: "not_found" | "conflict" | "invalid",
    message: string,
  ) {
    super(code, message);
    this.name = "KnowledgeManagerError";
  }
}

const idSchema = z.string().trim().min(1).max(120);
const nameSchema = z.string().trim().min(1).max(240)
  .refine(value => value !== "." && value !== "..", "文件名或文件夹名不能是 . 或 .. 。")
  .refine(value => !/[\\/\u0000-\u001f\u007f]/.test(value), "文件名或文件夹名包含不支持的字符。");
const itemSchema = z.object({ kind: z.enum(["folder", "resource"]), id: idSchema });

export const knowledgeManagerActionSchema = z.union([
  z.object({ action: z.literal("createFolder"), name: nameSchema, parentId: idSchema.nullable() }),
  z.object({ action: z.literal("rename"), kind: z.enum(["folder", "resource"]), id: idSchema, name: nameSchema }),
  z.object({ action: z.literal("move"), items: z.array(itemSchema).min(1).max(500), folderId: idSchema.nullable() }),
  z.object({ action: z.enum(["trash", "restore"]), items: z.array(itemSchema).min(1).max(500) }),
  z.object({ action: z.literal("publish"), id: idSchema, versionId: idSchema }),
  z.object({ action: z.literal("setVisibility"), id: idSchema, visibility: z.enum(["public", "internal"]) }),
]);
export type KnowledgeManagerAction = z.infer<typeof knowledgeManagerActionSchema>;

type Tx = Prisma.TransactionClient;
type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  deleted: boolean;
  trashBatchId: string | null;
};
type Resource = {
  id: string;
  type: string;
  title: string;
  visibility: string;
  archived: boolean;
  publishedVersionId: string | null;
  updatedAt: Date;
  latestVersionId: string | null;
  location: { resourceId: string; folderId: string | null; name: string; archivedBeforeTrash: boolean; trashBatchId: string | null } | null;
};
type Graph = { folders: Map<string, Folder>; resources: Map<string, Resource> };

const normalized = (value: string) => value.trim().toLocaleLowerCase();
const defaultName = (resource: Pick<Resource, "type" | "title">) => resource.type === "skill" ? resource.title : `${resource.title}.md`;
const sameParent = (left: string | null, right: string | null) => left === right;

function invalid(message: string): never {
  throw new KnowledgeManagerError("invalid", message);
}

function notFound(kind: string, id: string): never {
  throw new KnowledgeManagerError("not_found", `${kind}不存在：${id}`);
}

function conflict(message: string): never {
  throw new KnowledgeManagerError("conflict", message);
}

function ensureName(value: string) {
  const parsed = nameSchema.safeParse(value);
  if (!parsed.success) invalid(parsed.error.issues[0]?.message ?? "名称不正确。");
  return parsed.data;
}

function isNameTaken(graph: Graph, parentId: string | null, name: string, excludedFolders = new Set<string>(), excludedResources = new Set<string>(), includeArchived = false) {
  const key = normalized(name);
  for (const folder of graph.folders.values()) {
    if ((!includeArchived && folder.deleted) || excludedFolders.has(folder.id) || !sameParent(folder.parentId, parentId)) continue;
    if (normalized(folder.name) === key) return true;
  }
  for (const resource of graph.resources.values()) {
    if ((!includeArchived && resource.archived) || excludedResources.has(resource.id)) continue;
    const resourceName = resource.location?.name ?? defaultName(resource);
    const resourceFolder = resource.location?.folderId ?? null;
    if (sameParent(resourceFolder, parentId) && normalized(resourceName) === key) return true;
  }
  return false;
}

function descendants(graph: Graph, rootId: string) {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of graph.folders.values()) {
      if (!ids.has(folder.id) && folder.parentId && ids.has(folder.parentId)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function activeDescendants(graph: Graph, rootId: string) {
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const folder of graph.folders.values()) {
      if (folder.parentId === parentId && !folder.deleted && !ids.has(folder.id)) {
        ids.add(folder.id);
        queue.push(folder.id);
      }
    }
  }
  return ids;
}

function ancestors(graph: Graph, folderId: string | null) {
  const ids = new Set<string>();
  const seen = new Set<string>();
  let current = folderId;
  while (current) {
    if (seen.has(current)) invalid("目录树存在循环，无法继续操作。");
    seen.add(current);
    const folder = graph.folders.get(current);
    if (!folder) notFound("文件夹", current);
    ids.add(folder.id);
    current = folder.parentId;
  }
  return ids;
}

function isDescendant(graph: Graph, candidate: string | null, ancestor: string) {
  let current = candidate;
  const seen = new Set<string>();
  while (current) {
    if (current === ancestor) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = graph.folders.get(current)?.parentId ?? null;
  }
  return false;
}

function hasDeletedAncestor(graph: Graph, folderId: string | null) {
  const seen = new Set<string>();
  let current = folderId;
  while (current) {
    if (seen.has(current)) invalid("目录树存在循环，无法继续操作。");
    seen.add(current);
    const folder = graph.folders.get(current);
    if (!folder) notFound("文件夹", current);
    if (folder.deleted) return true;
    current = folder.parentId;
  }
  return false;
}

async function readGraph(tx: Tx): Promise<Graph> {
  const [folderRows, resourceRows] = await Promise.all([
    tx.hubFolder.findMany({ select: { id: true, name: true, parentId: true, deleted: true, trashBatchId: true } }),
    tx.hubResource.findMany({
      include: {
        location: true,
        versions: { orderBy: { number: "desc" }, take: 1, select: { id: true } },
      },
    }),
  ]);
  return {
    folders: new Map(folderRows.map(row => [row.id, row])),
    resources: new Map(resourceRows.map(row => [row.id, {
      id: row.id,
      type: row.type,
      title: row.title,
      visibility: row.visibility,
      archived: row.archived,
      publishedVersionId: row.publishedVersionId,
      updatedAt: row.updatedAt,
      latestVersionId: row.versions[0]?.id ?? null,
      location: row.location,
    }])),
  };
}

async function writeAudit(tx: Tx, action: string, targetId: string, detail: unknown, now: Date) {
  await tx.hubAudit.create({ data: { id: randomUUID(), action, targetId, detail: typeof detail === "string" ? detail : JSON.stringify(detail), createdAt: now } });
}

async function serializable<T>(client: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.$transaction(tx => fn(tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    } catch (error) {
      if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2002", "P2034"].includes(error.code)) throw error;
    }
  }
}

function transactionBoundHub(tx: Tx) {
  return new KnowledgeHub({ transaction: async callback => callback(createPrismaHubTransaction(tx)) });
}

/** Reuse the caller's Prisma transaction for import + publish workflows. */
export function createKnowledgeHubForTransaction(tx: Tx) {
  return transactionBoundHub(tx);
}

function collectRestoreConflicts(graph: Graph, folderIds: Set<string>, resourceIds: Set<string>) {
  for (const folderId of folderIds) {
    const folder = graph.folders.get(folderId);
    if (!folder) notFound("文件夹", folderId);
    if (isNameTaken(graph, folder.parentId, folder.name, folderIds, resourceIds)) conflict(`恢复后会与同级项目重名：${folder.name}`);
  }
  for (const resourceId of resourceIds) {
    const resource = graph.resources.get(resourceId);
    if (!resource) notFound("资源", resourceId);
    const folderId = resource.location?.folderId ?? null;
    const name = resource.location?.name ?? defaultName(resource);
    if (isNameTaken(graph, folderId, name, folderIds, resourceIds)) conflict(`恢复后会与同级项目重名：${name}`);
  }
  // Also reject duplicate names among deleted items that are restored together.
  const seen = new Map<string, string>();
  for (const folderId of folderIds) {
    const folder = graph.folders.get(folderId)!;
    const key = `${folder.parentId ?? "root"}:${normalized(folder.name)}`;
    const previous = seen.get(key);
    if (previous && previous !== folder.id) conflict(`恢复批次中存在同级重名：${folder.name}`);
    seen.set(key, folder.id);
  }
  for (const resourceId of resourceIds) {
    const resource = graph.resources.get(resourceId)!;
    const key = `${resource.location?.folderId ?? "root"}:${normalized(resource.location?.name ?? defaultName(resource))}`;
    const previous = seen.get(key);
    if (previous && previous !== resource.id) conflict(`恢复批次中存在同级重名：${resource.location?.name ?? defaultName(resource)}`);
    seen.set(key, resource.id);
  }
}

function resourceIdIsProtected(id: string) {
  return (protectedKnowledgeIds as readonly string[]).includes(id);
}

export type KnowledgeManagerListing = {
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
  protectedIds: string[];
};

export type ManagedImportResult = {
  resourceId: string;
  versionId?: string;
  version?: number;
  name: string;
  folderId: string | null;
  skipped?: boolean;
  renamed?: boolean;
  duplicate?: boolean;
  metadataChanged?: boolean;
  processing?: "ready";
  published?: boolean;
};

export class KnowledgeManager {
  constructor(private readonly client: PrismaClient) {}

  async list(): Promise<KnowledgeManagerListing> {
    return serializable(this.client, async tx => {
      const graph = await readGraph(tx);
      return {
        folders: [...graph.folders.values()].map(folder => ({ id: folder.id, name: folder.name, parentId: folder.parentId, deleted: folder.deleted })),
        resources: [...graph.resources.values()].map(resource => ({
          id: resource.id,
          name: resource.location?.name ?? defaultName(resource),
          folderId: resource.location?.folderId ?? null,
          type: resource.type,
          title: resource.title,
          visibility: resource.visibility,
          archived: resource.archived,
          publishedVersionId: resource.publishedVersionId,
          latestVersionId: resource.latestVersionId,
          updatedAt: resource.updatedAt.toISOString(),
        })),
        protectedIds: [...protectedKnowledgeIds],
      };
    });
  }

  async latestVersionId(id: string) {
    const row = await this.client.hubResource.findUnique({ where: { id }, select: { versions: { orderBy: { number: "desc" }, take: 1, select: { id: true } } } });
    if (!row) notFound("资源", id);
    return row.versions[0]?.id ?? null;
  }

  async apply(rawAction: unknown) {
    const action = knowledgeManagerActionSchema.parse(rawAction);
    return serializable(this.client, tx => this.applyInTransaction(tx, action));
  }

  private async applyInTransaction(tx: Tx, action: KnowledgeManagerAction) {
    const now = new Date();
    if (action.action === "setVisibility") {
      const resource = await tx.hubResource.findUnique({ where: { id: action.id } });
      if (!resource) notFound("资源", action.id);
      if (resource.type !== "case") invalid("公开／内参状态仅用于参悟案例。");
      if (resource.archived) conflict("请先从回收站恢复资料。");
      await tx.hubResource.update({ where: { id: action.id }, data: { visibility: action.visibility, updatedAt: now } });
      await writeAudit(tx, "visibility_updated", action.id, { before: resource.visibility, after: action.visibility }, now);
      return { id: action.id, visibility: action.visibility };
    }
    if (action.action === "createFolder") {
      const graph = await readGraph(tx);
      if (action.parentId) {
        const parent = graph.folders.get(action.parentId);
        if (!parent) notFound("文件夹", action.parentId);
        if (parent.deleted) conflict("不能在已删除的文件夹中创建内容。");
      }
      const name = ensureName(action.name);
      if (isNameTaken(graph, action.parentId, name)) conflict(`同级已有名为“${name}”的项目。`);
      const folder = await tx.hubFolder.create({ data: { id: randomUUID(), name, parentId: action.parentId, deleted: false, trashBatchId: null, createdAt: now, updatedAt: now } });
      await writeAudit(tx, "folder_created", folder.id, { name, parentId: action.parentId }, now);
      return { folder: { id: folder.id, name: folder.name, parentId: folder.parentId, deleted: folder.deleted } };
    }

    if (action.action === "rename") {
      const graph = await readGraph(tx);
      const name = ensureName(action.name);
      if (action.kind === "folder") {
        const folder = graph.folders.get(action.id);
        if (!folder) notFound("文件夹", action.id);
        if (folder.deleted) conflict("已删除的文件夹需要先恢复才能重命名。");
        if (isNameTaken(graph, folder.parentId, name, new Set([folder.id]))) conflict(`同级已有名为“${name}”的项目。`);
        await tx.hubFolder.update({ where: { id: folder.id }, data: { name, updatedAt: now } });
      } else {
        const resource = graph.resources.get(action.id);
        if (!resource) notFound("资源", action.id);
        if (resource.archived) conflict("已归档的资源需要先恢复才能重命名。");
        const folderId = resource.location?.folderId ?? null;
        if (isNameTaken(graph, folderId, name, new Set(), new Set([resource.id]))) conflict(`同级已有名为“${name}”的项目。`);
        await tx.hubResourceLocation.upsert({ where: { resourceId: resource.id }, create: { resourceId: resource.id, folderId, name, archivedBeforeTrash: false, trashBatchId: null, updatedAt: now }, update: { name, updatedAt: now } });
      }
      await writeAudit(tx, "renamed", action.id, { kind: action.kind, name }, now);
      return { id: action.id, kind: action.kind, name };
    }

    if (action.action === "move") {
      const graph = await readGraph(tx);
      const items = new Map(action.items.map(item => [`${item.kind}:${item.id}`, item]));
      if (items.size !== action.items.length) invalid("批量操作中不能重复选择同一个项目。");
      if (action.folderId) {
        const destination = graph.folders.get(action.folderId);
        if (!destination) notFound("文件夹", action.folderId);
        if (destination.deleted) conflict("不能移动到已删除的文件夹。");
      }
      const folderItems = action.items.filter(item => item.kind === "folder");
      const resourceItems = action.items.filter(item => item.kind === "resource");
      const movingFolders = new Set(folderItems.map(item => item.id));
      const movingResources = new Set(resourceItems.map(item => item.id));
      for (const left of folderItems) for (const right of folderItems) {
        if (left.id !== right.id && isDescendant(graph, left.id, right.id)) invalid("不能同时移动存在父子关系的文件夹。");
      }
      for (const item of folderItems) {
        const folder = graph.folders.get(item.id);
        if (!folder) notFound("文件夹", item.id);
        if (folder.deleted) conflict("已删除的文件夹需要先恢复才能移动。");
        if (action.folderId === folder.id || isDescendant(graph, action.folderId, folder.id)) conflict("不能把文件夹移动到自己或自己的子文件夹中。");
        if (action.folderId && movingFolders.has(action.folderId)) conflict("不能移动到本批次也在移动的文件夹中。");
      }
      for (const item of resourceItems) {
        const resource = graph.resources.get(item.id);
        if (!resource) notFound("资源", item.id);
        if (resource.archived) conflict("已归档的资源需要先恢复才能移动。");
        if (resource.location?.folderId && [...movingFolders].some(folderId => isDescendant(graph, resource.location!.folderId, folderId))) invalid("不能同时移动文件夹及其内部资源。");
      }
      const targetNames = new Map<string, string>();
      for (const item of folderItems) {
        const folder = graph.folders.get(item.id)!;
        if (isNameTaken(graph, action.folderId, folder.name, movingFolders, movingResources)) conflict(`移动后会与同级项目重名：${folder.name}`);
        const key = normalized(folder.name);
        if (targetNames.has(key)) conflict(`移动批次中存在同级重名：${folder.name}`);
        targetNames.set(key, folder.id);
      }
      for (const item of resourceItems) {
        const resource = graph.resources.get(item.id)!;
        const name = resource.location?.name ?? defaultName(resource);
        if (isNameTaken(graph, action.folderId, name, movingFolders, movingResources)) conflict(`移动后会与同级项目重名：${name}`);
        const key = normalized(name);
        if (targetNames.has(key)) conflict(`移动批次中存在同级重名：${name}`);
        targetNames.set(key, resource.id);
      }
      for (const item of folderItems) await tx.hubFolder.update({ where: { id: item.id }, data: { parentId: action.folderId, updatedAt: now } });
      for (const item of resourceItems) {
        const resource = graph.resources.get(item.id)!;
        const name = resource.location?.name ?? defaultName(resource);
        await tx.hubResourceLocation.upsert({ where: { resourceId: item.id }, create: { resourceId: item.id, folderId: action.folderId, name, archivedBeforeTrash: false, trashBatchId: null, updatedAt: now }, update: { folderId: action.folderId, updatedAt: now } });
      }
      for (const item of action.items) await writeAudit(tx, "moved", item.id, { kind: item.kind, folderId: action.folderId }, now);
      return { moved: action.items };
    }

    if (action.action === "trash") return this.trashInTransaction(tx, action.items, now);
    if (action.action === "restore") return this.restoreInTransaction(tx, action.items, now);
    if (action.action !== "publish") invalid("不支持的知识管理操作。");

    const resource = await tx.hubResource.findUnique({ where: { id: action.id }, include: { versions: true, location: { include: { folder: true } } } });
    if (!resource) notFound("资源", action.id);
    const graph = await readGraph(tx);
    if (resource.archived || hasDeletedAncestor(graph, resource.location?.folderId ?? null)) conflict("已归档的资源或已删除目录中的资源需要先恢复，才能发布。");
    const version = resource.versions.find(item => item.id === action.versionId);
    if (!version) notFound("资源版本", action.versionId);
    const current = resource.versions.find(item => item.id === resource.publishedVersionId);
    if (current && current.number > version.number) conflict("不能发布较旧的资源版本。");
    const publishedAt = version.publishedAt ?? now;
    await tx.hubVersion.update({ where: { id: version.id }, data: { publishedAt } });
    await tx.hubResource.update({ where: { id: resource.id }, data: { publishedVersionId: version.id, archived: false, updatedAt: now } });
    await writeAudit(tx, "published", resource.id, version.id, now);
    return { resourceId: resource.id, versionId: version.id, publishedAt };
  }

  private async trashInTransaction(tx: Tx, items: Array<{ kind: "folder" | "resource"; id: string }>, now: Date) {
    const graph = await readGraph(tx);
    const uniqueItems = new Set(items.map(item => `${item.kind}:${item.id}`));
    if (uniqueItems.size !== items.length) invalid("批量操作中不能重复选择同一个项目。");
    const selectedFolders = new Set(items.filter(item => item.kind === "folder").map(item => item.id));
    const selectedResources = new Set(items.filter(item => item.kind === "resource").map(item => item.id));
    const folderIds = new Set<string>();
    for (const id of selectedFolders) {
      const folder = graph.folders.get(id);
      if (!folder) notFound("文件夹", id);
      if (folder.deleted) conflict("项目已经在回收站中。");
      for (const other of selectedFolders) if (other !== id && isDescendant(graph, other, id)) invalid("不能同时删除存在父子关系的文件夹。");
      for (const child of activeDescendants(graph, id)) folderIds.add(child);
    }
    for (const id of selectedResources) {
      const resource = graph.resources.get(id);
      if (!resource) notFound("资源", id);
      if (resource.archived) conflict("项目已经在回收站中。");
    }
    const affectedResources = new Set<string>(selectedResources);
    for (const resource of graph.resources.values()) if (resource.location?.folderId && folderIds.has(resource.location.folderId)) affectedResources.add(resource.id);
    for (const id of affectedResources) if (resourceIdIsProtected(id)) throw new KnowledgeManagerError("conflict", `受保护资源不能删除：${id}`);
    const trashBatchId = randomUUID();
    for (const id of folderIds) await tx.hubFolder.update({ where: { id }, data: { deleted: true, trashBatchId, updatedAt: now } });
    for (const id of affectedResources) {
      const resource = graph.resources.get(id)!;
      const fromFolder = resource.location?.folderId ? folderIds.has(resource.location.folderId) : false;
      await tx.hubResource.update({ where: { id }, data: { archived: true, updatedAt: now } });
      if (resource.location) await tx.hubResourceLocation.update({ where: { resourceId: id }, data: { archivedBeforeTrash: fromFolder ? resource.archived : false, trashBatchId, updatedAt: now } });
    }
    for (const item of items) await writeAudit(tx, "trashed", item.id, { kind: item.kind }, now);
    return { trashed: items };
  }

  private async restoreInTransaction(tx: Tx, items: Array<{ kind: "folder" | "resource"; id: string }>, now: Date) {
    const graph = await readGraph(tx);
    const uniqueItems = new Set(items.map(item => `${item.kind}:${item.id}`));
    if (uniqueItems.size !== items.length) invalid("批量操作中不能重复选择同一个项目。");
    const folderIds = new Set<string>();
    const resourceIds = new Set<string>();
    const explicitContainerBatches = new Map<string, string | null>();
    for (const item of items) {
      if (item.kind === "folder") {
        const folder = graph.folders.get(item.id);
        if (!folder) notFound("文件夹", item.id);
        if (!folder.deleted) conflict("项目不在回收站中。");
        const batchId = folder.trashBatchId;
        for (const child of descendants(graph, item.id)) {
          const candidate = graph.folders.get(child)!;
          if (candidate.deleted && (child === item.id || batchId === null || candidate.trashBatchId === batchId)) {
            folderIds.add(child);
            explicitContainerBatches.set(child, batchId);
          }
        }
        for (const ancestor of ancestors(graph, folder.parentId)) if (graph.folders.get(ancestor)!.deleted) folderIds.add(ancestor);
      } else {
        const resource = graph.resources.get(item.id);
        if (!resource) notFound("资源", item.id);
        if (!resource.archived) conflict("项目不在回收站中。");
        resourceIds.add(item.id);
        for (const ancestor of ancestors(graph, resource.location?.folderId ?? null)) if (graph.folders.get(ancestor)!.deleted) folderIds.add(ancestor);
      }
    }
    for (const [folderId, batchId] of explicitContainerBatches) {
      for (const resource of graph.resources.values()) {
        if (resource.location?.folderId !== folderId || !resource.archived || resource.location.archivedBeforeTrash) continue;
        if (batchId === null || resource.location.trashBatchId === batchId) resourceIds.add(resource.id);
      }
    }
    collectRestoreConflicts(graph, folderIds, resourceIds);
    for (const id of folderIds) await tx.hubFolder.update({ where: { id }, data: { deleted: false, trashBatchId: null, updatedAt: now } });
    for (const id of resourceIds) {
      const resource = graph.resources.get(id)!;
      await tx.hubResource.update({ where: { id }, data: { archived: false, updatedAt: now } });
      if (resource.location) await tx.hubResourceLocation.update({ where: { resourceId: id }, data: { archivedBeforeTrash: false, trashBatchId: null, updatedAt: now } });
    }
    for (const item of items) await writeAudit(tx, "restored", item.id, { kind: item.kind }, now);
    return { restored: items };
  }

  async importManagedResource(input: ManagedImportInput, folderId: string | null, name: string, conflictMode: ManagedImportConflict): Promise<ManagedImportResult> {
    const parsed = importSchema.parse(input);
    const requestedName = ensureName(name);
    if (!["ask", "overwrite", "rename", "skip"].includes(conflictMode)) invalid("导入冲突策略不正确。");
    return serializable(this.client, async tx => {
      const graph = await readGraph(tx);
      if (folderId) {
        const folder = graph.folders.get(folderId);
        if (!folder) notFound("文件夹", folderId);
        if (folder.deleted) conflict("不能导入到已删除的文件夹。");
      }
      const existingById = graph.resources.get(parsed.id);
      if (existingById?.archived) conflict("资源在回收站中，请先恢复后再覆盖或更新。");
      const sameNameResources = [...graph.resources.values()]
        .filter(resource => {
          const resourceFolder = resource.location?.folderId ?? null;
          const resourceName = resource.location?.name ?? defaultName(resource);
          return sameParent(resourceFolder, folderId) && normalized(resourceName) === normalized(requestedName);
        })
        .sort((left, right) => Number(left.archived) - Number(right.archived));
      const sameName = sameNameResources[0];
      const sameNameFolder = [...graph.folders.values()]
        .filter(folder => sameParent(folder.parentId, folderId) && normalized(folder.name) === normalized(requestedName))
        .sort((left, right) => Number(left.deleted) - Number(right.deleted))[0];
      let targetResourceId = parsed.id;
      let effectiveName = requestedName;
      let renamed = false;
      if (sameNameFolder) {
        if (conflictMode !== "rename") conflict(`同级已有名为“${requestedName}”的文件夹。`);
        renamed = true;
      }
      if (sameName && sameName.id !== parsed.id) {
        if (conflictMode === "ask") conflict(`同级已有名为“${requestedName}”的资源。`);
        if (conflictMode === "skip") return { skipped: true, resourceId: sameName.id, versionId: sameName.latestVersionId ?? undefined, name: requestedName, folderId };
        if (conflictMode === "overwrite") {
          if (sameName.archived) conflict("同名资源在回收站中，请先恢复后再覆盖。");
          targetResourceId = sameName.id;
        }
        if (conflictMode === "rename") renamed = true;
      }
      if (renamed) {
        const extension = requestedName.match(/^(.*?)(\.[^.]*)$/);
        const stem = extension?.[1] ?? requestedName;
        const suffix = extension?.[2] ?? "";
        let index = 2;
        do {
          effectiveName = `${stem} (${index})${suffix}`;
          index += 1;
        } while (isNameTaken(graph, folderId, effectiveName, new Set(), new Set([parsed.id]), true));
      }
      if (existingById && parsed.baseVersionId && parsed.baseVersionId !== existingById.latestVersionId) conflict("资源已经发生变化，请重新读取后再导入。");
      const targetExisting = graph.resources.get(targetResourceId);
      const baseVersionId = targetExisting?.latestVersionId ?? parsed.baseVersionId;
      const imported = await createKnowledgeHubForTransaction(tx).import({ ...parsed, id: targetResourceId, baseVersionId });
      await tx.hubResourceLocation.upsert({
        where: { resourceId: imported.resourceId },
        create: { resourceId: imported.resourceId, folderId, name: effectiveName, archivedBeforeTrash: false, trashBatchId: null, updatedAt: new Date() },
        update: { folderId, name: effectiveName, archivedBeforeTrash: false, trashBatchId: null, updatedAt: new Date() },
      });
      await writeAudit(tx, "managed_imported", imported.resourceId, { folderId, name: effectiveName, conflict: conflictMode }, new Date());
      return { ...imported, name: effectiveName, folderId, renamed };
    });
  }
}

export function createKnowledgeManager(client: PrismaClient = prisma) {
  return new KnowledgeManager(client);
}

/** Upload routes can use this stable function without knowing the Prisma wiring. */
export async function importManagedResource(input: ManagedImportInput, folderId: string | null, name: string, conflictMode: ManagedImportConflict) {
  return createKnowledgeManager().importManagedResource(input, folderId, name, conflictMode);
}

export function knowledgeManagerErrorResponse(error: unknown) {
  if (error instanceof HubError) return Response.json({ error: error.message, code: error.code }, { status: error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400 });
  if (error instanceof ZodError) return Response.json({ error: "请求参数不正确。", code: "invalid" }, { status: 400 });
  return null;
}
