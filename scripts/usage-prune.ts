import { Prisma } from "@prisma/client";
import { prisma } from "../src/infrastructure/db/client";

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--apply")) throw new Error("Invalid arguments");
  const apply = args.length === 1;
  const now = new Date();
  const dayMs = 86_400_000;
  const shanghaiDate = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const sources = [
    { name: "pageViews", table: Prisma.sql`analytics_page_views`, order: Prisma.sql`occurred_at, event_id`,
      expired: Prisma.sql`occurred_at <= ${new Date(+now - 180 * dayMs)}` },
    { name: "personAudits", table: Prisma.sql`analytics_person_audits`, order: Prisma.sql`created_at, id`,
      expired: Prisma.sql`created_at <= ${new Date(+now - 365 * dayMs)}` },
    { name: "dailyVisits", table: Prisma.sql`analytics_visit_days`, order: Prisma.sql`day, module`,
      expired: Prisma.sql`DATE_ADD(DATE_ADD(day, INTERVAL 1 DAY), INTERVAL 24 MONTH) <= CAST(${shanghaiDate} AS DATE)` },
  ];
  const results = [];
  for (const { name, table, order, expired } of sources) {
    let removed = 0;
    if (apply) {
      for (let batch = 0; batch < 10; batch++) {
        const changed = await prisma.$executeRaw`DELETE FROM ${table} WHERE ${expired} ORDER BY ${order} LIMIT 500`;
        removed += changed;
        if (changed < 500) break;
      }
    }
    const [row] = await prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM ${table} WHERE ${expired}`;
    results.push({ source: name, removed, remaining: Number(row.total) });
  }
  console.log(JSON.stringify({ asOf: now.toISOString(), mode: apply ? "apply" : "preview", results }));
  if (apply && results.some(result => result.remaining > 0)) process.exitCode = 2;
}

main().catch(() => {
  console.error("Usage cleanup failed. Verify database access and usage: usage-prune [--apply].");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
