"use client";

import type { ReactNode, Ref, UIEventHandler } from "react";
import styles from "./hermit-v3.module.css";

/** Shared presentation boundary for live conversations and saved, read-only views. */
export function ConversationSurface({ children, readOnly = false, label, scrollRef, onScroll, footer }: {
  children: ReactNode;
  readOnly?: boolean;
  label: string;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: UIEventHandler<HTMLDivElement>;
  footer?: ReactNode;
}) {
  return <section
    className={`${styles.conversation} ${styles.conversationSurface}`}
    data-lh-hermit-conversation
    data-read-only={readOnly || undefined}
    aria-label={label}
  >
    <div data-lh-hermit-main ref={scrollRef} tabIndex={0} role="region" aria-label="对话消息" onScroll={onScroll}>
      <div data-lh-chat-scroll-content>{children}</div>
    </div>
    {footer && <footer data-lh-hermit-footer>{footer}</footer>}
  </section>;
}
