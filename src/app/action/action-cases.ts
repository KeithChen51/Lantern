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
  caseBody: {
    paragraphs: string[];
    positiveOutcomes: string[];
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
      imageUrl: "/v3_03_action_case_card.webp",
    },
    brief: {
      oneLine: "复盘门店是否应为代驾司机提供独立休息区：看清成本、边界和长期口碑之间的取舍。",
      learningGoal:
        "帮助门店把眼前成本放回服务链条里判断，理解善待合作伙伴不是额外人情，而是客户体验和口碑网络的一部分。",
      caseQuestion: "我们是否要花费额外的成本给代驾司机提供单独的合作伙伴休息区？",
    },
    background: {
      context:
        "周日下午，代驾张师傅完成了车辆交接，打开手机准备抢单。店里休息区似乎还有空位，张师傅蹲在屋檐下，看着外面的大太阳没有说话。",
      trigger:
        "门店需要在当场做出判断：请司机师傅到店里坐坐，喝杯水，让他体面舒适地等；还是礼貌完成接车交接，让他在店外阴凉处等一会儿。",
    },
    caseBody: {
      paragraphs: [
        "这时，我们面临两个选择：选择A，请司机师傅到店里坐坐，喝杯水，让他体面舒适地等。选择B，礼貌接车、交接完成，他可以在店外等。门外有阴凉的地方，师傅过一会儿就走了，不至于被暴晒。",
        "有些人或许会选择B，因为有两个无法回避的问题。第一是成本。服务店的每一平米，都折算在租金里。用来接待代驾司机，这坪效怎么算？水、电、保洁，样样都是钱。",
        "第二是边界。我们的服务对象是车主，代驾司机既不是我们的客户，也不是我们的供应商。服务的边界一旦打破，谁来兜底？门店的定位和服务标准会不会一点点模糊掉？",
        "这两点，从企业经营的角度，看上去非常理性，也很难直接驳倒。但这不是人情和道理的单选题，我们不妨把视野拉远，看看门店处在一张什么样的社会网络里。",
        "代驾司机是车主把车交给门店的最后一棒，是车主信任链条的延伸。我们善待司机，店里的其他车主在潜意识里会得到一个信号：这家店，对“我的人”不错，那对“我的车”也不会差。",
        "反之，如果一个代驾司机每个月都为我们服务，却只能在门外站着，他很难在同行群里夸奖我们，也更容易产生坏情绪。这份坏情绪会直接传递给终端客户，让我们花费更多精力去处理客诉。",
        "门店周边的活跃代驾司机不过几十人，他们的服务面向周边所有车主。代驾司机是我们长期的合作伙伴，也是提升服务体验的关键人物。我们有必要为代驾司机提供休息、等待的场地。",
        "那么，如何设置合作伙伴休息区，才能兼顾客户与司机的体验？如果直接把司机请进客休区，可能会占用客户空间，部分司机也会因为觉得不自在而不愿意去。因此，我们拿出一片独立区域专门作为合作伙伴休息区，并提供饮用水、沙发和充电口，用极低的成本投入进行体验投资。",
        "选A还是选B，关键不在于成本或边界本身，而在于你如何看待“谁是你的客户”、如何看待“成本和投资”。",
        "如果我们认为只有付了钱的车主才是客户，那代驾司机确实不需要管。但如果我们认为，每一个能影响车主决策、能传播门店口碑的人，都是服务链条上的一环，那么让他们在恶劣天气有个地方舒服地坐着等，就不是成本，而是对潜在口碑的一次定投。",
      ],
      positiveOutcomes: [
        "善意是可传递的。代驾师傅把我们的善意带到取送车服务当中，服务更用心，客户也更愿意使用取送车服务。",
        "取送车进店的渗透率逐渐增长后，门店可以削峰填谷，更合理地配置资源，提升维保效率。",
        "客户看到了我们的善，也体验到更高品质的服务，更容易成为忠实客户，降低维护客户关系的成本。",
      ],
    },
    cognitiveFrames: [
      {
        label: "成本视角",
        focus: "坪效、水电、保洁都是真实支出",
        question: "这片空间到底是消耗成本，还是改善取送车体验的投资？",
      },
      {
        label: "边界视角",
        focus: "代驾司机不是直接付费客户",
        question: "服务边界该按交易关系划定，还是按客户信任链条划定？",
      },
      {
        label: "客户视角",
        focus: "客户会观察门店如何对待“我的人”",
        question: "善待代驾司机，会不会让车主更相信门店也会善待自己的车？",
      },
      {
        label: "网络视角",
        focus: "几十名活跃司机影响周边车主口碑",
        question: "一个长期接触门店的人，是不是也在参与传播我们的服务体验？",
      },
    ],
    decisionNodes: [
      {
        title: "现场选择：请进来坐，还是让他在店外等",
        trigger:
          "代驾司机完成车辆交接后在门外等待，天气炎热，店内似乎还有空位。门店需要判断这是否属于服务责任的一部分。",
        options: [
          {
            label: "选择A：请司机师傅到店里坐坐",
            description: "提供饮用水和等候空间，让司机体面舒适地等待下一单。",
            customerEffect: "客户和同行能感受到门店对服务链条上每个人的尊重。",
            storeEffect: "需要承担空间、水电、保洁和现场管理成本。",
          },
          {
            label: "选择B：礼貌完成交接，店外等候",
            description: "交接流程合规完成，司机在门外阴凉处等待，短时间内不会被暴晒。",
            customerEffect: "短期看不影响车主交付，但可能让取送车链条里的合作伙伴产生疏离感。",
            storeEffect: "边界最清晰，成本最低，但错过一次建立长期合作关系的机会。",
          },
        ],
        finalChoice:
          "选择A。把代驾司机视为客户信任链条的延伸，让他在恶劣天气里有一个体面等待的地方。",
        impacts: {
          customer:
            "车主会通过这些细节判断门店是否可靠，也会把“对我的人不错”转化为“对我的车也不会差”的信任。",
          store:
            "门店需要付出很低的空间和物料成本，但能减少合作伙伴坏情绪向客户传递的风险。",
          compliance:
            "关键不是无限扩大服务边界，而是用明确区域和规则把善意落到可管理的空间里。",
        },
        riskControl:
          "不直接占用客户客休核心空间，设置独立区域，明确使用规则、开放时间、基础物资和现场维护责任。",
        status: "已落地",
      },
      {
        title: "边界重估：谁算服务链条上的一环",
        trigger:
          "代驾司机既不是直接付费客户，也不是传统意义上的供应商，但他会影响取送车体验、客户感受和门店口碑。",
        options: [
          {
            label: "只按付费关系定义客户",
            description: "只有车主才是服务对象，其他人员只需要完成交接即可。",
            customerEffect: "服务边界清楚，但容易忽略客户决策背后的信任关系。",
            storeEffect: "管理简单，成本明确，但合作伙伴不会主动为门店加分。",
          },
          {
            label: "按信任链条定义服务对象",
            description: "凡是能影响客户体验和口碑传播的人，都纳入服务判断。",
            customerEffect: "客户感知到的不是单点服务，而是一整条链路的可靠。",
            storeEffect: "需要门店具备更成熟的边界设计和现场组织能力。",
          },
        ],
        finalChoice:
          "按信任链条重新理解服务对象。代驾司机不是车主本人，但他是车主把车交给门店的最后一棒。",
        impacts: {
          customer:
            "取送车体验更顺，客户更容易把门店理解为一个可靠、周到、值得托付的组织。",
          store:
            "门店从处理单次交接，转向经营周边合作网络和长期口碑。",
          compliance:
            "边界不再只看合同关系，也要看是否存在稳定协作、体验传递和口碑影响。",
        },
        riskControl:
          "把合作伙伴休息区定义为取送车服务配套，而不是无限开放的公共休息空间。",
        status: "需持续观察",
      },
      {
        title: "空间设置：共用客休区，还是独立合作伙伴区",
        trigger:
          "如果直接把司机请进客户休息区，可能占用客户空间，也可能让部分司机觉得不自在。",
        options: [
          {
            label: "直接共用客户休息区",
            description: "执行最快，不需要重新规划区域。",
            customerEffect: "客户空间可能被挤占，司机也可能因为身份尴尬而不愿停留。",
            storeEffect: "管理成本低，但现场秩序和体验边界容易变模糊。",
          },
          {
            label: "设置独立合作伙伴休息区",
            description: "拿出一片独立区域，配置饮用水、沙发和充电口。",
            customerEffect: "客户和合作伙伴各有空间，彼此都更体面。",
            storeEffect: "投入有限，但需要持续维护区域整洁和使用秩序。",
          },
        ],
        finalChoice:
          "设置独立合作伙伴休息区。用清晰空间承接善意，兼顾客户与司机双方的体验。",
        impacts: {
          customer:
            "客户休息区不会被直接占用，同时能看到门店对合作伙伴的尊重。",
          store:
            "门店以低成本建立稳定、可复制的合作伙伴接待方式。",
          compliance:
            "独立区域能把善意、边界和现场管理同时落地，避免标准模糊。",
        },
        riskControl:
          "明确区域命名、物资配置、清洁责任和使用边界，避免从合作伙伴休息区滑向无序等候区。",
        status: "已落地",
      },
      {
        title: "成本判断：费用，还是体验投资",
        trigger:
          "水、电、保洁和面积都是真实成本，但活跃代驾司机也会长期影响取送车服务、周边车主口碑和客诉风险。",
        options: [
          {
            label: "只看即时成本",
            description: "把面积、物资和保洁费用视为额外支出。",
            customerEffect: "短期财务口径清楚，但无法计入信任和口碑的长期影响。",
            storeEffect: "门店看似节省成本，却可能在客诉和关系维护上付出更多。",
          },
          {
            label: "看长期体验回报",
            description: "把合作伙伴体验视为取送车服务渗透率、效率和口碑的基础投入。",
            customerEffect: "客户更愿意使用取送车服务，也更容易形成忠诚。",
            storeEffect: "取送车进店增加后，有机会削峰填谷，提升维保效率。",
          },
        ],
        finalChoice:
          "把这笔投入视为体验投资。它不是为非客户无限买单，而是为客户信任链条和潜在口碑做长期建设。",
        impacts: {
          customer:
            "客户能感受到门店对人和车的认真态度，取送车服务也更容易被接受。",
          store:
            "门店用较低成本改善合作伙伴情绪，减少坏情绪向终端客户传递。",
          compliance:
            "成本判断要同时看短期支出、长期效率、口碑收益和客诉成本。",
        },
        riskControl:
          "持续观察取送车渗透率、合作伙伴反馈、客户评价和客诉变化，避免只讲情怀、不看效果。",
        status: "需持续观察",
      },
    ],
    finalPractice: [
      "为长期参与取送车服务的代驾司机设置独立合作伙伴休息区。",
      "提供饮用水、沙发和充电口，让合作伙伴在恶劣天气里能体面等待。",
      "不直接占用客户客休核心空间，用独立区域保持客户与合作伙伴双方的舒适感。",
      "把合作伙伴体验纳入取送车服务体验和口碑管理，而不是只作为额外成本处理。",
    ],
    storeTakeaways: [
      {
        title: "客户不只在交易关系里",
        body: "每一个能影响车主决策、能传播门店口碑的人，都是服务链条上的一环。代驾司机不是车主本人，但他连接着车主、车辆和门店。",
      },
      {
        title: "善意需要有边界地落地",
        body: "不是把所有人都请进客户休息区，而是用独立、清晰、可维护的空间，让善意不会破坏现场秩序。",
      },
      {
        title: "低成本投入也可能是体验投资",
        body: "饮用水、沙发、充电口和一片等候空间，看上去都是小成本，但它们会影响合作伙伴情绪、取送车体验和客户信任。",
      },
      {
        title: "合作伙伴情绪会进入客户体验",
        body: "如果长期合作的人只能在门外站着，他很难主动为门店说好话；如果他被体面照顾，这份善意会进入后续服务。",
      },
    ],
    reusablePrinciples: [
      "凡是影响客户决策和口碑的人，都要被看作服务链条的一环。",
      "成本判断不能只看当下支出，也要看长期信任、效率和客诉成本。",
      "善意不是无限开放边界，而是用清晰空间和规则让彼此都体面。",
      "门店周边的稳定合作伙伴，是服务体验的外部延伸。",
    ],
    evidence: {
      sourceMaterials: [
        {
          type: "润色稿",
          title: "合作伙伴休息区案例文本",
          note: "用户提供的替换正文，用于将笃行原案例改为代驾司机合作伙伴休息区案例。",
          visibility: "maintainer_only",
        },
      ],
      sourceNotes: [
        "前台展示结构化案例和正文要点；维护字段用于后续审核和追溯。",
        "该案例后续可拆解为行动指南里的岗位应做/避免，也可作为路引回答取送车、合作伙伴体验和服务边界问题时的引用材料。",
      ],
    },
  },
];

export function getActionCaseBySlug(slug: string) {
  return ACTION_CASES.find((actionCase) => actionCase.slug === slug);
}
