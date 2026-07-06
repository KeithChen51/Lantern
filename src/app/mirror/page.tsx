import Link from "next/link";
import {
  LhCard,
  LhChip,
  LhDataTableShell,
  LhPageHero,
  LhSectionHeader,
} from "@/components/ui/lighthouse-primitives";
import { isPublicWorkshopEnabled } from "@/config/features";

const PUBLIC_WORKSHOP_ENABLED = isPublicWorkshopEnabled();

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
  [
    "迁移方式",
    "先识别原则，再看本地服务场景是否成立",
    PUBLIC_WORKSHOP_ENABLED ? "连接笃行、共创与路引" : "连接笃行与路引",
  ],
];

export default function MirrorPage() {
  return (
    <div className="space-y-8 pb-12">
      <LhPageHero
        title="在别人的灯火里，看见服务文化可以怎样成立。"
        description={
          <p>
            镜鉴不是文学化案例合集，而是外部标杆知识库。每个案例都要回答：它的做法解决了什么问题、背后的组织条件是什么、哪些部分可以转成我们自己的服务动作。
          </p>
        }
        asideTitle="案例筛选规则"
        asideItems={[
          { title: "先看事实与来源", description: "不先下结论，不把赞美当作分析。" },
          { title: "拆成原则、条件、动作", description: "让案例能进入讨论和迁移。" },
          { title: "只迁移适合售后场景的部分", description: "避免机械照搬外部经验。" },
        ]}
      />

      <section className="space-y-6">
        <LhSectionHeader
          eyebrow="案例目录"
          title="标杆案例"
          description={
            PUBLIC_WORKSHOP_ENABLED
              ? "每张卡片固定呈现来源、摘要、观察维度和下一步动作，便于后续进入笃行或共创。"
              : "每张卡片固定呈现来源、摘要、观察维度和下一步动作，便于后续进入笃行或路引。"
          }
        />

        <div className="grid gap-5 lg:grid-cols-2">
          {caseCards.map((card) => {
            const content = (
              <LhCard className="grid min-h-[300px] grid-rows-[auto_1fr_auto] gap-5 p-6 transition-[border-color,box-shadow,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:border-line-strong hover:shadow-lh-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <LhChip tone={card.href ? "success" : "neutral"}>{card.status}</LhChip>
                    <h2 className="mt-4 text-2xl font-extrabold leading-tight text-ink">{card.title}</h2>
                  </div>
                  <span className="text-sm font-extrabold text-muted">{card.date}</span>
                </div>
                <div>
                  <p className="text-base leading-8 text-ink-soft">{card.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {card.dimensions.map((dimension) => (
                      <LhChip key={dimension} tone="neutral">
                        {dimension}
                      </LhChip>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-4">
                  <span className="text-sm font-bold text-muted">镜鉴内容卡</span>
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
