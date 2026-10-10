import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { initializeBaseFolders } from "./base-folders";

describe("base knowledge folders", () => {
  it("places only unorganized resources, keeps an empty guidelines folder, and preserves operator moves on redeploy", async () => {
    type Folder = { id: string; name: string; parentId: string | null; deleted: boolean };
    type Location = { resourceId: string; folderId: string | null; name: string };
    const folders: Folder[] = [];
    const locations: Location[] = [{ resourceId: "manual-case", folderId: null, name: "人工整理.md" }];
    const resources = [
      { id: "brand-whitepaper", type: "document", title: "白皮书" },
      { id: "case-a", type: "case", title: "案例" },
      { id: "manual-case", type: "case", title: "人工整理" },
      { id: "skill-a", type: "skill", title: "Skill" },
      { id: "other", type: "document", title: "未分类" },
    ];
    const matches = (row: object, where: object) => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value);
    const tx = {
      hubFolder: {
        findUnique: async ({ where }: { where: object }) => folders.find(row => matches(row, where)) ?? null,
        findFirst: async ({ where }: { where: object }) => folders.find(row => matches(row, where)) ?? null,
        create: async ({ data }: { data: Folder }) => { folders.push(data); return data; },
      },
      hubResource: { findMany: async () => resources.filter(row => !locations.some(location => location.resourceId === row.id)) },
      hubResourceLocation: {
        findFirst: async ({ where }: { where: object }) => locations.find(row => matches(row, where)) ?? null,
        create: async ({ data }: { data: Location }) => { locations.push(data); return data; },
      },
      hubAudit: { create: async () => ({}) },
    } as unknown as Prisma.TransactionClient;
    expect((await initializeBaseFolders(tx)).placed).toBe(3);
    expect(folders.map(folder => folder.name)).toEqual(["白皮书", "参悟案例", "行为准则", "Skill"]);
    expect(locations.filter(location => location.folderId === "base-guidelines")).toHaveLength(0);
    const caseLocation = locations.find(location => location.resourceId === "case-a")!;
    caseLocation.folderId = null;
    expect((await initializeBaseFolders(tx)).placed).toBe(0);
    expect(caseLocation.folderId).toBeNull();
    expect(folders).toHaveLength(4);
    expect(locations.find(location => location.resourceId === "manual-case")?.folderId).toBeNull();
  });
});
