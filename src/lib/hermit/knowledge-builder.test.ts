import { describe, expect, it } from "vitest";
import {
  buildKnowledgeChunks,
  formatActionCaseKnowledgeDocuments,
  formatContentItemKnowledgeDocument,
  formatPublishedGuideKnowledgeDocument,
} from "./knowledge-builder";

describe("hermit knowledge builder", () => {
  it("formats published Workshop Do and Don't guides as retrievable practice knowledge", () => {
    const document = formatPublishedGuideKnowledgeDocument({
      id: "guide-1",
      title: "交车等待超时安抚",
      roleName: "服务顾问",
      serviceScenario: "交车等待",
      principleRef: "真",
      doText: "先确认客户已经等待多久，并主动说明下一步时间。",
      howText: "用具体时间点承诺回访，不用模糊话术。",
      dontText: "不要说马上就好，也不要让客户自己去催车间。",
      publishedAt: new Date("2026-06-01T00:00:00Z"),
    });

    expect(document).toMatchObject({
      id: "workshop-guide:guide-1",
      source: "Workshop 已发布指南 / 交车等待超时安抚",
      sourceType: "workshop_guide",
      evidenceTier: "exact",
    });
    expect(document.content).toContain("服务顾问");
    expect(document.content).toContain("先确认客户已经等待多久");
    expect(document.content).toContain("不要说马上就好");
  });

  it("formats Action cases with decisions and reusable practices", () => {
    const [document] = formatActionCaseKnowledgeDocuments([
      {
        slug: "driver-partner-rest-area",
        metadata: {
          title: "合作伙伴休息区",
          status: "published",
          roles: ["服务顾问"],
          serviceScenarios: ["取送车服务"],
          tags: ["客户体验", "服务边界"],
        },
        brief: {
          oneLine: "复盘门店是否应该为代驾司机提供休息区。",
          caseQuestion: "是否要为代驾司机设置休息区？",
        },
        decisionNodes: [
          {
            title: "现场选择",
            trigger: "代驾司机完成交接后在门外等待。",
            finalChoice: "设置独立合作伙伴休息区。",
          },
        ],
        finalPractice: ["提供饮用水、沙发和充电口。"],
        reusablePrinciples: ["服务边界要按客户信任链条判断。"],
      },
    ]);

    expect(document).toMatchObject({
      id: "action-case:driver-partner-rest-area",
      sourceType: "action_case",
      evidenceTier: "exact",
    });
    expect(document.content).toContain("是否要为代驾司机设置休息区？");
    expect(document.content).toContain("设置独立合作伙伴休息区");
    expect(document.content).toContain("服务边界要按客户信任链条判断");
  });

  it("formats managed published content versions as source-specific knowledge", () => {
    const document = formatContentItemKnowledgeDocument({
      id: "content-1",
      title: "服务顾问交车 SOP",
      contentType: "norm_file",
      bodyMarkdown: "# 服务顾问交车 SOP\n\n交车前必须说明已完成项目和待观察事项。",
      updatedAt: new Date("2026-06-02T00:00:00Z"),
    });

    expect(document).toMatchObject({
      id: "content-item:content-1",
      sourceType: "norm_file",
      evidenceTier: "exact",
    });
    expect(document.content).toContain("交车前必须说明已完成项目");
  });

  it("keeps source metadata when splitting documents into chunks", () => {
    const chunks = buildKnowledgeChunks([
      {
        id: "workshop-guide:guide-1",
        source: "Workshop 已发布指南 / 交车等待超时安抚",
        sourceType: "workshop_guide",
        evidenceTier: "exact",
        title: "交车等待超时安抚",
        content: "## 做法\n\n先确认等待时间并说明下一步。",
      },
    ]);

    expect(chunks).toEqual([
      expect.objectContaining({
        id: "workshop-guide:guide-1#0",
        source: "Workshop 已发布指南 / 交车等待超时安抚",
        sourceType: "workshop_guide",
        evidenceTier: "exact",
        heading: "交车等待超时安抚",
      }),
    ]);
  });
});
