import { expect, it } from "vitest";
import JSZip from "jszip";
import { bundledStandardizeSkill } from "./bundled-skill";
import { KnowledgeHub } from "./service";
import { MemoryHubStore } from "./test-store";
import { knowledgeDownload } from "./download";

it("downloads a runnable built-in Skill with original frontmatter and relative paths", async () => {
  const hub = new KnowledgeHub(new MemoryHubStore());
  const imported = await hub.import(await bundledStandardizeSkill());
  await hub.publish(imported.resourceId, imported.versionId);
  const response = await knowledgeDownload(await hub.get(imported.resourceId));
  expect(response.headers.get("content-disposition")).toContain("lantern-knowledge-standardize.zip");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  expect(await zip.file("SKILL.md")?.async("string")).toMatch(/^---\r?\nname: lantern-knowledge-standardize/);
  expect(zip.file("scripts/check.mjs")).not.toBeNull();
  expect(zip.file("tests/validate.test.mjs")).not.toBeNull();
  expect(Object.keys(zip.files).some(path => path.includes("node_modules"))).toBe(false);
});
