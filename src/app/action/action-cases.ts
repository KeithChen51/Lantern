export type ActionCaseSourceMaterial = {
  type: "访谈转写" | "分析报告" | "润色稿" | "政策文件";
  title: string;
  path?: string;
  note: string;
  visibility: "public" | "maintainer_only";
};

export type ActionCaseCognitiveFrame = {
  label: string;
  focus: string;
  question: string;
};

export type ActionCaseOption = {
  label: string;
  description: string;
  customerEffect: string;
  storeEffect: string;
};

export type ActionCaseDecisionNode = {
  title: string;
  trigger: string;
  options: ActionCaseOption[];
  finalChoice: string;
  impacts: {
    customer: string;
    store: string;
    compliance: string;
  };
  riskControl: string;
  status: "已落地" | "需持续观察";
};

export type ActionCase = {
  schemaVersion: 1;
  slug: string;
  href: string;
  metadata: {
    contentType: "action_case";
    module: "action";
    title: string;
    shortTitle: string;
    kicker: string;
    date: string;
    audience: string[];
    roles: string[];
    serviceScenarios: string[];
    tags: string[];
    visibility: "internal";
    owner: string;
    status: "draft" | "published";
    version: string;
    imageUrl?: string;
  };
  brief: {
    oneLine: string;
    learningGoal: string;
    caseQuestion: string;
  };
  background: {
    context: string;
    trigger: string;
  };
  cognitiveFrames: ActionCaseCognitiveFrame[];
  decisionNodes: ActionCaseDecisionNode[];
  finalPractice: string[];
  storeTakeaways: {
    title: string;
    body: string;
  }[];
  reusablePrinciples: string[];
  evidence: {
    sourceMaterials: ActionCaseSourceMaterial[];
    sourceNotes: string[];
  };
};

export const ACTION_CASES: ActionCase[] = [
  {
    schemaVersion: 1,
    slug: "substitute-vehicle-policy",
    href: "/action/substitute-vehicle-policy",
    metadata: {
      contentType: "action_case",
      module: "action",
      title: "代用车政策演变中的权衡与认知冲突",
      shortTitle: "代用车政策权衡",
      kicker: "内部服务实践案例",
      date: "MAY 2026",
      audience: ["门店伙伴", "售后服务管理者", "政策制定与执行团队"],
      roles: ["服务经理", "售后经理", "客户关系岗位", "区域服务运营"],
      serviceScenarios: ["维修等待", "事故车服务", "索赔服务", "代步出行安排"],
      tags: ["客户体验", "门店能力", "政策权衡", "代用车", "售后服务"],
      visibility: "internal",
      owner: "售后服务政策团队",
      status: "draft",
      version: "v0.1",
      imageUrl: "/v3_03_action_case_card.webp",
    },
    brief: {
      oneLine:
        "复盘代用车政策如何在客户体验、门店实际能力和财务合规之间做权衡。",
      learningGoal:
        "帮助门店理解政策弹性的目的不是降低客户标准，而是在真实执行条件下守住客户体验。",
      caseQuestion:
        "当严格标准、门店能力和客户实际用车需求不能同时被完全满足时，政策应该怎样取舍？",
    },
    background: {
      context:
        "代用车是售后服务中缓解客户维修等待焦虑的重要安排。客户不一定理解背后的财务模型、车辆来源或审批流程，他感受到的是维修期间有没有车可用，车况是否合适，沟通是否清楚。",
      trigger:
        "政策运行后，门店陆续反馈注册年限、地方牌照、车源转换、配车台次和车型配置等执行难点。业务团队需要根据真实问题调整政策，同时避免客户体验被逐步稀释。",
    },
    cognitiveFrames: [
      {
        label: "客户视角",
        focus: "等待期间是否被妥善照顾",
        question: "客户有真实出行需求时，是否能及时拿到状态合适的代用车？",
      },
      {
        label: "门店视角",
        focus: "车源、牌照、整备和运营成本",
        question: "门店是否具备找到车辆、完成注册、持续调度和维护车况的实际能力？",
      },
      {
        label: "政策视角",
        focus: "补贴逻辑、财务合规和体验底线",
        question: "政策是否既能被执行，又没有把门店困难直接转嫁给客户？",
      },
      {
        label: "指标视角",
        focus: "运营率、覆盖率和需求满足率",
        question: "管理指标变好时，客户真实需求是否也被满足？",
      },
    ],
    decisionNodes: [
      {
        title: "注册年限：从 12 个月到 15/18/24 个月",
        trigger:
          "财务模型希望首次上牌到代用车注册审批通过不超过 12 个月，以匹配车辆第一年折损；门店则需要处理试驾车退役、整备、材料准备和审批往返。",
        options: [
          {
            label: "严格坚持 12 个月",
            description: "与折损模型完全匹配，车辆新鲜度最好。",
            customerEffect: "客户更可能拿到车龄很新的代用车。",
            storeEffect: "部分门店可能因车源转换时间不足而无法配车。",
          },
          {
            label: "给予 15 个月基础冗余",
            description: "给试驾车转代用车留出合理操作时间。",
            customerEffect: "客户仍能获得相对较新的车辆，同时提高有车可用的概率。",
            storeEffect: "门店有更现实的准备窗口。",
          },
          {
            label: "特殊地区或全国继续放宽",
            description: "回应上海牌照等地方约束，后续全国放宽至 24 个月。",
            customerEffect: "覆盖更容易达成，但车龄、里程和车况感知可能下降。",
            storeEffect: "车源压力明显降低。",
          },
        ],
        finalChoice:
          "第一版采用 15 个月，特殊地区放宽至 18 个月，后续全国放宽至 24 个月，并通过车况、里程、清洁和交付要求守住体验底线。",
        impacts: {
          customer:
            "客户更不容易因为门店无车源而完全失去代用车服务，但需要关注车辆新鲜度和使用感知。",
          store:
            "门店获得了更可执行的缓冲期，但不能把年限弹性理解成体验降级空间。",
          compliance:
            "年限放宽会偏离最理想的折损匹配，需要在支持标准和实际贡献核算上同步校准。",
        },
        riskControl:
          "后续维护应补充车辆状态、里程、清洁、保险和交付检查字段，避免只放宽准入而缺少体验底线。",
        status: "需持续观察",
      },
      {
        title: "配车台次：运营率与覆盖率的取舍",
        trigger:
          "试点期按 10,000 台次配 1 台车，全国推广时提高到 5,000 台次配 1 台车，但整体运营达标率只有约 60% 至 70%。",
        options: [
          {
            label: "维持 5,000 台次配 1 台",
            description: "保证更多车辆进入服务池。",
            customerEffect: "客户高峰期更容易有车可用。",
            storeEffect: "部分车辆可能闲置，运营率压力较大。",
          },
          {
            label: "恢复 10,000 台次配 1 台",
            description: "减少车辆数量，提高单车运营率。",
            customerEffect: "高峰期可能出现客户有需求但无车可用。",
            storeEffect: "车辆使用更集中，管理指标更好看。",
          },
        ],
        finalChoice:
          "在降本增效压力下恢复为 10,000 台次配 1 台车，但后续评价不能只看运营率，还要看客户需求满足率。",
        impacts: {
          customer:
            "运营率提升不必然等于客户体验提升，车辆减少可能让部分客户失去服务机会。",
          store:
            "门店需要更强的预约、调度和异常反馈能力，不能只追求单车跑满。",
          compliance:
            "成本效率更容易解释，但如果缺少需求满足率，会形成指标偏差。",
        },
        riskControl:
          "新增或跟踪客户需求满足率、调度失败原因和高峰期缺车反馈，避免运营率单一导向。",
        status: "需持续观察",
      },
      {
        title: "索赔与事故车：把资源交给更需要的人",
        trigger:
          "原政策要求索赔客户占比达到 40%，运行后发现部分索赔客户虽在店周期长，但并不一定真实需要代用车。",
        options: [
          {
            label: "继续坚持 40% 索赔占比",
            description: "延续原考核口径。",
            customerEffect: "资源可能停留在并不急需代步的客户身上。",
            storeEffect: "门店容易为了比例安排资源，而不是为了真实需求安排资源。",
          },
          {
            label: "下调索赔占比，释放给事故车",
            description: "将索赔占比降至 20%，把资源转向更突然、更被动的事故车客户。",
            customerEffect: "事故车客户的出行中断更容易被照顾。",
            storeEffect: "门店考核压力更贴近真实客户需求。",
          },
        ],
        finalChoice:
          "将索赔客户考核比例下调至 20%，释放出的资源转向事故车客户。",
        impacts: {
          customer:
            "资源更接近真实痛点，尤其是突发事故后需要代步的客户。",
          store:
            "门店不必为了凑比例勉强安排资源，可以把车用在更需要的客户身上。",
          compliance:
            "总资源不增加，但考核口径更贴近真实使用场景。",
        },
        riskControl:
          "后续应保留客户需求判断和资源分配原因，避免从一个固定比例滑向另一个固定比例。",
        status: "已落地",
      },
      {
        title: "A/B 类车型：体验目标与现实车源",
        trigger:
          "品牌希望客户通过代用车体验更高配置车型，但门店并不一定随时具备 A 类车源。",
        options: [
          {
            label: "强制第一台配 A 类",
            description: "直接守住体验目标和品牌拉升意图。",
            customerEffect: "客户更可能获得高配车型体验。",
            storeEffect: "部分门店可能因缺少 A 类车而无法启动配车。",
          },
          {
            label: "优先配、尽量配，并允许阶段性替换",
            description: "保留体验方向，同时给门店寻找合适车辆的时间。",
            customerEffect: "降低无车可用风险，但要防止明显降级。",
            storeEffect: "执行弹性更高，可按实际车源逐步调整。",
          },
        ],
        finalChoice:
          "政策从“要配”软化为“优先配”“尽量配”，允许 B 类车在一定条件下先顶替，但支持核算转向实际用车天数和真实贡献。",
        impacts: {
          customer:
            "原 A 类客户不应被明显降级，B 类客户如体验 A 类车可能形成后续换购意愿。",
          store:
            "门店有时间寻找合适车辆，但不能把弹性理解为取消体验方向。",
          compliance:
            "按实际贡献核算比按名义配置更能减少空配、虚配和低效配置。",
        },
        riskControl:
          "记录车型替换路径、实际用车天数和客户车型匹配情况，防止名义配置与真实服务脱节。",
        status: "需持续观察",
      },
    ],
    finalPractice: [
      "注册年限从理论 12 个月扩展为 15 个月基础冗余，特殊地区和后续版本继续放宽，但需要车况底线配套。",
      "配车台次在推广期扩大后又恢复收紧，后续评价应补充客户需求满足率。",
      "索赔占比从 40% 下调至 20%，释放资源给更有急需的事故车客户。",
      "A/B 类车型要求从强制表达转为优先引导，并用实际用车天数衡量真实贡献。",
    ],
    storeTakeaways: [
      {
        title: "先判断客户真实需求",
        body: "不是所有维修客户都需要代用车，也不是只有索赔客户才需要代用车。客户是否有通勤、家庭、突发事故、等待周期等实际压力，应成为资源分配依据。",
      },
      {
        title: "主动反馈真实执行困难",
        body: "遇到车源、牌照、整备、审批周期等困难时，应尽早反馈，并说明具体原因和客户影响。政策调整需要真实信息，而不是笼统地说“做不到”。",
      },
      {
        title: "不把政策弹性理解为体验降级空间",
        body: "年限放宽、车型替换、比例调整，都是为了让服务能落地，不是为了降低客户标准。",
      },
      {
        title: "用客户价值理解运营指标",
        body: "单车运营率、用车天数、索赔占比、车型结构都是管理工具，真正要回答的是客户有需要时是否得到了合适帮助。",
      },
    ],
    reusablePrinciples: [
      "先看客户真实处境，再看门店执行方式，最后再设计考核比例。",
      "政策弹性是为了让服务落地，不是为了默许服务品质下滑。",
      "运营率、折让金额和车型结构不能替代客户需求满足率。",
      "门店困难需要被看见，但不能直接转化为客户体验的持续让步。",
    ],
    evidence: {
      sourceMaterials: [
        {
          type: "访谈转写",
          title: "pasted_content.txt",
          path: "C:/Users/Keith/Downloads/pasted_content.txt",
          note: "发言者 1 为代用车负责人，发言者 4 为案例整理者，提供政策演变与复盘口径。",
          visibility: "maintainer_only",
        },
        {
          type: "分析报告",
          title: "代用车政策演变与决策逻辑分析报告",
          path: "C:/Users/Keith/Downloads/代用车政策演变与决策逻辑分析报告",
          note: "用于核对注册年限、配车台次、索赔占比和 A/B 类车型配置等节点。",
          visibility: "maintainer_only",
        },
        {
          type: "润色稿",
          title: "案例研讨：代用车政策演变中的权衡与认知冲突（润色版）",
          path: "C:/Users/Keith/Downloads/案例研讨：代用车政策演变中的权衡与认知冲突（润色版）.md",
          note: "用于前台案例文案与门店视角表述。",
          visibility: "maintainer_only",
        },
      ],
      sourceNotes: [
        "前台只展示结构化案例内容；原始材料用于维护、审核和后续追溯。",
        "若后续接入后台，应把 sourceMaterials 作为附件或来源记录，不直接暴露给普通读者。",
      ],
    },
  },
];

export function getActionCaseBySlug(slug: string) {
  return ACTION_CASES.find((actionCase) => actionCase.slug === slug);
}
