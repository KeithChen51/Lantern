"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import { authFetch } from "@/components/auth/auth-fetch";
import { LhMessageAvatar, LhMessageBubble, LhMessageRow } from "@/components/ui/lighthouse-primitives";
import styles from "./hermit-records.module.css";

type RecordRow = {
  id: string; actor: "employee" | "guest" | "unknown"; createdAt: string; lastQuestionAt: string | null; turns: number; periodTurns?: number;
  identity?: { employeeNo: string | null; account: string | null; organization: string | null; source: "session-snapshot" | "current-profile" | "unavailable" } | null;
};
type Message = { id: string; role: "user" | "assistant"; text: string };
type Filters = { start: string; end: string; actor: string; id: string };
type RecordsResult = { rows: RecordRow[]; nextCursor: string | null };
type ContentResult = { messages: Message[]; nextCursor: string | null; view?: "stored-attempts" };
const emptyFilters: Filters = { start: "", end: "", actor: "", id: "" };
const dates = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });
const actors = { employee: "员工", guest: "访客", unknown: "身份未明确" };
function dateLabel(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? dates.format(new Date(value)) : "暂无提问"; }
function employeeLabel(row: RecordRow) {
  if (row.actor !== "employee") return actors[row.actor];
  const identity = row.identity;
  if (!identity || identity.source === "unavailable") return "工号未记录";
  if (identity.employeeNo) return `工号 ${identity.employeeNo}`;
  if (identity.account) return `登录账号 ${identity.account}`;
  return "工号未记录";
}
function organizationLabel(row: RecordRow) {
  if (row.actor !== "employee") return "—";
  return row.identity?.source !== "unavailable" && row.identity?.organization || "组织未记录";
}
function identitySource(row: RecordRow) {
  if (row.actor !== "employee") return null;
  if (row.identity?.source === "current-profile") return "当前资料";
  if (row.identity?.source === "session-snapshot") return "会话资料快照";
  return "资料未记录";
}

export function HermitRecords() {
  const session = useEmployeeSession();
  if (!session || session.kind === "guest" || !session.capabilities.includes("analytics:summary") || !Number.isFinite(session.expiresAt) || session.expiresAt <= 0) {
    return <p role="alert">请使用平台管理员账号查看路引记录。</p>;
  }
  return <RecordsWorkspace key={`${session.user.id}:${session.expiresAt}`} expiresAt={session.expiresAt} />;
}

function RecordsWorkspace({ expiresAt }: { expiresAt: number }) {
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<RecordsResult>({ rows: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [selected, setSelected] = useState<{ row: RecordRow; returnFocus: HTMLElement } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<string[]>([""]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const listRequest = useRef<AbortController | null>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const readTarget = useRef<{ cursor?: string; filters: Filters; page: number }>({ filters: emptyFilters, page: 0 });
  const needsRead = useRef(true);
  const scheduledRead = useRef<number | undefined>(undefined);
  const filterPanel = useRef<HTMLFormElement>(null);
  const filterToggle = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (cursor?: string, currentFilters = filters, page = 0) => {
    readTarget.current = { cursor, filters: currentFilters, page };
    if (Date.now() >= expiresAt || document.visibilityState !== "visible") return;
    if (scheduledRead.current !== undefined) window.clearTimeout(scheduledRead.current);
    scheduledRead.current = undefined;
    needsRead.current = false;
    setSelected(null);
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    setLoading(true); setError("");
    setResult({ rows: [], nextCursor: null });
    try {
      const query = new URLSearchParams();
      for (const [name, value] of Object.entries(currentFilters)) if (value) query.set(name, value);
      if (cursor) query.set("cursor", cursor);
      const response = await authFetch(`/api/admin/hermit-records?${query}`, { signal: request.signal, cache: "no-store" });
      if (!response.ok) throw new Error("list unavailable");
      const data = await response.json() as RecordsResult;
      if (!Array.isArray(data.rows) || (data.nextCursor !== null && typeof data.nextCursor !== "string")) throw new Error("invalid records");
      if (request.signal.aborted || listRequest.current !== request || Date.now() >= expiresAt || document.visibilityState !== "visible") return;
      setResult(data);
      setPageIndex(page);
      setPageCursors(previous => [...previous.slice(0, page), cursor ?? ""]);
      if (tableScroll.current) tableScroll.current.scrollTop = 0;
    } catch {
      if (!request.signal.aborted) {
        setResult({ rows: [], nextCursor: null });
        setError("暂时无法读取路引记录，请重试。若权限已变化，请刷新页面。");
      }
    } finally {
      if (listRequest.current === request) {
        listRequest.current = null;
        if (!request.signal.aborted) setLoading(false);
      }
    }
  }, [expiresAt, filters]);

  useEffect(() => {
    readTarget.current = { filters, page: 0 };
    needsRead.current = true;
    function cancelRead() {
      if (scheduledRead.current !== undefined) window.clearTimeout(scheduledRead.current);
      scheduledRead.current = undefined;
      listRequest.current?.abort();
      listRequest.current = null;
    }
    function conceal() {
      cancelRead();
      needsRead.current = true;
      flushSync(() => {
        setSelected(null); setResult({ rows: [], nextCursor: null }); setError(""); setLoading(true);
      });
    }
    function schedule() {
      if (document.visibilityState !== "visible" || Date.now() >= expiresAt || !needsRead.current || listRequest.current || scheduledRead.current !== undefined) return;
      scheduledRead.current = window.setTimeout(() => {
        scheduledRead.current = undefined;
        const target = readTarget.current;
        void load(target.cursor, target.filters, target.page);
      }, 0);
    }
    function visibility() {
      if (document.visibilityState !== "visible") conceal();
      else schedule();
    }
    function restore(event: PageTransitionEvent) {
      if (!event.persisted) return;
      conceal();
      schedule();
    }
    let timeout: number;
    function checkExpiry() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        cancelRead();
        needsRead.current = false;
        setExpired(true); setSelected(null); setResult({ rows: [], nextCursor: null });
      } else timeout = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    }
    checkExpiry();
    schedule();
    window.addEventListener("pagehide", conceal);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timeout);
      cancelRead();
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [expiresAt, filters, load]);

  useEffect(() => {
    if (!filtersOpen) return;
    const scheduled = window.setTimeout(() => filterPanel.current?.querySelector<HTMLInputElement>("input")?.focus(), 0);
    return () => window.clearTimeout(scheduled);
  }, [filtersOpen]);

  function closeFilters() {
    setFiltersOpen(false);
    filterToggle.current?.focus({ preventScroll: true });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.start && draft.end && draft.start > draft.end) { setError("开始日期须早于或等于结束日期。"); return; }
    setSelected(null);
    setResult({ rows: [], nextCursor: null }); setLoading(true);
    setPageIndex(0); setPageCursors([""]);
    setFilters({ ...draft, id: draft.id.trim() });
    if (filtersOpen) closeFilters();
  }
  function open(row: RecordRow, control: HTMLElement) { setSelected({ row, returnFocus: control }); }
  const dateFiltered = Boolean(filters.start || filters.end);
  if (expired) return <p role="alert">登录已失效，请重新登录后查看路引记录。</p>;
  return <section className={styles.workspace} aria-label="路引会话记录">
    <div className={styles.filterRegion}>
      <button ref={filterToggle} className={`${styles.secondary} ${styles.filterToggle}`} type="button" aria-expanded={filtersOpen} aria-controls="hermit-record-filters" onClick={() => setFiltersOpen(!filtersOpen)}>筛选条件</button>
      {filtersOpen && <button className={styles.filterBackdrop} type="button" tabIndex={-1} aria-label="关闭筛选条件" onClick={closeFilters} />}
    <form ref={filterPanel} id="hermit-record-filters" className={styles.filters} data-expanded={filtersOpen} onSubmit={submit} aria-label="筛选路引记录" onKeyDown={event => {
      if (!filtersOpen) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeFilters(); return; }
      if (event.key !== "Tab" || !window.matchMedia("(max-height: 700px)").matches) return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)")).filter(control => control.getClientRects().length > 0);
      const target = event.shiftKey ? controls.at(-1) : controls[0];
      if (event.shiftKey && document.activeElement === controls[0] || !event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); target?.focus(); }
    }}>
      <div className={styles.filterPanelHeader}><strong>筛选条件</strong><button className={styles.secondary} type="button" onClick={closeFilters}>收起筛选</button></div>
      <label>开始日期<input type="date" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label>
      <label>结束日期<input type="date" value={draft.end} min={draft.start || undefined} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label>
      <label>用户类型<select value={draft.actor} onChange={event => setDraft({ ...draft, actor: event.target.value })}><option value="">全部类型</option><option value="employee">员工</option><option value="guest">访客</option><option value="unknown">身份未明确</option></select></label>
      <label className={styles.identifier}>会话编号<input type="search" maxLength={191} placeholder="输入完整会话编号" value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })} /></label>
      <button className={styles.primary} type="submit" disabled={loading}>筛选</button>
      <button className={styles.secondary} type="button" disabled={loading} onClick={() => { setDraft(emptyFilters); setSelected(null); setResult({ rows: [], nextCursor: null }); setLoading(true); setPageIndex(0); setPageCursors([""]); setFilters({ ...emptyFilters }); }}>重置</button>
    </form>
    </div>
    {error && <div role="alert" className={styles.error}><p>{error}</p><button className={styles.secondary} type="button" onClick={() => { const target = readTarget.current; void load(target.cursor, target.filters, target.page); }}>重试读取</button></div>}
    <div ref={tableScroll} className={styles.tableScroll} aria-busy={loading} tabIndex={0} aria-label="路引记录表格，可滚动">
      <table className={styles.table}><thead><tr><th scope="col">会话编号</th><th scope="col">用户</th><th scope="col">所属组织</th><th scope="col">开始时间</th><th scope="col">最后提问</th><th scope="col">{dateFiltered ? "时段轮次" : "轮次"}</th></tr></thead>
        <tbody>{result.rows.map(row => <tr key={row.id} onClick={event => { if (!(event.target instanceof Element) || !event.target.closest("button")) open(row, event.currentTarget.querySelector("button")!); }}>
          <th scope="row"><button type="button" className={styles.recordLink} onClick={event => open(row, event.currentTarget)} aria-label={`回看会话 ${row.id}`}>{row.id}</button></th><td className={styles.employeeCell}><span>{employeeLabel(row)}</span>{row.actor === "employee" && <small>员工 · {identitySource(row)}</small>}</td><td className={styles.organizationCell}>{organizationLabel(row)}</td><td>{dateLabel(row.createdAt)}</td><td>{dateLabel(row.lastQuestionAt)}</td><td>{dateFiltered ? row.periodTurns : row.turns}</td>
        </tr>)}</tbody>
      </table>
      {!loading && !error && !result.rows.length && <p role="status" className={styles.state}>所选条件下暂无路引记录。</p>}
    </div>
    <div className={styles.pagination} aria-label="路引记录分页">
      <span role="status">{loading ? "正在读取路引记录…" : `第 ${pageIndex + 1} 页 · 本页 ${result.rows.length} 条`}</span>
      <div><button className={styles.secondary} type="button" disabled={loading || pageIndex === 0} onClick={() => void load(pageCursors[pageIndex - 1] || undefined, filters, pageIndex - 1)}>上一页</button><button className={styles.secondary} type="button" disabled={loading || !result.nextCursor} onClick={() => void load(result.nextCursor!, filters, pageIndex + 1)}>下一页</button></div>
    </div>
    {selected && <ConversationWindow key={selected.row.id} row={selected.row} expiresAt={expiresAt} onClose={() => setSelected(null)} returnFocus={selected.returnFocus} />}
  </section>;
}

function ConversationWindow({ row, expiresAt, onClose, returnFocus }: {
  row: RecordRow; expiresAt: number; onClose: () => void; returnFocus: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [content, setContent] = useState<ContentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const read = useCallback(async (cursor?: string) => {
    if (request.current || Date.now() >= expiresAt || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const response = await authFetch("/api/admin/hermit-records/content", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ id: row.id, ...(cursor ? { cursor } : {}) }), signal: controller.signal,
      });
      if (!response.ok) throw new Error("content unavailable");
      const result = await response.json() as ContentResult;
      if (!Array.isArray(result.messages) || result.messages.some(message => !message || typeof message.id !== "string" || !["user", "assistant"].includes(message.role) || typeof message.text !== "string") || (result.nextCursor !== null && typeof result.nextCursor !== "string")) throw new Error("invalid transcript");
      if (controller.signal.aborted || Date.now() >= expiresAt || document.visibilityState !== "visible") return;
      setContent(previous => ({ messages: cursor && previous ? [...previous.messages, ...result.messages.filter(message => !previous.messages.some(old => old.id === message.id))] : result.messages, nextCursor: result.nextCursor, view: result.view }));
    } catch {
      if (!controller.signal.aborted) { setContent(null); setError("暂时无法查看对话，请重试。若权限已变化，请刷新页面。"); }
    } finally {
      if (request.current === controller) { request.current = null; if (!controller.signal.aborted) setLoading(false); }
    }
  }, [expiresAt, row.id]);

  useEffect(() => {
    const element = dialog.current;
    const scrollRoot = document.documentElement;
    const overflow = scrollRoot.style.overflow;
    scrollRoot.style.overflow = "hidden";
    element?.showModal();
    // The row click mounts this view. Deferring the first read merges Strict Mode setup passes.
    const scheduled = window.setTimeout(() => { void read(); }, 0);
    return () => {
      window.clearTimeout(scheduled);
      request.current?.abort();
      request.current = null;
      element?.close();
      scrollRoot.style.overflow = overflow;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [read, returnFocus]);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="hermit-record-window-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClose={event => { if (!event.currentTarget.open) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <header className={styles.dialogHeader}><div><p className={styles.eyebrow}>路引记录 · 只读回看</p><h2 id="hermit-record-window-title">对话回看</h2></div><button className={styles.secondary} type="button" onClick={onClose} autoFocus aria-label="关闭对话回看">关闭</button></header>
    <dl className={styles.metadata}>
      {!content && <div className={styles.recordId}><dt>会话编号</dt><dd>{row.id}</dd></div>}
      <div><dt>{row.actor === "employee" ? "员工" : "用户类型"}</dt><dd>{employeeLabel(row)}</dd></div>
      {row.actor === "employee" && <div><dt>所属组织</dt><dd>{organizationLabel(row)}</dd></div>}
      <div><dt>开始时间</dt><dd>{dateLabel(row.createdAt)}</dd></div>
      {!content && <div><dt>最后提问</dt><dd>{dateLabel(row.lastQuestionAt)}</dd></div>}
      <div><dt>对话轮次</dt><dd>{row.turns}</dd></div>
      {row.actor === "employee" && <div className={styles.sourceNote}><dt>资料来源</dt><dd>{identitySource(row)}{row.identity?.source === "current-profile" && "，不代表会话发生时的工号与组织"}</dd></div>}
    </dl>
    <div className={styles.dialogBody}>
        {loading && !content && <p role="status" className={styles.state}>正在读取对话…</p>}
        {error && <div role="alert" className={styles.error}><p>{error}</p><button className={styles.secondary} type="button" onClick={() => void read()}>重试读取对话</button></div>}
        {content && <div data-lh-hermit-conversation className={styles.transcript} aria-label="已保存的对话内容">
          {content.view === "stored-attempts" && <p className={styles.hint}>会话较长，按保存顺序显示全部问答记录，包含重试回答。</p>}
          {content.messages.length ? content.messages.map(message => <TranscriptMessage key={message.id} message={message} />) : <p role="status" className={styles.state}>这段会话暂无已保存的提问或回复。</p>}
          {content.nextCursor && <button className={styles.secondary} type="button" disabled={loading} onClick={() => void read(content.nextCursor!)}>{loading ? "正在读取…" : "继续读取后续对话"}</button>}
          {!content.nextCursor && content.messages.length > 0 && <p className={styles.end}>已到这段对话的末尾</p>}
        </div>}
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
