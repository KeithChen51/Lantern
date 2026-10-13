import { statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const DEFAULT_KNOWLEDGE_SQLITE_PATH = "storage/knowledge/lighthouse.sqlite";

// A renamed default must never open an empty DB over existing deployment data.
// Explicit custom paths (including the old filename) remain authoritative.
export function resolveKnowledgeSqlitePath(
  configuredPath?: string,
  cwd = process.cwd(),
  warn: (message: string) => void = console.warn,
) {
  const canonical = resolve(cwd, configuredPath || DEFAULT_KNOWLEDGE_SQLITE_PATH);
  if (basename(canonical) !== "lighthouse.sqlite") return canonical;
  const legacy = join(dirname(canonical), "lantern.sqlite");
  const canonicalExists = statSync(canonical, { throwIfNoEntry: false })?.isFile();
  const legacyExists = statSync(legacy, { throwIfNoEntry: false })?.isFile();
  if (canonicalExists && legacyExists) {
    warn("Both lighthouse.sqlite and legacy lantern.sqlite exist; using lighthouse.sqlite. Review the offline migration before removing either file; no merge is performed.");
  }
  return !canonicalExists && legacyExists ? legacy : canonical;
}
