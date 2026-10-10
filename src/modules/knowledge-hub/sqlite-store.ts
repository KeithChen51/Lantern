import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { HubResource, HubStore, HubTransaction, HubVersion, Interaction, Provenance, Relation } from "./types";

// Keep the optional adapter compatible with the project's Node 20 type package.
// Only SQLite mode loads this built-in (Node >= 22.13; local development uses 24).
type Scalar = string | number | null;
type Row = Record<string, Scalar>;
type BuiltinModuleLoader = (id: string) => unknown;
interface Database {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    get(...values: Scalar[]): Row | undefined;
    all(...values: Scalar[]): Row[];
    run(...values: Scalar[]): unknown;
  };
}

const getBuiltinModule = (process as NodeJS.Process & { getBuiltinModule?: BuiltinModuleLoader }).getBuiltinModule;
const decode = <T>(row: Row | undefined): T | null => row ? JSON.parse(String(row.data)) as T : null;

function isBusyError(error: unknown) {
  const value = error as { code?: unknown; errcode?: unknown; errno?: unknown };
  const code = String(value.code ?? "");
  return value.errcode === 5 || value.errno === 5 ||
    code.includes("SQLITE_BUSY") || code.includes("DATABASE_IS_LOCKED") ||
    /SQLITE_BUSY|database is locked/i.test(String(error));
}

/** Durable, single-machine knowledge storage; never used as an automatic MySQL fallback. */
export class SqliteHubStore implements HubStore {
  private readonly db: Database;
  private pending = Promise.resolve();
  private closed = false;

  constructor(filename: string) {
    const sqlite = getBuiltinModule?.call(process, "node:sqlite") as { DatabaseSync: new (path: string) => Database } | undefined;
    if (!sqlite) throw new Error("SQLite knowledge storage requires Node.js >= 22.13 (Node.js 24 recommended).");
    const path = filename === ":memory:" ? filename : resolve(filename);
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new sqlite.DatabaseSync(path);
    this.db.exec([
      "PRAGMA busy_timeout = 5000;",
      "PRAGMA journal_mode = WAL;",
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE IF NOT EXISTS hub_resources (id TEXT PRIMARY KEY, data TEXT NOT NULL);",
      "CREATE TABLE IF NOT EXISTS hub_versions (",
      "  id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES hub_resources(id),",
      "  number INTEGER NOT NULL, checksum TEXT NOT NULL, published_at TEXT, data TEXT NOT NULL,",
      "  UNIQUE(resource_id, number), UNIQUE(resource_id, checksum)",
      ");",
      "CREATE TABLE IF NOT EXISTS hub_interactions (",
      "  id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL,",
      "  data TEXT NOT NULL, UNIQUE(source, external_id)",
      ");",
      "CREATE TABLE IF NOT EXISTS hub_relations (",
      "  id TEXT PRIMARY KEY, from_id TEXT NOT NULL REFERENCES hub_versions(id),",
      "  to_id TEXT NOT NULL REFERENCES hub_versions(id), data TEXT NOT NULL",
      ");",
      "CREATE INDEX IF NOT EXISTS hub_relations_from ON hub_relations(from_id);",
      "CREATE TABLE IF NOT EXISTS hub_provenance (",
      "  version_id TEXT NOT NULL REFERENCES hub_versions(id),",
      "  interaction_id TEXT NOT NULL REFERENCES hub_interactions(id), data TEXT NOT NULL,",
      "  PRIMARY KEY(version_id, interaction_id)",
      ");",
      "CREATE TABLE IF NOT EXISTS hub_audits (id TEXT PRIMARY KEY, data TEXT NOT NULL);",
      "PRAGMA busy_timeout = 0;",
    ].join("\n"));
  }

  close() {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }

  private resource(row: Row): HubResource {
    const versions = this.db.prepare("SELECT data, published_at FROM hub_versions WHERE resource_id = ? ORDER BY number").all(String(row.id));
    const metadata = decode<Omit<HubResource, "versions">>(row)!;
    return {
      ...metadata,
      // Existing single-instance volumes predate case audience metadata.
      visibility: metadata.visibility ?? (metadata.type === "case" ? "internal" : "public"),
      versions: versions.map(v => ({ ...decode<HubVersion>(v)!, publishedAt: v.published_at as string | null })),
    };
  }

  private transactionApi(): HubTransaction {
    const db = this.db;
    return {
      getResource: async id => {
        const row = db.prepare("SELECT * FROM hub_resources WHERE id = ?").get(id);
        return row ? this.resource(row) : null;
      },
      listResources: async () => db.prepare("SELECT * FROM hub_resources ORDER BY id").all().map(row => this.resource(row)),
      saveResource: async value => {
        const { versions, ...metadata } = value;
        db.prepare("INSERT INTO hub_resources(id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data")
          .run(value.id, JSON.stringify(metadata));
        for (const v of versions) {
          // Version payloads are immutable; only their publication marker can change.
          db.prepare([
            "INSERT INTO hub_versions(id, resource_id, number, checksum, published_at, data)",
            "VALUES (?, ?, ?, ?, ?, ?)",
            "ON CONFLICT(id) DO UPDATE SET published_at = excluded.published_at",
          ].join("\n")).run(v.id, value.id, v.number, v.checksum, v.publishedAt, JSON.stringify(v));
        }
      },
      getInteraction: async id => decode<Interaction>(db.prepare("SELECT data FROM hub_interactions WHERE id = ?").get(id)),
      findInteraction: async (source, externalId) => decode<Interaction>(db.prepare("SELECT data FROM hub_interactions WHERE source = ? AND external_id = ?").get(source, externalId)),
      saveInteraction: async value => {
        db.prepare("INSERT INTO hub_interactions(id, source, external_id, data) VALUES (?, ?, ?, ?)")
          .run(value.id, value.source, value.externalId, JSON.stringify(value));
      },
      saveRelation: async value => {
        db.prepare("INSERT INTO hub_relations(id, from_id, to_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
          .run(value.id, value.fromVersionId, value.toVersionId, JSON.stringify(value));
      },
      relations: async id => db.prepare("SELECT data FROM hub_relations WHERE from_id = ?").all(id).map(row => decode<Relation>(row)!),
      provenance: async id => db.prepare("SELECT data FROM hub_provenance WHERE version_id = ?").all(id).map(row => decode<Provenance>(row)!),
      saveProvenance: async value => {
        db.prepare([
          "INSERT INTO hub_provenance(version_id, interaction_id, data) VALUES (?, ?, ?)",
          "ON CONFLICT(version_id, interaction_id) DO UPDATE SET data = excluded.data",
        ].join("\n")).run(value.versionId, value.interactionId, JSON.stringify(value));
      },
      audit: async value => {
        db.prepare("INSERT INTO hub_audits(id, data) VALUES (?, ?)").run(value.id, JSON.stringify(value));
      },
    };
  }

  async transaction<T>(fn: (tx: HubTransaction) => Promise<T>): Promise<T> {
    const before = this.pending;
    let release!: () => void;
    this.pending = new Promise<void>(resolvePromise => { release = resolvePromise; });
    await before;
    let began = false;
    try {
      const deadline = Date.now() + 30_000;
      for (;;) {
        try {
          this.db.exec("BEGIN IMMEDIATE");
          began = true;
          break;
        } catch (error) {
          // Yield instead of blocking another connection's async transaction in this process.
          if (!isBusyError(error) || Date.now() >= deadline) throw error;
          await delay(25);
        }
      }
      const result = await fn(this.transactionApi());
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      if (began) this.db.exec("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }
}
