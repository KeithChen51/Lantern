import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFileSync(resolve(root, name), "utf8");
const releases = JSON.parse(read("src/content/releases.json"));
const check = process.argv.includes("--check");
const compare = (a, b) => {
  const right = b.split(".").map(Number);
  for (const [i, part] of a.split(".").map(Number).entries()) {
    if (part !== right[i]) return part - right[i];
  }
  return 0;
};
if (!Array.isArray(releases) || !releases.length) throw new Error("At least one release is required.");
for (const [i, release] of releases.entries()) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.version)) throw new Error("Version must have three numeric parts.");
  if (i && compare(releases[i - 1].version, release.version) <= 0) throw new Error("Releases must be unique and newest first.");
  if (release.date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(release.date) || new Date(release.date).toISOString().slice(0, 10) !== release.date)) throw new Error("Invalid release date.");
  if (!release.title?.trim() || !release.summary?.trim() || !release.changes?.length) throw new Error("Release content is required.");
  for (const group of release.changes) {
    if (!group.type?.trim() || !group.items?.length || group.items.some((item) => typeof item !== "string" || !item.trim())) throw new Error("Change groups cannot be empty.");
  }
}
const version = releases[0].version;
const changelog = "# 灯塔更新记录\n\n<!-- 由 src/content/releases.json 生成，请勿直接编辑。 -->\n\n" + releases.map((release) =>
  `## ${release.version} · ${release.title}\n\n${release.date || "首版基线（发布日期待实际发布时记录）"}\n\n${release.summary}\n\n` +
  release.changes.map((group) => `### ${group.type}\n\n${group.items.map((item) => `- ${item}`).join("\n")}\n`).join("\n")
).join("\n");
const outputs = { "CHANGELOG.md": changelog };
for (const file of ["package.json", "package-lock.json"]) {
  const data = JSON.parse(read(file));
  data.version = version;
  if (file === "package-lock.json") data.packages[""].version = version;
  outputs[file] = JSON.stringify(data, null, 2) + "\n";
}
for (const [file, output] of Object.entries(outputs)) {
  if (check) {
    if (read(file).replaceAll("\r\n", "\n") !== output) throw new Error(`${file} is out of sync. Run npm run releases:sync.`);
  } else writeFileSync(resolve(root, file), output);
}
console.log(`Release ${version}: ${check ? "verified" : "synchronized"}.`);
