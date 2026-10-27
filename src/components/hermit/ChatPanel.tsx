"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLhReducedMotion } from "@/hooks/use-lighthouse-motion";
import { authFetch } from "@/components/auth/auth-fetch";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import { ChatInput } from "./ChatInput";
import { DocumentReader } from "./DocumentReader";
import { MessageBubble } from "./MessageBubble";
import { HermitIdentity } from "./HermitIdentity";
import { ConversationHeader } from "./ConversationHeader";
import { ScenarioCards } from "./ScenarioCards";
import { RunFeedback } from "./RunFeedback";
import { HistoryDrawer, readConversation, useConversationHistory } from "./ConversationHistory";
import { ConversationReadScope, conversationTitle, messageRunState, restoredContext, markTerminalState, type ConversationDetail } from "./conversation-state";
import { hermitUploadOwner } from "./upload-scope";
import { useHermitAttachments } from "./useHermitAttachments";
import { getDocumentRecommendations, getHermitApiError, getTextContent, type HermitDocumentContext, type HermitDocumentRecommendation } from "./types";
import styles from "./hermit-v3.module.css";

function getErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : error;
  if (typeof raw === "string" && /network|fetch failed|failed to fetch/i.test(raw)) return "网络暂时不可用，请检查连接后重试。";
  return getHermitApiError(raw, "这次请求没有完成，请重试。");
}

export function ChatPanel() {
  const session = useEmployeeSession();
  const owner = hermitUploadOwner(session);
  return <HermitSessionWorkspace key={owner} owner={owner} guest={!session || session.kind === "guest"} />;
}

function HermitSessionWorkspace({ owner, guest }: { owner: string | null; guest: boolean }) {
  const [selection, setSelection] = useState<{ id: string; detail?: ConversationDetail; revision: number; focus?: boolean }>(() => ({ id: crypto.randomUUID(), revision: 0 }));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const detailId = useRef<string | null>(null);
  const detailScope = useRef(new ConversationReadScope());
  const history = useConversationHistory(!guest);
  useEffect(() => { const scope = detailScope.current; return () => scope.dispose(); }, []);

  function newConversation() {
    detailScope.current.dispose();
    setDetailLoading(false); setDetailError(null); setHistoryOpen(false);
    setSelection(previous => ({ id: crypto.randomUUID(), revision: previous.revision + 1, focus: true }));
  }
  async function selectConversation(id: string) {
    const request = detailScope.current.begin();
    detailId.current = id; setDetailLoading(true); setDetailError(null);
    try {
      const detail = await readConversation(id, request.signal);
      if (!request.current()) return;
      setSelection(previous => ({ id: detail.id, detail, revision: previous.revision + 1, focus: true }));
      setHistoryOpen(false);
    } catch (error) { if (request.current()) setDetailError(error instanceof Error ? error.message : "暂时无法打开对话，请重试。"); }
    finally { if (request.current()) setDetailLoading(false); }
  }
  return <>
    <ConversationWorkspace key={`${selection.id}:${selection.revision}`} id={selection.id} owner={owner} initial={selection.detail} focusOnMount={selection.focus} focusRequest={focusRequest}
      onNew={newConversation} onHistory={() => { setHistoryOpen(true); void history.load(); }} onSaved={() => { void history.load(); }} />
    <HistoryDrawer open={historyOpen} guest={guest} {...history} activeId={selection.id} detailLoading={detailLoading} detailError={detailError}
      onClose={() => { setHistoryOpen(false); detailScope.current.dispose(); setDetailLoading(false); }} onNew={newConversation}
      onFocusConversation={() => setFocusRequest(request => request + 1)}
      onSelect={id => { void selectConversation(id); }} onRetryDetail={() => { if (detailId.current) void selectConversation(detailId.current); }} onLoad={cursor => { void history.load(cursor); }} />
  </>;
}

interface ConversationWorkspaceProps { id: string; owner: string | null; initial?: ConversationDetail; focusOnMount?: boolean; focusRequest?: number; onNew: () => void; onHistory: () => void; onSaved: () => void }
export function ConversationWorkspace({ id, owner, initial, focusOnMount, focusRequest = 0, onNew, onHistory, onSaved }: ConversationWorkspaceProps) {
  const { attachments, setAttachments, uploadError, isUploadingAttachments, handleFilesSelected, handleRemoveAttachment, handleRetryAttachment, uploadScopeRef } = useHermitAttachments(owner, initial);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", fetch: authFetch }), []);
  const [input, setInput] = useState("");
  const [focusKey, setFocusKey] = useState(focusOnMount ? 1 : 0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [readerDocument, setReaderDocument] = useState<HermitDocumentRecommendation | null>(null);
  const [documentContext, setDocumentContext] = useState<HermitDocumentRecommendation | null>(() => restoredContext(initial));
  const [skillContext, setSkillContext] = useState<HermitDocumentRecommendation | null>(() => initial?.skillContext ? { id: `skill:${initial.skillContext.resourceId}`, ...initial.skillContext } : null);
  const pendingBodyRef = useRef<{ attachmentIds: string[]; documentContext?: HermitDocumentContext }>({ attachmentIds: attachments.flatMap(item => item.id ? [item.id] : []), ...(documentContext ? { documentContext: { resourceId: documentContext.resourceId, versionId: documentContext.versionId } } : {}) });
  const followLatestRef = useRef(true);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useLhReducedMotion();
  const { messages, setMessages, sendMessage, regenerate, stop, clearError, status, error } = useChat({
    id, transport, messages: initial?.messages,
    onData: part => {
      if (!uploadScopeRef.current?.active || part.type !== "data-hermit-progress") return;
      const data = part.data as { label?: unknown };
      if (typeof data?.label === "string") setProgress(data.label);
    },
    onError: chatError => {
      if (!uploadScopeRef.current?.active) return;
      setRequestError(getErrorMessage(chatError));
      setMessages(current => markTerminalState(current, "failed"));
    },
    onFinish: ({ isAbort, isError }) => {
      if (!uploadScopeRef.current?.active) return;
      if (isAbort || isError) setMessages(current => markTerminalState(current, isAbort ? "cancelled" : "failed"));
      onSaved();
    },
  });
  useEffect(() => () => { void stop(); }, [stop]);

  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;
  const title = conversationTitle(messages, initial?.title);
  const displayedError = requestError ?? (error ? "这次请求没有完成，请重试。" : null);
  const lastMessage = messages[messages.length - 1];
  const lastState = messageRunState(lastMessage);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && hasMessages && followLatestRef.current) element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
  }, [hasMessages, isLoading, messages]);

  async function submitText() {
    const text = input.trim();
    if (!text || isLoading || attachments.some(item => item.status !== "ready")) return;
    const body = { attachmentIds: attachments.flatMap(item => item.id ? [item.id] : []), ...(documentContext ? { documentContext: { resourceId: documentContext.resourceId, versionId: documentContext.versionId } } : {}), ...(skillContext ? { skillContext: { resourceId: skillContext.resourceId, versionId: skillContext.versionId } } : {}) };
    const scope = uploadScopeRef.current;
    pendingBodyRef.current = body;
    followLatestRef.current = true; setHasUnreadMessages(false);
    setInput(""); setRequestError(null); setProgress(null); setWasCancelled(false); clearError();
    setAttachments(current => current.map(item => item.id && body.attachmentIds.includes(item.id) ? { ...item, sent: true } : item));
    try {
      await sendMessage({ text }, { body });
    } catch (error) { if (scope?.active) { setRequestError(getErrorMessage(error)); setMessages(current => markTerminalState(current, "failed")); } }
  }
  function handleRetry() {
    if (isLoading) return;
    const scope = uploadScopeRef.current;
    setRequestError(null); setProgress(null); setWasCancelled(false); clearError();
    // Removed or expired attachments must never re-enter a request through retry.
    const readyIds = new Set(attachments.flatMap(item => item.status === "ready" && item.id ? [item.id] : []));
    const body = { ...pendingBodyRef.current, attachmentIds: pendingBodyRef.current.attachmentIds.filter(id => readyIds.has(id)), ...(documentContext ? { documentContext: { resourceId: documentContext.resourceId, versionId: documentContext.versionId } } : { documentContext: undefined }), ...(skillContext ? { skillContext: { resourceId: skillContext.resourceId, versionId: skillContext.versionId } } : { skillContext: undefined }) };
    void regenerate({ body }).catch(error => { if (scope?.active) { setRequestError(getErrorMessage(error)); setMessages(current => markTerminalState(current, "failed")); } });
  }
  function handleStop() { if (isLoading) { setWasCancelled(true); void stop(); } }
  const inputProps = { value: input, focusKey: focusKey + focusRequest, onChange: setInput, onSubmit: () => { void submitText(); }, onStop: handleStop, isLoading, isUploading: isUploadingAttachments,
    attachments, uploadError, onFilesSelected: handleFilesSelected, onRemoveAttachment: handleRemoveAttachment, onRetryAttachment: handleRetryAttachment,
    documentContext, onSelectDocument: setDocumentContext, onClearDocumentContext: () => setDocumentContext(null),
    skillContext, onSelectSkill: setSkillContext, onClearSkillContext: () => setSkillContext(null) };

  return <div className={styles.workspace}>
    <ConversationHeader title={hasMessages ? title : undefined} onNew={onNew} onHistory={onHistory} />
    {!hasMessages ? <section data-lh-hermit-start aria-labelledby="hermit-start-title">
      <div data-lh-hermit-start-inner>
        <div className={styles.startCopy}>
          <div className={styles.startIdentity}><HermitIdentity size="sm" /><span>路引</span></div>
          <h1 id="hermit-start-title" data-lh-hermit-start-title>让灯塔知识，帮你找到下一步。</h1>
          <p>查找依据、对照案例，或结合你的材料一起分析。</p>
        </div>
        <div data-lh-hermit-start-input><ChatInput {...inputProps} /></div>
        <ScenarioCards onSelect={draft => { setInput(draft); setFocusKey(key => key + 1); }} />
        <p className={styles.startFootnote}>回答供参考，请结合现场情况判断。</p>
      </div>
    </section> : <div className={`${styles.chatLayout} ${readerDocument ? styles.chatLayoutWithReader : ""}`} data-lh-hermit-layout>
      <section className={styles.conversation} data-lh-hermit-conversation aria-label="路引当前对话">
        <div data-lh-hermit-main ref={scrollRef} tabIndex={0} role="region" aria-label="对话消息" onScroll={event => {
          const element = event.currentTarget;
          followLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          if (followLatestRef.current) setHasUnreadMessages(false);
          else if (isLoading) setHasUnreadMessages(true);
        }}><div data-lh-chat-scroll-content>
          {initial?.unavailableAttachments.length ? <p className={styles.expiredAttachments} role="status">部分历史附件已过期或不可用：{initial.unavailableAttachments.map(item => item.name).join("、")}。请重新上传后继续引用。</p> : null}
          {initial?.unavailableSkillContext && <p className={styles.expiredAttachments} role="status">{initial.unavailableSkillContext.message}</p>}
          {messages.map(message => {
            const last = message.id === lastMessage?.id;
            const state = messageRunState(message);
            const visible = message.role !== "assistant" || getTextContent(message).trim() || getDocumentRecommendations(message).length;
            return <Fragment key={message.id}>
              {visible ? <MessageBubble message={message} onOpenDocument={setReaderDocument} showRecommendations={state !== "failed" && state !== "cancelled" && (!last || !isLoading && !displayedError)} /> : null}
              {message.role === "assistant" && (!last || !isLoading) && <RunFeedback error={last ? displayedError ?? (state === "failed" ? "这条回答未完成，请重试。" : null) : state === "failed" ? "这条回答未完成。" : null} cancelled={state === "cancelled" || last && wasCancelled} onRetry={last && (displayedError || state === "failed" || state === "cancelled" || wasCancelled) ? handleRetry : undefined} />}
            </Fragment>;
          })}
          {lastMessage?.role !== "assistant" && displayedError && <RunFeedback error={displayedError} onRetry={handleRetry} />}
          {isLoading && <RunFeedback loading progress={progress} />}
          {!isLoading && lastMessage?.role !== "assistant" && (lastState === "cancelled" || wasCancelled) && <RunFeedback cancelled onRetry={handleRetry} />}
        </div></div>
        <footer data-lh-hermit-footer>
          {hasUnreadMessages && <button type="button" className={styles.newMessages} onClick={() => { followLatestRef.current = true; setHasUnreadMessages(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" }); }}>查看最新回复 ↓</button>}
          <div data-lh-hermit-composer><ChatInput {...inputProps} /><p className={styles.startFootnote}>回答供参考，请结合现场情况判断。</p></div>
        </footer>
      </section>
      {readerDocument && <DocumentReader document={readerDocument} onClose={() => setReaderDocument(null)} onUse={document => { setDocumentContext(document); setReaderDocument(null); setFocusKey(key => key + 1); }} />}
    </div>}
  </div>;
}
