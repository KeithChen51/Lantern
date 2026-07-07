"use client";

import { Icon } from "@iconify/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import {
  LhMessageAvatar,
  LhMessageBubble as LhMessageBubbleFrame,
  LhMessageRow,
  LhLoadingGlyph,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

interface MessageBubbleProps {
  message: UIMessage;
}

type AnswerSectionKey = "direct" | "basis" | "reference" | "next";

type AnswerSection = {
  key: AnswerSectionKey;
  title: string;
  content: string;
};

const ANSWER_SECTION_ORDER: Array<{ key: AnswerSectionKey; title: string }> = [
  { key: "direct", title: "直接建议" },
  { key: "basis", title: "判断依据" },
  { key: "reference", title: "相关案例 / 规范" },
  { key: "next", title: "下一步动作" },
];

const SECTION_HEADING_PATTERN =
  /^\s{0,3}(?:#{2,4}\s*)?(?:[-*]\s*)?(?:\*\*)?\s*(直接建议|直接判断|判断依据|相关案例\s*\/\s*规范|相关案例|相关参照|案例参照|相关规范|规范参照|下一步动作|下一步)(?:\*\*)?\s*[：:]?\s*(.*)$/;

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  strong: ({ children }: { children?: ReactNode }) => <strong>{children}</strong>,
  ul: ({ children }: { children?: ReactNode }) => <ul>{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol>{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  h3: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
  h4: ({ children }: { children?: ReactNode }) => <h4>{children}</h4>,
  blockquote: ({ children }: { children?: ReactNode }) => <blockquote>{children}</blockquote>,
  table: ({ children }: { children?: ReactNode }) => (
    <div data-lh-message-table-wrap>
      <table data-lh-message-table>{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
  tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
  th: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
  td: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
  hr: () => <hr />,
};

const TABLE_SEPARATOR_DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g;

function normalizeMarkdownTableSeparators(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      if (!line.includes("|")) return line;

      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      if (cells.length < 2) return line;

      const normalizedCells = cells.map((cell) => cell.trim().replace(TABLE_SEPARATOR_DASHES, "-").replace(/\s+/g, ""));
      const isSeparator = normalizedCells.every((cell) => /^:?-+:?$/.test(cell));
      if (!isSeparator) return line;

      return `| ${normalizedCells.map((cell) => `${cell.startsWith(":") ? ":" : ""}---${cell.endsWith(":") ? ":" : ""}`).join(" | ")} |`;
    })
    .join("\n");
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function resolveSectionKey(label: string): AnswerSectionKey {
  if (label.includes("依据")) return "basis";
  if (label.includes("案例") || label.includes("规范") || label.includes("参照")) return "reference";
  if (label.includes("下一步")) return "next";
  return "direct";
}

function createSectionMap() {
  return new Map<AnswerSectionKey, string[]>(ANSWER_SECTION_ORDER.map(({ key }) => [key, []]));
}

function splitAssistantAnswer(markdown: string): AnswerSection[] {
  const sectionContent = createSectionMap();
  let activeSection: AnswerSectionKey = "direct";

  markdown.split(/\r?\n/).forEach((line) => {
    const match = line.match(SECTION_HEADING_PATTERN);
    if (match) {
      activeSection = resolveSectionKey(match[1]);
      const remainder = match[2]?.trim();
      if (remainder) sectionContent.get(activeSection)?.push(remainder);
      return;
    }

    sectionContent.get(activeSection)?.push(line);
  });

  return ANSWER_SECTION_ORDER.map(({ key, title }) => ({
    key,
    title,
    content: sectionContent.get(key)?.join("\n").trim() ?? "",
  })).filter((section) => section.content.length > 0);
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
  const assistantSections = splitAssistantAnswer(text);

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
        <div data-lh-answer-structure>
          {assistantSections.map((section) => (
            <section data-lh-answer-section data-section={section.key} key={section.key}>
              <h3 data-lh-answer-section-title>{section.title}</h3>
              <div data-lh-message-prose>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {normalizeMarkdownTableSeparators(section.content)}
                </ReactMarkdown>
              </div>
            </section>
          ))}
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
          <LhLoadingGlyph data-lh-message-typing-icon label={label} />
          {label}
        </span>
      </LhMessageBubbleFrame>
    </LhMessageRow>
  );
}
