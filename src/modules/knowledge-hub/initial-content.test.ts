import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { bundledCaseInsightSkill, CASE_INSIGHT_FILES, INITIAL_CASE_SLUGS, loadInitialContent } from "./initial-content";

describe("production first-install inventory", () => {
  it("contains only the approved 22 sources and keeps canonical cases internal", async () => {
    const inputs = await loadInitialContent();
    expect(inputs.map(input => input.id).sort()).toEqual([
      "brand-whitepaper", "knowledge-mirror-pang-dong-lai", "lantern-knowledge-standardize", "case-insight",
      ...INITIAL_CASE_SLUGS.map(slug => `case-${slug}`),
    ].sort());
    expect(inputs.filter(input => input.type === "document")).toHaveLength(2);
    expect(inputs.filter(input => input.type === "skill")).toHaveLength(2);
    expect(inputs.filter(input => input.type === "case")).toHaveLength(18);
    expect(inputs.some(input => ["brand-guide", "knowledge-heart-values"].includes(input.id))).toBe(false);
    for (const input of inputs.filter(input => input.type !== "skill")) {
      expect(input.markdown).toBe(await readFile(input.source, "utf8"));
      expect(input.visibility).toBe(input.type === "case" ? "internal" : "public");
    }
    expect(inputs[0].title).toBe("精诚服务品牌升级：价值框架与路径");
    expect(inputs[1].title).toBe("云游胖东来：标杆案例转译卡");
  });

  it("ships every case-insight reference byte-for-byte, including its provenance", async () => {
    const skill = await bundledCaseInsightSkill();
    expect(skill.files.map(file => file.path).sort()).toEqual([...CASE_INSIGHT_FILES].sort());
    expect(skill.files).toHaveLength(11);
    for (const file of skill.files) {
      expect(Buffer.from(file.contentBase64, "base64")).toEqual(await readFile(`skills/case-insight/${file.path}`));
    }
    for (const match of skill.markdown.matchAll(/\]\((references\/[^)]+)\)/g)) {
      expect(skill.files.some(file => file.path === match[1])).toBe(true);
    }
    const provenance = skill.files.find(file => file.path === "references/restoration-notes.md")!;
    expect(Buffer.from(provenance.contentBase64, "base64").toString()).toContain("不宣称是原始压缩包");
    expect(skill.files.some(file => /source\.html|restore_package|\.zip|\.skill$/.test(file.path))).toBe(false);
  });

  it("defaults to preview without connecting to an unreachable database or exposing credentials", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/knowledge-initialize.ts"], {
      encoding: "utf8", timeout: 20_000,
      env: { ...process.env, KNOWLEDGE_HUB_DRIVER: "mysql", DATABASE_URL: "mysql://private-user:private-secret@127.0.0.1:1/private-db" },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "dry-run", resources: 22 });
    expect(result.stdout + result.stderr).not.toMatch(/private-secret|private-user|private-db/);
  });

  it.each([["--unexpected"], ["--apply", "--dry-run"], ["positional"]])("rejects ambiguous or unknown CLI arguments %s", (...args) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/knowledge-initialize.ts", ...args], { encoding: "utf8", timeout: 20_000 });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });

  it("refuses SQLite apply before opening a database", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/knowledge-initialize.ts", "--apply"], {
      encoding: "utf8", timeout: 20_000, env: { ...process.env, KNOWLEDGE_HUB_DRIVER: "sqlite", DATABASE_URL: "file:/secret/path" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--apply requires");
    expect(result.stderr).not.toContain("/secret/path");
  });
});
