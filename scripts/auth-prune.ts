import { prisma } from "../src/infrastructure/db/client";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--apply")) throw new Error("Usage: npm run auth:prune [-- --apply]");
  // Used refresh generations carry the full family's expiry. Never prune by
  // creation time or used/active state, which would weaken replay detection.
  const cutoff = new Date();
  const expired = await prisma.accessRecord.count({ where: { expiresAt: { lte: cutoff } } });
  if (!args.includes("--apply")) { console.log(JSON.stringify({ mode: "dry-run", expired, cutoff: cutoff.toISOString() })); return; }
  let removed = 0;
  // Bound maintenance to 5,000 expired records; repeat for larger backlogs.
  for (let batch = 0; batch < 10; batch++) {
    const records = await prisma.accessRecord.findMany({ where: { expiresAt: { lte: cutoff } }, orderBy: { expiresAt: "asc" }, take: 500, select: { id: true } });
    if (!records.length) break;
    removed += (await prisma.accessRecord.deleteMany({ where: { id: { in: records.map(record => record.id) }, expiresAt: { lte: cutoff } } })).count;
  }
  console.log(JSON.stringify({ mode: "apply", removed, cutoff: cutoff.toISOString() }));
}
main().catch(() => { console.error("Authorization maintenance failed. Verify the database and migration configuration."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
