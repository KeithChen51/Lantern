"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from "react";
import { LhChatInputShell, LhChatSubmitButton, LhChatTextarea } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import styles from "./hermit.module.css";
import { formatHermitFileSize, type HermitAttachment, type HermitDocumentRecommendation } from "./types";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isLoading: boolean;
  isUploading: boolean;
  attachments: HermitAttachment[];
  onFilesSelected: (files: FileList | null) => void;
  onRemoveAttachment: (attachment: HermitAttachment) => void;
  onRetryAttachment: (attachment: HermitAttachment) => void;
  uploadError?: string | null;
  documentContext?: HermitDocumentRecommendation | null;
  onClearDocumentContext: () => void;
}

type ChatInputFocusOrigin = "none" | "pointer" | "keyboard";

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  isUploading,
  attachments,
  onFilesSelected,
  onRemoveAttachment,
  onRetryAttachment,
  uploadError,
  documentContext,
  onClearDocumentContext,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const focusIntentRef = useRef<Exclude<ChatInputFocusOrigin, "none">>("keyboard");
  const [focusOrigin, setFocusOrigin] = useState<ChatInputFocusOrigin>("none");
  const hasPendingAttachment = attachments.some((attachment) => attachment.status !== "ready");
  const canSubmit = Boolean(value.trim()) && !isLoading && !hasPendingAttachment;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 156)}px`;
    }
  }, [value]);

  useEffect(() => {
    function handlePointerIntent() {
      focusIntentRef.current = "pointer";
    }

    function handleKeyboardIntent(event: globalThis.KeyboardEvent) {
      if (event.key === "Tab") focusIntentRef.current = "keyboard";
    }

    window.addEventListener("pointerdown", handlePointerIntent, true);
    window.addEventListener("keydown", handleKeyboardIntent, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerIntent, true);
      window.removeEventListener("keydown", handleKeyboardIntent, true);
    };
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  function handleShellKeyDownCapture(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Tab") focusIntentRef.current = "keyboard";
  }

  function handleShellFocusCapture(event: FocusEvent<HTMLFormElement>) {
    if (event.target instanceof HTMLTextAreaElement) setFocusOrigin(focusIntentRef.current);
  }

  function handleShellBlurCapture(event: FocusEvent<HTMLFormElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setFocusOrigin("none");
  }

  return (
    <LhChatInputShell
      onDragOver={(event) => { event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); if (!isLoading && !isUploading) onFilesSelected(event.dataTransfer.files); }}
      data-lh-focus-origin={focusOrigin === "none" ? undefined : focusOrigin}
      onSubmit={handleSubmit}
      onPointerDownCapture={() => {
        focusIntentRef.current = "pointer";
      }}
      onKeyDownCapture={handleShellKeyDownCapture}
      onFocusCapture={handleShellFocusCapture}
      onBlurCapture={handleShellBlurCapture}
    >
      {documentContext && (
        <div className={styles.selectedDocument} aria-label={`当前引用文档：${documentContext.title}`}>
          <Icon icon={lighthouseIcons.document} aria-hidden="true" />
          <span>引用：{documentContext.title}</span>
          <button type="button" onClick={onClearDocumentContext} aria-label="取消引用当前文档" title="取消引用">
            <Icon icon={lighthouseIcons.close} aria-hidden="true" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <ul className={styles.attachmentList} aria-label="当前附件">
          {attachments.map((attachment) => (
            <li key={attachment.localId} className={styles.attachmentChip} data-status={attachment.status} data-sent={attachment.sent ? "true" : undefined}>
              <span className={styles.attachmentIcon} aria-hidden="true"><Icon icon={lighthouseIcons.document} /></span>
              <span className={styles.attachmentName} title={attachment.name}>{attachment.name}</span>
              <span className={styles.attachmentState}>
                {attachment.status === "uploading" && "读取中"}
                {attachment.status === "ready" && (attachment.sent ? "已引用" : formatHermitFileSize(attachment.size))}
                {attachment.status === "error" && (attachment.error ?? "失败")}
              </span>
              {attachment.status === "error" && attachment.file && (
                <button type="button" className={styles.attachmentRetry} onClick={() => onRetryAttachment(attachment)} disabled={isUploading} aria-label={`重试上传 ${attachment.name}`} title="重试上传">
                  <Icon icon={lighthouseIcons.refresh} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className={styles.attachmentRemove}
                onClick={() => onRemoveAttachment(attachment)}
                aria-label={attachment.sent ? `移除后续引用 ${attachment.name}` : `移除 ${attachment.name}`}
                title={attachment.sent ? "移除后续引用" : "移除附件"}
              >
                <Icon icon={lighthouseIcons.close} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div data-lh-chat-input-grid>
        <label data-lh-chat-input-label>
          <span className="sr-only">向路引提问</span>
          <LhChatTextarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={documentContext ? "围绕当前文档继续提问…" : "描述客户状态、现场限制和需要判断的问题"}
            disabled={isLoading}
            rows={1}
          />
        </label>
        <LhChatSubmitButton
          type={isLoading ? "button" : "submit"}
          onClick={isLoading ? onStop : undefined}
          disabled={isLoading ? false : !canSubmit}
          aria-label={isLoading ? "停止生成" : hasPendingAttachment ? "等待附件读取完成" : "发送"}
          title={isLoading ? "停止生成" : hasPendingAttachment ? "等待附件读取完成" : "发送"}
        >
          {isLoading ? (
            <span data-lh-chat-submit-icon className={styles.stopGlyph} aria-hidden="true">■</span>
          ) : (
            <Icon data-lh-chat-submit-icon icon={lighthouseIcons.send} />
          )}
        </LhChatSubmitButton>
      </div>

      <div className={styles.inputTools}>
        <div className={styles.inputToolsLeft}>
          <input
            ref={fileInputRef}
            className={styles.uploadInput}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(event) => {
              onFilesSelected(event.target.files);
              event.currentTarget.value = "";
            }}
            disabled={isLoading || isUploading}
            tabIndex={-1}
          />
          <button type="button" className={styles.uploadButton} onClick={() => fileInputRef.current?.click()} disabled={isLoading || isUploading}>
            <Icon icon={lighthouseIcons.publish} aria-hidden="true" />
            上传文件
          </button>
          <span className={`${styles.inputHint} ${uploadError ? styles.inputHintError : ""}`} role={uploadError ? "alert" : undefined}>
            {uploadError ?? "支持 PDF、DOCX、TXT、Markdown · 每个 10 MB，最多 5 个"}
          </span>
        </div>
        {hasPendingAttachment && !uploadError && <span className={styles.inputHint}>附件准备好后即可发送</span>}
      </div>
    </LhChatInputShell>
  );
}
