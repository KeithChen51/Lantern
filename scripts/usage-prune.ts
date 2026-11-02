import { prisma } from "../src/infrastructure/db/client";
import { pruneUsage } from "../src/modules/analytics/usage-prune";

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--apply")) throw new Error("Invalid arguments");
  const apply = args.length === 1;
  const result = await pruneUsage(prisma, apply);
  console.log(JSON.stringify(result));
  if (apply && result.results.some(entry => entry.remaining > 0)) process.exitCode = 2;
}

main().catch(() => {
  console.error("Usage cleanup failed. Verify database access and usage: usage-prune [--apply].");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
