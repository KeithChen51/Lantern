import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  LhCard,
  LhChip,
  LhDataTableShell,
  LhPanel,
  LhSectionHeader,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

const valueSections = [
  {
    title: "真",
    focus: "尊重事实",
    summary: "真，是尊重事实、尊重规律、尊重真实处境。",
    customer:
      "面对客户，真意味着如实说明车况、费用、进度、风险和不确定性。不夸大问题，不隐瞒失误，不用信息差诱导消费。",
    employee:
      "面对员工，真意味着清楚说明目标、规则、评价标准和经营压力。不用模糊承诺管理团队，不随意变更规则，也不把组织问题包装成员工个人问题。",
  },
  {
    title: "善",
    focus: "选择有益",
    summary: "善，是在规则、成本和效率之间选择更有益于人的做法。",
    customer:
      "面对客户，善不是一味迁就，而是在灰色地带里先问一句：这样做是否真正为客户创造价值？能不能多解释一步、多帮一步，同时守住合理边界？",
    employee:
      "面对员工，善意味着不把客户满意建立在员工单方面牺牲上。当一线面对投诉、加班、复杂问题和情绪压力时，组织要提供支持，而不是只在结果不好时追责。",
  },
  {
    title: "美",
    focus: "形成秩序",
    summary: "美，是让服务变得清楚、体面、有秩序。",
    customer:
      "面对客户，美体现在清楚的流程、整洁的环境、克制的表达和稳定的交付中。客户不需要反复解释同一个问题，也不该在混乱等待中消耗耐心。",
    employee:
      "面对员工，美体现在更清楚的工具、更合理的排班、更顺畅的协作和更专业的现场管理中。减少混乱、内耗和低质量重复劳动，本身就是对员工的尊重。",
  },
  {
    title: "爱",
    focus: "看见处境",
    summary: "爱，是看见人的处境，而不只看见流程、指标和结果。",
    customer:
      "面对客户，爱体现在对处境的体察。遇到特殊困难、紧急场景、长期关系和安全问题时，服务不能只剩下条款和流程。",
    employee:
      "面对员工，爱体现在对安全、尊严、成长和承压状态的关心。它不等于要求员工无限付出，也不是用情怀替代管理责任。",
  },
];

const dimensionNotes = [
  {
    title: "四维不是四格",
    description:
      "真实案例里，真、善、美、爱常常同时出现。分析时不必强行单选，而是先看它主要回答什么问题，再标注主维度与关联维度。",
  },
  {
    title: "善与爱怎样区分",
    description:
      "善更偏向“选择”，看我们是否在规则、成本、效率之间选择了更有利于人的做法；爱更偏向“看见”，看我们是否体察到对方当下的压力、困难、尊严和安全。",
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
    description: "遇到问题时去提问：把具体场景带回来，辨析主维度与关联维度，获得理念依据、相关案例和下一步建议。",
  },
];

const readingPath = [
  "先理解“精诚服务”回答什么问题",
  "再用真、善、美、爱分析客户与员工关系",
  "最后进入案例、共创和路引，把原则转成动作",
];

export default function HeartPage() {
  return (
    <div className="space-y-10 pb-16">
      <LhPanel elevated className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_340px] md:p-8">
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <LhChip tone="primary">
              <Icon icon={lighthouseIcons.heart} className="h-4 w-4" />
              本心
            </LhChip>
            <LhChip tone="signal">清晰优先</LhChip>
          </div>
          <h1 className="max-w-4xl text-4xl font-extrabold leading-tight text-ink md:text-6xl">
            于此，回答“精诚服务”到底相信什么。
          </h1>
          <div className="mt-6 max-w-4xl space-y-4 text-base leading-8 text-ink-soft md:text-lg">
            <p>
              客户把车交给我们，交出的不只是一次维修或保养需求，也是一份信任。员工站在一线，面对的也不只是流程、指标和投诉，而是真实的人、真实的压力，以及每天必须作出的判断。
            </p>
            <p>
              “本心”讨论的正是这些判断背后的标准。我们用真、善、美、爱来理解“精诚服务”：它既是对客户的承诺，也是经销商对员工、组织对一线的要求。
            </p>
          </div>
        </div>

        <aside className="rounded-md border border-line bg-surface-quiet p-5">
          <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">阅读路径</p>
          <ol className="mt-4 grid gap-3">
            {readingPath.map((item, index) => (
              <li key={item} className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-3 text-sm leading-6 text-ink-soft">
                <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-panel text-xs font-extrabold text-primary-deep">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            {valueSections.map((value) => (
              <LhChip key={value.title} tone="signal">
                {value.title}
              </LhChip>
            ))}
          </div>
        </aside>
      </LhPanel>

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <LhCard className="p-6">
          <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">核心</p>
          <h2 className="mt-3 text-3xl font-extrabold text-ink">精诚服务的核心</h2>
          <p className="mt-4 text-base leading-8 text-ink-soft">
            本心，是灯塔的起点。先把我们共同相信的价值讲清楚，再去看案例、做实践、共创规范、提出问题，后面的内容才有共同的出发点。
          </p>
        </LhCard>
        <div className="grid gap-5 md:grid-cols-2">
          <LhCard className="p-6">
            <h3 className="text-2xl font-extrabold text-ink">精</h3>
            <p className="mt-4 text-sm leading-7 text-ink-soft">
              精，是把事情做好。它要求专业、认真、持续改善，也要求我们尊重服务行业的基本规律，不用粗糙的方式处理人的问题。
            </p>
          </LhCard>
          <LhCard className="p-6">
            <h3 className="text-2xl font-extrabold text-ink">诚</h3>
            <p className="mt-4 text-sm leading-7 text-ink-soft">
              诚，是我们对人的态度。它体现在真、善、美、爱之中。真善美爱不是新的口号，而是判断服务和管理是否站得住的四个维度。
            </p>
          </LhCard>
        </div>
      </section>

      <section className="space-y-6">
        <LhSectionHeader
          eyebrow="价值维度"
          title="真、善、美、爱"
          description="它既适用于客户，也适用于员工。经销商怎样对待员工，最终会影响员工怎样对待客户。"
        />

        <div className="grid gap-4 md:grid-cols-2">
          {dimensionNotes.map((note) => (
            <LhCard key={note.title} className="p-5">
              <h3 className="text-lg font-extrabold text-ink">{note.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-soft">{note.description}</p>
            </LhCard>
          ))}
        </div>

        <div className="grid gap-5">
          {valueSections.map((value) => (
            <LhCard key={value.title} className="grid gap-5 p-5 lg:grid-cols-[180px_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-14 w-14 items-center justify-center rounded-md border border-signal/25 bg-signal-soft text-3xl font-extrabold text-signal-deep">
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
              <LhCard className="grid min-h-56 grid-rows-[auto_1fr_auto] gap-4 p-5 transition-[border-color,box-shadow,transform] duration-150 group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-lh-md">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-primary-soft text-primary-deep">
                    <Icon icon={section.icon} className="h-5 w-5" />
                  </span>
                  <LhChip tone="neutral">{section.label}</LhChip>
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-ink">{section.title}</h3>
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
              <td>真、善、美、爱</td>
              <td>作为判断服务和管理是否站得住的四个维度。</td>
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
