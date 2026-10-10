import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhPanel, LhChip } from "@/components/ui/lighthouse-primitives";
import { currentVersion, releases } from "@/lib/releases";
import { MarkReleaseRead } from "./MarkReleaseRead";
import styles from "./updates.module.css";

export const metadata: Metadata = { title: "版本更新 | 灯塔" };

export default function UpdatesPage() {
  return (
    <div className={styles.page}>
      <MarkReleaseRead />
      <PageHeading title="版本更新" description="了解灯塔的最新变化，回看每一次更新。" titleAdornment={<LhChip>当前版本 {currentVersion}</LhChip>} />
      <div className={styles.timeline}>
        {releases.map((release, index) => (
          <LhPanel key={release.version} className={styles.release} id={`v${release.version}`}>
            <div className={styles.meta}>
              <span className={styles.version}>v{release.version}</span>
              {index === 0 && <LhChip>最新更新</LhChip>}
              {release.date ? <time dateTime={release.date}>{release.date}</time> : <span>首版基线</span>}
            </div>
            <h2>{release.title}</h2>
            <p className={styles.summary}>{release.summary}</p>
            {release.changes.map((group) => (
              <section key={group.type} className={styles.group}>
                <h3>{group.type}</h3>
                <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
            ))}
          </LhPanel>
        ))}
      </div>
      <p className={styles.footnote}>更新记录从 1.0.0 开始。</p>
    </div>
  );
}
