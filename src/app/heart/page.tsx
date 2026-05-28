import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  LhCard,
  LhChip,
  LhDataTableShell,
  LhPageHero,
  LhSectionHeader,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

const valueSections = [
  {
    title: "求真",
    focus: "回到事实",
    summary: "求真，是把判断建立在事实、规律和真实处境之上。",
    customer:
      "面对客户，求真意味着如实说明车况、费用、进度、风险和不确定性。不夸大问题，不隐瞒失误，不用信息差诱导消费。",
    employee:
      "面对员工，求真意味着清楚说明目标、规则、评价标准和经营压力。让一线知道为什么这样做，也知道边界在哪里。",
  },
  {
    title: "尽善",
    focus: "选择有益",
    summary: "尽善，是在规则、成本和效率之间，尽可能选择更有益于人的做法。",
    customer:
      "面对客户，尽善不是无原则让利，也不是一味迁就，而是在灰色地带里多解释一步、多帮一步，同时守住合理边界。",
    employee:
      "面对员工，尽善意味着不把客户满意建立在员工单方面牺牲上。当一线面对投诉、加班和复杂问题时，组织要给出支持、授权和复盘。",
  },
  {
    title: "致美",
    focus: "抵达体验",
    summary: "致美，是让专业、秩序和体面真正抵达服务体验。",
    customer:
      "面对客户，致美体现在清楚的流程、整洁的环境、克制的表达和稳定的交付中。客户不需要反复解释同一个问题，也不该在混乱等待中消耗耐心。",
    employee:
      "面对员工，致美体现在更清楚的工具、更合理的排班、更顺畅的协作和更专业的现场管理中。减少混乱、内耗和低质量重复劳动，本身就是尊重。",
  },
  {
    title: "大爱",
    focus: "看见人",
    summary: "大爱，是在交易与流程之外，看见人的处境、尊严、安全和长期关系。",
    customer:
      "面对客户，大爱体现在对处境的体察。遇到特殊困难、紧急场景、长期关系和安全问题时，服务不能只剩下条款和流程。",
    employee:
      "面对员工，大爱体现在对安全、尊严、成长和承压状态的关心。它不等于要求员工无限付出，也不是用情怀替代管理责任。",
  },
  {
    title: "幸福",
    focus: "共同归处",
    summary: "幸福，是求真、尽善、致美、大爱最终要抵达的状态。",
    customer:
      "面对客户，幸福意味着安心、清楚、被尊重，愿意信任这家店，也愿意把下一次托付交给我们。",
    employee:
      "面对员工，幸福意味着被真实对待、获得支持、保有尊严，并能在长期工作中看到成长和价值。",
  },
];

const dimensionNotes = [
  {
    title: "五个词不是五格",
    description:
      "真实案例里，求真、尽善、致美、大爱常常同时出现。分析时不必强行单选，而是先看主要矛盾，再标注主维度与关联维度。",
  },
  {
    title: "幸福是最终检验",
    description:
      "幸福不只是情绪表达，而是检验结果：客户是否更安心，员工是否更有尊严，组织是否能长期、稳健地提供好服务。",
  },
  {
    title: "尽善与大爱怎样区分",
    description:
      "尽善更偏向“选择”，看我们是否在现实约束中选择了更有益于人的做法；大爱更偏向“看见”，看我们是否体察到处境、压力、尊严和安全。",
  },
];

const guideSections = [
  {
    title: "镜鉴",
    label: "镜鉴",
    href: "/mirror",
    icon: lighthouseIcons.mirror,
    description: "看外部有什么可参考：行业观察、标杆企业和服务案例，帮助大家打开服务想象力，而不是简单照搬。",
  },
  {
    title: "笃行",
    label: "笃行",
    href: "/action",
    icon: lighthouseIcons.action,
    description: "看我们已经做出了什么：沉淀内部真实实践，让一线的好做法被看见，也让可复用的方法留在组织里。",
  },
  {
    title: "共创",
    label: "共创",
    href: "/workshop",
    icon: lighthouseIcons.workshop,
    description: "把理念变成动作：围绕不同岗位和服务场景，共创鼓励与禁止事项，让价值观进入日常工作。",
  },
  {
    title: "路引",
    label: "路引",
    href: "/hermit",
    icon: lighthouseIcons.hermit,
    description: "遇到问题时去提问：把具体场景带回来，辨析求真、尽善、致美、大爱与幸福之间的关系，获得理念依据和下一步建议。",
  },
];

const readingPath = [
  "先理解“精诚服务”的五个价值词",
  "再看它们如何同时约束客户服务与员工管理",
  "最后进入案例、共创和路引，把价值转成现场判断",
];

export default function HeartPage() {
  return (
    <div className="space-y-8 pb-12">
      <LhPageHero
        title="于此，回答“精诚服务”到底相信什么。"
        description={
          <>
            <p>
              客户把车交给我们，交出的不只是一次维修或保养需求，也是一份信任。员工站在一线，面对的也不只是流程、指标和投诉，而是真实的人、真实的压力，以及每天必须作出的判断。
            </p>
            <p>
              “本心”讨论的正是这些判断背后的标准。我们用求真、尽善、致美、大爱、幸福来理解“精诚服务”：它既是对客户的承诺，也是经销商对员工、组织对一线的要求。
            </p>
          </>
        }
        asideTitle="阅读路径"
        asideItems={readingPath.map((item) => ({ title: item }))}
      />

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <LhCard className="border-primary-deep/35 bg-[linear-gradient(135deg,var(--color-primary-deep),var(--color-primary))] p-6 text-panel shadow-lh-deck">
          <p className="text-xs font-extrabold tracking-[0.14em] text-panel/65">核心</p>
          <h2 className="mt-3 text-2xl font-extrabold text-panel">精诚服务的核心</h2>
          <p className="mt-4 text-base leading-8 text-panel/80">
            本心，是灯塔的起点。先把我们共同相信的价值讲清楚，再去看案例、做实践、共创规范、提出问题，后面的内容才有共同的出发点。
          </p>
        </LhCard>
        <div className="grid gap-5 md:grid-cols-2">
          <LhCard className="p-6">
            <h3 className="text-xl font-extrabold text-ink">精</h3>
            <p className="mt-4 text-sm leading-7 text-ink-soft">
              精，是把事情做好。它要求专业、认真、持续改善，也要求我们尊重服务行业的基本规律，不用粗糙的方式处理人的问题。
            </p>
          </LhCard>
          <LhCard className="p-6">
            <h3 className="text-xl font-extrabold text-ink">诚</h3>
            <p className="mt-4 text-sm leading-7 text-ink-soft">
              诚，是我们对人的态度。它体现在求真、尽善、致美、大爱之中，并最终指向客户、员工与组织共同的幸福。
            </p>
          </LhCard>
        </div>
      </section>

      <section className="space-y-6">
        <LhSectionHeader
          eyebrow="价值路径"
          title="求真、尽善、致美、大爱、幸福"
          description="它既适用于客户，也适用于员工。经销商怎样对待员工，最终会影响员工怎样对待客户。"
        />

        <div className="grid gap-4 md:grid-cols-3">
          {dimensionNotes.map((note) => (
            <LhCard key={note.title} className="p-5">
              <h3 className="text-lg font-extrabold text-ink">{note.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-soft">{note.description}</p>
            </LhCard>
          ))}
        </div>

        <div className="grid gap-5">
          {valueSections.map((value) => (
            <LhCard key={value.title} className="grid gap-5 p-5 lg:grid-cols-[190px_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 min-w-14 items-center justify-center whitespace-nowrap rounded-sm border border-line bg-surface-quiet px-3 text-lg font-extrabold text-primary-deep">
                    {value.title}
                  </span>
                  <div>
                    <p className="text-sm font-extrabold text-primary-deep">{value.focus}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{value.summary}</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-sm border border-line bg-surface-quiet p-4">
                  <p className="text-sm font-extrabold text-primary-deep">面对客户</p>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">{value.customer}</p>
                </div>
                <div className="rounded-sm border border-line bg-surface-quiet p-4">
                  <p className="text-sm font-extrabold text-primary-deep">面对员工</p>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">{value.employee}</p>
                </div>
              </div>
            </LhCard>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <LhSectionHeader
          eyebrow="后续入口"
          title="接下来去哪里"
          description="本心不是资料库的终点，而是进入灯塔的起点。先理解我们相信什么，再进入不同工作区。"
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {guideSections.map((section) => (
            <Link key={section.title} href={section.href} className="group block">
              <LhCard className="grid min-h-52 grid-rows-[auto_1fr_auto] gap-4 p-5 transition-[border-color,box-shadow] duration-150 group-hover:border-line-strong group-hover:shadow-lh-md">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-surface-quiet text-primary-deep">
                    <Icon icon={section.icon} className="h-5 w-5" />
                  </span>
                  <LhChip tone="neutral">{section.label}</LhChip>
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-ink">{section.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">{section.description}</p>
                </div>
                <span className="text-sm font-extrabold text-primary-deep">进入页面</span>
              </LhCard>
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
              <td>作为判断服务和管理是否站得住的价值路径。</td>
              <td>用于路引问答与岗位应做/避免共创。</td>
            </tr>
            <tr>
              <td>客户与员工双视角</td>
              <td>避免把服务价值只理解成客户侧口号。</td>
              <td>用于笃行案例复盘中的权衡判断。</td>
            </tr>
          </tbody>
        </table>
      </LhDataTableShell>
    </div>
  );
}
