import { prisma } from "@/infrastructure/db";
import { resolve } from "node:path";
import { KnowledgeHub } from "./service";
import { PrismaHubStore } from "./prisma-store";
import { SqliteHubStore } from "./sqlite-store";
import type { HubStore } from "./types";

const local = globalThis as typeof globalThis & { lanternSqliteHub?: { path: string; store: SqliteHubStore } };

export function getKnowledgeHubStore(): HubStore {
  const driver = process.env.KNOWLEDGE_HUB_DRIVER || "mysql";
  if (driver === "sqlite") {
    const path = resolve(process.env.KNOWLEDGE_HUB_SQLITE_PATH || "storage/knowledge/lantern.sqlite");
    if (!local.lanternSqliteHub) local.lanternSqliteHub = { path, store: new SqliteHubStore(path) };
    if (local.lanternSqliteHub.path !== path) throw new Error("Restart the knowledge process after changing its SQLite path.");
    return local.lanternSqliteHub.store;
  }
  if (driver !== "mysql") throw new Error("Unknown knowledge storage driver: " + driver);
  if (!process.env.DATABASE_URL) throw new Error("Knowledge hub requires DATABASE_URL or KNOWLEDGE_HUB_DRIVER=sqlite.");
  return new PrismaHubStore(prisma);
}

export async function closeKnowledgeHub() {
  local.lanternSqliteHub?.store.close();
  delete local.lanternSqliteHub;
  await prisma.$disconnect();
}

export function getKnowledgeHub() {
  return new KnowledgeHub(getKnowledgeHubStore());
}
export function isKnowledgeHubEnabled() {
  return process.env.KNOWLEDGE_HUB_ENABLED === "true";
}
