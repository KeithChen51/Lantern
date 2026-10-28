"use client";

import { Icon } from "@iconify/react";
import ReactMarkdown, { type Components } from "react-markdown";
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
import styles from "./hermit-v3.module.css";
import { HermitIdentity } from "./HermitIdentity";
import { MessageContext } from "./MessageContext";
import { messageContext, type ContextRemoval } from "./message-context";
import type { HermitMessageContext } from "@/lib/hermit/conversation-contract";
import { getDocumentRecommendations, getHermitCitationFromHref, getHermitCitations, getTextContent, type HermitCitation, type HermitDocumentRecommendation } from "./types";

interface MessageBubbleProps {
  message: UIMessage;
  onOpenDocument?: (document: HermitDocumentRecommendation) => void;
  showRecommendations?: boolean;
  activeContext?: HermitMessageContext;
  contextDisabled?: boolean;
  onRemoveContext?: (item: ContextRemoval) => void;
}

const markdownComponents: Components = {
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

function CitationAnchor({
  href,
  children,
  citations,
  onOpenDocument,
}: {
  href?: string;
  children?: ReactNode;
  citations: HermitCitation[];
  onOpenDocument?: (document: HermitDocumentRecommendation) => void;
}) {
  const match = href?.match(/^#hermit-citation-(\d+)$/);
  const citation = getHermitCitationFromHref(href, citations);

  if (match && citation) {
    return (
      <button
        type="button"
        className={styles.citationButton}
        data-lh-hermit-citation={citation.number}
        aria-label={`打开引用 ${citation.number}：${citation.title}`}
        onClick={() => onOpenDocument?.({
          id: `citation:${citation.number}:${citation.resourceId}:${citation.versionId}`,
          resourceId: citation.resourceId,
          versionId: citation.versionId,
          title: citation.title,
          source: citation.source,
          startLine: citation.startLine,
          endLine: citation.endLine,
        })}
      >
        [{citation.number}]
      </button>
    );
  }

  // An internal citation-looking link is only actionable when it was backed by
  // a verified final answer-sources payload. Keep malformed model output plain.
  if (href?.toLowerCase().startsWith("#hermit-citation-")) return <>{children}</>;
  return <a href={href}>{children}</a>;
}

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

function AssistantAvatar() {
  return (
    <LhMessageAvatar variant="assistant">
      <HermitIdentity size="sm" />
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

export function MessageBubble({ message, onOpenDocument, showRecommendations = true, activeContext, contextDisabled, onRemoveContext }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const text = getTextContent(message);
  const citations = getHermitCitations(message);
  const documents = showRecommendations ? getDocumentRecommendations(message) : [];

  if (isUser) {
    return (
      <LhMessageRow messageRole="user">
        <div data-lh-message-bubble-slot>
          <LhMessageBubbleFrame variant="user">
            <div data-lh-message-author>你</div>
            <p className="whitespace-pre-wrap">{text}</p>
          </LhMessageBubbleFrame>
        </div>
        <MessageContext context={messageContext(message)} active={activeContext} disabled={contextDisabled} onOpenDocument={onOpenDocument} onRemove={onRemoveContext} />
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
          <span data-lh-message-meta-note>{documents.length || citations.length ? "结合灯塔知识回答" : "服务文化助手"}</span>
        </div>
        <div data-lh-message-prose>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              ...markdownComponents,
              a: ({ href, children }) => <CitationAnchor href={href} citations={citations} onOpenDocument={onOpenDocument}>{children}</CitationAnchor>,
            }}
          >
            {normalizeMarkdownTableSeparators(text)}
          </ReactMarkdown>
        </div>
        {documents.length > 0 && (
          <section className={styles.readerRecommendations} aria-label="灯塔知识中台推荐文档" data-lh-hermit-recommendations>
            <div className={styles.readerRecommendationsHeading}>
              <Icon icon={lighthouseIcons.document} aria-hidden="true" />
              推荐阅读
            </div>
            {documents.map((document) => (
              <button
                type="button"
                className={styles.documentCard}
                data-lh-hermit-recommendation={`${document.resourceId}:${document.versionId}`}
                key={document.id}
                onClick={() => onOpenDocument?.(document)}
                aria-label={`打开文档：${document.title}`}
              >
                <span className={styles.documentCardIcon} aria-hidden="true"><Icon icon={lighthouseIcons.document} /></span>
                <span className={styles.documentCardCopy}>
                  <span className={styles.documentCardTitle}>{document.title}</span>
                  <span className={styles.documentCardMeta}>{document.source}</span>
                  {document.reason && <span className={styles.documentCardReason}>{document.reason}</span>}
                  <span className={styles.documentReadLink}>阅读文档 →</span>
                </span>
                <Icon className={styles.documentCardArrow} icon={lighthouseIcons.arrowRightUp} aria-hidden="true" />
              </button>
            ))}
          </section>
        )}
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
