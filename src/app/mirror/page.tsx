import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  LhCard,
  LhChip,
  LhDataTableShell,
  LhPanel,
  LhSectionHeader,
  LhStatusBadge,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

const caseCards = [
  {
    title: "云游胖东来",
    description: "深入胖东来的商业哲学，理解它如何把人本经营、员工体验和服务秩序连接起来。",
    date: "2026-01",
    href: "/mirror/pang-dong-lai",
    status: "可阅读",
    dimensions: ["真诚", "员工关怀", "服务秩序"],
  },
  {
    title: "其他案例待沉淀",
    description: "后续案例会按行业、角色和可迁移动作整理，而不是只做散文式阅读。",
    date: "规划中",
    href: null,
    status: "待补充",
    dimensions: ["标杆经验", "服务文化", "可迁移动作"],
  },
];

const compareRows = [
  ["案例来源", "外部企业公开材料、行业观察、媒体报道", "帮助团队形成可讨论的参考对象"],
  ["阅读目标", "提取服务文化、组织管理和动作设计", "避免简单赞美或机械照搬"],
  ["迁移方式", "先识别原则，再看本地服务场景是否成立", "连接 Action、Workshop 与 Hermit"],
];

export default function MirrorPage() {
  return (
    <div className="space-y-10 pb-16">
      <LhPanel elevated className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_320px] md:p-8">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <LhChip tone="primary">
              <Icon icon={lighthouseIcons.mirror} className="h-4 w-4" />
              Mirror / 镜鉴
            </LhChip>
            <LhStatusBadge tone="info">Benchmark Library</LhStatusBadge>
          </div>
          <h1 className="max-w-4xl text-4xl font-extrabold leading-tight text-ink md:text-6xl">
            在别人的灯火里，看见服务文化可以怎样成立。
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-ink-soft md:text-lg">
            镜鉴不是文学化案例合集，而是外部标杆知识库。每个案例都要回答：它的做法解决了什么问题、背后的组织条件是什么、哪些部分可以转成我们自己的服务动作。
          </p>
        </div>

        <aside className="rounded-md border border-line bg-surface-quiet p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-deep">Case Rules</p>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-ink-soft">
            <li>先看事实与来源，不先下结论。</li>
            <li>拆成原则、条件、动作三层。</li>
            <li>只迁移适合售后服务场景的部分。</li>
          </ul>
        </aside>
      </LhPanel>

      <section className="space-y-6">
        <LhSectionHeader
          eyebrow="Case Index"
          title="标杆案例"
          description="每张卡片固定呈现来源、摘要、观察维度和下一步动作，便于后续进入 Action 或 Workshop。"
        />

        <div className="grid gap-5 lg:grid-cols-2">
          {caseCards.map((card) => {
            const content = (
              <LhCard className="grid min-h-[300px] grid-rows-[auto_1fr_auto] gap-5 p-6 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lh-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <LhChip tone={card.href ? "success" : "neutral"}>{card.status}</LhChip>
                    <h2 className="mt-4 text-3xl font-extrabold leading-tight text-ink">{card.title}</h2>
                  </div>
                  <span className="text-sm font-extrabold text-muted">{card.date}</span>
                </div>
                <div>
                  <p className="text-base leading-8 text-ink-soft">{card.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {card.dimensions.map((dimension) => (
                      <LhChip key={dimension} tone="signal">
                        {dimension}
                      </LhChip>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-4">
                  <span className="text-sm font-bold text-muted">Mirror ContentCard</span>
                  {card.href ? (
                    <span className="inline-flex min-h-9 items-center justify-center rounded-sm border border-line-strong bg-panel px-3 text-xs font-bold text-primary-deep shadow-lh-sm">
                      阅读案例
                    </span>
                  ) : (
                    <span className="text-sm font-extrabold text-muted">等待补充</span>
                  )}
                </div>
              </LhCard>
            );

            return card.href ? (
              <Link key={card.title} href={card.href} className="block">
                {content}
              </Link>
            ) : (
              <div key={card.title}>{content}</div>
            );
          })}
        </div>
      </section>

      <LhDataTableShell>
        <table>
          <thead>
            <tr>
              <th>维度</th>
              <th>看什么</th>
              <th>为什么重要</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map(([name, value, reason]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{value}</td>
                <td>{reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </LhDataTableShell>
    </div>
  );
}
