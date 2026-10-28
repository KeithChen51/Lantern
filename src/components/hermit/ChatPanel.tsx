"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { createConversationId } from "./conversation-id";
import { HistoryDrawer, readConversation, useConversationHistory } from "./ConversationHistory";
import { ConversationReadScope, conversationTitle, messageRunState, restoredContext, markTerminalState, type ConversationDetail } from "./conversation-state";
import { hermitUploadOwner } from "./upload-scope";
import { useHermitAttachments } from "./useHermitAttachments";
import { getDocumentRecommendations, getHermitApiError, getTextContent, type HermitDocumentRecommendation } from "./types";
import type { HermitMessageContext } from "@/lib/hermit/conversation-contract";
import { contextRequest, messageContext, retryContext, sameContextResource, unrepresentedContext, type ContextRemoval } from "./message-context";
import { MessageContext } from "./MessageContext";
import { HermitDraftStore } from "./draft-store";
import { appendCaseQuestion, caseDraftReference, type CaseDraftReference, type HermitCaseEntry } from "./case-entry";
import { restoreCaseReference } from "./restore-case-reference";
import styles from "./hermit-v3.module.css";

function getErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : error;
  if (typeof raw === "string" && /network|fetch failed|failed to fetch/i.test(raw)) return "网络暂时不可用，请检查连接后重试。";
  return getHermitApiError(raw, "这次请求没有完成，请重试。");
}

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const emptyDraftStorage = { getItem: () => null, setItem: () => {} };

export function ChatPanel({ entry }: { entry?: HermitCaseEntry } = {}) {
  const session = useEmployeeSession();
  const owner = hermitUploadOwner(session);
  const ready = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  return <HermitSessionWorkspace key={`${owner}:${ready}:${entry?.prompt ?? ""}`} owner={owner} guest={!session || session.kind === "guest"} restoreDrafts={ready} entry={ready ? entry : undefined} />;
}

function HermitSessionWorkspace({ owner, guest, restoreDrafts, entry }: { owner: string | null; guest: boolean; restoreDrafts: boolean; entry?: HermitCaseEntry }) {
  const [incomingEntry, setIncomingEntry] = useState(entry);
  function consumeEntry() {
    setIncomingEntry(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete("from"); url.searchParams.delete("question");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  const [drafts] = useState(() => new HermitDraftStore(owner, restoreDrafts ? undefined : emptyDraftStorage));
  const [selection, setSelection] = useState<{ id: string; detail?: ConversationDetail; revision: number; focus?: boolean; restore?: boolean }>(() => {
    const previous = drafts.cursor;
    // Guest history is not an account history capability. Carry only the unsent
    // text into a fresh conversation after reload, never reuse a hidden turn.
    const id = guest ? createConversationId() : previous?.id ?? createConversationId();
    if (guest && previous) {
      drafts.write(id, drafts.recoverText(previous.id));
      drafts.setCaseReference(id, drafts.caseReference(previous.id));
      drafts.setCaseReference(previous.id, null);
    }
    return { id, revision: 0, restore: !guest && previous?.persisted };
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const detailId = useRef<string | null>(null);
  const detailScope = useRef(new ConversationReadScope());
  const history = useConversationHistory(!guest);
  useLayoutEffect(() => { drafts.activate(); return () => drafts.dispose(); }, [drafts]);
  useEffect(() => { const scope = detailScope.current; return () => scope.dispose(); }, []);
  useEffect(() => {
    if (!selection.restore) return;
    const scope = detailScope.current;
    const request = scope.begin();
    void readConversation(selection.id, request.signal).then(detail => {
      if (request.current()) {
        const lastUser = detail.messages.findLast(message => message.role === "user");
        if (lastUser && getTextContent(lastUser).trim() === drafts.pendingText(detail.id)) drafts.acknowledged(detail.id);
        else { const text = drafts.recoverText(detail.id); drafts.acknowledged(detail.id); drafts.write(detail.id, text); }
        setSelection(previous => ({ ...previous, detail, restore: false }));
      }
    }).catch(error => {
      if (request.current()) setDetailError(error instanceof Error ? error.message : "暂时无法恢复对话，请重试。");
    });
    return () => { if (!request.signal.aborted) scope.dispose(); };
  }, [selection.id, selection.restore, selection.revision, drafts]);

  function startWithRecoveredDraft() {
    detailScope.current.dispose();
    const text = drafts.recoverText(selection.id);
    const id = createConversationId();
    drafts.write(id, text); drafts.setCaseReference(id, drafts.caseReference(selection.id));
    drafts.setCaseReference(selection.id, null); drafts.acknowledged(selection.id); drafts.select(id, false); setDetailError(null);
    setSelection(previous => ({ id, revision: previous.revision + 1, focus: true }));
  }

  function newConversation() {
    if (incomingEntry) consumeEntry();
    drafts.setCaseReference(selection.id, null);
    detailScope.current.dispose();
    setDetailLoading(false); setDetailError(null); setHistoryOpen(false);
    const id = createConversationId();
    drafts.select(id, false);
    setSelection(previous => ({ id, revision: previous.revision + 1, focus: true }));
  }
  async function selectConversation(id: string) {
    if (id === selection.id) {
      setHistoryOpen(false); detailScope.current.dispose(); setDetailLoading(false); setDetailError(null);
      setFocusRequest(request => request + 1);
      return;
    }
    const request = detailScope.current.begin();
    detailId.current = id; setDetailLoading(true); setDetailError(null);
    try {
      const detail = await readConversation(id, request.signal);
      if (!request.current()) return;
      drafts.select(detail.id, true);
      setSelection(previous => ({ id: detail.id, detail, revision: previous.revision + 1, focus: true }));
      setHistoryOpen(false);
    } catch (error) { if (request.current()) setDetailError(error instanceof Error ? error.message : "暂时无法打开对话，请重试。"); }
    finally { if (request.current()) setDetailLoading(false); }
  }
  return <>
    {selection.restore ? <div role="status" className={styles.restoreConversation}>
      <p>{detailError ?? "正在恢复上次对话…"}</p>
      {detailError && <button type="button" onClick={() => { setDetailError(null); setSelection(previous => ({ ...previous, revision: previous.revision + 1 })); }}>重试恢复</button>}
      <button type="button" onClick={startWithRecoveredDraft}>保留草稿，开始新对话</button>
    </div> : <ConversationWorkspace key={`${selection.id}:${selection.revision}`} id={selection.id} owner={owner} initial={selection.detail} focusOnMount={selection.focus} focusRequest={focusRequest} entry={incomingEntry} onEntryConsumed={consumeEntry}
      restoredCaseReference={drafts.caseReference(selection.id)} onCaseReferenceChange={reference => drafts.setCaseReference(selection.id, reference)}
      draftText={drafts.text(selection.id)} onDraftChange={text => { drafts.write(selection.id, text); drafts.select(selection.id, Boolean(selection.detail) || drafts.cursor?.persisted === true); }}
      onStarted={text => { drafts.submitting(selection.id, text); drafts.select(selection.id, !guest); }}
      onAcknowledged={() => drafts.acknowledged(selection.id)}
      onNew={newConversation} onHistory={() => { setHistoryOpen(true); void history.load(); }} onSaved={() => { void history.load(); }} />
    }
    <HistoryDrawer open={historyOpen} guest={guest} {...history} activeId={selection.id} detailLoading={detailLoading} detailError={detailError}
      onClose={() => { setHistoryOpen(false); detailScope.current.dispose(); setDetailLoading(false); }} onNew={newConversation}
      onFocusConversation={() => setFocusRequest(request => request + 1)}
      onSelect={id => { void selectConversation(id); }} onRetryDetail={() => { if (detailId.current) void selectConversation(detailId.current); }} onLoad={cursor => { void history.load(cursor); }} />
  </>;
}

interface ConversationWorkspaceProps { id: string; owner: string | null; initial?: ConversationDetail; focusOnMount?: boolean; focusRequest?: number; draftText?: string; entry?: HermitCaseEntry; onEntryConsumed?: () => void; restoredCaseReference?: CaseDraftReference | null; onCaseReferenceChange?: (reference: CaseDraftReference | null) => void; onDraftChange?: (text: string) => void; onStarted?: (text: string) => void; onAcknowledged?: () => void; onNew: () => void; onHistory: () => void; onSaved: () => void }
export function ConversationWorkspace({ id, owner, initial, focusOnMount, focusRequest = 0, draftText = "", entry, onEntryConsumed, restoredCaseReference, onCaseReferenceChange, onDraftChange, onStarted, onAcknowledged, onNew, onHistory, onSaved }: ConversationWorkspaceProps) {
  const { attachments, setAttachments, uploadError, isUploadingAttachments, handleFilesSelected, handleRemoveAttachment, handleRetryAttachment, uploadScopeRef } = useHermitAttachments(owner, initial, id);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", fetch: authFetch }), []);
  const [entryPending, setEntryPending] = useState(Boolean(entry && (draftText.trim() || initial?.messages.length)));
  const [entryNotice, setEntryNotice] = useState(entry);
  const entryHandled = useRef(false);
  const [input, setInput] = useState(entry && !entryPending ? entry.prompt : draftText);
  const [replacedDraft, setReplacedDraft] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(focusOnMount || entry && !entryPending ? 1 : 0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [readerDocument, setReaderDocument] = useState<HermitDocumentRecommendation | null>(null);
  const readerTriggerRef = useRef<HTMLElement | null>(null);
  function openReader(document: HermitDocumentRecommendation) {
    readerTriggerRef.current = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
    setReaderDocument(document);
  }
  function closeReader() {
    setReaderDocument(null);
    requestAnimationFrame(() => {
      const trigger = readerTriggerRef.current;
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
      else setFocusKey(key => key + 1);
    });
  }
  function updateInput(text: string) { setInput(text); onDraftChange?.(text); }
  const [documentContext, setDocumentContext] = useState<HermitDocumentRecommendation | null>(() => restoredContext(initial));
  const [skillContext, setSkillContext] = useState<HermitDocumentRecommendation | null>(() => initial?.skillContext ? { id: `skill:${initial.skillContext.resourceId}`, ...initial.skillContext } : null);
  const [draftDocument, setDraftDocument] = useState<HermitDocumentRecommendation | null>(entry && !entryPending ? entry.document : null);
  const [isRestoringCase, setIsRestoringCase] = useState(Boolean(restoredCaseReference && !(entry && !entryPending)));
  const [caseRestoreError, setCaseRestoreError] = useState(false);
  const [caseRestoreAttempt, setCaseRestoreAttempt] = useState(0);
  const caseRestoreController = useRef<AbortController | null>(null);
  const caseReferenceChanged = useRef(onCaseReferenceChange);
  useLayoutEffect(() => { caseReferenceChanged.current = onCaseReferenceChange; }, [onCaseReferenceChange]);
  // The initial reference belongs to this mounted conversation, never a newly selected history item.
  const referenceToRestore = useRef(entry && !entryPending ? null : restoredCaseReference);

  function cancelCaseRestore() {
    caseRestoreController.current?.abort();
    setIsRestoringCase(false); setCaseRestoreError(false);
  }
  function selectDraftDocument(document: HermitDocumentRecommendation | null) {
    cancelCaseRestore();
    referenceToRestore.current = null;
    caseReferenceChanged.current?.(null);
    setDraftDocument(document);
  }
  const [draftSkill, setDraftSkill] = useState<HermitDocumentRecommendation | null>(null);
  const activeContext: HermitMessageContext = { attachments: attachments.flatMap(item => item.sent && item.status === "ready" && item.id ? [{ id: item.id, name: item.name, size: item.size }] : []), documentContext, skillContext };
  const pendingContextRef = useRef<HermitMessageContext>(activeContext);
  const followLatestRef = useRef(true);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useLhReducedMotion();
  const { messages, setMessages, sendMessage, regenerate, stop, clearError, status, error } = useChat({
    id, transport, messages: initial?.messages,
    onData: part => {
      if (!uploadScopeRef.current?.active || part.type !== "data-hermit-progress") return;
      onAcknowledged?.();
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
  const lastUser = messages.findLast(message => message.role === "user");
  const unmappedContext = unrepresentedContext(activeContext, lastUser ? messageContext(lastUser) : null);
  const hasUnmappedContext = unmappedContext.attachments.length > 0 || unmappedContext.documentContext || unmappedContext.skillContext;
  const lastState = messageRunState(lastMessage);

  useEffect(() => {
    const reference = referenceToRestore.current;
    if (!reference) return;
    const controller = new AbortController();
    caseRestoreController.current = controller;
    void restoreCaseReference(reference, controller.signal).then(document => {
      if (controller.signal.aborted) return;
      setDraftDocument(document); setIsRestoringCase(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setCaseRestoreError(true); setIsRestoringCase(false);
    });
    return () => controller.abort();
  }, [caseRestoreAttempt]);

  useEffect(() => {
    if (!entry || entryPending || entryHandled.current) return;
    entryHandled.current = true;
    onDraftChange?.(entry.prompt);
    caseReferenceChanged.current?.(caseDraftReference(entry.document));
    onEntryConsumed?.();
  }, [entry, entryPending, onDraftChange, onEntryConsumed]);

  function applyCaseEntry() {
    if (!entryNotice) return;
    entryHandled.current = true;
    updateInput(appendCaseQuestion(input, entryNotice.prompt));
    cancelCaseRestore(); referenceToRestore.current = null;
    setDraftDocument(entryNotice.document);
    caseReferenceChanged.current?.(caseDraftReference(entryNotice.document));
    setEntryPending(false); setFocusKey(key => key + 1);
    onEntryConsumed?.();
  }

  useEffect(() => {
    const element = scrollRef.current;
    if (element && hasMessages && followLatestRef.current) element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
  }, [hasMessages, isLoading, messages]);

  async function submitText() {
    const text = input.trim();
    if (!text || isLoading || isRestoringCase || caseRestoreError || attachments.some(item => item.status !== "ready")) return;
    const context: HermitMessageContext = {
      attachments: attachments.flatMap(item => item.id ? [{ id: item.id, name: item.name, size: item.size }] : []),
      documentContext: draftDocument ?? documentContext, skillContext: draftSkill ?? skillContext,
    };
    const body = contextRequest(context);
    const scope = uploadScopeRef.current;
    pendingContextRef.current = context;
    if (entryPending) { entryHandled.current = true; onEntryConsumed?.(); setEntryPending(false); }
    caseReferenceChanged.current?.(null); referenceToRestore.current = null;
    followLatestRef.current = true; setHasUnreadMessages(false);
    onStarted?.(text); updateInput(""); setReplacedDraft(null); setEntryNotice(undefined); setRequestError(null); setProgress(null); setWasCancelled(false); clearError();
    setAttachments(current => current.map(item => item.id && body.attachmentIds.includes(item.id) ? { ...item, sent: true } : item));
    setDocumentContext(draftDocument ?? documentContext); setSkillContext(draftSkill ?? skillContext);
    setDraftDocument(null); setDraftSkill(null);
    try {
      await sendMessage({ text, metadata: { hermitContext: context } }, { body });
    } catch (error) { if (scope?.active) { setRequestError(getErrorMessage(error)); setMessages(current => markTerminalState(current, "failed")); } }
  }
  function handleRetry() {
    if (isLoading) return;
    const scope = uploadScopeRef.current;
    setRequestError(null); setProgress(null); setWasCancelled(false); clearError();
    const body = contextRequest(retryContext(pendingContextRef.current, activeContext));
    void regenerate({ body }).catch(error => { if (scope?.active) { setRequestError(getErrorMessage(error)); setMessages(current => markTerminalState(current, "failed")); } });
  }
  function removeSentContext(item: ContextRemoval) {
    if (isLoading) return;
    if (item.kind === "attachment") {
      const attachment = attachments.find(file => file.id === item.id);
      if (attachment) void handleRemoveAttachment(attachment);
    } else if (item.kind === "document" && sameContextResource(documentContext, item)) setDocumentContext(null);
    else if (item.kind === "skill" && sameContextResource(skillContext, item)) setSkillContext(null);
  }
  function handleStop() { if (isLoading) { setWasCancelled(true); void stop(); } }
  const inputProps = { value: input, focusKey: focusKey + focusRequest, onChange: (text: string) => { updateInput(text); setReplacedDraft(null); }, onSubmit: () => { void submitText(); }, onStop: handleStop, isLoading, isUploading: isUploadingAttachments,
    isResolvingContext: isRestoringCase, submitBlockedReason: caseRestoreError ? "案例引用未恢复，请重试或移除后发送" : undefined,
    attachments: attachments.filter(item => !item.sent), uploadError, onFilesSelected: handleFilesSelected, onRemoveAttachment: handleRemoveAttachment, onRetryAttachment: handleRetryAttachment,
    documentContext: draftDocument, onSelectDocument: selectDraftDocument, onClearDocumentContext: () => selectDraftDocument(null),
    skillContext: draftSkill, onSelectSkill: setDraftSkill, onClearSkillContext: () => setDraftSkill(null) };

  return <div className={styles.workspace}>
    <div>
    <ConversationHeader title={hasMessages ? title : undefined} onNew={onNew} onHistory={onHistory} />
    {entryNotice && <aside className={styles.caseEntry} aria-label="镜鉴案例问题">
      <p>{entryPending ? `已从镜鉴带来《${entryNotice.title}》的问题，原对话和草稿已保留。` : `已带入《${entryNotice.title}》的问题，发送前可以继续补充现场情况。`}</p>
      {entryNotice.notice && <p>{entryNotice.notice}</p>}
      <div>{entryPending && <button type="button" onClick={applyCaseEntry}>将案例问题加入草稿</button>}
        <button type="button" onClick={() => { entryHandled.current = true; setEntryNotice(undefined); setEntryPending(false); onEntryConsumed?.(); }}>{entryPending ? "暂不带入" : "收起提示"}</button></div>
    </aside>}
    {isRestoringCase && <aside className={styles.caseEntry} role="status"><p>正在恢复案例引用，问题草稿已保留…</p><button type="button" onClick={() => selectDraftDocument(null)}>移除引用，继续编辑</button></aside>}
    {caseRestoreError && <aside className={styles.caseEntry} role="alert"><p>案例引用暂时无法恢复，可能已不可读取。你的问题草稿已保留。</p><div><button type="button" onClick={() => { setIsRestoringCase(true); setCaseRestoreError(false); setCaseRestoreAttempt(attempt => attempt + 1); }}>重试恢复引用</button><button type="button" onClick={() => selectDraftDocument(null)}>移除引用，继续提问</button></div></aside>}
    </div>
    {!hasMessages ? <section data-lh-hermit-start aria-labelledby="hermit-start-title">
      <div data-lh-hermit-start-inner>
        <div className={styles.startCopy}>
          <div className={styles.startIdentity}><HermitIdentity size="sm" /><span>路引</span></div>
          <h1 id="hermit-start-title" data-lh-hermit-start-title>让灯塔知识，帮你找到下一步。</h1>
          <p>查找依据、对照案例，或结合你的材料一起分析。</p>
        </div>
        <div data-lh-hermit-start-input><ChatInput {...inputProps} /></div>
        {replacedDraft !== null && <p className={styles.draftUndo} role="status">已填入示例问题。<button type="button" onClick={() => { updateInput(replacedDraft); setReplacedDraft(null); setFocusKey(key => key + 1); }}>撤销替换</button></p>}
        <ScenarioCards onSelect={draft => { if (input !== draft) { setReplacedDraft(previous => previous ?? (input.trim() ? input : null)); updateInput(draft); } setFocusKey(key => key + 1); }} />
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
              {visible ? <MessageBubble message={message} onOpenDocument={openReader} activeContext={message.id === lastUser?.id ? activeContext : undefined} contextDisabled={isLoading} onRemoveContext={removeSentContext} showRecommendations={state !== "failed" && state !== "cancelled" && (!last || !isLoading && !displayedError)} /> : null}
              {message.role === "assistant" && (!last || !isLoading) && <RunFeedback error={last ? displayedError ?? (state === "failed" ? "这条回答未完成，请重试。" : null) : state === "failed" ? "这条回答未完成。" : null} cancelled={state === "cancelled" || last && wasCancelled} onRetry={last && (displayedError || state === "failed" || state === "cancelled" || wasCancelled) ? handleRetry : undefined} />}
            </Fragment>;
          })}
          {!!hasUnmappedContext && <section className={styles.followUpContext} aria-label="后续引用材料">
            <span>后续引用</span>
            <MessageContext context={unmappedContext} active={activeContext} disabled={isLoading} onOpenDocument={openReader} onRemove={removeSentContext} />
          </section>}
          {lastMessage?.role !== "assistant" && displayedError && <RunFeedback error={displayedError} onRetry={handleRetry} />}
          {isLoading && <RunFeedback loading progress={progress} />}
          {!isLoading && lastMessage?.role !== "assistant" && (lastState === "cancelled" || wasCancelled) && <RunFeedback cancelled onRetry={handleRetry} />}
          {!isLoading && lastMessage?.role === "user" && !displayedError && !wasCancelled && lastState !== "cancelled" && <RunFeedback error="这条问题尚未完成回答，可以重试。" onRetry={handleRetry} />}
        </div></div>
        <footer data-lh-hermit-footer>
          {hasUnreadMessages && <button type="button" className={styles.newMessages} onClick={() => { followLatestRef.current = true; setHasUnreadMessages(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" }); }}>查看最新回复 ↓</button>}
          <div data-lh-hermit-composer><ChatInput {...inputProps} /></div>
        </footer>
      </section>
      {readerDocument && <DocumentReader document={readerDocument} onClose={closeReader} onUse={document => { selectDraftDocument(document); setReaderDocument(null); setFocusKey(key => key + 1); }} />}
      <p className={`${styles.startFootnote} ${styles.conversationFootnote}`}>回答供参考，请结合现场情况判断。</p>
    </div>}
  </div>;
}
