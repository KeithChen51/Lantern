import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const baseFolders = [
  { id: "base-whitepapers", name: "白皮书" },
  { id: "base-cases", name: "参悟案例" },
  { id: "base-guidelines", name: "行为准则" },
  { id: "base-skills", name: "Skill" },
] as const;

export function baseFolderFor(resource: { id: string; type: string }) {
  if (["brand-whitepaper", "brand-guide", "knowledge-heart-values"].includes(resource.id)) return "base-whitepapers";
  if (resource.type === "case") return "base-cases";
  if (resource.type === "skill") return "base-skills";
  return null;
}

/** First placement only. Redeploying must not undo an operator's organization. */
export async function initializeBaseFolders(tx: Prisma.TransactionClient) {
  const now = new Date();
  const alreadyOrganized = await tx.hubAudit.findFirst({ where: { action: "base_folders_initialized", targetId: "base-folders-v1" } });
  const destinations = new Map<string, string>();
  for (const definition of baseFolders) {
    const existing = await tx.hubFolder.findUnique({ where: { id: definition.id } });
    if (existing) {
      if (!existing.deleted) destinations.set(definition.id, existing.id);
      continue;
    }
    const byName = await tx.hubFolder.findFirst({ where: { parentId: null, name: definition.name, deleted: false } });
    if (byName) { destinations.set(definition.id, byName.id); continue; }
    await tx.hubFolder.create({ data: { ...definition, parentId: null, deleted: false, createdAt: now, updatedAt: now } });
    destinations.set(definition.id, definition.id);
  }
  const resources = await tx.hubResource.findMany({
    where: { archived: false, ...(alreadyOrganized ? { location: null } : { OR: [{ location: null }, { location: { folderId: null } }] }) },
    select: { id: true, type: true, title: true, location: { select: { name: true } } },
  });
  let placed = 0;
  for (const resource of resources) {
    const key = baseFolderFor(resource);
    const folderId = key && destinations.get(key);
    if (!folderId) continue;
    const original = resource.location?.name ?? (resource.type === "skill" ? resource.title : `${resource.title}.md`);
    let name = original;
    let suffix = 2;
    while (await tx.hubResourceLocation.findFirst({ where: { folderId, name } }) || await tx.hubFolder.findFirst({ where: { parentId: folderId, name, deleted: false } })) name = `${original} (${suffix++})`;
    await tx.hubResourceLocation.upsert({ where: { resourceId: resource.id }, create: { resourceId: resource.id, folderId, name, updatedAt: now }, update: { folderId, name, updatedAt: now } });
    await tx.hubAudit.create({ data: { id: randomUUID(), action: "base_folder_placed", targetId: resource.id, detail: JSON.stringify({ folderId, name }), createdAt: now } });
    placed++;
  }
  if (!alreadyOrganized) await tx.hubAudit.create({ data: { id: randomUUID(), action: "base_folders_initialized", targetId: "base-folders-v1", detail: JSON.stringify({ placed }), createdAt: now } });
  return { folders: [...destinations.values()], placed };
}
