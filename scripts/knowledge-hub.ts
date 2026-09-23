import "./knowledge-env";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { prisma } from "../src/infrastructure/db";
import { getKnowledgeHub } from "../src/modules/knowledge-hub/runtime";
import { commands, executeCommand, isCommand } from "../src/modules/knowledge-hub/commands";

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { input: { type: "string" }, markdown: { type: "string" }, help: { type: "boolean" } } });
  const name = positionals[0];
  if (values.help || !name) {
    console.log("Lantern knowledge CLI\nUsage: npm run hub -- <command> --input request.json [--markdown body.md]\nCommands: " + Object.keys(commands).join(", ") + "\nAll commands print JSON; import creates drafts. publish is explicit. Requires DATABASE_URL.");
    return;
  }
  if (!isCommand(name)) throw new Error(`Unknown command: ${name}`);
  const request = values.input ? JSON.parse(await readFile(values.input, "utf8")) : {};
  if (values.markdown) {
    if (name !== "import") throw new Error("--markdown is only supported by import");
    request.markdown = await readFile(values.markdown, "utf8");
  }
  console.log(JSON.stringify(await executeCommand(getKnowledgeHub(), name, request), null, 2));
}
main().catch(error => { console.error(JSON.stringify({ error: error instanceof Error ? error.message : "Command failed" })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
