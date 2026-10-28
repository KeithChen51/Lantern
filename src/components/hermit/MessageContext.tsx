"use client";

import { Icon } from "@iconify/react";
import type { HermitMessageContext } from "@/lib/hermit/conversation-contract";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { formatHermitFileSize, type HermitDocumentRecommendation } from "./types";
import { sameContextResource, type ContextRemoval } from "./message-context";
import styles from "./hermit-v3.module.css";

export function MessageContext({ context, active, disabled, onOpenDocument, onRemove }: {
  context: HermitMessageContext | null;
  active?: HermitMessageContext;
  disabled?: boolean;
  onOpenDocument?: (document: HermitDocumentRecommendation) => void;
  onRemove?: (item: ContextRemoval) => void;
}) {
  if (!context) return null;
  const items = [
    ...context.attachments.map(file => ({ key: `file:${file.id}`, name: file.name, detail: formatHermitFileSize(file.size),
      icon: lighthouseIcons.document, document: undefined as HermitDocumentRecommendation | undefined,
      active: active?.attachments.some(item => item.id === file.id), removal: { kind: "attachment", id: file.id } as ContextRemoval })),
    ...(["document", "skill"] as const).flatMap(kind => {
      const document = kind === "document" ? context.documentContext : context.skillContext;
      const current = kind === "document" ? active?.documentContext : active?.skillContext;
      return document ? [{ key: `${kind}:${document.resourceId}:${document.versionId}`, name: document.title,
        detail: kind === "skill" ? "使用技能" : "知识文档", icon: kind === "skill" ? lighthouseIcons.hermit : lighthouseIcons.document,
        document: { ...document, id: `${kind}:${document.resourceId}:${document.versionId}` }, active: sameContextResource(document, current),
        removal: { kind, resourceId: document.resourceId, versionId: document.versionId } as ContextRemoval }] : [];
    }),
  ];
  if (!items.length) return null;
  return <ul className={styles.messageContext} aria-label="本条消息引用的材料">
    {items.map(item => <li key={item.key} className={styles.messageContextCard}>
      {item.document && onOpenDocument ? <button type="button" className={styles.messageContextContent}
        aria-label={`查看引用材料：${item.name}`} onClick={() => onOpenDocument(item.document!)}>
        <Icon icon={item.icon} aria-hidden="true" /><span><strong title={item.name}>{item.name}</strong><small>{item.detail}</small></span>
      </button> : <div className={styles.messageContextContent}>
        <Icon icon={item.icon} aria-hidden="true" /><span><strong title={item.name}>{item.name}</strong><small>{item.detail}</small></span>
      </div>}
      {item.active && onRemove && <button type="button" className={styles.messageContextRemove} disabled={disabled}
        title="停止在后续回答中引用，保留这条消息的记录" aria-label={`移除后续引用 ${item.name}`} onClick={() => onRemove(item.removal)}>
        <Icon icon={lighthouseIcons.close} aria-hidden="true" />
      </button>}
    </li>)}
  </ul>;
}
