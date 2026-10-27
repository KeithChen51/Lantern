import type { ReactNode } from "react";
import styles from "./login.module.css";

/** A server-rendered entry: the native login form also works without JavaScript. */
export function LoginSurface({ children }: { children: ReactNode }) {
  return (
    <div data-lh-v3 data-lh-login className={styles.surface}>
      <div className={styles.layout}>
        <section className={styles.story} aria-label="灯塔 · 服务文化数字平台">
          {/* The shared brand image is explicitly public; no image optimizer or session is needed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.image} src="/lighthouse-home-hero-bg-v2-realistic-shore.png" alt="" fetchPriority="high" />
          <div className={styles.veil} aria-hidden="true" />
          <div className={styles.wordmark}>
            <span className={styles.brand}>灯塔</span>
            <span className={styles.brandDescription}>服务文化数字平台</span>
          </div>
          <div className={styles.storyCopy}>
            <p className={styles.storyTitle}>以文化为灯，<br />照亮服务之路。</p>
            <p className={styles.values}>求真 · 尽善 · 致美 · 大爱 · 幸福</p>
          </div>
        </section>
        <section className={styles.entry} aria-labelledby="auth-title">
          <div className={styles.entryContent}>
            <p className={styles.eyebrow}>员工登录</p>
            <h1 id="auth-title" className={styles.title}>欢迎来到灯塔</h1>
            {children}
            <p className={styles.help}>登录遇到问题，请联系平台维护人员（林子轩）。</p>
          </div>
          <p className={styles.footer}>从理念到实践，让服务有据可循。</p>
        </section>
      </div>
    </div>
  );
}
