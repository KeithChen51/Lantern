"use client";

import type { ReactNode } from "react";
import styles from "./hermit-v3.module.css";

/** Shared presentation boundary for live conversations and saved, read-only views. */
export function ConversationSurface({ children, readOnly = false, label }: {
  children: ReactNode;
  readOnly?: boolean;
  label: string;
}) {
  return <section
    className={`${styles.conversation} ${styles.conversationSurface}`}
    data-lh-hermit-conversation
    data-read-only={readOnly || undefined}
    aria-label={label}
  >{children}</section>;
}
