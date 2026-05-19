"use client";

import { Icon } from "@iconify/react";
import ReactMarkdown from "react-markdown";
import type { UIMessage } from "ai";
import { LhChip, LhStatusBadge } from "@/components/ui/lighthouse-primitives";
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
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-line bg-surface-quiet text-primary-deep">
      <Icon icon={lighthouseIcons.hermit} className="h-5 w-5" />
    </span>
  );
}

function UserAvatar() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-panel text-primary-deep shadow-lh-sm">
      <Icon icon={lighthouseIcons.user} className="h-5 w-5" />
    </span>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const text = getTextContent(message);

  if (isUser) {
    return (
      <article className="grid grid-cols-[minmax(0,1fr)_36px] gap-3">
        <div className="flex justify-end">
          <div className="max-w-[min(720px,92%)] rounded-sm border border-primary/25 bg-primary-soft px-4 py-3 text-sm font-bold leading-7 text-primary-deep shadow-lh-sm">
            <div className="mb-1 text-xs font-extrabold text-primary-deep/80">你</div>
            <p className="whitespace-pre-wrap">{text}</p>
          </div>
        </div>
        <UserAvatar />
      </article>
    );
  }

  const needsEvidence = isEvidenceInsufficient(text);

  return (
    <article className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
      <AssistantAvatar />
      <div className="min-w-0 rounded-sm border border-line bg-panel p-5 text-ink shadow-lh-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <strong className="text-sm font-extrabold text-ink">路引</strong>
          <LhChip tone="primary">路引回答</LhChip>
          <LhStatusBadge tone={needsEvidence ? "warning" : "success"}>
            {needsEvidence ? "证据不足" : "可继续判断"}
          </LhStatusBadge>
        </div>
        <div className="hermit-prose text-sm leading-7 text-ink-soft md:text-base md:leading-8">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-extrabold text-ink">{children}</strong>,
              ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
              ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
              li: ({ children }) => <li className="text-ink-soft">{children}</li>,
              h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-extrabold text-ink">{children}</h3>,
              h4: ({ children }) => <h4 className="mb-2 mt-4 text-sm font-extrabold text-ink">{children}</h4>,
              blockquote: ({ children }) => (
                <blockquote className="my-4 rounded-sm border-l-4 border-primary bg-surface-quiet px-4 py-3 text-muted">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-5 border-line" />,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      </div>
    </article>
  );
}

export function TypingIndicator() {
  return (
    <article className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
      <AssistantAvatar />
      <div className="w-fit rounded-sm border border-line bg-panel px-4 py-3 text-sm font-bold leading-6 text-muted shadow-lh-sm">
        <span className="inline-flex items-center gap-2">
          <Icon icon={lighthouseIcons.refresh} className={cn("h-4 w-4 animate-spin text-primary")} />
          路引正在整理事实和依据
        </span>
      </div>
    </article>
  );
}
