"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from "react";
import { LhChatInputShell, LhChatSubmitButton, LhChatTextarea } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import styles from "./hermit-v3.module.css";
import { AttachmentContext } from "./AttachmentContext";
import { AddContentMenu } from "./AddContentMenu";
import { type HermitAttachment, type HermitDocumentRecommendation } from "./types";

interface ChatInputProps {
  value: string;
  focusKey?: number;
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
  onSelectDocument?: (document: HermitDocumentRecommendation) => void;
  skillContext?: HermitDocumentRecommendation | null;
  onSelectSkill?: (skill: HermitDocumentRecommendation) => void;
  onClearSkillContext?: () => void;
}

type ChatInputFocusOrigin = "none" | "pointer" | "keyboard";

export function ChatInput({
  value,
  focusKey,
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
  onSelectDocument,
  skillContext,
  onSelectSkill,
  onClearSkillContext,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const focusIntentRef = useRef<Exclude<ChatInputFocusOrigin, "none">>("keyboard");
  const [focusOrigin, setFocusOrigin] = useState<ChatInputFocusOrigin>("none");
  const hasPendingAttachment = attachments.some((attachment) => attachment.status !== "ready");
  const canSubmit = Boolean(value.trim()) && !isLoading && !hasPendingAttachment;

  useEffect(() => { if (focusKey) textareaRef.current?.focus(); }, [focusKey]);

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

  const contextProps = { attachments, documentContext, skillContext, isUploading, onRemove: onRemoveAttachment, onRetry: onRetryAttachment, onClearDocument: onClearDocumentContext, onClearSkill: onClearSkillContext };
  return (<>
    <AttachmentContext {...contextProps} variant="pending" />
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
      <AttachmentContext {...contextProps} />

      <div data-lh-chat-input-grid>
        <label data-lh-chat-input-label>
          <span className="sr-only">向路引提问</span>
          <LhChatTextarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={documentContext ? "围绕当前文档继续提问…" : "描述你的问题，或上传材料一起分析…"}
            rows={1}
          />
        </label>
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
          <AddContentMenu disabled={isLoading || isUploading} onLocalFile={() => fileInputRef.current?.click()}
            documentId={documentContext?.resourceId} skillId={skillContext?.resourceId}
            onDocument={onSelectDocument ? document => { onSelectDocument(document); textareaRef.current?.focus(); } : undefined}
            onSkill={onSelectSkill ? skill => { onSelectSkill(skill); textareaRef.current?.focus(); } : undefined} />
        </div>
        <div className={styles.inputToolsRight}>

          <LhChatSubmitButton
            type={isLoading ? "button" : "submit"}
            onClick={isLoading ? event => {
              // Stopping can synchronously turn this same node into a submit
              // button. Cancel the click default before that state transition.
              event.preventDefault();
              onStop();
            } : undefined}
            disabled={isLoading ? false : !canSubmit}
            aria-label={isLoading ? "停止生成" : hasPendingAttachment ? "等待附件读取完成" : "发送"}
            title={isLoading ? "停止生成" : hasPendingAttachment ? "等待附件读取完成" : "发送"}
          >
            {isLoading ? (
              <span data-lh-chat-submit-icon className={styles.stopGlyph} aria-hidden="true">■</span>
            ) : (
              <>
                <Icon icon={lighthouseIcons.arrowUp} className={styles.sendArrow} aria-hidden="true" />
              </>
            )}
          </LhChatSubmitButton>
        </div>
      </div>
      {uploadError && <p className={styles.inputError} role="alert">{uploadError}</p>}
      {hasPendingAttachment && !uploadError && <span className={styles.inputHint} role="status">附件准备好后即可发送</span>}
    </LhChatInputShell></>
  );
}
