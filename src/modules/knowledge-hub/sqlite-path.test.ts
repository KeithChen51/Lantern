import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KNOWLEDGE_SQLITE_PATH, resolveKnowledgeSqlitePath } from "./sqlite-path";
import { SqliteHubStore } from "./sqlite-store";
import { KnowledgeHub } from "./service";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lighthouse-sqlite-path-"));
  roots.push(root);
  const directory = join(root, "storage", "knowledge");
  mkdirSync(directory, { recursive: true });
  return { root, canonical: join(directory, "lighthouse.sqlite"), legacy: join(directory, "lantern.sqlite") };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("knowledge SQLite filename compatibility", () => {
  it("uses the canonical default for a new installation", () => {
    const f = fixture();
    expect(resolveKnowledgeSqlitePath(undefined, f.root)).toBe(f.canonical);
  });
  it("keeps an existing legacy database when the new default is absent", () => {
    const f = fixture();
    writeFileSync(f.legacy, "existing data");
    expect(resolveKnowledgeSqlitePath(undefined, f.root)).toBe(f.legacy);
    expect(resolveKnowledgeSqlitePath(DEFAULT_KNOWLEDGE_SQLITE_PATH, f.root)).toBe(f.legacy);
    expect(resolveKnowledgeSqlitePath(f.canonical, f.root)).toBe(f.legacy);
  });
  it("selects the new database when both exist and reports migration ambiguity", () => {
    const f = fixture();
    writeFileSync(f.canonical, "new data"); writeFileSync(f.legacy, "old data");
    const warn = vi.fn();
    expect(resolveKnowledgeSqlitePath(undefined, f.root, warn)).toBe(f.canonical);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no merge is performed"));
  });
  it("honors explicit legacy and unrelated custom paths", () => {
    const f = fixture();
    writeFileSync(f.legacy, "existing data");
    expect(resolveKnowledgeSqlitePath(f.legacy, f.root)).toBe(f.legacy);
    expect(resolveKnowledgeSqlitePath("storage/knowledge/custom.sqlite", f.root)).toBe(resolve(f.root, "storage/knowledge/custom.sqlite"));
  });
  it.skipIf(!(process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.call(process, "node:sqlite"))("reads previously published data from the fallback database", async () => {
    const f = fixture();
    const original = new SqliteHubStore(f.legacy);
    try {
      const hub = new KnowledgeHub(original);
      const imported = await hub.import({ id: "existing", type: "document", title: "Existing data", source: "old installation", markdown: "# Existing publication" });
      await hub.publish(imported.resourceId, imported.versionId);
    } finally { original.close(); }
    const reopened = new SqliteHubStore(resolveKnowledgeSqlitePath(DEFAULT_KNOWLEDGE_SQLITE_PATH, f.root));
    try { expect((await new KnowledgeHub(reopened).get("existing")).version.markdown).toBe("# Existing publication"); }
    finally { reopened.close(); }
  });
});
