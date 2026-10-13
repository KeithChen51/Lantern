#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { validate } from "./validate.mjs";

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    id: { type: "string" }, export: { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("node scripts/check.mjs source.md [--id resource-id] [--export NEW-import.json]\nRead-only validation; --export creates one new JSON file. Never imports or publishes. Exit 0=ready, 1=validation error, 2=usage/I/O error.");
  } else {
    if (positionals.length !== 1 || !positionals[0].toLowerCase().endsWith(".md")) throw new Error("请提供一个 .md 文件");
    const result = await validate(await readFile(positionals[0], "utf8"), { id: values.id });
    if (values.export && result.ready && !result.request) {
      result.ready = false;
      result.issues.push({ severity: "error", code: "export_id", line: 1, message: "导出需要资源 id" });
    }
    if (values.export && result.ready) await writeFile(values.export, JSON.stringify(result.request, null, 2) + "\n", { flag: "wx", encoding: "utf8" });
    // Avoid echoing source content into logs. The report stays separate from the article.
    console.log(JSON.stringify({ protocolVersion: result.protocolVersion, ready: result.ready,
      issues: result.issues, linkAccessibility: result.linkAccessibility, factsVerified: result.factsVerified,
      exported: values.export && result.ready ? values.export : null }, null, 2));
    if (!result.ready) process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ ready: false, error: error.message })); process.exitCode = 2;
}
