/** The operator records the actual collection start when enabling the notice and collector. */
export function visitCoverageStart(now: Date = new Date()): Date | null {
  const input = process.env.LIGHTHOUSE_VISITS_START_AT;
  if (!input || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input)) return null;
  const start = new Date(input);
  if (!Number.isFinite(start.getTime()) || start > now) return null;
  const canonical = input.includes(".") ? input : input.replace("Z", ".000Z");
  return start.toISOString() === canonical ? start : null;
}
