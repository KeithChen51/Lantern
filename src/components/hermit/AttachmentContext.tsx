"use client";

import { Icon } from "@iconify/react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { formatHermitFileSize, type HermitAttachment, type HermitDocumentRecommendation } from "./types";
import styles from "./hermit-v3.module.css";

export function AttachmentContext({ attachments, documentContext, skillContext, isUploading, onRemove, onRetry, onClearDocument, onClearSkill, variant = "context" }: {
  attachments: HermitAttachment[]; documentContext?: HermitDocumentRecommendation | null; isUploading: boolean;
  onRemove: (attachment: HermitAttachment) => void; onRetry: (attachment: HermitAttachment) => void; onClearDocument: () => void;
  variant?: "pending" | "context";
  skillContext?: HermitDocumentRecommendation | null; onClearSkill?: () => void;
}) {
  const visibleAttachments = variant === "pending" ? attachments.filter(attachment => !attachment.sent) : [];
  return <>
    {variant === "context" && (documentContext || skillContext) && <div className={styles.contextSelections}>
    {documentContext && <div className={styles.selectedDocument} aria-label={`当前引用文档：${documentContext.title}`}>
      <Icon icon={lighthouseIcons.document} aria-hidden="true" /><span title={documentContext.title}>引用：{documentContext.title}</span>
      <button type="button" onClick={onClearDocument} aria-label="取消引用当前文档"><Icon icon={lighthouseIcons.close} aria-hidden="true" /></button>
    </div>}
    {skillContext && <div className={styles.selectedDocument} aria-label={`当前技能：${skillContext.title}`}>
      <Icon icon={lighthouseIcons.hermit} aria-hidden="true" /><span title={skillContext.title}>技能：{skillContext.title}</span>
      <button type="button" onClick={onClearSkill} aria-label="移除当前技能"><Icon icon={lighthouseIcons.close} aria-hidden="true" /></button>
    </div>}
    </div>}
    {visibleAttachments.length > 0 && <ul className={variant === "pending" ? styles.attachmentTiles : styles.attachmentList} aria-label={variant === "pending" ? "待发送附件" : "当前附件上下文"}>
      {visibleAttachments.map(attachment => <li key={attachment.localId} className={variant === "pending" ? styles.attachmentTile : styles.attachmentChip} data-status={attachment.status} data-sent={attachment.sent ? "true" : undefined}>
        <span className={styles.attachmentIcon} aria-hidden="true"><Icon icon={lighthouseIcons.document} /></span>
        <span className={styles.attachmentName} title={attachment.name}>{attachment.name}</span>
        <span className={styles.attachmentState} title={attachment.error}>{attachment.status === "uploading" ? "读取中" : attachment.status === "error" ? "上传失败" : attachment.sent ? "已引用" : formatHermitFileSize(attachment.size)}</span>
        {attachment.status === "error" && attachment.file && <button type="button" className={styles.attachmentRetry} onClick={() => onRetry(attachment)} disabled={isUploading} aria-label={`重试上传 ${attachment.name}`}><Icon icon={lighthouseIcons.refresh} aria-hidden="true" /></button>}
        <button type="button" className={styles.attachmentRemove} onClick={() => onRemove(attachment)} aria-label={attachment.status === "uploading" ? `取消上传 ${attachment.name}` : attachment.sent ? `移除后续引用 ${attachment.name}` : `移除附件 ${attachment.name}`}><Icon icon={lighthouseIcons.close} aria-hidden="true" /></button>
      </li>)}
    </ul>}
  </>;
}
