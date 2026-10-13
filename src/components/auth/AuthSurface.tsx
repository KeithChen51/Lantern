import type { ReactNode } from "react";
import styles from "./auth.module.css";

export function AuthSurface({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.surface}><section className={styles.card} aria-labelledby="auth-title">
    {/* Plain markup keeps employee login working with JavaScript disabled. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/nav-lighthouse-transparent.png" width="32" height="80" alt="" />
    <p className={styles.brand}>灯塔</p><h1 id="auth-title">{title}</h1>{children}
  </section></div>;
}
export function AuthNotice({ children }: { children: ReactNode }) { return <p className={styles.notice} role="alert">{children}</p>; }
