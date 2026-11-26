import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import JSZip from "jszip";
import { EXTERNAL_AI_INSTALL_PATH } from "../src/lib/external-ai-install";

const skill = "lighthouse-hermit";
const skillFiles = [
  "SKILL.md",
  "references/setup-dsh.md",
  "references/setup-other-hosts.md",
  "references/setup-space-one.md",
  "assets/dsh.cordis.patch.yml",
];

async function addClientNotices(archive: JSZip, inputs: string[]) {
  const directories = new Set<string>();
  for (const input of inputs) {
    const parts = input.replaceAll("\\", "/").split("/");
    const modules = parts.lastIndexOf("node_modules");
    if (modules < 0) continue;
    const packageSegments = parts[modules + 1].startsWith("@") ? 2 : 1;
    directories.add(parts.slice(0, modules + 1 + packageSegments).join("/"));
  }

  const notices: string[] = [];
  for (const directory of [...directories].sort()) {
    const metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")) as {
      name: string;
      version: string;
      license?: string;
    };
    notices.push(`${metadata.name}@${metadata.version} — ${metadata.license ?? "see accompanying notices"}`);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && /^(?:licen[cs]e|notice|copying)(?:[._-].+)?$/i.test(entry.name)) {
        archive.file(`client/licenses/${metadata.name}/${entry.name}`, await readFile(path.join(directory, entry.name)));
      }
    }
  }
  archive.file("client/THIRD_PARTY_NOTICES.txt", notices.join("\n") + "\n");
}

async function main() {
  const archive = new JSZip();
  for (const file of skillFiles) {
    archive.file(`${skill}/${file}`, await readFile(path.join("skills", skill, file)));
  }
  const client = await build({
    entryPoints: ["packages/lighthouse-client/src/cli.js"],
    bundle: true,
    platform: "node",
    target: "node20.9",
    format: "esm",
    write: false,
    metafile: true,
    outfile: "lighthouse.mjs",
    banner: { js: "import { createRequire as lighthouseCreateRequire } from 'node:module'; const require = lighthouseCreateRequire(import.meta.url);" },
  });
  archive.file("client/lighthouse.mjs", client.outputFiles[0].contents);
  await addClientNotices(archive, Object.keys(client.metafile.inputs));

  const output = path.join("public", EXTERNAL_AI_INSTALL_PATH.slice(1));
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Built ${output}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
