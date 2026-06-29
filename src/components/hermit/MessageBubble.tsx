"use client";

import { Icon } from "@iconify/react";
import ReactMarkdown from "react-markdown";
import type { UIMessage } from "ai";
import {
  LhChip,
  LhMessageAvatar,
  LhMessageBubble as LhMessageBubbleFrame,
  LhMessageRow,
  LhStatusBadge,
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

function isEvidenceInsufficient(text: string) {
  return /证据不足|缺少|无法判断|还需要|还缺少|不能直接下结论/.test(text);
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

  const needsEvidence = isEvidenceInsufficient(text);

  return (
    <LhMessageRow messageRole="assistant">
      <AssistantAvatar />
      <LhMessageBubbleFrame>
        <div data-lh-message-meta>
          <strong>路引</strong>
          <LhChip tone="neutral">AI 回答</LhChip>
          <LhStatusBadge tone={needsEvidence ? "warning" : "success"}>
            {needsEvidence ? "证据不足" : "可继续判断"}
          </LhStatusBadge>
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

export function TypingIndicator() {
  return (
    <LhMessageRow messageRole="assistant">
      <AssistantAvatar />
      <LhMessageBubbleFrame variant="typing">
        <span data-lh-message-typing>
          <Icon data-lh-message-typing-icon icon={lighthouseIcons.refresh} className={cn("animate-spin")} />
          路引正在整理事实和依据
        </span>
      </LhMessageBubbleFrame>
    </LhMessageRow>
  );
}
