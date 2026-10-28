"use client";

import Link from "next/link";
import { useRef } from "react";
import styles from "./knowledge.module.css";

export function ReadingMobileNavigation({ returnHref, returnLabel, headings }: { returnHref: string; returnLabel: string; headings: { id: string; text: string; depth: number }[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return <nav className={styles.mobileReadingBar} aria-label="阅读快捷导航" onKeyDown={event => {
    if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); }
  }}>
    <Link href={returnHref}>↩ {returnLabel}</Link>
    {headings.length > 0 && <details ref={menu} className={styles.mobileReadingMenu}>
      <summary>目录</summary>
      <nav aria-label="文章目录"><ol>{headings.map(heading => <li key={heading.id} data-depth={heading.depth}><a href={`#${heading.id}`} onClick={() => { if (menu.current) menu.current.open = false; }}>{heading.text}</a></li>)}</ol></nav>
    </details>}
    <a href="#resource-top">顶部 ↑</a>
  </nav>;
}
