"use client";

import { Fragment, type ReactNode, type Ref, type UIEventHandler } from "react";
import type { UIMessage } from "ai";
import { ConversationHeader } from "./ConversationHeader";
import { ConversationSurface } from "./ConversationSurface";
import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";
import { getDocumentRecommendations, getTextContent } from "./types";
import styles from "./hermit-v3.module.css";

type Props = {
  title?: string;
  label: string;
  messages: UIMessage[];
  headerContent?: ReactNode;
  beforeMessages?: ReactNode;
  children?: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: UIEventHandler<HTMLDivElement>;
  messageOptions?: (message: UIMessage) => Omit<MessageBubbleProps, "message" | "readOnly">;
  afterMessage?: (message: UIMessage) => ReactNode;
  footer?: ReactNode;
  reader?: ReactNode;
} & (
  { mode?: "interactive"; onNew: () => void; onHistory: () => void; onClose?: never; titleId?: never }
  | { mode: "read-only"; onClose: () => void; titleId: string; onNew?: never; onHistory?: never }
);

/** The conversation page is shared by live chat and administrator playback. */
export function HermitConversationView(props: Props) {
  const readOnly = props.mode === "read-only";
  return <div className={`${styles.workspace} ${styles.conversationTheme}`}>
    <div>
      {props.mode === "read-only"
        ? <ConversationHeader mode="read-only" title={props.title} titleId={props.titleId} onClose={props.onClose} />
        : <ConversationHeader title={props.title} onNew={props.onNew} onHistory={props.onHistory} />}
      {props.headerContent}
    </div>
    <div className={`${styles.chatLayout} ${props.reader ? styles.chatLayoutWithReader : ""}`} data-lh-hermit-layout>
      <ConversationSurface label={props.label} readOnly={readOnly} scrollRef={props.scrollRef} onScroll={props.onScroll} footer={readOnly ? undefined : props.footer}>
        {props.beforeMessages}
        {props.messages.map(message => <Fragment key={message.id}>
          {(message.role !== "assistant" || getTextContent(message).trim() || getDocumentRecommendations(message).length)
            ? <MessageBubble {...props.messageOptions?.(message)} message={message} readOnly={readOnly} />
            : null}
          {props.afterMessage?.(message)}
        </Fragment>)}
        {props.children}
      </ConversationSurface>
      {!readOnly && props.reader}
      <p className={`${styles.startFootnote} ${styles.conversationFootnote}`}>回答供参考，请结合现场情况判断。</p>
    </div>
  </div>;
}
