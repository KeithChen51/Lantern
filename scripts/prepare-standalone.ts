import { copyStandaloneAssets } from "../src/build/prepare-standalone";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { bundledStandardizeSkill } from "../src/modules/knowledge-hub/bundled-skill";

async function main() {
  copyStandaloneAssets();
  const standalone = path.resolve(".next/standalone");
  await mkdir(path.join(standalone, "bootstrap"), { recursive: true });
  await writeFile(path.join(standalone, "bootstrap/standardize-skill.json"), JSON.stringify(await bundledStandardizeSkill()));
  await build({
    entryPoints: ["scripts/knowledge-install-builtin.ts"],
    outfile: path.join(standalone, "scripts/knowledge-install-builtin.cjs"),
    bundle: true, platform: "node", target: "node20", format: "cjs", external: ["@prisma/client"],
  });
  console.log("Prepared Next standalone assets and built-in standardization Skill bootstrap.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
