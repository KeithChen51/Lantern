import { Prisma } from "@prisma/client";

type Transaction = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;
type Database = Transaction & {
  $transaction<T>(action: (transaction: Transaction) => Promise<T>, options?: { maxWait: number; timeout: number }): Promise<T>;
};
type CleanupResult = { source: string; removed: number; remaining: number };
const DAY = 86_400_000;
const BATCH_SIZE = 500;
const BATCH_LIMIT = 10;

/** Freeze only complete, non-identifying daily UV before expiring its facts. */
async function pruneVisitBatch(database: Database, cutoff: Date, today: string, seenDays: Set<string>): Promise<number> {
  const archivedThisBatch: string[] = [];
  const removed = await database.$transaction(async tx => {
    // Lock exact candidates so concurrent maintenance cannot delete half a day
    // between its completeness check and saving its anonymous total.
    const candidates = await tx.$queryRaw<Array<{ event_id: string; archive_day: string | null }>>(Prisma.sql`
      SELECT event_id,
        CASE WHEN DATE_ADD(DATE_ADD(DATE(DATE_ADD(occurred_at, INTERVAL 8 HOUR)), INTERVAL 1 DAY), INTERVAL 24 MONTH) > CAST(${today} AS DATE)
          THEN DATE_FORMAT(DATE_ADD(occurred_at, INTERVAL 8 HOUR), '%Y-%m-%d') ELSE NULL END AS archive_day
      FROM analytics_page_views WHERE occurred_at <= ${cutoff}
      ORDER BY occurred_at, actor_kind, subject_id, event_id LIMIT ${BATCH_SIZE} FOR UPDATE
    `);
    if (!candidates.length) return 0;
    const days = [...new Set(candidates.map(row => row.archive_day).filter((day): day is string => day !== null && !seenDays.has(day)))];
    if (days.length) {
      const saved = await tx.$queryRaw<Array<{ day: string }>>(Prisma.sql`
        SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day FROM analytics_daily_visitors
        WHERE day IN (${Prisma.join(days)})
      `);
      const savedDays = new Set(saved.map(row => row.day));
      for (const day of days) {
        if (!savedDays.has(day)) {
          const start = new Date(day + "T00:00:00+08:00");
          const end = new Date(start.getTime() + DAY);
          // Distinct pairs preserve employee/guest namespaces and deduplicate
          // users across modules. A prior partial purge fails this equality,
          // so it leaves a missing UV rather than inventing a smaller total.
          // INSERT IGNORE never replaces an already preserved complete day.
          await tx.$executeRaw(Prisma.sql`
            INSERT IGNORE INTO analytics_daily_visitors (day, visitors)
            SELECT CAST(${day} AS DATE), COUNT(DISTINCT actor_kind, subject_id)
            FROM analytics_page_views WHERE occurred_at >= ${start} AND occurred_at < ${end}
            HAVING COUNT(*) > 0 AND COUNT(*) = (
              SELECT SUM(views) FROM analytics_visit_days WHERE day = CAST(${day} AS DATE)
            )
          `);
        }
        archivedThisBatch.push(day);
      }
    }
    return tx.$executeRaw(Prisma.sql`
      DELETE FROM analytics_page_views WHERE occurred_at <= ${cutoff}
        AND event_id IN (${Prisma.join(candidates.map(row => row.event_id))})
    `);
  }, { maxWait: 5_000, timeout: 30_000 });
  // Do not memoize failed/rolled-back transactions.
  archivedThisBatch.forEach(day => seenDays.add(day));
  return removed;
}

/** Preview is read-only; apply removes at most 5,000 expired rows per source. */
export async function pruneUsage(database: Database, apply: boolean, now = new Date()) {
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const visitCutoff = new Date(+now - 180 * DAY);
  const expiredSummary = Prisma.sql`DATE_ADD(DATE_ADD(day, INTERVAL 1 DAY), INTERVAL 24 MONTH) <= CAST(${today} AS DATE)`;
  const sources = [
    { name: "visitRateBuckets", table: Prisma.sql`access_records`, order: Prisma.sql`expiresAt, id`,
      expired: Prisma.sql`kind = 'bucket' AND subjectId = 'analytics-visits' AND expiresAt <= ${now}` },
    { name: "pageViews", table: Prisma.sql`analytics_page_views`, order: Prisma.sql`occurred_at, actor_kind, subject_id, event_id`,
      expired: Prisma.sql`occurred_at <= ${visitCutoff}` },
    { name: "personAudits", table: Prisma.sql`analytics_person_audits`, order: Prisma.sql`created_at, id`,
      expired: Prisma.sql`created_at <= ${new Date(+now - 365 * DAY)}` },
    { name: "dailyVisits", table: Prisma.sql`analytics_visit_days`, order: Prisma.sql`day, module`, expired: expiredSummary },
    { name: "dailyVisitors", table: Prisma.sql`analytics_daily_visitors`, order: Prisma.sql`day`, expired: expiredSummary },
  ];
  const seenDays = new Set<string>();
  const results: CleanupResult[] = [];
  for (const { name, table, order, expired } of sources) {
    let removed = 0;
    if (apply) {
      for (let batch = 0; batch < BATCH_LIMIT; batch++) {
        const changed = name === "pageViews"
          ? await pruneVisitBatch(database, visitCutoff, today, seenDays)
          : await database.$executeRaw(Prisma.sql`DELETE FROM ${table} WHERE ${expired} ORDER BY ${order} LIMIT ${BATCH_SIZE}`);
        removed += changed;
        if (changed < BATCH_SIZE) break;
      }
    }
    const [row] = await database.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM ${table} WHERE ${expired}`);
    results.push({ source: name, removed, remaining: Number(row.total) });
  }
  return { asOf: now.toISOString(), mode: apply ? "apply" as const : "preview" as const, results };
}
