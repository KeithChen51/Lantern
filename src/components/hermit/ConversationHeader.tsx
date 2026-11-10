"use client";

import { HermitIdentity } from "./HermitIdentity";
import styles from "./hermit-v3.module.css";

type Props = { title?: string } & (
  { mode?: "interactive"; onNew: () => void; onHistory: () => void; onClose?: never; titleId?: never }
  | { mode: "read-only"; onClose: () => void; titleId: string; onNew?: never; onHistory?: never }
);

export function ConversationHeader({ title, mode, onNew, onHistory, onClose, titleId }: Props) {
  const Heading = mode === "read-only" ? "h2" : "h1";
  return <header className={styles.conversationHeader}>
    <div className={styles.conversationTitle}>{title && <><HermitIdentity size="sm" /><Heading id={titleId} title={title}>{title}</Heading></>}{mode === "read-only" && <span className={styles.readOnlyLabel}>只读</span>}</div>
    <nav className={styles.conversationActions} aria-label="对话操作">
      {mode === "read-only"
        ? <button type="button" onClick={onClose} autoFocus aria-label="关闭对话回看">关闭</button>
        : <><button type="button" onClick={onNew}>＋ 新对话</button>
          <button type="button" onClick={onHistory} aria-haspopup="dialog">历史对话</button></>}
    </nav>
  </header>;
}
