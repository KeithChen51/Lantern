"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { Icon } from "@iconify/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { LhButton, LhStatusBadge, LhSuggestionList } from "@/components/ui/lighthouse-primitives";
import { useLhReducedMotion } from "@/hooks/use-lighthouse-motion";
import { ChatInput } from "./ChatInput";
import { DocumentReader } from "./DocumentReader";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import styles from "./hermit-v3.module.css";
import { authFetch } from "@/components/auth/auth-fetch";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import { HermitUploadScope, hermitUploadOwner } from "./upload-scope";
import {
  getDocumentRecommendations,
  getHermitApiError,
  getTextContent,
  isSupportedHermitFile,
  type HermitAttachment,
  type HermitDocumentContext,
  type HermitDocumentRecommendation,
} from "./types";

const SUGGESTED_QUESTIONS = [
  "交车时间未定，客户持续追问",
  "客户诉求与门店成本冲突",
  "客户情绪升高，先稳住第一句话",
];

const MAX_ATTACHMENTS_PER_CONVERSATION = 5;

function getConversationTitle(messages: UIMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const text = firstUserMessage ? getTextContent(firstUserMessage).trim() : "";
  if (!text) return "当前服务场景";
  return text.length > 34 ? `${text.slice(0, 34)}…` : text;
}

function isVisibleMessage(message: UIMessage) {
  return message.role !== "assistant" || getTextContent(message).trim().length > 0 || getDocumentRecommendations(message).length > 0;
}

function shouldShowThinkingIndicator(messages: UIMessage[], isLoading: boolean) {
  if (!isLoading) return false;

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return true;
  if (lastMessage.role !== "assistant") return true;

  return getTextContent(lastMessage).trim().length === 0 && getDocumentRecommendations(lastMessage).length === 0;
}

function getErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : error;
  if (typeof raw === "string" && /network|fetch failed|failed to fetch/i.test(raw)) return "网络暂时不可用，请检查连接后重试。";
  return getHermitApiError(raw, "这次请求没有完成，请重试。");
}

function createLocalAttachmentId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
}

export function ChatPanel() {
  const uploadOwner = hermitUploadOwner(useEmployeeSession());
  const uploadOwnerRef = useRef(uploadOwner);
  const uploadScopeRef = useRef<HermitUploadScope | null>(null);
  useLayoutEffect(() => {
    uploadOwnerRef.current = uploadOwner;
    const scope = new HermitUploadScope(uploadOwner, () => uploadOwnerRef.current);
    uploadScopeRef.current = scope;
    return () => { scope.dispose(); };
  }, [uploadOwner]);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", fetch: authFetch }), []);
  const pendingTextRef = useRef<string | null>(null);
  const pendingBodyRef = useRef<{ attachmentIds: string[]; documentContext?: HermitDocumentContext }>({ attachmentIds: [] });
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const uploadQueueLengthRef = useRef(0);
  const canceledUploadIdsRef = useRef(new Set<string>());
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<HermitAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [readerDocument, setReaderDocument] = useState<HermitDocumentRecommendation | null>(null);
  const [documentContext, setDocumentContext] = useState<HermitDocumentRecommendation | null>(null);
  const [wasAborted, setWasAborted] = useState(false);
  const followLatestRef = useRef(true);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useLhReducedMotion();
  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    clearError,
    status,
    error,
  } = useChat({
    transport,
    onError: (chatError) => {
      setRequestError(getErrorMessage(chatError));
      const pendingText = pendingTextRef.current;
      if (pendingText) setInput((current) => current || pendingText);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;
  const conversationTitle = getConversationTitle(messages);
  const visibleMessages = messages.filter(isVisibleMessage);
  const showThinkingIndicator = shouldShowThinkingIndicator(messages, isLoading);
  const displayedError = requestError ?? (error ? "这次请求没有完成，请重试。" : null);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const element = scrollRef.current;
    if (element && (hasMessages || isLoading) && followLatestRef.current) {
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
    } else if (element && !followLatestRef.current && isLoading) {
      setHasUnreadMessages(true);
    }
  }, [hasMessages, isLoading, messages, status]);

  async function uploadAttachment(file: File, localId: string, scope: HermitUploadScope) {
    scope.assertActive();
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await authFetch("/api/hermit/attachments", { method: "POST", body: formData, signal: scope.signal });
      scope.assertActive();
      const responseText = await response.text();
      scope.assertActive();
      let payload: unknown = responseText;
      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch {
        // Keep the plain text body for the short actionable error extractor.
      }
      if (!response.ok || !payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string") {
        throw new Error(getHermitApiError(payload, "文件上传失败，请重试。"));
      }

      const data = payload as { id: string; name?: unknown; size?: unknown; status?: unknown };
      if (data.status !== "ready") throw new Error(getHermitApiError(payload, "文件暂时无法读取，请重试。"));
      if (canceledUploadIdsRef.current.delete(localId)) {
        await deleteServerAttachment(data.id, scope);
        return;
      }
      setAttachments((current) => current.map((attachment) => (
        attachment.localId === localId
          ? {
              ...attachment,
              id: data.id,
              name: typeof data.name === "string" ? data.name : attachment.name,
              size: typeof data.size === "number" ? data.size : attachment.size,
              status: "ready",
              sent: false,
              error: undefined,
            }
          : attachment
      )));
    } catch (error) {
      if (!scope.active) return;
      const message = getHermitApiError(error, "有文件未能上传，请重试或移除后继续。");
      setAttachments((current) => current.map((attachment) => (
        attachment.localId === localId ? { ...attachment, status: "error", error: message } : attachment
      )));
      setUploadError(message);
    }
  }

  async function uploadSelectedFiles(files: File[], availableSlots: number, scope: HermitUploadScope) {
    await scope.forEach(files.slice(0, availableSlots), async file => {
      if (!isSupportedHermitFile(file)) {
        setUploadError(`${file.name} 暂不支持。请选择 PDF、Word、TXT 或 Markdown 文件。`);
        return;
      }

      const localId = createLocalAttachmentId(file);
      setAttachments((current) => [...current, { localId, name: file.name, size: file.size, status: "uploading", file }]);
      await uploadAttachment(file, localId, scope);
    });
  }

  function enqueueUpload(task: (scope: HermitUploadScope) => Promise<void>) {
    const scope = uploadScopeRef.current;
    if (!scope?.active) return;
    uploadQueueLengthRef.current += 1;
    setIsUploadingAttachments(true);

    const run = async () => {
      try {
        scope.assertActive();
        await task(scope);
      } finally {
        uploadQueueLengthRef.current -= 1;
        if (scope.active && uploadQueueLengthRef.current === 0) setIsUploadingAttachments(false);
      }
    };

    const next = uploadQueueRef.current.then(run, run);
    uploadQueueRef.current = next.catch(() => undefined);
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    if (isUploadingAttachments || uploadQueueLengthRef.current > 0) return;
    setUploadError(null);

    const availableSlots = Math.max(0, MAX_ATTACHMENTS_PER_CONVERSATION - attachments.length);
    if (availableSlots === 0) {
      setUploadError("本次对话最多保留 5 个附件。");
      return;
    }

    if (files.length > availableSlots) setUploadError("本次对话最多保留 5 个附件，其他文件未加入。");
    const selectedFiles = Array.from(files);
    enqueueUpload(scope => uploadSelectedFiles(selectedFiles, availableSlots, scope));
  }

  async function handleRemoveAttachment(attachment: HermitAttachment) {
    if (attachment.status === "uploading") canceledUploadIdsRef.current.add(attachment.localId);
    setAttachments((current) => current.filter((item) => item.localId !== attachment.localId));
    if (!attachment.id) return;

    const scope = uploadScopeRef.current;
    if (scope?.active) await deleteServerAttachment(attachment.id, scope);
  }

  async function deleteServerAttachment(id: string, scope: HermitUploadScope) {
    try {
      scope.assertActive();
      await authFetch("/api/hermit/attachments", {
        method: "DELETE",
        signal: scope.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // The local removal still gives the user control; the server can clean up expired attachments.
    }
  }

  function handleRetryAttachment(attachment: HermitAttachment) {
    if (!attachment.file) return;
    setUploadError(null);
    setAttachments((current) => current.map((item) => (
      item.localId === attachment.localId ? { ...item, status: "uploading", error: undefined } : item
    )));
    enqueueUpload(scope => uploadAttachment(attachment.file as File, attachment.localId, scope));
  }

  async function submitText(rawText: string) {
    const text = rawText.trim();
    const readyAttachments = attachments.filter((attachment) => attachment.status === "ready" && attachment.id).slice(0, MAX_ATTACHMENTS_PER_CONVERSATION);
    if (!text || isLoading || attachments.some((attachment) => attachment.status !== "ready")) return;

    const body = {
      attachmentIds: readyAttachments.map((attachment) => attachment.id as string),
      ...(documentContext ? { documentContext: { resourceId: documentContext.resourceId, versionId: documentContext.versionId } } : {}),
    };
    followLatestRef.current = true;
    setHasUnreadMessages(false);
    pendingTextRef.current = text;
    pendingBodyRef.current = body;
    setInput("");
    setRequestError(null);
    setWasAborted(false);
    clearError();

    try {
      await sendMessage({ text }, { body });
      setAttachments((current) => current.map((attachment) => (
        attachment.id && body.attachmentIds.includes(attachment.id) ? { ...attachment, sent: true } : attachment
      )));
      pendingTextRef.current = null;
    } catch (submitError) {
      setInput((current) => current || text);
      setRequestError(getErrorMessage(submitError));
    }
  }

  function handleSubmit() {
    void submitText(input);
  }

  function handleSuggestedQuestion(question: string) {
    if (isLoading) return;
    void submitText(question);
  }

  function handleStop() {
    if (!isLoading) return;
    setWasAborted(true);
    stop();
  }

  function handleRetry() {
    if (isLoading) return;
    setWasAborted(false);
    setRequestError(null);
    clearError();
    void regenerate({ body: pendingBodyRef.current }).catch((regenerateError) => {
      setRequestError(getErrorMessage(regenerateError));
      const pendingText = pendingTextRef.current;
      if (pendingText) setInput((current) => current || pendingText);
    });
  }

  function handleUseDocument(document: HermitDocumentRecommendation) {
    setDocumentContext(document);
    setReaderDocument(null);
  }

  if (!hasMessages) {
    return (
      <EmptyChatStart
        input={input}
        isLoading={isLoading}
        isUploading={isUploadingAttachments}
        attachments={attachments}
        uploadError={uploadError ?? displayedError}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onStop={handleStop}
        onFilesSelected={handleFilesSelected}
        onRemoveAttachment={handleRemoveAttachment}
        onRetryAttachment={handleRetryAttachment}
        onSuggestedQuestion={handleSuggestedQuestion}
        documentContext={documentContext}
        onClearDocumentContext={() => setDocumentContext(null)}
      />
    );
  }

  return (
    <div className={`${styles.chatLayout} ${readerDocument ? styles.chatLayoutWithReader : ""}`} data-lh-hermit-layout>
      <section className={styles.conversation} data-lh-hermit-conversation aria-label="路引当前对话">
        <div className={styles.conversationStatus} aria-live="polite">
          <span className={styles.visuallyHidden}>{conversationTitle}</span>
          <LhStatusBadge tone={isLoading ? "warning" : displayedError ? "danger" : "neutral"}>
            {isLoading ? "生成中" : displayedError ? "需要重试" : "可追问"}
          </LhStatusBadge>
        </div>

        <div data-lh-hermit-main ref={scrollRef} tabIndex={0} role="region" aria-label="对话消息" onScroll={(event) => {
          const element = event.currentTarget;
          followLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          if (followLatestRef.current) setHasUnreadMessages(false);
        }}>
          <div data-lh-chat-scroll-content>
            {displayedError && (
              <div className={styles.requestError} role="alert">
                <p>{displayedError}</p>
                <LhButton type="button" size="sm" variant="danger" className={styles.requestRetry} onClick={handleRetry} icon={<Icon icon={lighthouseIcons.refresh} aria-hidden="true" />}>
                  重试
                </LhButton>
              </div>
            )}
            {visibleMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onOpenDocument={setReaderDocument}
                showRecommendations={message.id !== lastMessageId || (!isLoading && !displayedError && !wasAborted)}
              />
            ))}
            {showThinkingIndicator && <TypingIndicator label="思考中" />}
          </div>
        </div>

        <footer data-lh-hermit-footer>
          {hasUnreadMessages && <button type="button" className={styles.newMessages} onClick={() => {
            followLatestRef.current = true;
            setHasUnreadMessages(false);
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
          }}>查看最新回复 ↓</button>}
          <div data-lh-hermit-composer>
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              onStop={handleStop}
              isLoading={isLoading}
              isUploading={isUploadingAttachments}
              attachments={attachments}
              onFilesSelected={handleFilesSelected}
              onRemoveAttachment={handleRemoveAttachment}
              onRetryAttachment={handleRetryAttachment}
              uploadError={uploadError}
              documentContext={documentContext}
              onClearDocumentContext={() => setDocumentContext(null)}
            />
          </div>
        </footer>
      </section>

      {readerDocument && <DocumentReader document={readerDocument} onClose={() => setReaderDocument(null)} onUse={handleUseDocument} />}
    </div>
  );
}

interface EmptyChatStartProps {
  input: string;
  isLoading: boolean;
  isUploading: boolean;
  attachments: HermitAttachment[];
  uploadError: string | null;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onFilesSelected: (files: FileList | null) => void;
  onRemoveAttachment: (attachment: HermitAttachment) => void;
  onRetryAttachment: (attachment: HermitAttachment) => void;
  onSuggestedQuestion: (question: string) => void;
  documentContext: HermitDocumentRecommendation | null;
  onClearDocumentContext: () => void;
}

function EmptyChatStart({
  input,
  isLoading,
  isUploading,
  attachments,
  uploadError,
  onInputChange,
  onSubmit,
  onStop,
  onFilesSelected,
  onRemoveAttachment,
  onRetryAttachment,
  onSuggestedQuestion,
  documentContext,
  onClearDocumentContext,
}: EmptyChatStartProps) {
  return (
    <section data-lh-hermit-start aria-labelledby="hermit-start-title">
      <div data-lh-hermit-start-inner>
        <div className={styles.startCopy}>
          <h2 id="hermit-start-title" data-lh-hermit-start-title>把现场的难题，一起理清。</h2>
          <p>说说发生了什么，也可以上传相关文件。路引会结合灯塔知识，帮助你形成下一步判断。</p>
        </div>
        <div data-lh-hermit-start-examples>
          <LhSuggestionList
            label="可直接提问"
            questions={SUGGESTED_QUESTIONS}
            disabled={isLoading}
            hideLabel
            onSelect={onSuggestedQuestion}
          />
        </div>
        <div data-lh-hermit-start-input>
          <ChatInput
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            onStop={onStop}
            isLoading={isLoading}
            isUploading={isUploading}
            attachments={attachments}
            onFilesSelected={onFilesSelected}
            onRemoveAttachment={onRemoveAttachment}
            onRetryAttachment={onRetryAttachment}
            uploadError={uploadError}
            documentContext={documentContext}
            onClearDocumentContext={onClearDocumentContext}
          />
        </div>
        <p className={styles.startFootnote}>回答供参考，请结合现场情况判断。</p>
      </div>
    </section>
  );
}
