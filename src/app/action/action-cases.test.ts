import { describe, expect, it } from "vitest";
import { ACTION_CASES, type ActionCase, getActionCaseBySlug } from "./action-cases";

describe("action cases", () => {
  it("stores Action cases with normalized maintenance dimensions", () => {
    const actionCase = getActionCaseBySlug("driver-partner-rest-area") as ActionCase | undefined;

    expect(actionCase?.schemaVersion).toBe(1);
    expect(actionCase?.metadata.title).toBe("是否为代驾司机设置合作伙伴休息区");
    expect(actionCase?.metadata.audience).toContain("门店伙伴");
    expect(actionCase?.metadata.tags).toEqual(expect.arrayContaining(["客户体验", "合作伙伴", "服务边界"]));
    expect(actionCase?.brief.oneLine).toContain("长期口碑");
    expect(actionCase?.brief.caseQuestion).toContain("合作伙伴休息区");
    expect(actionCase?.background.trigger).toContain("店外阴凉处");
    expect(actionCase?.caseBody.paragraphs.join("")).toContain("代驾司机是车主把车交给门店的最后一棒");
    expect(actionCase?.cognitiveFrames.map((frame: { label: string }) => frame.label)).toEqual([
      "成本视角",
      "边界视角",
      "客户视角",
      "网络视角",
    ]);
    expect(actionCase?.decisionNodes[0]).toEqual(
      expect.objectContaining({
        title: "现场选择：请进来坐，还是让他在店外等",
        finalChoice: expect.stringContaining("选择A"),
        impacts: expect.objectContaining({
          customer: expect.any(String),
          store: expect.any(String),
          compliance: expect.any(String),
        }),
      }),
    );
    expect(actionCase?.storeTakeaways).toHaveLength(4);
    expect(actionCase?.evidence.sourceMaterials[0]).toEqual(
      expect.objectContaining({ type: "润色稿", visibility: "maintainer_only" }),
    );
    expect(ACTION_CASES.map((item) => item.slug)).toContain("driver-partner-rest-area");
  });
});
