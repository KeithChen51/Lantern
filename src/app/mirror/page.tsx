import Link from "next/link";
import { LhDataTableShell } from "@/components/ui/lighthouse-primitives";
import { PageHeading } from "@/components/ui/PageHeading";
import styles from "./content-v3.module.css";

const caseCards = [
  {
    title: "云游胖东来",
    description: "把胖东来的公开事实拆成机制、条件和售后可用动作，作为服务文化转译的标杆案例卡。",
    href: "/mirror/pang-dong-lai",
    meta: "外部标杆 · 零售服务",
    dimensions: ["机制拆解", "员工尊重", "售后迁移"],
  },
  {
    title: "其他案例待沉淀",
    description: "后续案例按行业、角色和可迁移动作整理。",
    href: null,
    meta: "",
    dimensions: [],
  },
] as const;

const compareRows = [
  ["案例来源", "外部企业公开材料、行业观察、媒体报道", "帮助团队形成可讨论的参考对象"],
  ["阅读目标", "提取服务文化、组织管理和动作设计", "避免简单赞美或机械照搬"],
  ["拆解方式", "先识别事实、机制和成立条件，再转成售后动作", "连接笃行与路引"],
];

const readingRules = [
  "先看事实与来源，不先下结论，不把赞美当作分析。",
  "拆成原则、条件、动作，让案例能进入讨论和迁移。",
  "只迁移适合售后场景的部分，避免机械照搬外部经验。",
];

export default function MirrorPage() {
  return (
    <div data-lh-page-archetype="cultural-reading" data-lh-page="mirror" className={styles.page}>
      <div className={styles.stack}>
        <PageHeading title="镜鉴" description="从外部标杆中，找到值得借鉴的服务方法。" />

        <div className={styles.toolbar}>
          <p className={styles.toolbarMeta}>标杆案例&nbsp; / &nbsp;1 篇可阅读</p>
          <details className={styles.methodInline}>
            <summary className={styles.toolbarAction}>阅读方法</summary>
            <div className={styles.methodBody}>
              <p>镜鉴把公开案例拆成可验证的事实、成立条件和可迁移动作。</p>
              <ol className={styles.methodList}>
                {readingRules.map((rule, index) => (
                  <li key={rule}>
                    <span className={styles.methodIndex}>{index + 1}</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        </div>

        <div className={styles.caseGrid}>
          <Link href={caseCards[0].href} className={styles.caseCard}>
            <p className={styles.caseMeta}>{caseCards[0].meta}</p>
            <h2 className={styles.caseTitle}>{caseCards[0].title}</h2>
            <p className={styles.caseDescription}>{caseCards[0].description}</p>
            <p className={styles.caseTags}>{caseCards[0].dimensions.join("   /   ")}</p>
            <span className={styles.caseLink}>阅读案例 →</span>
          </Link>

          <div className={styles.caseCardMuted}>
            <h2 className={styles.caseTitleMuted}>{caseCards[1].title}</h2>
            <p className={styles.caseDescription}>{caseCards[1].description}</p>
          </div>
        </div>

        <details className={styles.methodDisclosure}>
          <summary>查看镜鉴的拆解维度</summary>
          <div className={styles.methodBody}>
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
        </details>
      </div>
    </div>
  );
}
