import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DumpFingerprint, compare } from "./compare-mysql-dumps.mjs";

const sql = (column = "  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,", suffix = "") =>
  `CREATE TABLE \x60resource\x60 (\n${column}\n  PRIMARY KEY (\x60id\x60)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n${suffix}`;
const explicit = text => text.replace(/(?<!CHARACTER SET utf8mb4) COLLATE utf8mb4_/g, " CHARACTER SET utf8mb4 COLLATE utf8mb4_");
const digest = (text, size = 65536) => {
  const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text);
  const result = new DumpFingerprint();
  for (let i = 0; i < bytes.length; i += size) result.write(bytes.subarray(i, i + size));
  return result.finish();
};
const equal = (a, b, size) => digest(a, size).sha256 === digest(b, size).sha256;

test("199 character column differences from real MySQL families are equivalent at every small chunk size", () => {
  const types = ["varchar(36)", "char(8)", "text", "longtext", "enum('active','disabled')", "set('a','it\\'s','b''b')", "tinytext", "mediumtext"];
  const columns = Array.from({ length: 199 }, (_, i) => `  \x60column${i}\x60 ${types[i % types.length]} COLLATE utf8mb4_${i % 2 ? "bin" : "unicode_ci"} NOT NULL,`).join("\n");
  const original = sql(columns);
  const restored = explicit(original);
  for (const size of [1, 2, 3, 7, 31, 65536]) {
    assert.ok(equal(original, restored, size));
    assert.equal(digest(original, size).normalizedColumns, 199);
  }
});

test("row, default, comment, collation, type, index and constraint changes remain significant", () => {
  const original = sql(undefined, "INSERT INTO `resource` (`id`) VALUES ('original');\n");
  const restored = explicit(original);
  for (const [before, after] of [
    ["'original'", "'changed'"], ["unicode_ci NOT NULL", "bin NOT NULL"], ["varchar(36)", "varchar(37)"],
    ["PRIMARY KEY", "UNIQUE KEY"], ["NOT NULL", "DEFAULT NULL"],
  ]) assert.ok(!equal(original, restored.replace(before, after)));
  for (const option of ["DEFAULT", "COMMENT"]) {
    const a = sql(`  \x60id\x60 text COLLATE utf8mb4_bin ${option} '  \x60fake\x60 text COLLATE utf8mb4_bin',`);
    const b = a.replace("text COLLATE", "text CHARACTER SET utf8mb4 COLLATE").replace("fake` text COLLATE", "fake` text CHARACTER SET utf8mb4 COLLATE");
    assert.ok(!equal(a, b));
  }
});

test("DDL-like lines inside strings, comments and unfinished statements are never normalized", () => {
  const fake = "CREATE TABLE `pretend` (\n  `x` text COLLATE utf8mb4_bin,\n);\n";
  const wrappers = [
    text => `INSERT INTO \x60resource\x60 VALUES ('${text}');\n`,
    text => `/*\n${text}*/\n`,
    text => `SELECT\n${text}`,
    text => sql(`  \x60id\x60 text COLLATE utf8mb4_bin COMMENT '${text}',`),
  ];
  for (const wrap of wrappers) {
    for (const size of [1, 2, 7, 65536]) assert.ok(!equal(wrap(fake), wrap(explicit(fake)), size));
  }
});

test("doubled quotes, escaped quotes, quoted identifiers and comments across blocks preserve context", () => {
  const original = "/* header; '\n */\n" + sql("  `it``s` enum('it\\'s','a''b') COLLATE utf8mb4_bin DEFAULT 'a''b',", "INSERT INTO `resource` VALUES ('\\\'/*x*/;','a''b');\n");
  const restored = original.replace(" COLLATE utf8mb4_bin DEFAULT", " CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT");
  for (let size = 1; size <= 17; size++) assert.ok(equal(original, restored, size));
});

test("line endings, EOF and invalid UTF-8 bytes remain significant", () => {
  const original = sql();
  assert.ok(!equal(original, original.replaceAll("\n", "\r\n")));
  assert.ok(!equal(original, original.slice(0, -1)));
  const prefix = Buffer.from("INSERT INTO `r` VALUES ('");
  const suffix = Buffer.from("');\n");
  assert.ok(!equal(Buffer.concat([prefix, Buffer.from([0xff]), suffix]), Buffer.concat([prefix, Buffer.from([0xfe]), suffix]), 1));
});

test("large INSERTs stream while unsupported long DDL stays byte-exact", () => {
  const original = sql(undefined, `INSERT INTO \x60resource\x60 VALUES ('${"x".repeat(1024 * 1024)}');\n`);
  assert.ok(equal(original, explicit(sql()) + original.slice(sql().length), 4096));
  const longColumn = sql(`  \x60id\x60 text COLLATE utf8mb4_bin COMMENT '${"x".repeat(9000)}',`);
  assert.ok(!equal(longColumn, explicit(longColumn), 4096));
});

test("gzip file errors and incomplete SQL fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "mysql-dump-compare-"));
  try {
    const a = join(root, "a.gz"), b = join(root, "b.gz");
    await writeFile(a, gzipSync(sql())); await writeFile(b, gzipSync(explicit(sql())));
    assert.equal((await compare(a, b)).equal, true);
    await writeFile(b, "not gzip"); await assert.rejects(compare(a, b));
    await assert.rejects(compare(a, join(root, "missing.gz")));
    await writeFile(b, gzipSync("INSERT INTO r VALUES ('unfinished")); await assert.rejects(compare(a, b));
    await writeFile(b, gzipSync("CREATE TABLE `r` (\n")); await assert.rejects(compare(a, b));
  } finally { await rm(root, { recursive: true, force: true }); }
});
