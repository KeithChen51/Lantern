import type { ReactNode } from "react";
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

const stats = [
  { label: "2025 年销售额", value: "200.35", unit: "亿元", note: "提前达成目标" },
  { label: "2024 年利润", value: "8+", unit: "亿元", note: "公开报道口径" },
  { label: "2024 年税收", value: "6+", unit: "亿元", note: "区域贡献" },
  { label: "员工平均月收", value: "9000+", unit: "元", note: "税后口径" },
  { label: "门店数量", value: "13", unit: "家", note: "许昌 / 新乡" },
  { label: "员工总数", value: "10000+", unit: "人", note: "商贸集团" },
];

const modelRows = [
  ["流量引擎", "超市业态以高品质、低毛利和强服务吸引稳定客流。", "不把服务体验当成附属项，而是经营模型的一部分。"],
  ["价值变现", "自持物业、高利业态和品牌信任共同提升商业价值。", "服务文化需要组织能力和商业模型支撑。"],
  ["管理条件", "高薪酬、利润分享、假期制度和员工尊严共同构成现场稳定性。", "员工体验会影响客户体验，不能只要求一线热情。"],
];

const welfareCards = [
  ["高薪酬", "税后平均月收入超 9000 元，管理层年均分配达 70 万元。"],
  ["利润分享", "实行“三三三”原则，部分利润用于员工分红。"],
  ["超长假期", "年假 40 天，含不需要理由的“不开心假”，并坚持周二闭店。"],
  ["委屈奖", "员工受不公对待可获补偿，制度上承认一线尊严。"],
  ["全家保障", "提供覆盖全家的医疗保险及大病救助。"],
  ["民主评议", "管理层接受满意度评议，管理权力不只向上负责。"],
];

const impactCards = [
  {
    title: "零售界的海底捞",
    description: "被称为“没有淡季的 6A 级景区”，成为消费打卡地。其“不满意就退货”、免费代驾等服务已成为行业范本。",
    tags: ["文旅效应", "服务标杆"],
  },
  {
    title: "从竞争到赋能",
    description: "2024 年起启动对步步高、永辉、物美等传统商超的帮扶调改，输出管理理念、商品结构和现场服务方法。",
    tags: ["同行帮扶", "组织输出"],
  },
];

const challengeCards = [
  ["扩张悖论", "出于对服务质量的保护，主动关闭部分盈利门店。高度依赖创始人理念，跨地域扩张难度高。"],
  ["模式可持续性", "高人力成本与重资产模式，需要持续面对电商、仓储会员店和本地消费波动。"],
  ["数字化融合", "与数字化服务商合作推进经营管理，同时探索理念和品牌的轻资产输出路径。"],
];

const references = [
  "新华网. (2024). 《何以胖东来——一家“网红”商超的坚守与嬗变》",
  "新华网. (2025). 《胖东来提前50多天完成200亿元目标》",
  "虎嗅网. (2024). 《胖东来真正的商业模式是什么？》",
  "中金公司. (2025). 《何以胖东来？人本经营造就幸福生产力》",
  "新浪财经. (2024). 《独家专访胖东来创始人》",
];

const toc = [
  ["overview", "企业概况"],
  ["model", "商业模式"],
  ["culture", "自由与爱"],
  ["impact", "市场影响"],
  ["future", "未来挑战"],
  ["conclusion", "镜鉴结论"],
];

export default function PangDongLaiPage() {
  return (
    <div className="pb-16">
      <div className="mb-6">
        <Link
          href="/mirror"
          className="inline-flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-2 text-sm font-bold text-primary-deep shadow-lh-sm transition-colors hover:border-line-strong hover:bg-primary-soft"
        >
          <Icon icon={lighthouseIcons.mirror} className="h-4 w-4" />
          返回镜鉴
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-5">
            <LhCard className="p-4">
              <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">目录</p>
              <nav className="mt-4 grid gap-2" aria-label="案例目录">
                {toc.map(([href, label], index) => (
                  <a
                    key={href}
                    href={`#${href}`}
                    className="grid min-h-9 grid-cols-[28px_minmax(0,1fr)] items-center rounded-sm px-2 text-sm font-bold text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary-deep"
                  >
                    <span className="text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
                    <span>{label}</span>
                  </a>
                ))}
              </nav>
            </LhCard>

            <LhCard className="p-4">
              <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">镜鉴说明</p>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                这个案例的重点不是“赞美胖东来”，而是拆解它如何把员工体验、服务体验和组织制度放在同一条链路里。
              </p>
            </LhCard>
          </div>
        </aside>

        <main className="min-w-0 space-y-8">
          <LhPanel elevated className="p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <LhChip tone="primary">
                <Icon icon={lighthouseIcons.mirror} className="h-4 w-4" />
                镜鉴案例
              </LhChip>
              <LhStatusBadge tone="success">可阅读</LhStatusBadge>
            </div>
            <h1 className="max-w-3xl text-2xl font-extrabold leading-tight text-ink md:text-3xl">
              云游胖东来
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-ink-soft">
              深入一家区域零售企业的商业哲学与人文关怀，观察它如何把“自由、爱、人本经营”落到组织制度和服务现场。
            </p>
            <div className="mt-6 grid gap-3 text-sm font-bold text-muted sm:grid-cols-3">
              <span>来源：公开报道整理</span>
              <span>更新时间：2026-01</span>
              <span>用途：服务文化镜鉴</span>
            </div>
          </LhPanel>

          <ContentSection id="overview" eyebrow="概览" title="企业概况">
            <p className="max-w-4xl text-base leading-8 text-ink-soft">
              胖东来由创始人于东来先生于 1995 年在河南许昌创立，从一家街边小店起步，发展至今已成为在许昌、新乡两地拥有 13 家门店的大型商贸集团。
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((item) => (
                <LhCard key={item.label} className="p-5">
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted">{item.label}</p>
                  <p className="mt-3 flex items-end gap-2">
                    <span className="text-3xl font-extrabold text-ink">{item.value}</span>
                    <span className="pb-1 text-sm font-bold text-ink-soft">{item.unit}</span>
                  </p>
                  <LhChip tone="neutral" className="mt-4">
                    {item.note}
                  </LhChip>
                </LhCard>
              ))}
            </div>
          </ContentSection>

          <ContentSection id="model" eyebrow="商业模式" title="商业模式不是单纯卖货">
            <p className="max-w-4xl text-base leading-8 text-ink-soft">
              与传统零售企业不同，胖东来的商业模式并非单纯依赖商品销售，而是一种“超市业态引流 + 商业地产变现 + 服务信任复利”的复合模式。
            </p>
            <LhDataTableShell className="mt-6">
              <table>
                <thead>
                  <tr>
                    <th>层级</th>
                    <th>做法</th>
                    <th>对本项目的启发</th>
                  </tr>
                </thead>
                <tbody>
                  {modelRows.map(([level, practice, lesson]) => (
                    <tr key={level}>
                      <td>{level}</td>
                      <td>{practice}</td>
                      <td>{lesson}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </LhDataTableShell>
          </ContentSection>

          <ContentSection id="culture" eyebrow="文化制度" title="自由与爱如何进入制度">
            <LhPanel className="border-line bg-surface-quiet p-5">
              <blockquote className="text-base font-bold leading-8 text-ink">
                “有的人说胖东来是神话，其实就是真诚了一点、善良了一点，如果这样都被说是神话，那我们过得多悲哀啊！”
              </blockquote>
              <p className="mt-4 text-sm font-extrabold text-primary-deep">于东来</p>
            </LhPanel>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {welfareCards.map(([title, content]) => (
                <LhCard key={title} className="p-5">
                  <h3 className="text-lg font-extrabold text-ink">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">{content}</p>
                </LhCard>
              ))}
            </div>
          </ContentSection>

          <ContentSection id="impact" eyebrow="行业影响" title="从服务标杆到行业影响">
            <div className="grid gap-5 md:grid-cols-2">
              {impactCards.map((card) => (
                <LhCard key={card.title} className="grid min-h-56 grid-rows-[auto_1fr_auto] gap-4 p-5">
                  <h3 className="text-xl font-extrabold text-ink">{card.title}</h3>
                  <p className="text-sm leading-7 text-ink-soft">{card.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {card.tags.map((tag) => (
                      <LhChip key={tag} tone="info">
                        #{tag}
                      </LhChip>
                    ))}
                  </div>
                </LhCard>
              ))}
            </div>
          </ContentSection>

          <ContentSection id="future" eyebrow="未来挑战" title="未来挑战">
            <div className="grid gap-4">
              {challengeCards.map(([title, description]) => (
                <LhCard key={title} className="grid gap-3 p-5 md:grid-cols-[180px_minmax(0,1fr)]">
                  <h3 className="text-lg font-extrabold text-ink">{title}</h3>
                  <p className="text-sm leading-7 text-ink-soft">{description}</p>
                </LhCard>
              ))}
            </div>
          </ContentSection>

          <ContentSection id="conclusion" eyebrow="结论" title="镜鉴结论">
            <LhPanel className="p-6">
              <p className="max-w-4xl text-lg leading-9 text-ink">
                胖东来证明了商业成功可以建立在对人的真诚与关爱之上。但对本项目来说，更重要的是它提示我们：服务文化不是一段好听的话，而是一套能保护员工、稳定现场、兑现客户信任的组织安排。
              </p>
            </LhPanel>
          </ContentSection>

          <footer className="rounded-sm border border-line bg-surface-quiet p-5">
            <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">参考来源</p>
            <ul className="mt-4 grid gap-2 text-xs leading-6 text-muted">
              {references.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </footer>
        </main>
      </div>
    </div>
  );
}

function ContentSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <LhSectionHeader eyebrow={eyebrow} title={title} />
      <div className="mt-5">{children}</div>
    </section>
  );
}
