import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  LhBackLink,
  LhCallout,
  LhCard,
  LhChip,
  LhDataTableShell,
  LhPageHero,
  LhPanel,
  LhSectionHeader,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { isPublicWorkshopEnabled } from "@/config/features";

const PUBLIC_WORKSHOP_ENABLED = isPublicWorkshopEnabled();

const stats = [
  { label: "2025 年销售额", value: "200.35", unit: "亿元", note: "提前达成目标" },
  { label: "2024 年利润", value: "8+", unit: "亿元", note: "公开报道口径" },
  { label: "2024 年税收", value: "6+", unit: "亿元", note: "区域贡献" },
  { label: "员工平均月收", value: "9000+", unit: "元", note: "税后口径" },
  { label: "门店数量", value: "13", unit: "家", note: "许昌 / 新乡" },
  { label: "员工总数", value: "10000+", unit: "人", note: "商贸集团" },
];

const productCards = [
  {
    title: "读懂事实",
    description: "先固定公开数据、经营背景和材料来源，避免把标杆案例写成单纯的赞美。",
  },
  {
    title: "拆出机制",
    description: "把员工体验、服务信任、现场秩序和组织共创拆成可讨论的结构。",
  },
  {
    title: "转成动作",
    description: "只迁移适合汽车售后场景的做法，明确条件、边界和下一步使用位置。",
  },
];

const mechanismCards = [
  {
    title: "员工体验是服务秩序的前置条件",
    signal: "高薪酬、利润分享、休假、委屈奖和管理评议，让一线不只靠情绪劳动支撑现场。",
    condition: "组织愿意把成本投向员工稳定性，并允许制度保护员工尊严。",
    transfer: "售后服务要先设计员工可承受的授权、轮值、升级和补偿边界，再要求高质量客户沟通。",
    tags: ["大爱", "幸福"],
  },
  {
    title: "信任来自透明和长期一致",
    signal: "低毛利、退货承诺、免费服务和自有品牌共同降低顾客的不确定感。",
    condition: "价格、品质和服务承诺要能被长期验证，不能只靠一次活动制造热度。",
    transfer: "维修费用、等待进度、风险判断和替代方案要前置说明，让客户知道我们依据什么做决定。",
    tags: ["求真", "尽善"],
  },
  {
    title: "标准不是压住现场，而是托住现场",
    signal: "岗位职责、服务流程和突发事件处理都有动作颗粒度，但仍保留必要裁量空间。",
    condition: "流程要能反复修订，不能只由管理者一次写完后向下发放。",
    transfer: "把高频售后场景拆成 Do / Don't，交给一线共创、审核后发布，而不是只写价值口号。",
    tags: ["致美", "共创"],
  },
  {
    title: "商业模型为服务文化供能",
    signal: "超市引流、自持物业、高信任业态和同行调改，让服务文化拥有商业支撑。",
    condition: "高质量服务需要投入来源，不能只把服务当作成本中心。",
    transfer: "经销商要把客户信任、复购、转介绍和员工稳定纳入经营解释，不只看单次工单效率。",
    tags: ["经营", "长期"],
  },
];

const transferRows = [
  [
    "等待 / 维修进度不确定",
    "把客户焦虑当成事实管理，而不是情绪管理。",
    "固定进度节点、风险说明、可选方案和升级联系人。",
    "不承诺无法控制的完工时间。",
  ],
  [
    "费用 / 项目解释",
    "信任来自透明，不只来自低价。",
    "把检查依据、必要性、价格组成和替代方案讲清楚。",
    "不把专业信息包装成客户听不懂的术语。",
  ],
  [
    "客户委屈或不满",
    "制度要承认人的感受和尊严。",
    "先确认事实与感受，再判断补救、补偿或升级路径。",
    "不让一线独自承担超出权限的冲突。",
  ],
  [
    "一线员工被冲突夹住",
    "员工被保护，服务才稳定。",
    "给服务顾问明确的授权边界、求助机制和复盘渠道。",
    "不把所有问题都解释成个人态度问题。",
  ],
  [
    "优秀做法难以沉淀",
    "规则从现场多轮讨论中生成。",
    PUBLIC_WORKSHOP_ENABLED ? "把可复用做法提交到共创，审核后形成岗位指南。" : "先沉淀为内部案例，再进入后续共创流程。",
    "不把案例停留在故事分享层面。",
  ],
];

const workflowSteps = [
  {
    title: "1. 固定事实",
    description: "记录公开来源、时间口径、适用范围和不确定处，让案例有证据底座。",
  },
  {
    title: "2. 识别机制",
    description: "用员工、客户、现场、经营四个视角拆出它为什么能成立。",
  },
  {
    title: "3. 判断条件",
    description: "先看汽车售后是否具备同类条件，再决定能否迁移。",
  },
  {
    title: "4. 转为动作",
    description: PUBLIC_WORKSHOP_ENABLED
      ? "进入共创形成岗位 Do / Don't，或进入路引成为服务判断参照。"
      : "先进入笃行与路引，形成内部案例和问答参照。",
  },
];

const questionCards = [
  {
    title: "给服务顾问",
    questions: [
      "客户等待时间超出预期时，哪些事实必须先透明告知？",
      "什么情况下可以先安抚，再补充完整检查结论？",
    ],
  },
  {
    title: "给管理者",
    questions: [
      "哪些客户冲突不应该只让一线个人承担？",
      "员工被客户不公对待时，门店需要怎样的保护机制？",
    ],
  },
  {
    title: "给共创沉淀",
    questions: [
      "哪些高频场景可以先写成 Do / Don't 清单？",
      "哪些做法只是胖东来的条件成立，不适合直接照搬？",
    ],
  },
];

const references = [
  "新华网. (2024). 《何以胖东来——一家“网红”商超的坚守与嬗变》",
  "新华网. (2025). 《胖东来提前50多天完成200亿元目标》",
  "虎嗅网. (2024). 《胖东来真正的商业模式是什么？》",
  "中金公司. (2025). 《何以胖东来？人本经营造就幸福生产力》",
  "新浪财经. (2024). 《独家专访胖东来创始人》",
];

const toc = [
  ["overview", "案例定位"],
  ["evidence", "事实底座"],
  ["mechanism", "机制拆解"],
  ["transfer", "售后迁移"],
  ["workflow", "使用路径"],
  ["questions", "讨论问题"],
];

export default function PangDongLaiPage() {
  const workflowHref = PUBLIC_WORKSHOP_ENABLED ? "/workshop" : "/action";
  const workflowLabel = PUBLIC_WORKSHOP_ENABLED ? "进入共创沉淀动作" : "进入笃行查看案例";

  return (
    <article className="pb-16">
      <div className="mb-6">
        <LhBackLink href="/mirror" icon={<Icon icon={lighthouseIcons.mirror} className="size-[1rem]" />}>
          返回镜鉴
        </LhBackLink>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-5">
            <LhCard className="p-4">
              <p className="text-[length:var(--title-kicker)] font-[var(--weight-black)] leading-[1.2] tracking-[var(--tracking-kicker)] text-primary-text">
                案例工作台
              </p>
              <nav className="mt-4 grid gap-2" aria-label="案例工作台目录">
                {toc.map(([href, label], index) => (
                  <a
                    key={href}
                    href={`#${href}`}
                    className="grid min-h-9 grid-cols-[28px_minmax(0,1fr)] items-center rounded-[var(--lh-control-radius)] px-2 text-[length:var(--type-control)] font-[var(--weight-bold)] leading-[var(--leading-control)] text-[color:var(--color-ink-soft)] transition-colors hover:bg-primary-soft hover:text-primary-text"
                  >
                    <span className="text-[length:var(--type-label)] text-[color:var(--color-muted)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{label}</span>
                  </a>
                ))}
              </nav>
            </LhCard>

            <LhCard className="p-4">
              <p className="text-[length:var(--title-kicker)] font-[var(--weight-black)] leading-[1.2] tracking-[var(--tracking-kicker)] text-primary-text">
                本页产出
              </p>
              <ul className="mt-4 grid gap-3 text-[length:var(--type-body)] leading-[var(--leading-body)] text-[color:var(--color-ink-soft)]">
                <li>一组可复用机制卡</li>
                <li>一张售后迁移矩阵</li>
                <li>一组路引 / 共创问题</li>
              </ul>
            </LhCard>
          </div>
        </aside>

        <main className="min-w-0 space-y-8">
          <LhPageHero
            icon={<Icon icon={lighthouseIcons.mirror} className="size-[1rem]" />}
            eyebrow="镜鉴案例"
            title="云游胖东来"
            description={
              <p>
                这不是一篇品牌游记，而是一张可转译的标杆案例卡。页面把胖东来的公开事实拆成机制、条件和售后可用动作，帮助团队判断哪些经验能进入精诚服务，哪些只能作为背景参照。
              </p>
            }
            asideTitle="阅读任务"
            asideItems={[
              { title: "先看事实", description: "固定来源、数据口径和经营背景。" },
              { title: "再拆机制", description: "看员工、客户、现场和经营如何互相支撑。" },
              { title: "最后转译", description: "只迁移适合汽车售后的动作和判断方法。" },
            ]}
            footer={
              <div className="flex flex-wrap gap-2">
                {["人本经营", "员工体验", "服务秩序", "售后迁移"].map((tag) => (
                  <LhChip key={tag} tone="neutral">
                    {tag}
                  </LhChip>
                ))}
              </div>
            }
          />

          <ContentSection
            id="overview"
            eyebrow="定位"
            title="从研究文章升级为可使用的标杆案例"
            description="镜鉴的目标，是让外部案例从“读过了”变成“能讨论、能迁移、能被路引引用”。"
          >
            <div className="grid gap-4 md:grid-cols-3">
              {productCards.map((card) => (
                <LhCard key={card.title} className="p-5">
                  <h3 className="text-[length:var(--title-card)] font-[var(--weight-extrabold)] leading-[1.2] text-ink">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-[length:var(--type-body)] leading-[var(--leading-body)] text-[color:var(--color-ink-soft)]">
                    {card.description}
                  </p>
                </LhCard>
              ))}
            </div>
          </ContentSection>

          <ContentSection id="evidence" eyebrow="事实底座" title="先把可引用事实摆出来">
            <p className="max-w-4xl text-[length:var(--type-reading)] leading-[var(--leading-reading)] text-[color:var(--color-ink-soft)]">
              胖东来由创始人于东来先生于 1995 年在河南许昌创立，从一家街边小店起步，发展至今已成为在许昌、新乡两地拥有多家门店的大型商贸集团。以下数据继续沿用当前资料口径，作为案例阅读的事实底座。
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((item) => (
                <LhCard key={item.label} className="p-5">
                  <p className="text-[length:var(--title-kicker)] font-[var(--weight-black)] uppercase leading-[1.2] tracking-[var(--tracking-kicker)] text-[color:var(--color-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-3 flex items-end gap-2">
                    <span className="text-[length:var(--title-section)] font-[var(--weight-extrabold)] leading-none text-ink">
                      {item.value}
                    </span>
                    <span className="pb-1 text-[length:var(--type-control)] font-[var(--weight-bold)] leading-[var(--leading-control)] text-[color:var(--color-ink-soft)]">
                      {item.unit}
                    </span>
                  </p>
                  <LhChip tone="neutral" className="mt-4">
                    {item.note}
                  </LhChip>
                </LhCard>
              ))}
            </div>
          </ContentSection>

          <ContentSection
            id="mechanism"
            eyebrow="机制拆解"
            title="把胖东来拆成四个可判断机制"
            description="产品化后的镜鉴，不直接问“学不学胖东来”，而是先问这些机制在汽车售后里是否成立。"
          >
            <div className="grid gap-5">
              {mechanismCards.map((card, index) => (
                <LhPanel key={card.title} className="p-5 md:p-6">
                  <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <LhChip tone="primary">机制 {index + 1}</LhChip>
                      <h3 className="mt-3 text-[length:var(--title-card)] font-[var(--weight-extrabold)] leading-[1.2] text-ink">
                        {card.title}
                      </h3>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {card.tags.map((tag) => (
                          <LhChip key={tag} tone="neutral">
                            {tag}
                          </LhChip>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <MechanismBlock title="观察信号">{card.signal}</MechanismBlock>
                      <MechanismBlock title="成立条件">{card.condition}</MechanismBlock>
                      <MechanismBlock title="售后迁移">{card.transfer}</MechanismBlock>
                    </div>
                  </div>
                </LhPanel>
              ))}
            </div>
          </ContentSection>

          <ContentSection
            id="transfer"
            eyebrow="迁移矩阵"
            title="转成汽车售后可以讨论的动作"
            description="矩阵不是操作指令，而是给服务顾问、管理者和共创审核者的讨论起点。"
          >
            <LhDataTableShell>
              <table>
                <thead>
                  <tr>
                    <th>售后场景</th>
                    <th>胖东来启发</th>
                    <th>可转译动作</th>
                    <th>边界</th>
                  </tr>
                </thead>
                <tbody>
                  {transferRows.map(([scene, lesson, action, boundary]) => (
                    <tr key={scene}>
                      <td>{scene}</td>
                      <td>{lesson}</td>
                      <td>{action}</td>
                      <td>{boundary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </LhDataTableShell>
          </ContentSection>

          <ContentSection id="workflow" eyebrow="使用路径" title="这张案例卡怎么进入产品链路">
            <div className="grid gap-4 md:grid-cols-2">
              {workflowSteps.map((step) => (
                <LhCard key={step.title} className="p-5">
                  <h3 className="text-[length:var(--title-card)] font-[var(--weight-extrabold)] leading-[1.2] text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-[length:var(--type-body)] leading-[var(--leading-body)] text-[color:var(--color-ink-soft)]">
                    {step.description}
                  </p>
                </LhCard>
              ))}
            </div>
            <LhCallout
              tone="primary"
              icon={<Icon icon={lighthouseIcons.hermit} className="size-[1.125rem]" />}
              title="路引使用方式"
              action={
                <Link
                  href="/hermit"
                  className="inline-flex min-h-10 items-center justify-center rounded-[var(--lh-control-radius)] border border-line-strong bg-panel px-3 text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-primary-text transition-colors hover:bg-primary-soft"
                >
                  打开路引
                </Link>
              }
            >
              提问时不要只说“学习胖东来”，要带上具体售后场景，让路引按事实、价值依据、相近案例和下一步动作回应。
            </LhCallout>
          </ContentSection>

          <ContentSection id="questions" eyebrow="讨论问题" title="把案例带回现场的三个入口">
            <div className="grid gap-5 lg:grid-cols-3">
              {questionCards.map((card) => (
                <LhCard key={card.title} className="p-5">
                  <h3 className="text-[length:var(--title-card)] font-[var(--weight-extrabold)] leading-[1.2] text-ink">
                    {card.title}
                  </h3>
                  <ul className="mt-4 grid gap-3 text-[length:var(--type-body)] leading-[var(--leading-body)] text-[color:var(--color-ink-soft)]">
                    {card.questions.map((question) => (
                      <li key={question} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                        {question}
                      </li>
                    ))}
                  </ul>
                </LhCard>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={workflowHref}
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--lh-control-radius)] border border-primary bg-primary px-4 text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-panel transition-colors hover:bg-primary-deep"
              >
                {workflowLabel}
              </Link>
              <Link
                href="/hermit"
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--lh-control-radius)] border border-line-strong bg-panel px-4 text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-primary-text transition-colors hover:bg-primary-soft"
              >
                带着问题问路引
              </Link>
            </div>
          </ContentSection>

          <ContentSection id="conclusion" eyebrow="镜鉴结论" title="真正要迁移的不是热度，而是规则生成方式">
            <LhPanel className="p-6">
              <p className="max-w-4xl text-[length:var(--type-reading)] leading-[var(--leading-reading)] text-ink">
                胖东来提示我们：服务文化不是一段好听的话，而是一套能保护员工、稳定现场、兑现客户信任的组织安排。对精诚服务来说，最值得迁移的是“价值观落到动作、动作来自现场、标准保留判断空间”的生成方式。
              </p>
            </LhPanel>
          </ContentSection>

          <footer className="rounded-[var(--lh-card-radius)] border border-line bg-surface-quiet p-5">
            <p className="text-[length:var(--title-kicker)] font-[var(--weight-black)] leading-[1.2] tracking-[var(--tracking-kicker)] text-primary-text">
              参考来源
            </p>
            <ul className="mt-4 grid gap-2 text-[length:var(--type-label)] leading-[var(--leading-label)] text-[color:var(--color-muted)]">
              {references.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </footer>
        </main>
      </div>
    </article>
  );
}

function MechanismBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--lh-control-radius)] border border-line bg-surface-quiet p-4">
      <p className="text-[length:var(--title-kicker)] font-[var(--weight-black)] leading-[1.2] tracking-[var(--tracking-kicker)] text-primary-text">
        {title}
      </p>
      <p className="mt-3 text-[length:var(--type-body)] leading-[var(--leading-body)] text-[color:var(--color-ink-soft)]">
        {children}
      </p>
    </div>
  );
}

function ContentSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 space-y-5">
      <LhSectionHeader eyebrow={eyebrow} title={title} description={description} />
      {children}
    </section>
  );
}
