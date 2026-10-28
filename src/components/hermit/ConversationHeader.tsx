"use client";

import { HermitIdentity } from "./HermitIdentity";
import styles from "./hermit-v3.module.css";

export function ConversationHeader({ title, onNew, onHistory }: { title?: string; onNew: () => void; onHistory: () => void }) {
  return <header className={styles.conversationHeader}>
    <div className={styles.conversationTitle}>{title && <><HermitIdentity size="sm" /><h1 title={title}>{title}</h1></>}</div>
    <nav className={styles.conversationActions} aria-label="对话操作">
      <button type="button" onClick={onNew}>＋ 新对话</button>
      <button type="button" onClick={onHistory} aria-haspopup="dialog">历史对话</button>
    </nav>
  </header>;
}
