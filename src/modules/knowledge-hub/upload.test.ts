import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { markdownInput, readSkillZip, safePackagePath, skillInput } from "./upload";
const file = (path: string, text: string) => ({ path, bytes: Buffer.from(text) });
describe("knowledge uploads", () => {
  it("imports explicit case audience without inventing an overwrite value when omitted", () => {
    expect(markdownInput(file("case.md", "---\nvisibility: public\n---\n# 案例"), "case").visibility).toBe("public");
    expect(markdownInput(file("case.md", "# 案例"), "case").visibility).toBeUndefined();
    expect(() => markdownInput(file("case.md", "---\nvisibility: secret\n---\n# 案例"), "case")).toThrow();
  });
  it("keeps body and metadata but cannot target a resource through frontmatter", () => {
    const result = markdownInput(file("guide.md", "---\nid: brand-whitepaper\ntitle: 指引\ntype: document\ntags: [服务]\n---\n# 指引\n\n正文"), "document");
    expect(result.id).not.toBe("brand-whitepaper");
    expect(result).toMatchObject({ title: "指引", tags: ["服务"], markdown: "# 指引\n\n正文" });
    expect(() => markdownInput(file("guide.pdf", "content"), "document")).toThrow("仅支持");
    expect(() => markdownInput(file("guide.md", "---\ntype: case\n---\n正文"), "document")).toThrow("类型");
  });
  it("rejects unsafe paths, invalid YAML and non UTF-8 input", () => {
    for (const path of ["../file", "/root/file", "a\\file", "a//file", "C:/file"]) expect(() => safePackagePath(path)).toThrow();
    expect(() => markdownInput(file("a.md", "---\ntitle: [\n---\nBody"), "document")).toThrow("YAML");
    expect(() => markdownInput({ path: "a.md", bytes: new Uint8Array([255]) }, "document")).toThrow("UTF-8");
  });
  it("preserves skill files, strips a wrapper and excludes dependencies and secrets", () => {
    const result = skillInput([file("my-skill/SKILL.md", "---\nname: my-skill\ndescription: Test\n---\n# Skill\nBody"), file("my-skill/scripts/check.py", "print('ok')"), file("my-skill/.env", "TOKEN=x"), file("my-skill/node_modules/a.js", "ignored")], "my-skill");
    expect(result.request.files.map(f => f.path)).toEqual(["SKILL.md", "scripts/check.py"]);
    expect(result.excluded).toHaveLength(2);
    expect(() => skillInput([file("SKILL.md", "# Skill"), file("x.txt", "-----BEGIN PRIVATE KEY-----")], "skill")).toThrow("私钥");
    expect(() => skillInput([file("README.md", "# Skill")], "skill")).toThrow("SKILL.md");
  });
  it("rejects duplicate package paths and symlinks in ZIP", async () => {
    expect(() => skillInput([file("SKILL.md", "# Skill"), file("skill.md", "duplicate")], "skill")).toThrow("重复");
    const zip = new JSZip().file("SKILL.md", "# Skill").file("link", "../outside", { unixPermissions: 0o120777 });
    await expect(readSkillZip(await zip.generateAsync({ type: "uint8array", platform: "UNIX" }))).rejects.toThrow("符号链接");
  });
  it("rejects traversal in ZIP before normalized names can conceal it", async () => {
    const zip = new JSZip().file("../evil.md", "evil");
    await expect(readSkillZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow("路径");
  });
  it("bounds decompression and accepts normal Skill ZIPs", async () => {
    const zip = new JSZip().file("SKILL.md", "# Skill\n\nRead me").file("ref/info.txt", "info");
    const unpacked = await readSkillZip(await zip.generateAsync({ type: "uint8array" }));
    expect(skillInput(unpacked.entries, "skill").request.files).toHaveLength(2);
    const bomb = new JSZip().file("large.txt", "x".repeat(12_000_001));
    await expect(readSkillZip(await bomb.generateAsync({ type: "uint8array", compression: "DEFLATE" }))).rejects.toThrow("解压后");
  });
});
