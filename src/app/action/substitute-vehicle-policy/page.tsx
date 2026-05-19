import Link from "next/link";
import { notFound } from "next/navigation";
import { getActionCaseBySlug } from "../action-cases";

const CASE_SLUG = "substitute-vehicle-policy";

export default function SubstituteVehiclePolicyPage() {
  const actionCase = getActionCaseBySlug(CASE_SLUG);

  if (!actionCase) {
    notFound();
  }

  const { metadata, brief, background, evidence } = actionCase;

  return (
    <article className="mx-auto max-w-7xl px-4">
      <div className="mb-8">
        <Link
          href="/action"
          className="text-sm font-medium text-ink/50 transition-colors hover:text-amber"
        >
          返回笃行
        </Link>
      </div>

      <header className="grid gap-8 border-b border-ink/10 pb-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-amber">
            {metadata.kicker}
          </p>
          <h1 className="max-w-4xl font-serif text-4xl leading-tight text-ink md:text-6xl">
            {metadata.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-9 text-ink/68">{brief.oneLine}</p>
        </div>

        <aside className="self-start rounded-xl border border-white/60 bg-white/45 p-6 shadow-[0_12px_35px_rgba(0,0,0,0.05)] backdrop-blur-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-ink/35">
            Audience
          </p>
          <p className="text-sm leading-7 text-ink/70">{metadata.audience.join("、")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {metadata.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-amber/20 bg-amber/10 px-3 py-1 text-xs text-amber"
              >
                {tag}
              </span>
            ))}
          </div>
          <dl className="mt-6 grid gap-3 border-t border-ink/10 pt-5 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/35">
                Version
              </dt>
              <dd className="mt-1 text-ink/68">{metadata.version}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/35">
                Owner
              </dt>
              <dd className="mt-1 text-ink/68">{metadata.owner}</dd>
            </div>
          </dl>
        </aside>
      </header>

      <section className="grid gap-8 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h2 className="font-serif text-2xl text-ink">案例速览</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/60 bg-white/40 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-amber">
              Learning Goal
            </p>
            <p className="text-sm leading-7 text-ink/70">{brief.learningGoal}</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/40 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-amber">
              Case Question
            </p>
            <p className="text-sm leading-7 text-ink/70">{brief.caseQuestion}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-8 border-t border-ink/10 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h2 className="font-serif text-2xl text-ink">背景与触发</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-xl border border-white/60 bg-white/35 p-6">
            <h3 className="text-sm font-semibold text-ink">业务背景</h3>
            <p className="mt-3 text-sm leading-7 text-ink/68">{background.context}</p>
          </section>
          <section className="rounded-xl border border-white/60 bg-white/35 p-6">
            <h3 className="text-sm font-semibold text-ink">触发问题</h3>
            <p className="mt-3 text-sm leading-7 text-ink/68">{background.trigger}</p>
          </section>
        </div>
      </section>

      <section className="grid gap-8 border-t border-ink/10 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h2 className="font-serif text-2xl text-ink">认知视角</h2>
          <p className="mt-3 text-sm leading-7 text-ink/55">
            这个案例不是门店和总部之间的利益冲突，而是不同角色对“什么才算照顾好客户”的认知差异。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {actionCase.cognitiveFrames.map((frame) => (
            <section key={frame.label} className="rounded-xl border border-white/60 bg-white/40 p-5">
              <h3 className="font-serif text-2xl text-ink">{frame.label}</h3>
              <p className="mt-3 text-sm font-medium text-amber">{frame.focus}</p>
              <p className="mt-3 text-sm leading-7 text-ink/68">{frame.question}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-t border-ink/10 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h2 className="font-serif text-2xl text-ink">关键权衡</h2>
          <p className="mt-3 text-sm leading-7 text-ink/55">
            每个节点都需要同时看客户体验、门店实际能力和政策执行风险。
          </p>
        </div>
        <div className="space-y-5">
          {actionCase.decisionNodes.map((decision, index) => (
            <section
              key={decision.title}
              className="rounded-xl border border-white/60 bg-white/45 p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber">
                    0{index + 1}
                  </p>
                  <h3 className="font-serif text-2xl text-ink">{decision.title}</h3>
                </div>
                <span className="rounded-full border border-ink/10 bg-white/45 px-3 py-1 text-xs text-ink/50">
                  {decision.status}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-ink/68">{decision.trigger}</p>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber">
                    Customer
                  </p>
                  <p className="text-sm leading-7 text-ink/65">{decision.impacts.customer}</p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber">
                    Store
                  </p>
                  <p className="text-sm leading-7 text-ink/65">{decision.impacts.store}</p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber">
                    Compliance
                  </p>
                  <p className="text-sm leading-7 text-ink/65">{decision.impacts.compliance}</p>
                </div>
              </div>

              <div className="mt-6 border-t border-ink/10 pt-5">
                <p className="text-sm font-semibold text-ink">最终选择</p>
                <p className="mt-2 text-sm leading-7 text-ink/68">{decision.finalChoice}</p>
              </div>
              <details className="mt-4 rounded-xl border border-ink/10 bg-white/30 p-4">
                <summary className="cursor-pointer text-sm font-medium text-ink/72">
                  查看当时面对的选择
                </summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {decision.options.map((option) => (
                    <div key={option.label} className="rounded-lg border border-ink/10 bg-white/35 p-4">
                      <p className="text-sm font-semibold text-ink">{option.label}</p>
                      <p className="mt-2 text-sm leading-6 text-ink/62">{option.description}</p>
                      <p className="mt-3 text-xs leading-6 text-ink/48">
                        客户影响：{option.customerEffect}
                      </p>
                      <p className="mt-1 text-xs leading-6 text-ink/48">
                        门店影响：{option.storeEffect}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
              <p className="mt-4 text-sm leading-7 text-ink/58">风险控制：{decision.riskControl}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-t border-ink/10 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h2 className="font-serif text-2xl text-ink">最终做法</h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-2">
          {actionCase.finalPractice.map((item, index) => (
            <li
              key={item}
              className="rounded-xl border border-white/60 bg-white/40 p-5 text-sm leading-7 text-ink/70"
            >
              <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.22em] text-amber">
                0{index + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 border-t border-ink/10 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h2 className="font-serif text-2xl text-ink">门店启示</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {actionCase.storeTakeaways.map((takeaway) => (
            <section
              key={takeaway.title}
              className="rounded-xl border border-amber/20 bg-amber/10 p-5 text-sm leading-7 text-ink/72"
            >
              <h3 className="mb-3 font-serif text-xl text-ink">{takeaway.title}</h3>
              <p>{takeaway.body}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-t border-ink/10 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h2 className="font-serif text-2xl text-ink">可复用原则</h2>
        </div>
        <div className="space-y-3">
          {actionCase.reusablePrinciples.map((principle) => (
            <p
              key={principle}
              className="border-l-2 border-amber/45 bg-white/30 px-5 py-3 text-sm leading-7 text-ink/70"
            >
              {principle}
            </p>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-t border-ink/10 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h2 className="font-serif text-2xl text-ink">来源材料</h2>
          <p className="mt-3 text-sm leading-7 text-ink/55">
            原始正文和访谈材料保留为维护信息，前台只呈现结构化案例。
          </p>
        </div>
        <details className="rounded-xl border border-dashed border-ink/15 bg-white/25 p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink/72">
            查看维护字段
          </summary>
          <div className="mt-5 space-y-4">
            {evidence.sourceMaterials.map((source) => (
              <div key={source.title} className="border-t border-ink/10 pt-4 first:border-t-0 first:pt-0">
                <p className="text-sm font-semibold text-ink">{source.title}</p>
                <p className="mt-1 text-xs text-amber">{source.type} · {source.visibility}</p>
                <p className="mt-2 text-sm leading-7 text-ink/62">{source.note}</p>
              </div>
            ))}
            <div className="space-y-2 border-t border-ink/10 pt-4">
              {evidence.sourceNotes.map((note) => (
                <p key={note} className="text-xs leading-6 text-ink/48">
                  {note}
                </p>
              ))}
            </div>
          </div>
        </details>
      </section>
    </article>
  );
}
