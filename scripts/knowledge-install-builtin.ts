// Bundled as standalone/scripts/knowledge-install-builtin.cjs during build.
// Run after migrations, from the standalone directory with DATABASE_URL set.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { KnowledgeHub, importSchema } from "../src/modules/knowledge-hub/service";
import { createPrismaHubTransaction } from "../src/modules/knowledge-hub/prisma-store";

const prisma = new PrismaClient();
async function main() {
  const input = importSchema.parse(JSON.parse(await readFile(path.join(process.cwd(), "bootstrap", "standardize-skill.json"), "utf8")));
  const result = await prisma.$transaction(async tx => {
    if (await tx.hubResource.findUnique({ where: { id: input.id }, select: { id: true } })) return { id: input.id, skipped: true, reason: "already managed in hub" };
    const hub = new KnowledgeHub({ transaction: async callback => callback(createPrismaHubTransaction(tx)) });
    const imported = await hub.import(input);
    await hub.publish(imported.resourceId, imported.versionId);
    return { ...imported, published: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Built-in Skill initialization failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
