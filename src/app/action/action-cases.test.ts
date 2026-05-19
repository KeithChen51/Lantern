import { describe, expect, it } from "vitest";
import { ACTION_CASES, type ActionCase, getActionCaseBySlug } from "./action-cases";

describe("action cases", () => {
  it("stores Action cases with normalized maintenance dimensions", () => {
    const actionCase = getActionCaseBySlug("substitute-vehicle-policy") as ActionCase | undefined;

    expect(actionCase?.schemaVersion).toBe(1);
    expect(actionCase?.metadata.title).toBe("代用车政策演变中的权衡与认知冲突");
    expect(actionCase?.metadata.audience).toContain("门店伙伴");
    expect(actionCase?.metadata.tags).toEqual(expect.arrayContaining(["客户体验", "门店能力", "政策权衡"]));
    expect(actionCase?.brief.oneLine).toContain("客户体验");
    expect(actionCase?.background.trigger).toContain("政策运行");
    expect(actionCase?.cognitiveFrames.map((frame: { label: string }) => frame.label)).toEqual([
      "客户视角",
      "门店视角",
      "政策视角",
      "指标视角",
    ]);
    expect(actionCase?.decisionNodes[0]).toEqual(
      expect.objectContaining({
        title: "注册年限：从 12 个月到 15/18/24 个月",
        finalChoice: expect.stringContaining("15"),
        impacts: expect.objectContaining({
          customer: expect.any(String),
          store: expect.any(String),
          compliance: expect.any(String),
        }),
      }),
    );
    expect(actionCase?.storeTakeaways).toHaveLength(4);
    expect(actionCase?.evidence.sourceMaterials[0]).toEqual(
      expect.objectContaining({ type: "访谈转写", visibility: "maintainer_only" }),
    );
    expect(ACTION_CASES.map((item) => item.slug)).toContain("substitute-vehicle-policy");
  });
});
