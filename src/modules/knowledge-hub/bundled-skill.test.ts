import { describe, expect, it } from "vitest";
import { bundledStandardizeSkill, STANDARDIZE_SKILL_ID } from "./bundled-skill";
describe("bundled standardization skill", () => {
  it("ships the complete runnable skill without machine dependencies", async () => {
    const input = await bundledStandardizeSkill();
    expect(input.id).toBe(STANDARDIZE_SKILL_ID);
    expect(input.type).toBe("skill");
    const paths = input.files.map(file => file.path);
    expect(paths).toEqual(expect.arrayContaining(["SKILL.md", "package.json", "package-lock.json", "scripts/check.mjs", "scripts/validate.mjs", "scripts/schema.mjs", "references/protocol.md", "assets/document.md"]));
    expect(paths.some(p => p.includes("node_modules") || p.includes(".env"))).toBe(false);
    expect(input.markdown).not.toMatch(/^---/);
    expect(Buffer.from(input.files.find(f => f.path === "SKILL.md")!.contentBase64, "base64").toString()).toContain("name: lantern-knowledge-standardize");
  });
});
