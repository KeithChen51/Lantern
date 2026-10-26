import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "output", "wecom-pilot");
await mkdir(output, { recursive: true });
const expected = new Set(["wecom-ticket-probe.cjs", "wecom-probe.env.example", "README.md", "manifest.json"]);
if ((await readdir(output, { withFileTypes: true })).some(entry => !entry.isFile() || !expected.has(entry.name))) {
  throw new Error("Diagnostic output contains unrelated files. Use a clean output directory; no files were removed.");
}
await build({ entryPoints: [path.join(root, "scripts/wecom-ticket-probe.ts")], bundle: true, platform: "node", target: "node20", format: "cjs", outfile: path.join(output, "wecom-ticket-probe.cjs"), sourcemap: false, legalComments: "none" });
await copyFile(path.join(root, "deploy/intranet/environments/wecom-probe.env.example"), path.join(output, "wecom-probe.env.example"));
await copyFile(path.join(root, "docs/deployment/lighthouse-wecom-pilot.md"), path.join(output, "README.md"));
const files = [];
for (const file of ["wecom-ticket-probe.cjs", "wecom-probe.env.example", "README.md"]) {
  const bytes = await readFile(path.join(output, file));
  files.push({ file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify({ artifact: "wecom-ticket-diagnostic", applicationRelease: false, issue: 76, minimumNode: "20.9.0", files }, null, 2)}\n`);
process.stdout.write(`${output}\n`);
