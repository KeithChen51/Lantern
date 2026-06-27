import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  LhChip,
  LhDataTableShell,
  LhPageHero,
  LhSectionHeader,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { isPublicWorkshopEnabled } from "@/config/features";

type ValueSection = {
  title: string;
  focus: string;
  summary: string;
  customer: string;
  employee: string;
  organization?: string;
  society?: string;
  actions: string[];
};

const PUBLIC_WORKSHOP_ENABLED = isPublicWorkshopEnabled();

const upgradeReasons = [
  {
    title: "把信任看作核心资产",
    description:
      "信任不是服务之后的自然结果，而是需要被经营的核心资产。它不可透支，无法速成，只能在长期交付中被积累、被验证、被兑现。",
  },
  {
    title: "从服务走向关系",
    description:
      "功能型服务关注车辆有没有修好、需求有没有被响应；价值型关系关注客户是否安心、员工是否有尊严、组织是否可持续。",
  },
  {
    title: "让员工成为价值承担者",
    description:
      "员工不是被动承压的执行端。组织需要给出支持、授权、协作、复盘和保障，让好服务成为可以稳定兑现的能力。",
  },
];

const valueSections: ValueSection[] = [
  {
    title: "求真",
    focus: "回到事实",
    summary: "求真，是尊重事实、规律和真实处境。",
    customer:
      "面对客户，求真意味着如实说明车况、费用、依据、进度、风险和不确定性。不夸大问题，不隐瞒失误，不让客户事后才知道关键事实。",
    employee:
      "面对员工，求真意味着讲清目标、规则、评价标准。组织不能用模糊承诺来管理团队，也不能把流程、资源和管理问题简单归结为员工个人问题。",
    actions: ["能确认的事实，当场讲清楚。", "不能确认的事项，明确下一步和责任人。", "对客户不制造信息差，对员工不制造规则差。"],
  },
  {
    title: "尽善",
    focus: "选择有益",
    summary: "尽善，是在规则、成本、效率和资源约束之间，尽可能选择更有益于人、也更有利于长期信任的做法。",
    customer:
      "面对客户，尽善不是无原则让利，也不是一味迁就，而是在标准允许的范围内多解释一步、多协调一步、多减少一次等待。",
    employee:
      "面对员工，尽善意味着不把客户满意建立在员工单方面牺牲上，而要给出支持、授权和复盘。",
    actions: [
      "不把“流程规定”当成推诿理由。",
      "不把“客户满意”变成员工无边界付出的理由。",
      "在现实约束中，选择更能保护长期信任的做法。",
    ],
  },
  {
    title: "致美",
    focus: "抵达体验",
    summary: "致美，是让服务不止于完成，更抵达专业与秩序。",
    customer:
      "面对客户，致美体现在清晰有效的流程、整洁有序的现场、准确克制的表达和稳定可追踪的交付中；也体现在钣喷、维修等高专业度场景里从破损到修复、从混乱到秩序的工艺之美。",
    employee:
      "面对员工，致美体现在整齐的服务工具、合理的排班、顺畅的协作和专业的现场管理中。流程清楚，工序衔接顺畅，标准被认真执行，员工才更容易把专业做出来。",
    actions: ["把流程、进度和责任讲清楚。", "把现场、工具、工序和协作整理到位。", "让客户看见专业，让员工做出专业，让交付更稳定、更体面。"],
  },
  {
    title: "大爱",
    focus: "看见人",
    summary: "大爱，是在规则和流程之内，看见人的处境、尊严、安全和长期关系。",
    customer:
      "面对客户，大爱体现在对具体处境的体察。客户遇到事故、返修、异地用车、家庭出行、安全风险或长期信任受挫时，服务不能只剩条款和话术。先理解他的担心、损失和不便，再回到规则中寻找可承担、可交代的解法。",
    employee:
      "面对员工，大爱体现在对安全、尊严、成长和承压状态的关心。员工面对客户情绪、复杂工单、加班压力和跨部门协作时，组织不能只要求“扛住”，而要给出支持、授权、复盘和保护。",
    society:
      "面向社会，大爱要求把企业经营放在更长远的公共责任之中，以真诚、专业、守信的服务维护行业秩序，减少资源浪费，保护环境，推动构建更安全、更可靠、更有温度的汽车服务生态。",
    actions: ["先看见人的处境，再回到规则中找解法。", "对客户有温度，对员工有支持、有边界、有保护。", "把服务行为放回长期关系和公共责任中审视。"],
  },
  {
    title: "幸福",
    focus: "共同归处",
    summary:
      "幸福，是求真、尽善、致美、大爱最终要抵达的状态。人的尊严、自由与幸福是经济发展的目的而不是代价。",
    customer:
      "面对客户，幸福不是简单的满意评分，而是感到安心、被尊重，并愿意继续托付。",
    employee:
      "面对员工，幸福是在真实压力中仍然被支持、被尊重、能成长。员工知道标准在哪里，资源从哪里来，问题可以如何被复盘，而不是把所有压力都变成个人承担。",
    organization:
      "面对组织，幸福意味着服务体系可持续，经营结果建立在真实价值、稳定交付和长期关系之上。发展不应以消耗人的感受和尊严为前提，而是在成就客户、支持员工、承担责任中获得长期价值。",
    actions: ["用客户是否更安心来检验服务。", "用员工是否更有尊严、更有支持来检验管理。", "用组织是否更可持续、发展是否尊重人的尊严与幸福来检验经营。"],
  },
];

const dimensionNotes = [
  {
    title: "五个词是一条路径",
    description:
      "求真立事实，尽善而致远，致美见专业，大爱看见人，幸福验结果。",
  },
  {
    title: "价值要进入组织能力",
    description:
      "这套路径贯穿服务客户、对待员工、组织协作和经营管理全过程。价值观要进入流程、授权、协作、复盘和保障机制，成为组织可以稳定兑现的服务能力。",
  },
  {
    title: "回到真实场景",
    description:
      PUBLIC_WORKSHOP_ENABLED
        ? "接下来的案例、实践、共创和问答，不是把价值观停留在概念里，而是把它放回日常动作和共同规范中。"
        : "接下来的案例、实践和问答，不是把价值观停留在概念里，而是把它放回日常动作和具体场景中。",
  },
];

const guideSections = [
  {
    title: "外部学习案例",
    label: "镜鉴",
    href: "/mirror",
    icon: lighthouseIcons.mirror,
    description: "整理外部值得参考的服务案例，看别人如何把理念变成体验。",
  },
  {
    title: "内部行动参悟",
    label: "笃行",
    href: "/action",
    icon: lighthouseIcons.action,
    description: "回到我们自己的服务现场，复盘过去在哪些判断路口犹豫过、选择过、承担过。",
  },
  {
    title: "基于共创的执行清单",
    label: "共创",
    href: "/workshop",
    icon: lighthouseIcons.workshop,
    description: "由一线和内部团队共同补充 Do & Don't，让规范从真实场景里长出来。",
  },
  {
    title: "常见问题与讨论",
    label: "路引",
    href: "/hermit",
    icon: lighthouseIcons.hermit,
    description: "把执行中的疑问、边界和不同看法说出来，帮助大家持续校准。",
  },
];

const readingPath = [
  "先理解为什么要持续经营客户信任",
  "再看求真、尽善、致美、大爱、幸福如何进入服务体系",
  PUBLIC_WORKSHOP_ENABLED
    ? "最后进入案例、实践、共创和问答，回到具体场景中判断"
    : "最后进入案例、实践和问答，回到具体场景中判断",
];

const visibleGuideSections = guideSections.filter((section) => section.href !== "/workshop" || PUBLIC_WORKSHOP_ENABLED);

export default function HeartPage() {
  return (
    <div data-lh-heart-page className="pb-16">
      <LhPageHero
        data-lh-heart-hero
        title={
          <>
            <span data-lh-heart-title-line>于此，回答“精诚服务”</span>
            <span data-lh-heart-title-line>为什么再次出发。</span>
          </>
        }
        description={
          <>
            <p>
              汽车后市场服务日趋同质化，竞争加剧，服务和价格再难形成长期护城河。客户关系的经营质量，正在成为长期经营的分水岭。
            </p>
            <p>
              “本心”讨论的，正是精诚服务如何持续经营客户信任：从提供功能型服务，走向建立价值型关系。
            </p>
            <p>
              {PUBLIC_WORKSHOP_ENABLED
                ? "先理解求真、尽善、致美、大爱、幸福，再去看案例、实践、共创和问答，后面的内容才有共同的出发点。"
                : "先理解求真、尽善、致美、大爱、幸福，再去看案例、实践和问答，后面的内容才有共同的出发点。"}
            </p>
          </>
        }
        asideTitle="阅读路径"
        asideItems={readingPath.map((item) => ({ title: item }))}
      />

      <section data-lh-heart-prologue>
        <div data-lh-heart-prologue-lead>
          <p data-lh-heart-kicker>升级背景</p>
          <h2>长期经营的分水岭在哪里？</h2>
          <p>
            如何让每一次服务不止于交付结果，还能沉淀客户信任，正在成为长期经营必须回答的问题。关键在于持续经营客户信任。
          </p>
        </div>
        <div data-lh-heart-prologue-notes>
          {upgradeReasons.map((reason) => (
            <article key={reason.title} data-lh-heart-note>
              <h3>{reason.title}</h3>
              <p>{reason.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section data-lh-heart-origin>
        <div data-lh-heart-origin-lead>
          <p data-lh-heart-kicker>核心</p>
          <h2>精诚服务的核心</h2>
          <p>
            新的服务价值框架并非对“精诚”的重写，而是对其内涵的延伸，把“精于勤，诚于心”的朴素共识进一步转化为可理解、可判断、可执行的价值路径。
          </p>
        </div>
        <div data-lh-heart-origin-pair>
          <article>
            <h3>精</h3>
            <p>
              精，代表极致的追求与行动。专业判断、认真执行、持续改善，最终体现在清楚的流程、合理的排产、顺畅的协作和稳定的交付上。
            </p>
          </article>
          <article>
            <h3>诚</h3>
            <p>
              诚，代表内在的价值与品格。真实、善意、秩序和关怀，不停留在态度上，而体现在客户关系、员工支持和组织管理里。
            </p>
          </article>
        </div>
      </section>

      <section data-lh-heart-values>
        <LhSectionHeader
          eyebrow="价值路径"
          title="求真、尽善、致美、大爱、幸福"
          description="求真立事实，尽善而致远，致美见专业，大爱看见人，幸福验结果。"
        />

        <div data-lh-heart-value-summary>
          {dimensionNotes.map((note) => (
            <article key={note.title}>
              <h3>{note.title}</h3>
              <p>{note.description}</p>
            </article>
          ))}
        </div>

        <ol data-lh-heart-value-scroll>
          {valueSections.map((value, index) => (
            <li key={value.title} data-lh-heart-value-item>
              <div data-lh-heart-value-heading>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{value.title}</h3>
                  <p>{value.focus}</p>
                </div>
              </div>
              <p data-lh-heart-value-summary-text>{value.summary}</p>
              <div data-lh-heart-viewpoints>
                <article>
                  <h4>面对客户</h4>
                  <p>{value.customer}</p>
                </article>
                <article>
                  <h4>面对员工</h4>
                  <p>{value.employee}</p>
                </article>
                {"organization" in value && value.organization ? (
                  <article data-wide="true">
                    <h4>面对组织</h4>
                    <p>{value.organization}</p>
                  </article>
                ) : null}
                {"society" in value && value.society ? (
                  <article data-wide="true">
                    <h4>面向社会</h4>
                    <p>{value.society}</p>
                  </article>
                ) : null}
              </div>
              <div data-lh-heart-actions>
                <h4>行动提示</h4>
                <ul>
                  {value.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section data-lh-heart-next>
        <LhSectionHeader
          eyebrow="后续入口"
          title="接下来怎么看这套内容"
          description="这个框架是“精诚服务”的价值底座。接下来的内容，会帮助大家把它放回真实场景、日常动作和共同规范中。"
        />
        <div data-lh-heart-guide-list>
          {visibleGuideSections.map((section) => (
            <Link key={section.title} href={section.href} data-lh-heart-guide-link>
              <span data-lh-heart-guide-icon>
                <Icon icon={section.icon} />
              </span>
              <span data-lh-heart-guide-copy>
                <span>
                  <LhChip tone="neutral">{section.label}</LhChip>
                  <strong>{section.title}</strong>
                </span>
                <span>{section.description}</span>
              </span>
              <span data-lh-heart-guide-action>进入</span>
            </Link>
          ))}
        </div>
      </section>

      <LhDataTableShell>
        <table>
          <thead>
            <tr>
              <th>阅读材料</th>
              <th>本页用途</th>
              <th>后续承接</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>求真、尽善、致美、大爱、幸福</td>
              <td>作为从功能型服务走向价值型关系的判断路径。</td>
              <td>{PUBLIC_WORKSHOP_ENABLED ? "用于案例复盘、路引问答与岗位 Do & Don't 共创。" : "用于案例复盘、路引问答与后续岗位 Do & Don't 梳理。"}</td>
            </tr>
            <tr>
              <td>客户、员工、社会与组织视角</td>
              <td>避免把服务价值只理解成客户侧口号。</td>
              <td>用于笃行案例复盘中的权衡判断。</td>
            </tr>
          </tbody>
        </table>
      </LhDataTableShell>

      <section data-lh-heart-closing>
        <p>
          愿求真不虚，尽善不空，致美不浮，大爱不泛，让幸福从愿景进入每一次服务。
        </p>
      </section>
    </div>
  );
}
