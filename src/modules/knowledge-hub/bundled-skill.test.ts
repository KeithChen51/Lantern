import { describe, expect, it } from "vitest";
import { bundledStandardizeSkill, STANDARDIZE_SKILL_ID } from "./bundled-skill";
import { KnowledgeHub } from "./service";
import { MemoryHubStore } from "./test-store";
describe("bundled standardization skill", () => {
  it("ships the complete runnable skill without machine dependencies", async () => {
    const input = await bundledStandardizeSkill();
    expect(input.id).toBe(STANDARDIZE_SKILL_ID);
    expect(input.type).toBe("skill");
    const paths = input.files.map(file => file.path);
    expect(paths).toEqual(expect.arrayContaining(["SKILL.md", "package.json", "package-lock.json", "scripts/check.mjs", "scripts/validate.mjs", "scripts/schema.mjs", "references/protocol.md", "assets/document.md"]));
    expect(paths.some(p => p.includes("node_modules") || p.includes(".env"))).toBe(false);
    expect(input.markdown).not.toMatch(/^---/);
    expect(Buffer.from(input.files.find(f => f.path === "SKILL.md")!.contentBase64, "base64").toString()).toContain("name: lighthouse-knowledge-standardize");
  });
  it("keeps the persisted resource identity and published version after the package rename", async () => {
    const store = new MemoryHubStore();
    const hub = new KnowledgeHub(store);
    const previous = await hub.import({ id: "lantern-knowledge-standardize", type: "skill", title: "Existing maintained Skill", source: "existing deployment", markdown: "# Maintained instructions" });
    await hub.publish(previous.resourceId, previous.versionId);
    const input = await bundledStandardizeSkill();
    expect(input.id).toBe("lantern-knowledge-standardize");
    const updated = await hub.import(input);
    expect(updated.resourceId).toBe(previous.resourceId);
    expect(store.resources.size).toBe(1);
    expect((await hub.get(previous.resourceId)).version.id).toBe(previous.versionId);
  });
});
