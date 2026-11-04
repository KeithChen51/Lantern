"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { LhButton, LhCard, LhEmptyState, LhPanel, LhStateNotice, LhTextArea, LhTextField } from "@/components/ui/lighthouse-primitives";
import { SUGGESTION_CATEGORIES, SUGGESTION_STATUSES, SUGGESTION_LIMITS, type BoardViewer, type BoardNotificationResult, type SuggestionCategory, type SuggestionDetail, type SuggestionListResult } from "@/modules/feedback/board-types";
import { boardRequest, useBoardResource } from "./board-client";
import { BoardError, BoardLoading, BoardSelect, BoardTime, SuggestionMeta } from "./board-ui";
import styles from "./board.module.css";

export function FeedbackBoard({ viewer }: { viewer: BoardViewer }) {
  const [tab, setTab] = useState<"feed" | "notifications">("feed");
  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("latest");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [published, setPublished] = useState<SuggestionDetail | null>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const query = new URLSearchParams({ sort, page: String(page) });
  if (category) query.set("category", category);
  if (status) query.set("status", status);
  if (mine) query.set("mine", "true");
  const feed = useBoardResource<SuggestionListResult>(`/api/feedback?${query}`);
  const notifications = useBoardResource<BoardNotificationResult>("/api/feedback/notifications");
  const [notificationCursor, setNotificationCursor] = useState<string | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const totalPages = feed.data ? Math.max(1, Math.ceil(feed.data.total / feed.data.pageSize)) : 1;

  async function markRead(ids: string[]) {
    setNotificationBusy(true);
    setNotificationError("");
    try {
      await boardRequest("/api/feedback/notifications", { method: "PATCH", body: { ids }, csrfToken: viewer.csrfToken });
      window.dispatchEvent(new CustomEvent("lighthouse:feedback-notifications-read"));
      const data = notifications.data;
      if (data) {
        const newlyRead = data.items.filter((item) => ids.includes(item.id) && !item.readAt).length;
        notifications.update({ ...data, unreadCount: Math.max(0, data.unreadCount - newlyRead), items: data.items.map((item) => ids.includes(item.id) ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item) });
      }
    } catch (error) { setNotificationError(error instanceof Error ? error.message : "标记未完成，请重试。"); }
    finally { setNotificationBusy(false); }
  }

  async function moreNotifications() {
    const cursor = notificationCursor ?? notifications.data?.nextCursor;
    if (!cursor || !notifications.data) return;
    setNotificationBusy(true);
    setNotificationError("");
    try {
      const next = await boardRequest<BoardNotificationResult>(`/api/feedback/notifications?cursor=${encodeURIComponent(cursor)}`);
      notifications.update({ ...next, items: [...notifications.data.items, ...next.items] });
      setNotificationCursor(next.nextCursor);
    } catch (error) { setNotificationError(error instanceof Error ? error.message : "加载失败，请重试。"); }
    finally { setNotificationBusy(false); }
  }

  function closeComposer() { setComposing(false); publishButton.current?.focus(); }

  return <div className={styles.stack}>
    <div className={styles.toolbar}>
      <div className={styles.tabs} role="group" aria-label="建议看板视图">
        <LhButton type="button" aria-pressed={tab === "feed"} variant={tab === "feed" ? "primary" : "secondary"} onClick={() => setTab("feed")}>建议看板</LhButton>
        <LhButton type="button" aria-pressed={tab === "notifications"} variant={tab === "notifications" ? "primary" : "secondary"} onClick={() => { setTab("notifications"); notifications.reload(); setNotificationCursor(null); }}>我的通知{(notifications.data?.unreadCount ?? 0) > 0 && <span className={styles.badge} aria-label={`${notifications.data!.unreadCount} 条未读`}>{notifications.data!.unreadCount}</span>}</LhButton>
      </div>
      <LhButton ref={publishButton} type="button" variant="primary" aria-expanded={composing} aria-controls="publish-suggestion" onClick={() => { setComposing((value) => !value); setTab("feed"); }}>发布建议</LhButton>
    </div>
    {composing && <LhPanel id="publish-suggestion" className={styles.panel}><PublishSuggestion viewer={viewer} onCancel={closeComposer} onPublished={(item) => { setPublished(item); closeComposer(); setPage(1); feed.reload(); }} /></LhPanel>}
    {published && <LhStateNotice tone="success">建议已发布。<Link className={styles.link} href={`/feedback/${encodeURIComponent(published.id)}`}>查看“{published.title}”</Link></LhStateNotice>}
    {tab === "feed" ? <>
      <LhPanel className={`${styles.panel} ${styles.stack}`} aria-label="筛选建议">
        <div className={styles.filters}>
          <BoardSelect label="建议分类" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">全部分类</option>{SUGGESTION_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</BoardSelect>
          <BoardSelect label="处理状态" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">全部状态</option>{SUGGESTION_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</BoardSelect>
          <BoardSelect label="排列顺序" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="latest">最新发布</option><option value="popular">最多赞同</option></BoardSelect>
        </div>
        <div className={styles.toolbar}><label className={styles.check}><input type="checkbox" checked={mine} onChange={(event) => { setMine(event.target.checked); setPage(1); }} />只看我的建议</label>{(category || status || mine) && <LhButton type="button" variant="ghost" onClick={() => { setCategory(""); setStatus(""); setMine(false); setPage(1); }}>清除筛选</LhButton>}</div>
      </LhPanel>
      {feed.loading && <BoardLoading />}
      {feed.error && <BoardError message={feed.error} retry={feed.reload} />}
      {feed.data && <>
        <p className={styles.meta} role="status">共 {feed.data.total} 条建议</p>
        {feed.data.items.length === 0 ? <LhEmptyState title="暂无建议" description={category || status || mine ? "当前筛选下暂无建议，可清除筛选查看全部。" : "把你希望改进的地方写下来，一起讨论下一步。"} /> : <ul className={styles.feed} aria-label="建议列表">{feed.data.items.map((item) => <li key={item.id}><LhCard className={styles.panel}><SuggestionMeta item={item} /><h2 className={styles.title}><Link href={`/feedback/${encodeURIComponent(item.id)}`}>{item.title}</Link></h2><div className={styles.meta}><span>{item.likeCount} 人赞同</span><span>{item.commentCount} 条评论</span>{item.likedByMe && <span>你已赞同</span>}</div></LhCard></li>)}</ul>}
        {totalPages > 1 && <nav className={styles.toolbar} aria-label="建议分页"><LhButton type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</LhButton><span aria-live="polite">第 {page} / {totalPages} 页</span><LhButton type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</LhButton></nav>}
      </>}
    </> : <section className={styles.stack} aria-label="我的通知">
      <div className={styles.toolbar}><h2 className={styles.sectionTitle}>我的通知</h2><LhButton type="button" disabled={notificationBusy || !notifications.data?.items.some((item) => !item.readAt)} onClick={() => void markRead(notifications.data!.items.filter((item) => !item.readAt).map((item) => item.id))}>本页全部已读</LhButton></div>
      {notifications.loading && <BoardLoading />}
      {notifications.error && <BoardError message={notifications.error} retry={notifications.reload} />}
      {notificationError && <BoardError message={notificationError} />}
      {notifications.data?.items.length === 0 && <LhEmptyState title="暂无通知" description="建议有新回应或收到回复时，会在这里提醒你。" />}
      <ul className={styles.feed}>{notifications.data?.items.map((item) => <li key={item.id}><LhPanel className={`${styles.panel} ${styles.notification} ${!item.readAt ? styles.unread : ""}`}><div className={styles.meta}>{!item.readAt && <span>未读</span>}<BoardTime value={item.createdAt} /></div><Link className={styles.link} href={`/feedback/${encodeURIComponent(item.suggestionId)}`}>{item.title}</Link><p className={styles.plain}>{item.message}</p>{!item.readAt && <div><LhButton type="button" disabled={notificationBusy} onClick={() => void markRead([item.id])}>标为已读</LhButton></div>}</LhPanel></li>)}</ul>
      {notifications.data?.nextCursor && <LhButton type="button" disabled={notificationBusy} onClick={() => void moreNotifications()}>{notificationBusy ? "加载中…" : "更多通知"}</LhButton>}
    </section>}
  </div>;
}

export function PublishSuggestion({ viewer, onPublished, onCancel }: { viewer: BoardViewer; onPublished: (item: SuggestionDetail) => void; onCancel: () => void }) {
  const [category, setCategory] = useState<SuggestionCategory>("platform");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) { setError("请填写建议标题。"); titleInput.current?.focus(); return; }
    if (!content.trim()) { setError("请填写建议内容。"); contentInput.current?.focus(); return; }
    setBusy(true); setError("");
    try { onPublished(await boardRequest<SuggestionDetail>("/api/feedback", { method: "POST", body: { category, title: title.trim(), content: content.trim() }, csrfToken: viewer.csrfToken })); }
    catch (error) { setError(error instanceof Error ? error.message : "发布失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-label="发布建议" noValidate>
    <h2 className={styles.sectionTitle}>发布建议</h2>
    <p className={styles.meta}>以 {viewer.displayName} 的身份发布。所有内容仅员工可见。</p>
    <fieldset disabled={busy}>
      <BoardSelect label="建议分类" value={category} required onChange={(event) => setCategory(event.target.value as SuggestionCategory)}>{SUGGESTION_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</BoardSelect>
      <LhTextField ref={titleInput} id="suggestion-title" label="建议标题" required maxLength={SUGGESTION_LIMITS.title} value={title} onChange={(event) => setTitle(event.target.value)} helperText={`用一句话说明建议，最多 ${SUGGESTION_LIMITS.title} 字。`} />
      <LhTextArea ref={contentInput} id="suggestion-content" label="建议内容" required rows={6} maxLength={SUGGESTION_LIMITS.content} value={content} onChange={(event) => setContent(event.target.value)} helperText={`描述当前问题和希望的改进，仅支持文字，最多 ${SUGGESTION_LIMITS.content} 字。`} />
    </fieldset>
    {error && <BoardError message={error} />}
    <div className={styles.actions}><LhButton type="submit" variant="primary" disabled={busy} aria-busy={busy}>{busy ? "发布中…" : "确认发布"}</LhButton><LhButton type="button" disabled={busy} onClick={onCancel}>取消</LhButton></div>
  </form>;
}
