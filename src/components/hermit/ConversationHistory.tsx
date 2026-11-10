"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/components/auth/auth-fetch";
import { ConversationReadScope, type ConversationDetail, type ConversationSummary } from "./conversation-state";
import styles from "./hermit-v3.module.css";

export function useConversationHistory(enabled: boolean) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef(new ConversationReadScope());
  useEffect(() => { const current = scope.current; return () => current.dispose(); }, []);
  const load = useCallback(async (nextCursor?: string) => {
    if (!enabled) return;
    const request = scope.current.begin();
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ limit: "20", ...(nextCursor ? { cursor: nextCursor } : {}) });
      const response = await authFetch(`/api/hermit/conversations?${query}`, { signal: request.signal });
      if (!response.ok) throw new Error("暂时无法读取历史对话，请重试。");
      const data = await response.json() as { items: ConversationSummary[]; nextCursor: string | null };
      if (!request.current()) return;
      setItems(previous => nextCursor ? [...previous, ...data.items.filter(item => !previous.some(old => old.id === item.id))] : data.items);
      setCursor(data.nextCursor);
    } catch { if (request.current()) setError("暂时无法读取历史对话，请重试。"); }
    finally { if (request.current()) setLoading(false); }
  }, [enabled]);
  return { items, cursor, loading, error, load };
}

export function HistoryDrawer({ open, guest, items, cursor, loading, error, activeId, detailLoading, detailError, onClose, onNew, onSelect, onRetryDetail, onLoad, onFocusConversation }: {
  open: boolean; guest: boolean; items: ConversationSummary[]; cursor: string | null; loading: boolean; error: string | null;
  activeId: string; detailLoading: boolean; detailError: string | null; onClose: () => void; onNew: () => void;
  onSelect: (id: string) => void; onRetryDetail: () => void; onLoad: (cursor?: string) => void;
  onFocusConversation: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) { restoreFocus.current = document.activeElement as HTMLElement; element.showModal(); }
    if (!open && element.open) { element.close(); if (restoreFocus.current?.isConnected) restoreFocus.current.focus(); }
  }, [open]);
  return <dialog ref={dialog} className={styles.historyDrawer} aria-labelledby="hermit-history-title" tabIndex={-1} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')).filter(control => control.getClientRects().length > 0);
    const target = event.shiftKey ? controls.at(-1) : controls[0];
    if (!controls.length || event.shiftKey && document.activeElement === controls[0] || !event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); (target ?? event.currentTarget).focus(); }
  }} onCancel={event => { event.preventDefault(); onClose(); }} onClose={() => { onClose(); if (!restoreFocus.current?.isConnected) onFocusConversation(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left) onClose(); } }}>
    <div className={styles.historyHeader}><h2 id="hermit-history-title">历史对话</h2><button type="button" onClick={onClose} autoFocus>关闭</button></div>
    <p className={styles.historyHint}>{guest ? "登录后保存历史对话。访客对话不会混入账号历史。" : "仅显示当前账号的对话"}</p>
    <button type="button" className={styles.historyNew} onClick={onNew}>＋ 开始新对话</button>
    <div className={styles.historyBody} aria-busy={loading || detailLoading}>
      {detailLoading && <p role="status">正在打开对话…</p>}
      {detailError && <div className={styles.historyError} role="alert"><p>{detailError}</p><button type="button" onClick={onRetryDetail}>重试打开</button></div>}
      {loading && items.length === 0 && <p role="status">正在读取历史对话…</p>}
      {error && <div className={styles.historyError} role="alert"><p>{error}</p><button type="button" onClick={() => onLoad()}>重试</button></div>}
      {!guest && !loading && !error && items.length === 0 && <p className={styles.historyHint}>还没有历史对话。开始提问后，对话会保存在这里。</p>}
      <ul className={styles.historyList}>{items.map(item => <li key={item.id}><HistoryRow item={item} active={item.id === activeId} onSelect={onSelect} /></li>)}</ul>
      {cursor && <button type="button" className={styles.historyMore} disabled={loading} onClick={() => onLoad(cursor)}>{loading ? "正在读取…" : "加载更多"}</button>}
    </div>
    <p className={styles.historyHint}>打开对话后，可以继续追问。</p>
  </dialog>;
}

function HistoryRow({ item, active, onSelect }: { item: ConversationSummary; active: boolean; onSelect: (id: string) => void }) {
  return <button type="button" className={styles.historyRow} aria-current={active ? "true" : undefined} onClick={() => onSelect(item.id)}>
    <strong>{item.title}</strong><span>{item.preview}</span><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
  </button>;
}

export async function readConversation(id: string, signal: AbortSignal): Promise<ConversationDetail> {
  const response = await authFetch(`/api/hermit/conversations/${encodeURIComponent(id)}`, { signal });
  if (!response.ok) throw new Error(response.status === 404 ? "这段对话已不可用，请选择其他对话。" : "暂时无法打开这段对话，请重试。");
  return response.json();
}
