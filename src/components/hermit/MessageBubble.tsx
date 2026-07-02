"use client";

import { Icon } from "@iconify/react";
import ReactMarkdown from "react-markdown";
import type { UIMessage } from "ai";
import {
  LhMessageAvatar,
  LhMessageBubble as LhMessageBubbleFrame,
  LhMessageRow,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: UIMessage;
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function AssistantAvatar() {
  return (
    <LhMessageAvatar variant="assistant">
      <Icon icon={lighthouseIcons.hermit} />
    </LhMessageAvatar>
  );
}

function UserAvatar() {
  return (
    <LhMessageAvatar variant="user">
      <Icon icon={lighthouseIcons.user} />
    </LhMessageAvatar>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const text = getTextContent(message);

  if (isUser) {
    return (
      <LhMessageRow messageRole="user">
        <div data-lh-message-bubble-slot>
          <LhMessageBubbleFrame variant="user">
            <div data-lh-message-author>你</div>
            <p className="whitespace-pre-wrap">{text}</p>
          </LhMessageBubbleFrame>
        </div>
        <UserAvatar />
      </LhMessageRow>
    );
  }

  return (
    <LhMessageRow messageRole="assistant">
      <AssistantAvatar />
      <LhMessageBubbleFrame>
        <div data-lh-message-meta>
          <strong>路引</strong>
          <span data-lh-message-meta-note>框架建议</span>
        </div>
        <div data-lh-message-prose>
          <ReactMarkdown
            components={{
              p: ({ children }) => <p>{children}</p>,
              strong: ({ children }) => <strong>{children}</strong>,
              ul: ({ children }) => <ul>{children}</ul>,
              ol: ({ children }) => <ol>{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              h3: ({ children }) => <h3>{children}</h3>,
              h4: ({ children }) => <h4>{children}</h4>,
              blockquote: ({ children }) => <blockquote>{children}</blockquote>,
              hr: () => <hr />,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      </LhMessageBubbleFrame>
    </LhMessageRow>
  );
}

export function TypingIndicator({ label = "思考中" }: { label?: string }) {
  return (
    <LhMessageRow messageRole="assistant">
      <AssistantAvatar />
      <LhMessageBubbleFrame variant="typing">
        <span data-lh-message-typing>
          <Icon data-lh-message-typing-icon icon={lighthouseIcons.refresh} className={cn("animate-spin")} />
          {label}
        </span>
      </LhMessageBubbleFrame>
    </LhMessageRow>
  );
}
