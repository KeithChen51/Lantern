import Link from "next/link";
import { ACTION_CASES } from "./action-cases";

export default function ActionPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <section className="mb-12 px-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-amber">
          Internal Practice
        </p>
        <h1 className="mb-4 flex items-baseline gap-3 text-4xl font-bold md:text-5xl">
          <span className="font-noto text-ink">笃行</span>
          <span className="font-serif text-3xl italic text-amber opacity-90 md:text-4xl">Action</span>
        </h1>
        <div className="max-w-3xl space-y-4 font-serif text-lg leading-relaxed text-ink/62">
          <p>
            笃行记录内部已经发生的服务实践：不是把理念停在墙上，而是回到一个个真实政策、真实门店和真实客户场景里，复盘我们如何做选择。
          </p>
          <p>
            这里的案例重点看三件事：客户体验是否被守住，门店是否具备执行条件，政策指标是否真的服务于客户价值。
          </p>
        </div>
      </section>

      <section>
        <div className="mb-4 px-4">
          <h2 className="flex items-baseline gap-3 font-serif text-2xl text-ink md:text-3xl">
            内部实践案例
            <span className="font-serif text-lg italic text-amber opacity-80 md:text-xl">Cases</span>
          </h2>
        </div>
        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {ACTION_CASES.map((actionCase) => (
            <Link
              key={actionCase.slug}
              href={actionCase.href}
              className="group block rounded-xl border border-white/60 bg-white/45 p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:bg-white/60 hover:shadow-[0_16px_45px_rgba(0,0,0,0.06)]"
            >
              <article className="grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
                <div>
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber/25 bg-amber/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber">
                      {actionCase.metadata.date}
                    </span>
                    {actionCase.metadata.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-ink/10 bg-white/40 px-3 py-1 text-xs text-ink/55"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h3 className="max-w-3xl font-serif text-3xl leading-tight text-ink transition-colors group-hover:text-amber md:text-4xl">
                    {actionCase.metadata.title}
                  </h3>
                  <p className="mt-5 max-w-3xl text-base leading-8 text-ink/68">
                    {actionCase.brief.oneLine}
                  </p>
                  <p className="mt-6 text-sm font-medium text-amber">查看案例复盘</p>
                </div>
                <div className="border-t border-ink/10 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-ink/35">
                    Decision Nodes
                  </p>
                  <ol className="space-y-3">
                    {actionCase.decisionNodes.map((decision, index) => (
                      <li key={decision.title} className="flex gap-3 text-sm leading-6 text-ink/68">
                        <span className="font-semibold text-amber">0{index + 1}</span>
                        <span>{decision.title}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-6 border-t border-ink/10 pt-4 text-xs leading-6 text-ink/48">
                    维护字段：背景与触发、认知冲突、关键选择、客户影响、门店能力、风险控制、来源材料。
                  </p>
                </div>
              </article>
            </Link>
          ))}
          <div className="rounded-xl border border-dashed border-ink/15 bg-white/25 p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-ink/35">
              Coming Soon
            </p>
            <h3 className="font-serif text-2xl text-ink">更多内部实践待沉淀</h3>
            <p className="mt-4 text-sm leading-7 text-ink/62">
              后续可继续接入交付、索赔、客户关怀、门店协同等真实案例，让一线经验留在组织里。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
