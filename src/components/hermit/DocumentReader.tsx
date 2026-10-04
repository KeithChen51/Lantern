"use client";

import { Icon } from "@iconify/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useState } from "react";
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

const markdownComponents: Components = {
  table: ({ children }) => <div className={styles.readerProseTableWrap}><table>{children}</table></div>,
  a: ({ href, children }) => <a href={href ? safeUrlTransform(href) : undefined}>{children}</a>,
};

export function DocumentReader({ document, onClose, onUse }: DocumentReaderProps) {
  const [resource, setResource] = useState<HermitResourceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
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

      <div className={styles.readerBody}>
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
          <>
            <div className={styles.readerProse} data-lh-document-prose>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={safeUrlTransform}>
                {resource.version.markdown}
              </ReactMarkdown>
            </div>
            <button type="button" className={styles.readerUse} onClick={() => onUse(document)}>
              <Icon icon={lighthouseIcons.hermit} aria-hidden="true" />
              引用本文继续提问
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
