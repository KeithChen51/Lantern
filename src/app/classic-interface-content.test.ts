import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("classic interface content guardrails", () => {
  it("keeps the current Heart value structure", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");

    expect(heartPage).toContain("求真、尽善、致美、大爱、幸福");
    expect(heartPage).toContain("长期经营的分水岭在哪里？");
    expect(heartPage).toContain("致美，是让服务不止于完成，更抵达专业与秩序。");
    expect(heartPage).toContain("人的尊严、自由与幸福是经济发展的目的而不是代价。");
  });

  it("keeps the current Action case instead of restoring backup branch content", () => {
    const cases = readProjectFile("src/app/action/action-cases.ts");

    expect(cases).toContain("driver-partner-rest-area");
    expect(cases).toContain("是否为代驾司机设置合作伙伴休息区");
    expect(cases).not.toContain("substitute-vehicle-policy");
  });

  it("keeps current Hermit persistence modules", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/modules/hermit/service.ts"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/modules/hermit/repository.ts"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/modules/hermit/types.ts"))).toBe(true);
  });

  it("keeps Workshop sections in the current role-aware structure", () => {
    const workshopSections = readProjectFile("src/app/workshop/workshop-sections.ts");

    expect(workshopSections).toContain('export type WorkshopSectionId = "public" | "submit" | "personal" | "review"');
    expect(workshopSections).toContain('{ id: "public"');
    expect(workshopSections).toContain('{ id: "submit"');
    expect(workshopSections).toContain('{ id: "personal"');
    expect(workshopSections).toContain('{ id: "review"');
  });
});
