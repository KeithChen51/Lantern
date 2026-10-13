import { Prisma, type PrismaClient } from "@prisma/client";
import { initializeBaseFolders } from "./base-folders";
import { createPrismaHubTransaction } from "./prisma-store";
import { KnowledgeHub } from "./service";
import type { InitialContent } from "./initial-content";

export class InitialInstallError extends Error {}

type Table = { name: string; engine: string | null };
const quoteTable = (name: string) => `\`${name.replace(/`/g, "``")}\``;

/** Inspect every table, including auth or future modules unknown to this importer. */
export async function assertEmptyMigratedDatabase(tx: Prisma.TransactionClient) {
  const tables = await tx.$queryRaw<Table[]>`SELECT TABLE_NAME AS name, ENGINE AS engine
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME`;
  const names = new Set(tables.map(table => table.name));
  if (!names.has("_prisma_migrations") || Prisma.dmmf.datamodel.models.some(model => !names.has(model.dbName ?? model.name))) {
    throw new InitialInstallError("First initialization requires a fully migrated empty MySQL database; run migrate first.");
  }
  const unfinished = await tx.$queryRaw<Array<{ occupied: number }>>`SELECT 1 AS occupied FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL LIMIT 1`;
  if (unfinished.length) throw new InitialInstallError("Database has an unfinished migration; initialization refused.");
  for (const table of tables) {
    if (table.name === "_prisma_migrations") continue;
    if (table.engine?.toLowerCase() !== "innodb") throw new InitialInstallError("First initialization requires transactional InnoDB tables.");
    // At Serializable isolation, a locking read on an empty table takes a gap
    // lock until commit. Concurrent initializers cannot both seed these tables.
    // A deadlock aborts one entire transaction; never retry it as an overwrite.
    const rows = await tx.$queryRawUnsafe<Array<{ occupied: number }>>(`SELECT 1 AS occupied FROM ${quoteTable(table.name)} LIMIT 1 FOR UPDATE`);
    if (rows.length) throw new InitialInstallError("Database already contains application data; first initialization refused. Use schema-only upgrade for existing environments.");
  }
}

/** One transaction owns emptiness checks, resources, publication and folders. */
export async function initializeKnowledgeDatabase(client: PrismaClient, inputs: InitialContent[]) {
  if (inputs.length !== 22 || new Set(inputs.map(input => input.id)).size !== 22) {
    throw new InitialInstallError("First initialization requires the approved 22-resource inventory.");
  }
  return client.$transaction(async tx => {
    await assertEmptyMigratedDatabase(tx);
    const transaction = createPrismaHubTransaction(tx);
    const hub = new KnowledgeHub({ transaction: async callback => callback(transaction) });
    for (const input of inputs) {
      const imported = await hub.import(input);
      await hub.publish(imported.resourceId, imported.versionId);
    }
    const folders = await initializeBaseFolders(tx);
    return { initialized: true, resources: inputs.length, published: inputs.length, folders: folders.folders.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000, maxWait: 10_000 });
}
