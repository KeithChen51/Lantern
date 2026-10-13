import "./knowledge-env";
import { parseArgs } from "node:util";
import { initialContentInventory, loadInitialContent } from "../src/modules/knowledge-hub/initial-content";

async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean" }, apply: { type: "boolean" } }, strict: true, allowPositionals: false });
  if (values.apply && values["dry-run"]) throw new Error("Choose either --dry-run or --apply.");
  const inputs = await loadInitialContent();
  if (!values.apply) {
    console.log(JSON.stringify({ mode: "dry-run", resources: inputs.length, inventory: initialContentInventory(inputs) }, null, 2));
    return;
  }
  if ((process.env.KNOWLEDGE_HUB_DRIVER || "mysql") !== "mysql" || !process.env.DATABASE_URL?.startsWith("mysql://")) {
    throw new Error("--apply requires KNOWLEDGE_HUB_DRIVER=mysql and a MySQL DATABASE_URL.");
  }
  // Preview never constructs or connects a Prisma client.
  const [{ PrismaClient }, { initializeKnowledgeDatabase, InitialInstallError }] = await Promise.all([
    import("@prisma/client"), import("../src/modules/knowledge-hub/initial-install"),
  ]);
  const client = new PrismaClient({ log: [] });
  try {
    console.log(JSON.stringify(await initializeKnowledgeDatabase(client, inputs)));
  } catch (error) {
    if (error instanceof InitialInstallError) throw error;
    // Raw database errors may include private connection or record details.
    throw new Error("First initialization failed; the transaction was rolled back. Verify migrations and database access before retrying.");
  } finally { await client.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "First initialization failed."); process.exitCode = 1; });
