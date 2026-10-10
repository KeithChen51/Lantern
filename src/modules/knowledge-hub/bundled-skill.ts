import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { skillInput, type UploadEntry } from "./upload";

export const STANDARDIZE_SKILL_ID = "lantern-knowledge-standardize";
// Distribute only the maintained runtime instructions, templates and validator.
// Never traverse local dependency installs, caches or arbitrary workspace files.
export async function bundledStandardizeSkill(root = process.cwd()) {
  const directory = path.join(root, "skills", STANDARDIZE_SKILL_ID);
  const entries: UploadEntry[] = [];
  async function collect(relative: string) {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Bundled Skill cannot contain links: ${name}`);
      if (entry.isDirectory()) await collect(name);
      else if (entry.isFile()) entries.push({ path: name, bytes: await readFile(path.join(directory, name)) });
    }
  }
  for (const name of ["SKILL.md", "package.json", "package-lock.json"]) entries.push({ path: name, bytes: await readFile(path.join(directory, name)) });
  for (const name of ["agents", "assets", "references", "scripts"]) await collect(name);
  // The package's npm test command is portable; the separate TS hub integration
  // test belongs to the application repository and is intentionally not shipped.
  entries.push({ path: "tests/validate.test.mjs", bytes: await readFile(path.join(directory, "tests/validate.test.mjs")) });
  const { request } = skillInput(entries, STANDARDIZE_SKILL_ID);
  return { ...request, id: STANDARDIZE_SKILL_ID, title: "灯塔资料标准化 Skill", source: "灯塔部署内置 Skill", tags: ["内置", "资料标准化", "Markdown 检查"] };
}
