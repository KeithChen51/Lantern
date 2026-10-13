import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { loadInitialContent } from "./initial-content";
import { initializeKnowledgeDatabase } from "./initial-install";

type Row = Record<string, unknown>;
type State = Map<string, Row[]>;

// A transaction/Prisma adapter fixture, not a MySQL substitute. It exercises the
// real hub import/publication and folder services. InnoDB locking still needs a
// real MySQL integration run in the deployment environment.
function fixture() {
  let state: State = new Map(Prisma.dmmf.datamodel.models.map(model => [model.dbName ?? model.name, []]));
  state.set("_prisma_migrations", [{ finished_at: new Date(), rolled_back_at: null }]);
  const queries: string[] = [];
  const transactions: unknown[] = [];
  let failingFolder = false;
  let previous = Promise.resolve();
  const client = {
    async $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options: unknown) {
      transactions.push(options);
      const before = previous;
      let release!: () => void;
      previous = new Promise<void>(resolve => { release = resolve; });
      await before;
      const next = structuredClone(state);
      const rows = (table: string) => next.get(table)!;
      const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
      const upsert = (table: string, where: Row, create: Row, update: Row) => {
        const existing = rows(table).find(row => matches(row, where));
        if (existing) { Object.assign(existing, structuredClone(update)); return existing; }
        const inserted = structuredClone(create); rows(table).push(inserted); return inserted;
      };
      const tx = {
        $queryRaw: async (parts: TemplateStringsArray) => {
          const sql = parts.join(""); queries.push(sql);
          if (sql.includes("information_schema")) return [...next.keys()].map(name => ({ name, engine: "InnoDB" }));
          return rows("_prisma_migrations").filter(row => row.finished_at === null && row.rolled_back_at === null).slice(0, 1).map(() => ({ occupied: 1 }));
        },
        $queryRawUnsafe: async (sql: string) => {
          queries.push(sql);
          const table = /FROM `((?:``|[^`])+)`/.exec(sql)![1].replace(/``/g, "`");
          return rows(table).slice(0, 1).map(() => ({ occupied: 1 }));
        },
        hubResource: {
          findUnique: async ({ where }: { where: Row }) => {
            const row = rows("hub_resources").find(row => matches(row, where));
            return row ? { ...structuredClone(row), versions: structuredClone(rows("hub_versions").filter(version => version.resourceId === row.id)) } : null;
          },
          upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => upsert("hub_resources", where, create, update),
          findMany: async () => rows("hub_resources").filter(row => !row.archived).map(row => ({ ...row, location: null })),
        },
        hubVersion: { upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => upsert("hub_versions", where, create, update) },
        hubAudit: {
          create: async ({ data }: { data: Row }) => { rows("hub_audits").push(structuredClone(data)); return data; },
          findFirst: async ({ where }: { where: Row }) => rows("hub_audits").find(row => matches(row, where)) ?? null,
        },
        hubFolder: {
          findUnique: async ({ where }: { where: Row }) => rows("hub_folders").find(row => matches(row, where)) ?? null,
          findFirst: async ({ where }: { where: Row }) => rows("hub_folders").find(row => matches(row, where)) ?? null,
          create: async ({ data }: { data: Row }) => { if (failingFolder) throw new Error("injected folder failure"); rows("hub_folders").push(structuredClone(data)); return data; },
        },
        hubResourceLocation: {
          findFirst: async ({ where }: { where: Row }) => rows("hub_resource_locations").find(row => matches(row, where)) ?? null,
          upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => upsert("hub_resource_locations", where, create, update),
        },
      } as unknown as Prisma.TransactionClient;
      try { const result = await fn(tx); state = next; return result; } finally { release(); }
    },
  } as unknown as PrismaClient;
  return { client, queries, transactions, state: () => state, failFolders: () => { failingFolder = true; } };
}

describe("empty-database first initialization", () => {
  it("publishes 22 resources with one version each, four folders and no demo records", async () => {
    const db = fixture();
    expect(await initializeKnowledgeDatabase(db.client, await loadInitialContent())).toEqual({ initialized: true, resources: 22, published: 22, folders: 4 });
    const state = db.state();
    expect(state.get("hub_resources")).toHaveLength(22);
    expect(state.get("hub_versions")).toHaveLength(22);
    expect(state.get("hub_versions")!.every(row => row.publishedAt instanceof Date)).toBe(true);
    expect(state.get("hub_resources")!.every(row => row.publishedVersionId && !row.archived)).toBe(true);
    expect(state.get("hub_folders")!.map(row => row.name)).toEqual(["白皮书", "参悟案例", "行为准则", "Skill"]);
    expect(state.get("hub_resource_locations")).toHaveLength(21);
    expect(state.get("hub_resource_locations")!.some(row => row.folderId === "base-guidelines")).toBe(false);
    expect(state.get("users")).toEqual([]);
    expect(state.get("brands")).toEqual([]);
    expect(db.transactions).toEqual([{ isolationLevel: "Serializable", timeout: 120_000, maxWait: 10_000 }]);
    expect(db.queries.filter(query => query.includes("FOR UPDATE"))).toHaveLength(Prisma.dmmf.datamodel.models.length);
    const before = structuredClone(state);
    await expect(initializeKnowledgeDatabase(db.client, await loadInitialContent())).rejects.toThrow("already contains application data");
    expect(db.state()).toEqual(before);
  });

  it.each([
    ["hub_resources", { id: "hidden", archived: true, publishedVersionId: null }],
    ["hub_folders", { id: "deleted", deleted: true, trashBatchId: "trash" }],
    ["hub_resource_locations", { resourceId: "moved", name: "operator.md", folderId: "operator" }],
    ["hub_audits", { id: "metadata-only", action: "metadata_updated", detail: "operator visibility" }],
    ["chat_sessions", { id: "history" }],
    ["users", { id: "production-user" }],
    ["future_auth_sessions", { id: "future-auth" }],
  ])("refuses occupied %s without altering any operator data", async (table, row) => {
    const db = fixture();
    db.state().set(table, [row]);
    const before = structuredClone(db.state());
    await expect(initializeKnowledgeDatabase(db.client, await loadInitialContent())).rejects.toThrow("already contains application data");
    expect(db.state()).toEqual(before);
    expect(db.state().get("hub_versions")).toEqual([]);
  });

  it("rolls back all imports and publication when folder creation fails", async () => {
    const db = fixture();
    const before = structuredClone(db.state());
    db.failFolders();
    await expect(initializeKnowledgeDatabase(db.client, await loadInitialContent())).rejects.toThrow("injected folder failure");
    expect(db.state()).toEqual(before);
  });

  it("refuses incomplete schema and unfinished migrations before any writes", async () => {
    const inputs = await loadInitialContent();
    const missing = fixture(); missing.state().delete("identity_accounts");
    await expect(initializeKnowledgeDatabase(missing.client, inputs)).rejects.toThrow("fully migrated");
    const unfinished = fixture(); unfinished.state().get("_prisma_migrations")!.push({ finished_at: null, rolled_back_at: null });
    await expect(initializeKnowledgeDatabase(unfinished.client, inputs)).rejects.toThrow("unfinished migration");
    expect(unfinished.state().get("hub_resources")).toEqual([]);
  });

  it("allows only one initializer to commit through the transaction boundary", async () => {
    const db = fixture(); const inputs = await loadInitialContent();
    const outcomes = await Promise.allSettled([initializeKnowledgeDatabase(db.client, inputs), initializeKnowledgeDatabase(db.client, inputs)]);
    expect(outcomes.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(db.state().get("hub_resources")).toHaveLength(22);
    expect(db.state().get("hub_versions")).toHaveLength(22);
  });
});
