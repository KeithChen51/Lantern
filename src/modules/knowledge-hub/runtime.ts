import { prisma } from "@/infrastructure/db";
import { resolveKnowledgeSqlitePath } from "./sqlite-path";
import { KnowledgeHub } from "./service";
import { PrismaHubStore } from "./prisma-store";
import { SqliteHubStore } from "./sqlite-store";
import type { HubStore } from "./types";

type SqliteRuntime = { path: string; store: SqliteHubStore };
const local = globalThis as typeof globalThis & { lighthouseSqliteHub?: SqliteRuntime; lanternSqliteHub?: SqliteRuntime };

export function getKnowledgeHubStore(): HubStore {
  const driver = process.env.KNOWLEDGE_HUB_DRIVER || "mysql";
  if (driver === "sqlite") {
    const path = resolveKnowledgeSqlitePath(process.env.KNOWLEDGE_HUB_SQLITE_PATH);
    // Share the old key during hot reload rather than opening a second connection.
    local.lighthouseSqliteHub ??= local.lanternSqliteHub ?? { path, store: new SqliteHubStore(path) };
    local.lanternSqliteHub = local.lighthouseSqliteHub;
    if (local.lighthouseSqliteHub.path !== path) throw new Error("Restart the knowledge process after changing its SQLite path.");
    return local.lighthouseSqliteHub.store;
  }
  if (driver !== "mysql") throw new Error("Unknown knowledge storage driver: " + driver);
  if (!process.env.DATABASE_URL) throw new Error("Knowledge hub requires DATABASE_URL or KNOWLEDGE_HUB_DRIVER=sqlite.");
  return new PrismaHubStore(prisma);
}

export async function closeKnowledgeHub() {
  (local.lighthouseSqliteHub ?? local.lanternSqliteHub)?.store.close();
  delete local.lighthouseSqliteHub;
  delete local.lanternSqliteHub;
  await prisma.$disconnect();
}

export function getKnowledgeHub() {
  return new KnowledgeHub(getKnowledgeHubStore());
}
export function isKnowledgeHubEnabled() {
  return process.env.KNOWLEDGE_HUB_ENABLED === "true";
}
