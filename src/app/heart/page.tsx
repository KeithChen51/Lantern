import Link from "next/link";

const valueSections = [
  {
    title: "真",
    summary: "真，是尊重事实，也尊重人的知情权。",
    customer:
      "面对客户，真意味着如实说明车况、费用、进度、风险和不确定性。不夸大问题，不隐瞒失误，不用信息差诱导消费。",
    employee:
      "面对员工，真意味着清楚说明目标、规则、评价标准和经营压力。不用模糊承诺管理团队，不随意变更规则，也不把组织问题包装成员工个人问题。",
  },
  {
    title: "善",
    summary: "善，是在商业判断中保留对人的体察。",
    customer:
      "面对客户，善不是一味迁就，而是在灰色地带里先问一句：这样做是否真正为客户创造价值？能不能多解释一步、多帮一步，同时守住合理边界？",
    employee:
      "面对员工，善意味着不把客户满意建立在员工单方面牺牲上。当一线面对投诉、加班、复杂问题和情绪压力时，组织要提供支持，而不是只在结果不好时追责。",
  },
  {
    title: "美",
    summary: "美，是把服务和管理都做得有序、得体、有尊严。",
    customer:
      "面对客户，美体现在清楚的流程、整洁的环境、克制的表达和稳定的交付中。客户不需要反复解释同一个问题，也不该在混乱等待中消耗耐心。",
    employee:
      "面对员工，美体现在更清楚的工具、更合理的排班、更顺畅的协作和更专业的现场管理中。减少混乱、内耗和低质量重复劳动，本身就是对员工的尊重。",
  },
  {
    title: "爱",
    summary: "爱，是把人当作目的，而不只是流程和指标里的对象。",
    customer:
      "面对客户，爱体现在对处境的体察。遇到特殊困难、紧急场景、长期关系和安全问题时，服务不能只剩下条款和流程。",
    employee:
      "面对员工，爱体现在对安全、尊严、成长和承压状态的关心。它不等于要求员工无限付出，也不是用情怀替代管理责任。",
  },
];

const guideSections = [
  {
    title: "本心",
    label: "Heart",
    href: "/",
    description: "理解我们相信什么：精诚服务的价值底座，以及真、善、美、爱如何同时适用于客户关系和员工关系。",
  },
  {
    title: "镜鉴",
    label: "Mirror",
    href: "/mirror",
    description: "看外部有什么可参考：行业观察、标杆企业和服务案例，帮助大家打开服务想象力，而不是简单照搬。",
  },
  {
    title: "笃行",
    label: "Action",
    href: "/action",
    description: "看我们已经做出了什么：沉淀内部真实实践，让一线的好做法被看见，也让可复用的方法留在组织里。",
  },
  {
    title: "共创",
    label: "Workshop",
    href: "/workshop",
    description: "把理念变成动作：围绕不同岗位和服务场景，共创鼓励与禁止事项，让价值观进入日常工作。",
  },
  {
    title: "路引",
    label: "Hermit",
    href: "/hermit",
    description: "遇到问题时去提问：当一个场景不好判断，可以获得理念依据、相关案例和下一步建议。",
  },
];

export default function HeartPage() {
  return (
    <div className="mx-auto max-w-xs sm:max-w-7xl">
      <div className="mb-12 px-4">
        <h1 className="mb-4 flex items-baseline gap-3 text-4xl font-bold md:text-5xl">
            <span className="font-noto text-ink">本心</span>
          <span className="font-serif text-3xl italic text-amber opacity-90 md:text-4xl">
              Heart
            </span>
          </h1>
        <div className="max-w-3xl space-y-4 font-serif text-lg leading-relaxed text-ink/60">
          <p className="text-2xl leading-snug text-ink md:text-3xl">
              于此，回答“精诚服务”到底相信什么。
            </p>
            <p>
              客户把车交给我们，交出的不只是一次维修或保养需求，也是一份信任。员工站在一线，面对的也不只是流程、指标和投诉，而是真实的人、真实的压力，以及每天必须作出的判断。
            </p>
            <p>
              “本心”要讨论的，正是这些判断背后的标准。我们用真、善、美、爱来理解“精诚服务”：它既是对客户的承诺，也是经销商对员工、组织对一线的要求。
            </p>
            <p>
              本心，是灯塔的起点。先把我们共同相信的价值讲清楚，再去看案例、做实践、共创规范、提出问题，后面的内容才有共同的出发点。
            </p>
          </div>
        <div className="mt-6 flex flex-wrap gap-3">
            {valueSections.map((value) => (
            <span
                key={value.title}
              className="rounded-full border border-amber/30 bg-amber/10 px-4 py-2 font-noto text-sm text-amber md:text-base"
              >
              {value.title}
            </span>
            ))}
          </div>
      </div>

      <section className="px-4">
        <div className="mb-6">
          <h2 className="flex items-baseline gap-3 font-serif text-2xl text-ink md:text-3xl">
            精诚服务的核心
            <span className="font-serif text-lg italic text-amber opacity-80 md:text-xl">
              Philosophy
            </span>
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
            <h3 className="mb-4 font-noto text-2xl text-ink">精</h3>
            <p className="leading-8 text-ink/70">
              精，是把事情做好。它要求专业、认真、持续改善，也要求我们尊重服务行业的基本规律，不用粗糙的方式处理人的问题。
            </p>
          </article>
          <article className="rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
            <h3 className="mb-4 font-noto text-2xl text-ink">诚</h3>
            <p className="leading-8 text-ink/70">
              诚，是我们对人的态度。它体现在真、善、美、爱之中。真善美爱不是新的口号，而是判断服务和管理是否站得住的四个维度。
            </p>
          </article>
        </div>
      </section>

      <section className="mt-12 px-4">
        <div className="mb-6 max-w-3xl">
          <h2 className="mb-4 flex items-baseline gap-3 font-serif text-2xl text-ink md:text-3xl">
            真、善、美、爱
            <span className="font-serif text-lg italic text-amber opacity-80 md:text-xl">
              Values
            </span>
          </h2>
          <p className="text-sm leading-relaxed text-ink/70 md:text-base">
            它既适用于客户，也适用于员工。经销商怎样对待员工，最终会影响员工怎样对待客户。一个不真实、不善待、不体面、不关心人的内部环境，很难长期提供有温度的服务。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {valueSections.map((value) => (
            <article
              key={value.title}
              className="rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm"
            >
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
                <h3 className="font-noto text-4xl text-ink">{value.title}</h3>
                <p className="min-w-0 font-serif text-base leading-7 text-ink/70">
                  {value.summary}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="border-t border-amber/25 pt-4">
                  <p className="mb-2 text-sm font-semibold text-amber">面对客户</p>
                  <p className="text-sm leading-7 text-ink/68">{value.customer}</p>
                </div>
                <div className="border-t border-ink/12 pt-4">
                  <p className="mb-2 text-sm font-semibold text-ink/70">面对员工</p>
                  <p className="text-sm leading-7 text-ink/68">{value.employee}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 px-4">
        <div className="mb-6 max-w-3xl">
          <h2 className="mb-4 flex items-baseline gap-3 font-serif text-2xl text-ink md:text-3xl">
            接下来去哪里
            <span className="font-serif text-lg italic text-amber opacity-80 md:text-xl">
              Guide
            </span>
          </h2>
          <p className="text-sm leading-relaxed text-ink/70 md:text-base">
            本心不是资料库的终点，而是进入灯塔的起点。先理解我们相信什么，再去镜鉴看他人的经验，去笃行看自己的实践，去共创把原则写成动作，最后在路引中把问题带回具体场景。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {guideSections.map((section) => (
            <Link
              key={section.title}
              href={section.href}
              className="group flex min-h-56 flex-col justify-between rounded-2xl border border-white/60 bg-white/40 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:bg-white/55 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/30 transition-colors group-hover:text-amber/80">
                {section.label}
              </span>
              <div>
                <h3 className="mb-3 font-serif text-2xl text-ink transition-colors group-hover:text-amber">
                  {section.title}
                </h3>
                <p className="text-sm leading-7 text-ink/65">{section.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
