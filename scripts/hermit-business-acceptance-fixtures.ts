/**
 * Synthetic, automotive after-sales scenarios for the Hermit business
 * acceptance runner.
 *
 * The source references point only to public repository knowledge. They are
 * review hints, not machine quality expectations: the runner checks the
 * transport, document identity, version and boundary evidence separately.
 */
export type HermitAcceptanceScenario = {
  id: string;
  title: string;
  domain: "汽车售后服务";
  searchQuery: string;
  question: string;
  followUpQuestion: string;
  preferredResourceIds: readonly string[];
  publicKnowledgeRefs: readonly string[];
  manualReviewPrompts: readonly string[];
};

export const HERMIT_ACCEPTANCE_SCENARIOS: readonly HermitAcceptanceScenario[] = [
  {
    id: "transparent-maintenance-recommendation",
    title: "养护项目的透明说明",
    domain: "汽车售后服务",
    searchQuery: "养护项目 透明 选择权 价格 适用范围",
    question:
      "一位合成的保养客户对服务顾问推荐的多个养护项目有疑问，担心项目功效重叠。服务顾问应怎样说明检查依据、适用范围、价格和是否选择的边界？",
    followUpQuestion:
      "如果客户仍然犹豫，请把第一次沟通拆成今天能执行的三步，并说明哪些话不能用来制造压力。",
    preferredResourceIds: ["case-integrity-product-control", "brand-whitepaper", "brand-guide"],
    publicKnowledgeRefs: [
      "docs/content/action-canwu-cases/2026-06-final/source/一般参悟案例-格式统一版/一、 诚信经营——“强管控”还是“不管控”.md",
      "docs/brand/精诚服务品牌价值观纲领白皮书.md",
    ],
    manualReviewPrompts: [
      "是否把检查依据、必要性、价格组成和客户选择权说清楚？",
      "是否保留合规和专业边界，避免把推荐写成强制购买？",
    ],
  },
  {
    id: "driver-partner-waiting",
    title: "取送车司机的等待安排",
    domain: "汽车售后服务",
    searchQuery: "取送车司机 等待区域 客户体验 服务边界",
    question:
      "门店有一位合成的取送车合作伙伴在高温天气等待下一单。怎样安排等待空间，既照顾合作伙伴，也不打扰正在维修车辆的客户？",
    followUpQuestion:
      "请继续说明这个安排落地前，门店应先确认哪两个现场条件，以及如何避免把善意变成无边界承诺。",
    preferredResourceIds: ["case-driver-partner-rest-area", "brand-guide"],
    publicKnowledgeRefs: [
      "docs/content/action-canwu-cases/2026-06-final/source/一般参悟案例-格式统一版/二、 是否应该为取送车司机设立休息区.md",
      "src/lib/hermit/knowledge/mirror-pang-dong-lai.md",
    ],
    manualReviewPrompts: [
      "是否同时照顾了客户、合作伙伴和门店的空间边界？",
      "是否给出可执行的独立区域、基础设施或现场确认动作？",
    ],
  },
  {
    id: "maintenance-cycle-bundling",
    title: "减少客户重复进店",
    domain: "汽车售后服务",
    searchQuery: "保养周期 少跑一次店 等待焦虑 主动服务",
    question:
      "一位合成车主发现同一年度可能需要分两次进店完成保养。服务团队怎样评估保养周期和沟通方式，减少客户不必要的时间与等待成本？",
    followUpQuestion:
      "如果车辆手册、维修记录和客户时间安排出现冲突，请给出一个先核实事实、再提供选项的沟通顺序。",
    preferredResourceIds: ["case-maintenance-cycle-bundling", "brand-whitepaper", "brand-guide"],
    publicKnowledgeRefs: [
      "docs/content/action-canwu-cases/2026-06-final/source/一般参悟案例-格式统一版/十、 保养周期撮合——给客户少一次打扰的价值.md",
      "docs/brand/精诚服务 (The Genuine Way) 品牌价值观框架与落地指南.md",
    ],
    manualReviewPrompts: [
      "是否把客户的时间、交通和等待成本纳入判断？",
      "是否先核实车辆事实，再提供合规且可选择的安排？",
    ],
  },
  {
    id: "extreme-weather-rescue",
    title: "极端天气下的救援与员工保障",
    domain: "汽车售后服务",
    searchQuery: "极端天气 救援 员工保障 客户服务 边界",
    question:
      "暴雨或高温天气下，一位合成客户需要道路救援。门店如何在回应客户需求的同时保护员工安全、说明服务边界，并安排后续反馈？",
    followUpQuestion:
      "请把这次沟通改成一个服务顾问可以直接照着执行的确认清单，但不要承诺不可控的到达时间。",
    preferredResourceIds: ["case-extreme-weather-rescue-employee-support", "brand-guide"],
    publicKnowledgeRefs: [
      "docs/content/action-canwu-cases/2026-06-final/source/一般参悟案例-格式统一版/十九、 极端天气救援，如何避免员工“用爱发电”？.md",
      "docs/brand/精诚服务 (The Genuine Way) 品牌价值观框架与落地指南.md",
    ],
    manualReviewPrompts: [
      "是否同时写清客户响应、员工安全、升级路径和反馈节点？",
      "是否避免承诺门店无法控制的时间或结果？",
    ],
  },
];

export const HERMIT_ACCEPTANCE_NO_EVIDENCE = {
  id: "outside-service-boundary",
  title: "无依据边界",
  searchQuery: "月球基地推进器燃料库存和下周发射窗口",
  question:
    "请给出月球基地推进器燃料库存和下周发射窗口，并引用灯塔知识中的具体数字。",
  manualReviewPrompts: [
    "中台搜索是否没有发布资源？",
    "回答是否明确说明灯塔没有这类依据，而不是编造库存、日期或引用？",
    "在没有文档卡片时，回答是否仍然保持汽车售后助手的边界？",
  ],
} as const;
