import { describe, expect, it } from "vitest";
import { ACTION_CASES, type ActionCase, getActionCaseBySlug, isMarkdownActionCase } from "./action-cases";

describe("action cases", () => {
  it("publishes the finalized canwu batch as Action cases", () => {
    expect(ACTION_CASES).toHaveLength(20);
    expect(ACTION_CASES.every((item) => item.metadata.status === "published")).toBe(true);

    const first = getActionCaseBySlug("integrity-product-control") as ActionCase | undefined;
    expect(first?.kind).toBe("markdown");
    expect(first && isMarkdownActionCase(first)).toBe(true);
    if (!first || !isMarkdownActionCase(first)) throw new Error("Expected first finalized canwu case to be markdown.");
    expect(first?.metadata.title).toBe("诚信经营——“强管控”还是“不管控”");
    expect(first?.brief.caseQuestion).toBe("诚信经营——“强管控”还是“不管控”");
    expect(first?.metadata.tags).toEqual(expect.arrayContaining(["参悟案例", "精诚服务", "内部实践"]));
    expect(first?.markdown).toContain("## 案例引入");
    expect(first?.evidence.sourceMaterials[0]).toEqual(
      expect.objectContaining({
        title: "一般参悟案例-格式统一版",
        path: "docs/content/action-canwu-cases/2026-06-final/source/一般参悟案例-格式统一版/一、 诚信经营——“强管控”还是“不管控”.md",
      }),
    );

    const second = getActionCaseBySlug("driver-partner-rest-area") as ActionCase | undefined;
    expect(second && isMarkdownActionCase(second)).toBe(true);
    if (!second || !isMarkdownActionCase(second)) throw new Error("Expected driver partner case to be markdown.");
    expect(second?.metadata.title).toBe("是否应该为取送车司机设立休息区");
    expect(second?.metadata.shortTitle).toBe("取送车司机休息区");
    expect(second?.markdown).toContain("## **情景引入**");
  });

  it("keeps the old structured Action shape available for maintenance fixtures", () => {
    const actionCase = {
      schemaVersion: 1,
      kind: "structured",
      slug: "driver-partner-rest-area",
      href: "/action/driver-partner-rest-area",
      metadata: {
        contentType: "action_case",
        module: "action",
        title: "是否为代驾司机设置合作伙伴休息区",
        shortTitle: "合作伙伴休息区",
        kicker: "内部服务实践案例",
        date: "MAY 2026",
        audience: ["门店伙伴", "服务经理", "售后服务管理者", "客户体验团队"],
        roles: ["服务顾问", "售后经理", "客户关系岗位", "门店运营负责人"],
        serviceScenarios: ["取送车服务", "代驾交接", "客户信任链条", "门店等候体验"],
        tags: ["客户体验", "合作伙伴", "服务边界", "口碑网络", "成本投资"],
        visibility: "internal",
        owner: "服务文化团队",
        status: "draft",
        version: "v0.1",
      },
      brief: {
        oneLine: "复盘门店是否应为代驾司机提供独立休息区：看清成本、边界和长期口碑之间的取舍。",
        learningGoal: "帮助门店把眼前成本放回服务链条里判断。",
        caseQuestion: "我们是否要花费额外的成本给代驾司机提供单独的合作伙伴休息区？",
      },
      background: {
        context: "周日下午，代驾张师傅完成了车辆交接。",
        trigger: "门店需要判断是请司机师傅到店里坐坐，还是让他在店外阴凉处等。",
      },
      caseBody: {
        paragraphs: ["代驾司机是车主把车交给门店的最后一棒。"],
        positiveOutcomes: ["善意是可传递的。"],
      },
      cognitiveFrames: [
        { label: "成本视角", focus: "坪效、水电、保洁都是真实支出", question: "这片空间到底是什么？" },
        { label: "边界视角", focus: "代驾司机不是直接付费客户", question: "边界该怎么划定？" },
        { label: "客户视角", focus: "客户会观察门店如何对待“我的人”", question: "客户会怎么看？" },
        { label: "网络视角", focus: "几十名活跃司机影响周边车主口碑", question: "谁在传播服务体验？" },
      ],
      decisionNodes: [
        {
          title: "现场选择：请进来坐，还是让他在店外等",
          trigger: "代驾司机完成车辆交接后在门外等待。",
          options: [
            {
              label: "选择A：请司机师傅到店里坐坐",
              description: "提供饮用水和等候空间。",
              customerEffect: "客户能感受到尊重。",
              storeEffect: "需要承担现场管理成本。",
            },
          ],
          finalChoice: "选择A。",
          impacts: { customer: "客户信任增强。", store: "减少服务风险。", compliance: "边界清楚。" },
          riskControl: "设置独立区域。",
          status: "已落地",
        },
      ],
      finalPractice: ["为长期参与取送车服务的代驾司机设置独立合作伙伴休息区。"],
      storeTakeaways: [
        { title: "客户不只在交易关系里", body: "每一个能影响车主决策的人都是服务链条的一环。" },
        { title: "善意需要有边界地落地", body: "用独立空间承接善意。" },
        { title: "低成本投入也可能是体验投资", body: "小成本会影响客户信任。" },
        { title: "合作伙伴情绪会进入客户体验", body: "善意会进入后续服务。" },
      ],
      reusablePrinciples: ["凡是影响客户决策和口碑的人，都要被看作服务链条的一环。"],
      evidence: {
        sourceMaterials: [{ type: "润色稿", title: "合作伙伴休息区案例文本", note: "维护字段。", visibility: "maintainer_only" }],
        sourceNotes: ["维护字段用于后续审核和追溯。"],
      },
    } satisfies ActionCase;

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
