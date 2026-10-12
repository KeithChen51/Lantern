"use client";

import { Icon } from "@iconify/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState } from "react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { getHermitApiError, isHermitResourceResponse, type HermitDocumentRecommendation, type HermitResourceResponse } from "./types";
import styles from "./hermit-v3.module.css";

interface DocumentReaderProps {
  document: HermitDocumentRecommendation;
  onClose: () => void;
  onUse: (document: HermitDocumentRecommendation) => void;
}

function safeUrlTransform(url: string): string {
  if (url.startsWith("#") || url.startsWith("/") || /^https?:\/\//i.test(url)) return url;
  return "#";
}

function sourceLineAttributes(node: unknown): Record<string, string> {
  if (typeof node !== "object" || node === null || !("position" in node)) return {};
  const position = (node as { position?: unknown }).position;
  if (typeof position !== "object" || position === null) return {};
  const start = (position as { start?: unknown }).start;
  const end = (position as { end?: unknown }).end;
  const startLine = typeof start === "object" && start !== null && "line" in start && typeof (start as { line?: unknown }).line === "number"
    ? (start as { line: number }).line
    : undefined;
  const endLine = typeof end === "object" && end !== null && "line" in end && typeof (end as { line?: unknown }).line === "number"
    ? (end as { line: number }).line
    : startLine;
  if (!startLine || !endLine) return {};
  return {
    "data-lh-source-start-line": String(startLine),
    "data-lh-source-end-line": String(endLine),
  };
}

const markdownComponents: Components = {
  p: ({ children, node }) => <p {...sourceLineAttributes(node)}>{children}</p>,
  h1: ({ children, node }) => <h1 {...sourceLineAttributes(node)}>{children}</h1>,
  h2: ({ children, node }) => <h2 {...sourceLineAttributes(node)}>{children}</h2>,
  h3: ({ children, node }) => <h3 {...sourceLineAttributes(node)}>{children}</h3>,
  h4: ({ children, node }) => <h4 {...sourceLineAttributes(node)}>{children}</h4>,
  li: ({ children, node }) => <li {...sourceLineAttributes(node)}>{children}</li>,
  blockquote: ({ children, node }) => <blockquote {...sourceLineAttributes(node)}>{children}</blockquote>,
  table: ({ children }) => <div className={styles.readerProseTableWrap}><table>{children}</table></div>,
  a: ({ href, children }) => <a href={href ? safeUrlTransform(href) : undefined}>{children}</a>,
};

export function DocumentReader({ document, onClose, onUse }: DocumentReaderProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [resource, setResource] = useState<HermitResourceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const controller = new AbortController();
    let active = true;
    setResource(null);
    setError(null);

    async function loadResource() {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/resources/${encodeURIComponent(document.resourceId)}?version=${encodeURIComponent(document.versionId)}`,
          { signal: controller.signal },
        );
        const responseText = await response.text();
        let payload: unknown = responseText;
        try {
          payload = responseText ? JSON.parse(responseText) : null;
        } catch {
          // Keep the plain text body for the short actionable error extractor.
        }
        if (!response.ok) throw new Error(getHermitApiError(payload, "文档暂时无法打开，请稍后重试。"));
        if (!isHermitResourceResponse(payload)) throw new Error("resource-response-invalid");
        if (active) setResource(payload);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (active) {
          setResource(null);
          setError(getHermitApiError(err, "文档暂时无法打开，请稍后重试。"));
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadResource();
    return () => {
      active = false;
      controller.abort();
    };
  }, [document.resourceId, document.versionId, reloadToken]);

  useEffect(() => {
    if (!resource || !document.startLine || !bodyRef.current) return;
    const body = bodyRef.current;
    const targetStart = document.startLine;
    const targetEnd = document.endLine ?? targetStart;
    const target = Array.from(body.querySelectorAll<HTMLElement>("[data-lh-source-start-line]"))
      .find((element) => {
        const startLine = Number(element.dataset.lhSourceStartLine);
        const endLine = Number(element.dataset.lhSourceEndLine ?? element.dataset.lhSourceStartLine);
        return Number.isFinite(startLine) && Number.isFinite(endLine) && startLine <= targetEnd && endLine >= targetStart;
      });
    if (!target) return;
    const bodyRect = body.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    body.scrollTo({ top: Math.max(0, body.scrollTop + targetRect.top - bodyRect.top - 16), behavior: "auto" });
  }, [document.endLine, document.resourceId, document.startLine, document.versionId, resource]);

  return (
    <aside className={styles.readerPanel} aria-label="知识文档阅读区" data-lh-hermit-document-reader>
      <header className={styles.readerHeader}>
        <div className={styles.readerHeaderCopy}>
          <p className={styles.readerEyebrow}>灯塔知识中台 · 文档阅读</p>
          <h2 className={styles.readerTitle}>{resource?.title ?? document.title}</h2>
          <p className={styles.readerSource}>{resource?.source ?? document.source}{document.heading ? ` · ${document.heading}` : ""}</p>
        </div>
        <div>
          <button type="button" className={styles.readerBack} onClick={onClose} aria-label="返回路引对话">
            <Icon icon={lighthouseIcons.arrowRightUp} className="rotate-180" aria-hidden="true" />
            返回对话
          </button>
          <button type="button" className={styles.readerClose} onClick={onClose} aria-label="关闭文档阅读区" title="关闭阅读区">
            <Icon icon={lighthouseIcons.close} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={styles.readerBody} ref={bodyRef} tabIndex={0} role="region" aria-label="文档正文">
        {isLoading && <div className={styles.readerLoading} role="status">正在打开文档…</div>}
        {!isLoading && error && (
          <div className={styles.readerError} role="alert">
            <p>{error}</p>
            <button type="button" className={styles.readerRetry} onClick={() => setReloadToken((token) => token + 1)}>
              <Icon icon={lighthouseIcons.refresh} aria-hidden="true" />
              重试
            </button>
          </div>
        )}
        {!isLoading && !error && resource && (
          <div className={styles.readerProse} data-lh-document-prose>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={safeUrlTransform}>
              {resource.version.markdown}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {!isLoading && !error && resource && (
        <footer className={styles.readerFooter}>
          <button type="button" className={styles.readerUse} onClick={() => onUse(document)}>
            <Icon icon={lighthouseIcons.hermit} aria-hidden="true" />
            引用本文继续提问
          </button>
        </footer>
      )}
    </aside>
  );
}
