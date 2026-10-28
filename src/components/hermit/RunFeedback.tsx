"use client";

import { TypingIndicator } from "./MessageBubble";
import styles from "./hermit-v3.module.css";

export function RunFeedback({ loading, progress, error, cancelled, onRetry }: { loading?: boolean; progress?: string | null; error?: string | null; cancelled?: boolean; onRetry?: () => void }) {
  if (loading) return <div role="status" aria-live="polite"><TypingIndicator label={progress || "正在连接路引"} /></div>;
  if (!error && !cancelled) return null;
  return <div className={error ? styles.requestError : styles.runCancelled} role={error ? "alert" : "status"}>
    <p>{error || "已停止生成。你可以继续提问，或重新生成这条回答。"}</p>
    {onRetry && <button type="button" className={styles.requestRetry} onClick={onRetry}>{cancelled ? "重新生成" : "重试"}</button>}
  </div>;
}
