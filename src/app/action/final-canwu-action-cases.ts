import generatedCases from "./final-canwu-action-cases.generated.json";
import type { MarkdownActionCase } from "./action-cases";

type GeneratedCanwuCase = {
  order: number;
  slug: string;
  title: string;
  sourcePath: string;
  summary: string;
  markdown: string;
  headings: Array<{ level: number; title: string }>;
};

const METADATA_BY_ORDER: Record<number, { shortTitle: string; tags: string[] }> = {
  1: { shortTitle: "诚信经营管控", tags: ["诚信经营", "养护产品", "客户信任"] },
  2: { shortTitle: "取送车司机休息区", tags: ["取送车", "合作伙伴", "服务边界"] },
  3: { shortTitle: "取送车客诉原则", tags: ["取送车", "客诉处理", "责任边界"] },
  4: { shortTitle: "接待台吃饭边界", tags: ["员工关怀", "现场管理", "客户感知"] },
  5: { shortTitle: "车间降温抉择", tags: ["车间环境", "员工效能", "质量保障"] },
  6: { shortTitle: "客休区楼梯体验", tags: ["空间设计", "客户体验", "安全感"] },
  7: { shortTitle: "服务顾问呼吸感", tags: ["服务顾问", "专业空间", "员工效能"] },
  8: { shortTitle: "插座与主动服务", tags: ["主动服务", "客休区", "现场判断"] },
  9: { shortTitle: "客休区售卖边界", tags: ["客休区", "售卖边界", "体验管理"] },
  10: { shortTitle: "保养周期撮合", tags: ["保养周期", "客户打扰", "主动服务"] },
  11: { shortTitle: "权限开通门槛", tags: ["权限标准", "区域管理", "规则一致"] },
  12: { shortTitle: "转化门店硬装", tags: ["门店建设", "硬装改造", "扩店效率"] },
  13: { shortTitle: "相邻门店合并运营", tags: ["集团运营", "品牌边界", "合并运营"] },
  14: { shortTitle: "执法记录仪边界", tags: ["记录仪", "服务沟通", "隐私边界"] },
  15: { shortTitle: "营运车渠道分流", tags: ["营运车", "渠道分流", "服务效率"] },
  16: { shortTitle: "节假日氛围布置", tags: ["节假日", "氛围布置", "体验传播"] },
  18: { shortTitle: "精诚吧标准", tags: ["精诚吧", "体验标准", "经营承压"] },
  19: { shortTitle: "极端天气救援", tags: ["极端天气", "员工保障", "救援服务"] },
};

const COMMON_TAGS = ["参悟案例", "精诚服务", "内部实践"];

function toMarkdownActionCase(item: GeneratedCanwuCase): MarkdownActionCase {
  const metadata = METADATA_BY_ORDER[item.order];

  return {
    schemaVersion: 1,
    kind: "markdown",
    slug: item.slug,
    href: `/action/${item.slug}`,
    metadata: {
      contentType: "action_case",
      module: "action",
      title: item.title,
      shortTitle: metadata.shortTitle,
      kicker: "最终参悟案例",
      date: "JUN 2026",
      audience: ["品牌方售后团队", "区域服务管理者", "门店管理者", "一线服务人员"],
      roles: ["服务顾问", "服务经理", "区域管理者", "门店运营负责人"],
      serviceScenarios: metadata.tags,
      tags: [...metadata.tags, ...COMMON_TAGS],
      visibility: "internal",
      owner: "精诚服务内容团队",
      status: "published",
      version: "2026-06-final",
    },
    brief: {
      oneLine: item.summary,
      learningGoal: "通过最终参悟案例回到真实服务现场，理解选择背后的服务价值、经营边界和可复用原则。",
      caseQuestion: item.title,
    },
    markdown: item.markdown,
    headings: item.headings,
    evidence: {
      sourceMaterials: [
        {
          type: "润色稿",
          title: "一般参悟案例-格式统一版",
          path: item.sourcePath,
          note: "用户确认的最终参悟案例 Markdown，已归档为笃行案例静态内容源。",
          visibility: "maintainer_only",
        },
      ],
      sourceNotes: [
        "本批次是最终确定内容，当前以静态发布案例形式进入笃行；后续可再转入管理端内容库。",
        "原始 Markdown 保留在 docs/content/action-canwu-cases/2026-06-final/，应用侧生成数据不得反向覆盖源文件。",
      ],
    },
  };
}

export const FINAL_CANWU_ACTION_CASES = (generatedCases as GeneratedCanwuCase[]).map(toMarkdownActionCase);
