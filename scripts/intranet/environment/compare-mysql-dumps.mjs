// Compare logical dumps without hiding data or schema changes. MySQL 8 may add
// redundant CHARACTER SET utf8mb4 on restore before the same column COLLATE.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";

const PREFIX_LIMIT = 8192;
const quotedValue = "'(?:\\\\[\\s\\S]|''|[^'\\\\])*'";
const characterType = `(?:var)?char\\([0-9]+\\)|(?:tiny|medium|long)?text|(?:enum|set)\\(${quotedValue}(?:,${quotedValue})*\\)`;
const column = new RegExp(`^(  \x60(?:\x60\x60|[^\x60])+\x60 (?:${characterType}))( CHARACTER SET utf8mb4)?( COLLATE utf8mb4_[a-z0-9_]+)(?=[ \\t,\\r\\n]|$)`);
const header = /^CREATE TABLE `(?:``|[^`])+` \(\r?\n$/;

// Syntax state is updated from original bytes, never from canonical output.
// Latin1 is a bijective byte transport: invalid UTF-8 remains significant.
class SqlContext {
  mode = "code";
  escaped = false;
  boundary = true;
  depth = null;
  pending = "";

  feed(text, final = false) {
    const input = this.pending + text;
    const end = final ? input.length : Math.max(0, input.length - 2);
    let i = 0;
    for (; i < end; i++) {
      const c = input[i], next = input[i + 1];
      if (this.mode === "line") { if (c === "\n") this.mode = "code"; continue; }
      if (this.mode === "block") { if (c === "*" && next === "/") { this.mode = "code"; i++; } continue; }
      if (this.mode !== "code") {
        if (this.escaped) { this.escaped = false; continue; }
        if (c === "\\") { this.escaped = true; continue; }
        if (c === this.mode) {
          if (next === c) i++;
          else this.mode = "code";
        }
        continue;
      }
      if (c === "#" || (c === "-" && next === "-" && /[\s\x00-\x20]/.test(input[i + 2] ?? "x"))) {
        this.mode = "line"; if (c === "-") i++; continue;
      }
      if (c === "/" && next === "*") { this.mode = "block"; i++; continue; }
      if (c === "'" || c === '"' || c === "`") { this.mode = c; this.boundary = false; continue; }
      if (c === ";") { this.boundary = true; continue; }
      if (!/\s/.test(c)) this.boundary = false;
      if (this.depth !== null) {
        if (c === "(") this.depth++;
        if (c === ")" && --this.depth === 0) this.depth = null;
      }
    }
    this.pending = input.slice(i);
  }
}

export class DumpFingerprint {
  context = new SqlContext();
  hash = createHash("sha256");
  bytes = 0;
  prefix = "";
  longLine = false;
  normalizedColumns = 0;

  emit(text) {
    const bytes = Buffer.from(text, "latin1");
    this.hash.update(bytes); this.bytes += bytes.length;
  }

  line(text) {
    const isHeader = this.context.mode === "code" && this.context.boundary && header.test(text);
    let output = text;
    if (this.context.mode === "code" && this.context.depth === 1) {
      const match = column.exec(text);
      if (match && !match[2]) {
        output = `${match[1]} CHARACTER SET utf8mb4${text.slice(match[1].length)}`;
        this.normalizedColumns++;
      }
    }
    this.emit(output);
    this.context.feed(text, true);
    if (isHeader) this.context.depth = 1;
  }

  write(buffer) {
    const text = buffer.toString("latin1");
    let start = 0;
    while (start < text.length) {
      const newline = text.indexOf("\n", start);
      const end = newline === -1 ? text.length : newline + 1;
      const part = text.slice(start, end);
      if (!this.longLine && this.prefix.length + part.length <= PREFIX_LIMIT) {
        this.prefix += part;
        if (newline !== -1) { this.line(this.prefix); this.prefix = ""; }
      } else {
        // Unsupported long DDL stays byte-exact (fail closed). Long INSERTs
        // stream without buffering a database-sized statement or line.
        this.emit(this.prefix); this.context.feed(this.prefix); this.prefix = "";
        this.emit(part); this.context.feed(part, newline !== -1);
        this.longLine = newline === -1;
      }
      start = end;
    }
  }

  finish() {
    if (this.prefix) this.line(this.prefix);
    this.context.feed("", true);
    if (!["code", "line"].includes(this.context.mode) || this.context.depth !== null) throw new Error("Incomplete SQL syntax");
    return { sha256: this.hash.digest("hex"), bytes: this.bytes, normalizedColumns: this.normalizedColumns };
  }
}

export async function fingerprint(file) {
  if (!(await stat(file)).isFile()) throw new Error("Dump must be a regular file");
  const source = createReadStream(file);
  const gzip = createGunzip();
  source.on("error", error => gzip.destroy(error));
  source.pipe(gzip);
  const result = new DumpFingerprint();
  try {
    for await (const chunk of gzip) result.write(chunk);
    return result.finish();
  } finally { source.destroy(); gzip.destroy(); }
}

export async function compare(original, restored) {
  const a = await fingerprint(original);
  const b = await fingerprint(restored);
  return { equal: a.sha256 === b.sha256 && a.bytes === b.bytes, original: a, restored: b };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error("Usage: compare-mysql-dumps.mjs original.sql.gz restored.sql.gz");
    const result = await compare(process.argv[2], process.argv[3]);
    console.log(JSON.stringify(result));
    if (!result.equal) process.exitCode = 1;
  } catch {
    // SQL, filenames and driver errors may contain private configuration.
    console.error("MySQL dump comparison failed: unreadable, invalid or incomplete dump");
    process.exitCode = 1;
  }
}
