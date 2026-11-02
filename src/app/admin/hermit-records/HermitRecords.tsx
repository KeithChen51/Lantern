"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import { authFetch } from "@/components/auth/auth-fetch";
import { LhMessageAvatar, LhMessageBubble, LhMessageRow } from "@/components/ui/lighthouse-primitives";
import styles from "./hermit-records.module.css";

type RecordRow = { id: string; actor: "employee" | "guest" | "unknown"; createdAt: string; lastQuestionAt: string | null; turns: number };
type Message = { id: string; role: "user" | "assistant"; text: string };
type Filters = { start: string; end: string; actor: string; id: string };
type RecordsResult = { rows: RecordRow[]; nextCursor: string | null };
type ContentResult = { messages: Message[]; nextCursor: string | null; view?: "stored-attempts" };
const emptyFilters: Filters = { start: "", end: "", actor: "", id: "" };
const dates = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });
const actors = { employee: "员工", guest: "访客", unknown: "身份未明确" };
function dateLabel(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? dates.format(new Date(value)) : "暂无提问"; }

export function HermitRecords({ canReadContent }: { canReadContent: boolean }) {
  const session = useEmployeeSession();
  if (!session || session.kind === "guest" || !session.capabilities.includes("analytics:summary") || !Number.isFinite(session.expiresAt) || session.expiresAt <= 0) {
    return <p role="alert">请使用平台管理员账号查看路引记录。</p>;
  }
  return <RecordsWorkspace key={`${session.user.id}:${session.expiresAt}:${canReadContent}`} canReadContent={canReadContent} expiresAt={session.expiresAt} />;
}

function RecordsWorkspace({ canReadContent, expiresAt }: { canReadContent: boolean; expiresAt: number }) {
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<RecordsResult>({ rows: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [selected, setSelected] = useState<{ row: RecordRow; returnFocus: HTMLElement } | null>(null);
  const listRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor?: string, currentFilters = filters) => {
    if (Date.now() >= expiresAt || document.visibilityState !== "visible") return;
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    setLoading(true); setError("");
    if (!cursor) setResult({ rows: [], nextCursor: null });
    try {
      const query = new URLSearchParams();
      for (const [name, value] of Object.entries(currentFilters)) if (value) query.set(name, value);
      if (cursor) query.set("cursor", cursor);
      const response = await authFetch(`/api/admin/hermit-records?${query}`, { signal: request.signal, cache: "no-store" });
      if (!response.ok) throw new Error("list unavailable");
      const data = await response.json() as RecordsResult;
      if (!Array.isArray(data.rows) || (data.nextCursor !== null && typeof data.nextCursor !== "string")) throw new Error("invalid records");
      if (request.signal.aborted || Date.now() >= expiresAt) return;
      setResult(previous => ({ rows: cursor ? [...previous.rows, ...data.rows.filter(row => !previous.rows.some(old => old.id === row.id))] : data.rows, nextCursor: data.nextCursor }));
    } catch {
      if (!request.signal.aborted) setError("暂时无法读取路引记录，请重试。若权限已变化，请刷新页面。");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [expiresAt, filters]);

  useEffect(() => {
    const scheduled = window.setTimeout(() => { void load(undefined, filters); }, 0);
    return () => { window.clearTimeout(scheduled); listRequest.current?.abort(); };
  }, [filters, load]);

  useEffect(() => {
    function conceal() { flushSync(() => setSelected(null)); }
    function visibility() {
      if (document.visibilityState !== "visible") conceal();
      else void load();
    }
    let timeout: number;
    function checkExpiry() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        listRequest.current?.abort();
        setExpired(true); setSelected(null); setResult({ rows: [], nextCursor: null });
      } else timeout = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    }
    checkExpiry();
    window.addEventListener("pagehide", conceal);
    window.addEventListener("pageshow", conceal);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timeout);
      listRequest.current?.abort();
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("pageshow", conceal);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [expiresAt, load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.start && draft.end && draft.start > draft.end) { setError("开始日期须早于或等于结束日期。"); return; }
    setSelected(null);
    setFilters({ ...draft, id: draft.id.trim() });
  }
  function open(row: RecordRow, control: HTMLElement) { setSelected({ row, returnFocus: control }); }
  if (expired) return <p role="alert">登录已失效，请重新登录后查看路引记录。</p>;
  return <section className={styles.workspace} aria-label="路引会话记录">
    <form className={styles.filters} onSubmit={submit} aria-label="筛选路引记录">
      <label>开始日期<input type="date" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label>
      <label>结束日期<input type="date" value={draft.end} min={draft.start || undefined} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label>
      <label>用户类型<select value={draft.actor} onChange={event => setDraft({ ...draft, actor: event.target.value })}><option value="">全部类型</option><option value="employee">员工</option><option value="guest">访客</option><option value="unknown">身份未明确</option></select></label>
      <label className={styles.identifier}>会话编号<input type="search" maxLength={191} placeholder="输入完整会话编号" value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })} /></label>
      <button className={styles.primary} type="submit" disabled={loading}>筛选</button>
      <button className={styles.secondary} type="button" disabled={loading} onClick={() => { setDraft(emptyFilters); setSelected(null); setFilters({ ...emptyFilters }); }}>重置</button>
    </form>
    <p className={styles.hint}>按最后提问时间倒序排列，日期按北京时间筛选。点击一条会话可打开对话回看窗口。</p>
    {error && <div role="alert" className={styles.error}><p>{error}</p><button className={styles.secondary} type="button" onClick={() => void load()}>重试读取</button></div>}
    <div className={styles.tableScroll} aria-busy={loading}>
      <table className={styles.table}><thead><tr><th scope="col">会话编号</th><th scope="col">用户类型</th><th scope="col">开始时间</th><th scope="col">最后提问</th><th scope="col">轮次</th></tr></thead>
        <tbody>{result.rows.map(row => <tr key={row.id} onClick={event => { if (!(event.target instanceof Element) || !event.target.closest("button")) open(row, event.currentTarget.querySelector("button")!); }}>
          <th scope="row"><button type="button" className={styles.recordLink} onClick={event => open(row, event.currentTarget)} aria-label={`回看会话 ${row.id}`}>{row.id}</button></th><td>{actors[row.actor]}</td><td>{dateLabel(row.createdAt)}</td><td>{dateLabel(row.lastQuestionAt)}</td><td>{row.turns}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {loading && <p role="status" className={styles.state}>正在读取路引记录…</p>}
    {!loading && !error && !result.rows.length && <p role="status" className={styles.state}>所选条件下暂无路引记录。</p>}
    {result.nextCursor && <button className={styles.secondary} type="button" disabled={loading} onClick={() => void load(result.nextCursor!)}>加载更多会话</button>}
    {selected && <ConversationWindow key={selected.row.id} row={selected.row} canReadContent={canReadContent} expiresAt={expiresAt} onClose={() => setSelected(null)} returnFocus={selected.returnFocus} />}
  </section>;
}

function ConversationWindow({ row, canReadContent, expiresAt, onClose, returnFocus }: {
  row: RecordRow; canReadContent: boolean; expiresAt: number; onClose: () => void; returnFocus: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [purpose, setPurpose] = useState("");
  const [content, setContent] = useState<ContentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const validPurpose = purpose.trim().length >= 4 && purpose.trim().length <= 256 && !/[\u0000-\u001f\u007f]/.test(purpose.trim());

  useEffect(() => {
    const element = dialog.current;
    const scrollRoot = document.documentElement;
    const overflow = scrollRoot.style.overflow;
    scrollRoot.style.overflow = "hidden";
    element?.showModal();
    return () => {
      request.current?.abort();
      element?.close();
      scrollRoot.style.overflow = overflow;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  async function read(cursor?: string) {
    if (!canReadContent || !validPurpose || request.current || Date.now() >= expiresAt || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const response = await authFetch("/api/admin/hermit-records/content", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ id: row.id, purpose: purpose.trim(), ...(cursor ? { cursor } : {}) }), signal: controller.signal,
      });
      if (!response.ok) throw new Error("content unavailable");
      const result = await response.json() as ContentResult;
      if (!Array.isArray(result.messages) || result.messages.some(message => !message || typeof message.id !== "string" || !["user", "assistant"].includes(message.role) || typeof message.text !== "string") || (result.nextCursor !== null && typeof result.nextCursor !== "string")) throw new Error("invalid transcript");
      if (controller.signal.aborted || Date.now() >= expiresAt || document.visibilityState !== "visible") return;
      setContent(previous => ({ messages: cursor && previous ? [...previous.messages, ...result.messages.filter(message => !previous.messages.some(old => old.id === message.id))] : result.messages, nextCursor: result.nextCursor, view: result.view }));
    } catch {
      if (!controller.signal.aborted) { setContent(null); setError("暂时无法查看对话。请确认授权仍有效后重试。"); }
    } finally {
      if (request.current === controller) { request.current = null; if (!controller.signal.aborted) setLoading(false); }
    }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="hermit-record-window-title" onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className={styles.dialogHeader}><div><p className={styles.eyebrow}>路引记录 · 只读回看</p><h2 id="hermit-record-window-title">对话回看</h2></div><button className={styles.secondary} type="button" onClick={onClose} autoFocus aria-label="关闭对话回看">关闭</button></header>
    <dl className={styles.metadata}><div><dt>会话编号</dt><dd>{row.id}</dd></div><div><dt>用户类型</dt><dd>{actors[row.actor]}</dd></div><div><dt>开始时间</dt><dd>{dateLabel(row.createdAt)}</dd></div><div><dt>最后提问</dt><dd>{dateLabel(row.lastQuestionAt)}</dd></div><div><dt>对话轮次</dt><dd>{row.turns}</dd></div></dl>
    <div className={styles.dialogBody}>
      {!canReadContent ? <p className={styles.state}>当前账号可查看会话信息。查看对话正文需由平台负责人授予专项权限。</p> : <>
        {!content && <form className={styles.purposeForm} onSubmit={event => { event.preventDefault(); void read(); }}>
          <label htmlFor="hermit-record-purpose">查看事由<textarea id="hermit-record-purpose" value={purpose} minLength={4} maxLength={256} rows={3} placeholder="填写本次查看的具体事由（4–256 字）" disabled={loading} onChange={event => setPurpose(event.target.value)} /></label>
          <p className={styles.hint}>系统会记录查看人、事由和会话范围。</p>
          <button className={styles.primary} type="submit" disabled={!validPurpose || loading}>{loading ? "正在读取对话…" : "查看对话"}</button>
        </form>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {content && <div data-lh-hermit-conversation className={styles.transcript} aria-label="已保存的对话内容">
          {content.view === "stored-attempts" && <p className={styles.hint}>会话较长，按保存顺序显示全部问答记录，包含重试回答。</p>}
          {content.messages.length ? content.messages.map(message => <TranscriptMessage key={message.id} message={message} />) : <p role="status" className={styles.state}>这段会话暂无已保存的提问或回复。</p>}
          {content.nextCursor && <button className={styles.secondary} type="button" disabled={loading} onClick={() => void read(content.nextCursor!)}>{loading ? "正在读取…" : "继续读取后续对话"}</button>}
          {!content.nextCursor && content.messages.length > 0 && <p className={styles.end}>已到这段对话的末尾</p>}
        </div>}
      </>}
    </div>
  </dialog>;
}

function TranscriptMessage({ message }: { message: Message }) {
  return <LhMessageRow messageRole={message.role} className={styles.message} aria-label={message.role === "user" ? "用户提问" : "路引回复"}>
    {message.role === "assistant" && <LhMessageAvatar aria-hidden="true">引</LhMessageAvatar>}
    <LhMessageBubble variant={message.role}><p className={styles.author}>{message.role === "user" ? "用户" : "路引"}</p>
      {message.role === "user" ? <p className={styles.userText}>{message.text || "（空消息）"}</p> : <div data-lh-message-prose className={styles.prose}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
        a: ({ children, href }) => <span>{href?.match(/^#hermit-citation-\d+$/) ? <>[{children}]</> : children}</span>,
        img: ({ alt }) => <span>{alt ? `［图片：${alt}］` : "［图片］"}</span>,
      }}>{message.text || "（空消息）"}</ReactMarkdown></div>}
    </LhMessageBubble>
  </LhMessageRow>;
}
