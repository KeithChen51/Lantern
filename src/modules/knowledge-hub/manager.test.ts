/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { HubError, importSchema } from "./service";
import { createKnowledgeManager, protectedKnowledgeIds } from "./manager";

type AnyRow = Record<string, any>;

class MemoryManagerDb {
  state = {
    folders: [] as AnyRow[],
    resources: [] as AnyRow[],
    locations: [] as AnyRow[],
    audits: [] as AnyRow[],
  };

  hubFolder = {
    findMany: async () => structuredClone(this.state.folders),
    create: async ({ data }: AnyRow) => { this.state.folders.push(structuredClone(data)); return structuredClone(data); },
    update: async ({ where, data }: AnyRow) => {
      const row = this.state.folders.find(item => item.id === where.id);
      if (!row) throw new Error("folder missing");
      Object.assign(row, structuredClone(data));
      return structuredClone(row);
    },
  };

  hubResource = {
    findMany: async () => this.state.resources.map(row => this.resourceRow(row)),
    findUnique: async ({ where }: AnyRow) => {
      const row = this.state.resources.find(item => item.id === where.id);
      return row ? this.resourceRow(row) : null;
    },
    update: async ({ where, data }: AnyRow) => {
      const row = this.state.resources.find(item => item.id === where.id);
      if (!row) throw new Error("resource missing");
      Object.assign(row, structuredClone(data));
      return this.resourceRow(row);
    },
    upsert: async ({ where, create, update }: AnyRow) => {
      const row = this.state.resources.find(item => item.id === where.id);
      if (row) Object.assign(row, structuredClone(update));
      else this.state.resources.push({ ...structuredClone(create), versions: [] });
      const target = row ?? this.state.resources.at(-1);
      if (!target) throw new Error("resource missing");
      return this.resourceRow(target);
    },
  };

  hubResourceLocation = {
    upsert: async ({ where, create, update }: AnyRow) => {
      const found = this.state.locations.find(item => item.resourceId === where.resourceId);
      if (found) Object.assign(found, structuredClone(update));
      else this.state.locations.push(structuredClone(create));
      return structuredClone(found ?? this.state.locations.at(-1));
    },
    update: async ({ where, data }: AnyRow) => {
      const row = this.state.locations.find(item => item.resourceId === where.resourceId);
      if (!row) throw new Error("location missing");
      Object.assign(row, structuredClone(data));
      return structuredClone(row);
    },
  };

  hubVersion = {
    update: async ({ where, data }: AnyRow) => {
      const resource = this.state.resources.find(item => (item.versions ?? []).some((version: AnyRow) => version.id === where.id));
      const version = resource?.versions.find((item: AnyRow) => item.id === where.id);
      if (version) Object.assign(version, structuredClone(data));
      return structuredClone(version ?? {});
    },
    upsert: async ({ create, update }: AnyRow) => {
      const resource = this.state.resources.find(item => item.id === create.resourceId);
      if (!resource) throw new Error("resource missing");
      const version = resource.versions.find((item: AnyRow) => item.id === create.id);
      if (version) Object.assign(version, structuredClone(update));
      else resource.versions.push(structuredClone(create));
      return structuredClone(version ?? resource.versions.at(-1));
    },
  };

  hubAudit = {
    create: async ({ data }: AnyRow) => { this.state.audits.push(structuredClone(data)); return structuredClone(data); },
  };

  async $transaction(callback: (tx: this) => Promise<unknown>) {
    const snapshot = structuredClone(this.state);
    try {
      return await callback(this);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  private resourceRow(row: AnyRow) {
    return {
      ...structuredClone(row),
      location: structuredClone(this.state.locations.find(item => item.resourceId === row.id) ?? null),
      versions: structuredClone(row.versions ?? []),
    };
  }
}

function seedResource(db: MemoryManagerDb, id = "doc", title = "资料", folderId: string | null = null) {
  const now = new Date("2026-10-10T00:00:00.000Z");
  db.state.resources.push({ id, type: "document", title, summary: "", tags: [], source: "test", businessScope: "", archived: false, publishedVersionId: "v1", createdAt: now, updatedAt: now, versions: [{ id: "v1", resourceId: id, number: 1, title, markdown: `# ${title}`, checksum: "seed", changeNote: "", createdAt: now, publishedAt: now, validity: "unknown", effectiveFrom: null, effectiveTo: null, files: [], citations: [] }] });
  db.state.locations.push({ resourceId: id, folderId, name: `${title}.md`, archivedBeforeTrash: false, updatedAt: now });
}

function setup() {
  const db = new MemoryManagerDb();
  return { db, manager: createKnowledgeManager(db as unknown as PrismaClient) };
}

describe("knowledge manager", () => {
  it("maintains case audience with an audit without changing publication", async () => {
    const { db, manager } = setup();
    seedResource(db, "case-a", "案例");
    db.state.resources[0].type = "case";
    db.state.resources[0].visibility = "internal";
    await manager.apply({ action: "setVisibility", id: "case-a", visibility: "public" });
    expect((await manager.list()).resources[0]).toMatchObject({ visibility: "public", publishedVersionId: "v1" });
    expect(db.state.audits.at(-1)).toMatchObject({ action: "visibility_updated" });
    await manager.apply({ action: "trash", items: [{ kind: "resource", id: "case-a" }] });
    await expect(manager.apply({ action: "setVisibility", id: "case-a", visibility: "internal" })).rejects.toThrow("恢复");
    seedResource(db, "document-a");
    await expect(manager.apply({ action: "setVisibility", id: "document-a", visibility: "internal" })).rejects.toThrow("仅用于");
  });
  it("creates folders and rejects duplicate names and cycles", async () => {
    const { manager } = setup();
    const root = await manager.apply({ action: "createFolder", name: "资料", parentId: null });
    const rootId = (root as { folder: { id: string } }).folder.id;
    const child = await manager.apply({ action: "createFolder", name: "子目录", parentId: rootId });
    const childId = (child as { folder: { id: string } }).folder.id;
    await expect(manager.apply({ action: "createFolder", name: "资料", parentId: null })).rejects.toMatchObject({ code: "conflict" });
    await expect(manager.apply({ action: "move", items: [{ kind: "folder", id: rootId }], folderId: childId })).rejects.toMatchObject({ code: "conflict" });
    await expect(manager.apply({ action: "createFolder", name: ".", parentId: null })).rejects.toThrow();
    await expect(manager.apply({ action: "createFolder", name: "带\u0001控制符", parentId: null })).rejects.toThrow();
  });

  it("trashes and restores a folder with its resource atomically", async () => {
    const { db, manager } = setup();
    const folderResult = await manager.apply({ action: "createFolder", name: "规范", parentId: null });
    const folderId = (folderResult as { folder: { id: string } }).folder.id;
    seedResource(db, "guide", "规范", folderId);
    await manager.apply({ action: "trash", items: [{ kind: "folder", id: folderId }] });
    expect(db.state.folders.find(item => item.id === folderId)?.deleted).toBe(true);
    expect(db.state.resources.find(item => item.id === "guide")?.archived).toBe(true);
    await manager.apply({ action: "restore", items: [{ kind: "folder", id: folderId }] });
    expect(db.state.folders.find(item => item.id === folderId)?.deleted).toBe(false);
    expect(db.state.resources.find(item => item.id === "guide")?.archived).toBe(false);
    expect(db.state.resources.find(item => item.id === "guide")?.publishedVersionId).toBe("v1");
  });

  it("protects required resources and rolls back a failed batch", async () => {
    const { db, manager } = setup();
    seedResource(db, protectedKnowledgeIds[0], "白皮书");
    const otherFolder = await manager.apply({ action: "createFolder", name: "临时", parentId: null });
    const folderId = (otherFolder as { folder: { id: string } }).folder.id;
    await expect(manager.apply({ action: "trash", items: [{ kind: "resource", id: protectedKnowledgeIds[0] }] })).rejects.toMatchObject({ code: "conflict" });
    await expect(manager.apply({ action: "trash", items: [{ kind: "folder", id: folderId }, { kind: "folder", id: "missing" }] })).rejects.toThrow(HubError);
    expect(db.state.folders.find(item => item.id === folderId)?.deleted).toBe(false);
  });

  it("refuses to trash a folder containing a protected resource", async () => {
    const { db, manager } = setup();
    const folderResult = await manager.apply({ action: "createFolder", name: "系统资料", parentId: null });
    const folderId = (folderResult as { folder: { id: string } }).folder.id;
    seedResource(db, protectedKnowledgeIds[1], "核心价值", folderId);
    await expect(manager.apply({ action: "trash", items: [{ kind: "folder", id: folderId }] })).rejects.toMatchObject({ code: "conflict" });
    expect(db.state.folders.find(item => item.id === folderId)?.deleted).toBe(false);
    expect(db.state.resources.find(item => item.id === protectedKnowledgeIds[1])?.archived).toBe(false);
  });

  it("restores only the selected resource when its folder was trashed", async () => {
    const { db, manager } = setup();
    const folderResult = await manager.apply({ action: "createFolder", name: "资料", parentId: null });
    const folderId = (folderResult as { folder: { id: string } }).folder.id;
    seedResource(db, "first", "第一份", folderId);
    seedResource(db, "second", "第二份", folderId);
    await manager.apply({ action: "trash", items: [{ kind: "folder", id: folderId }] });
    await manager.apply({ action: "restore", items: [{ kind: "resource", id: "first" }] });
    expect(db.state.folders.find(item => item.id === folderId)?.deleted).toBe(false);
    expect(db.state.resources.find(item => item.id === "first")?.archived).toBe(false);
    expect(db.state.resources.find(item => item.id === "second")?.archived).toBe(true);
  });

  it("keeps a separately trashed child out of a parent folder restore", async () => {
    const { db, manager } = setup();
    const rootResult = await manager.apply({ action: "createFolder", name: "根目录", parentId: null });
    const rootId = (rootResult as { folder: { id: string } }).folder.id;
    const childResult = await manager.apply({ action: "createFolder", name: "子目录", parentId: rootId });
    const childId = (childResult as { folder: { id: string } }).folder.id;
    seedResource(db, "child-resource", "子资料", childId);
    await manager.apply({ action: "trash", items: [{ kind: "folder", id: childId }] });
    await manager.apply({ action: "trash", items: [{ kind: "folder", id: rootId }] });
    await manager.apply({ action: "restore", items: [{ kind: "folder", id: rootId }] });
    expect(db.state.folders.find(item => item.id === rootId)?.deleted).toBe(false);
    expect(db.state.folders.find(item => item.id === childId)?.deleted).toBe(true);
    expect(db.state.resources.find(item => item.id === "child-resource")?.archived).toBe(true);
  });

  it("does not publish an archived resource or one below a deleted folder", async () => {
    const { db, manager } = setup();
    seedResource(db, "archived", "已归档");
    await manager.apply({ action: "trash", items: [{ kind: "resource", id: "archived" }] });
    await expect(manager.apply({ action: "publish", id: "archived", versionId: "v1" })).rejects.toMatchObject({ code: "conflict" });
    const folderResult = await manager.apply({ action: "createFolder", name: "待恢复", parentId: null });
    const folderId = (folderResult as { folder: { id: string } }).folder.id;
    seedResource(db, "nested", "嵌套", folderId);
    await manager.apply({ action: "trash", items: [{ kind: "folder", id: folderId }] });
    await expect(manager.apply({ action: "publish", id: "nested", versionId: "v1" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("treats folders as import conflicts and prefers active resources", async () => {
    const { db, manager } = setup();
    await manager.apply({ action: "createFolder", name: "资料", parentId: null });
    const skill = importSchema.parse({ id: "new-skill", type: "skill", title: "技能", markdown: "# 技能", source: "测试" });
    await expect(manager.importManagedResource(skill, null, "资料", "ask")).rejects.toMatchObject({ code: "conflict" });
    expect((await manager.importManagedResource(skill, null, "资料", "rename")).name).toBe("资料 (2)");

    seedResource(db, "archived-copy", "同名");
    db.state.resources.find(item => item.id === "archived-copy")!.archived = true;
    seedResource(db, "active-copy", "同名");
    const incoming = importSchema.parse({ id: "incoming", type: "document", title: "同名", markdown: "# 新版", source: "测试" });
    const overwritten = await manager.importManagedResource(incoming, null, "同名.md", "overwrite");
    expect(overwritten.resourceId).toBe("active-copy");
    expect(db.state.resources.find(item => item.id === "archived-copy")?.archived).toBe(true);
  });

  it("returns the file tree shape and stable default names", async () => {
    const { db, manager } = setup();
    seedResource(db, "tool", "工具说明");
    db.state.resources[0].type = "skill";
    db.state.locations = [];
    const result = await manager.list();
    expect(result.resources[0]).toMatchObject({ id: "tool", name: "工具说明", folderId: null, latestVersionId: "v1" });
    expect(result.protectedIds).toEqual(["brand-whitepaper", "knowledge-heart-values"]);
  });

  it("requires an explicit conflict policy and preserves an archived resource's publication pointer", async () => {
    const { db, manager } = setup();
    seedResource(db, "old", "资料");
    db.state.resources[0].archived = true;
    const input = importSchema.parse({ id: "incoming", type: "document", title: "资料", markdown: "# 新内容", source: "测试" });
    await expect(manager.importManagedResource(input, null, "资料.md", "ask")).rejects.toMatchObject({ code: "conflict" });
    await expect(manager.importManagedResource(input, null, "资料.md", "overwrite")).rejects.toMatchObject({ code: "conflict" });
    await manager.apply({ action: "restore", items: [{ kind: "resource", id: "old" }] });
    const imported = await manager.importManagedResource(input, null, "资料.md", "overwrite");
    expect(imported.resourceId).toBe("old");
    expect(db.state.resources.find(item => item.id === "old")).toMatchObject({ archived: false, publishedVersionId: "v1" });
    expect((await manager.importManagedResource({ ...input, id: "incoming-2" }, null, "资料.md", "rename")).name).toBe("资料 (2).md");
  });
});
