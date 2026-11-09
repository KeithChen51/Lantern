"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReadingEntryLink, ReadingListPosition } from "@/components/knowledge/ReadingListNavigation";
import { readingEntryId } from "@/components/knowledge/reading-return";
import { PageHeading } from "@/components/ui/PageHeading";
import { Heart, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LhButton, LhCard, LhEmptyState, LhPanel, LhStateNotice, LhTextArea, LhTextField } from "@/components/ui/lighthouse-primitives";
import { SUGGESTION_CATEGORIES, SUGGESTION_STATUSES, SUGGESTION_LIMITS, type BoardViewer, type BoardNotificationResult, type SuggestionCategory, type SuggestionDetail, type SuggestionListResult, type SuggestionSummary } from "@/modules/feedback/board-types";
import { boardRequest, captureBoardAuthorization, markBoardNotificationsRead, subscribeBoardAuthorization, useBoardResource } from "./board-client";
import { BoardError, BoardLoading, BoardSelect, BoardTime, StatusBadge, categoryLabel, statusLabel } from "./board-ui";
import { feedbackListHref, readFeedbackBrowse, type FeedbackBrowse } from "./feedback-navigation";
import { clearSuggestionDraft, emptySuggestionDraft, readSuggestionDraft, writeSuggestionDraft } from "./suggestion-draft";
import styles from "./board.module.css";

export function FeedbackBoard({ viewer }: { viewer: BoardViewer }) {
  const params = useSearchParams();
  const browse = readFeedbackBrowse(params);
  const { category, status, scope, sort, page } = browse;
  const returnTo = feedbackListHref(browse);
  function setBrowse(patch: Partial<FeedbackBrowse>) {
    const current = readFeedbackBrowse(new URLSearchParams(window.location.search));
    window.history.replaceState(null, "", feedbackListHref({ ...current, ...patch }));
  }
  const [tab, setTab] = useState<"feed" | "notifications">("feed");
  const categoryRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = categoryRow.current;
    if (!row) return;
    const revealSelectedCategory = () => {
      const selected = row.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!selected) return;
      const bounds = row.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      // Only move this strip; vertical scrolling belongs to list-position recovery.
      if (item.left < bounds.left + 4) row.scrollLeft += item.left - bounds.left - 4;
      else if (item.right > bounds.right - 4) row.scrollLeft += item.right - bounds.right + 4;
    };
    revealSelectedCategory();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(revealSelectedCategory);
    observer.observe(row);
    return () => observer.disconnect();
  }, [category, tab]);
  const [composing, setComposing] = useState(false);
  const [likeStates, setLikeStates] = useState<Record<string, { busy: boolean; error?: string }>>({});
  const pendingLikes = useRef(new Set<string>());
  const [published, setPublished] = useState<SuggestionDetail | null>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const query = new URLSearchParams({ sort, page: String(page) });
  if (category) query.set("category", category);
  if (status) query.set("status", status);
  if (scope === "mine") query.set("mine", "true");
  if (scope === "participated") query.set("participated", "true");
  const feedKey = query.toString();
  const currentFeed = useRef({ key: feedKey, revision: 0 });
  if (currentFeed.current.key !== feedKey) currentFeed.current = { key: feedKey, revision: currentFeed.current.revision + 1 };
  const feed = useBoardResource<SuggestionListResult>(`/api/feedback?${query}`, viewer.userId);
  const notifications = useBoardResource<BoardNotificationResult>("/api/feedback/notifications", viewer.userId);
  const latestFeed = useRef({ owner: viewer.userId, reload: feed.reload });
  latestFeed.current = { owner: viewer.userId, reload: feed.reload };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const totalPages = feed.data ? Math.min(1000, Math.max(1, Math.ceil(feed.data.total / feed.data.pageSize))) : 1;

  useEffect(() => {
    if (feed.data && !feed.loading && page > totalPages) {
      window.history.replaceState(null, "", feedbackListHref({ ...readFeedbackBrowse(new URLSearchParams(window.location.search)), page: totalPages }));
    }
  }, [feed.data, feed.loading, page, totalPages]);

  useEffect(() => subscribeBoardAuthorization(viewer.userId, () => {
    clearSuggestionDraft(viewer.userId);
    setComposing(false);
    setPublished(null);
  }), [viewer.userId]);

  async function markRead(ids: string[]) {
    setNotificationBusy(true);
    setNotificationError("");
    try {
      await markBoardNotificationsRead(ids, viewer.csrfToken, viewer.userId, (batch) => {
        notifications.update((data) => {
          if (!data) return data;
          const newlyRead = data.items.filter((item) => batch.includes(item.id) && !item.readAt).length;
          return { ...data, unreadCount: Math.max(0, data.unreadCount - newlyRead), items: data.items.map((item) => batch.includes(item.id) ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item) };
        });
        window.dispatchEvent(new CustomEvent("lighthouse:feedback-notifications-read"));
      });
    } catch (error) { setNotificationError(error instanceof Error ? error.message : "标记未完成，请重试。"); }
    finally { setNotificationBusy(false); }
  }

  async function moreNotifications() {
    const cursor = notifications.data?.nextCursor;
    if (!cursor || !notifications.data) return;
    setNotificationBusy(true);
    setNotificationError("");
    try {
      const next = await boardRequest<BoardNotificationResult>(`/api/feedback/notifications?cursor=${encodeURIComponent(cursor)}`, undefined, viewer.userId);
      notifications.update((data) => {
        if (!data) return data;
        const seen = new Set(data.items.map((item) => item.id));
        return { ...next, items: [...data.items, ...next.items.filter((item) => !seen.has(item.id))] };
      });
    } catch (error) { setNotificationError(error instanceof Error ? error.message : "加载失败，请重试。"); }
    finally { setNotificationBusy(false); }
  }

  function closeComposer() { setComposing(false); publishButton.current?.focus(); }

  async function toggleLike(item: SuggestionSummary) {
    if (pendingLikes.current.has(item.id)) return;
    pendingLikes.current.add(item.id);
    const requestRevision = currentFeed.current.revision;
    const requestOwner = viewer.userId;
    const authorized = captureBoardAuthorization(requestOwner);
    const canApply = () => mounted.current && latestFeed.current.owner === requestOwner && authorized();
    setLikeStates((previous) => ({ ...previous, [item.id]: { busy: true } }));
    try {
      const result = await boardRequest<{ liked: boolean; likeCount: number }>(`/api/feedback/${encodeURIComponent(item.id)}/like`, { method: "PUT", body: { liked: !item.likedByMe }, csrfToken: viewer.csrfToken }, viewer.userId);
      if (!canApply()) return;
      if (currentFeed.current.revision === requestRevision) feed.update((data) => data ? { ...data, items: data.items.map((entry) => entry.id === item.id ? { ...entry, likedByMe: result.liked, likeCount: result.likeCount } : entry) } : data);
      latestFeed.current.reload();
    } catch (error) {
      if (canApply() && currentFeed.current.revision === requestRevision) setLikeStates((previous) => ({ ...previous, [item.id]: { busy: false, error: error instanceof Error ? error.message : "赞同未完成，请重试。" } }));
    } finally {
      pendingLikes.current.delete(item.id);
      if (mounted.current && latestFeed.current.owner === requestOwner) setLikeStates((previous) => ({ ...previous, [item.id]: { ...previous[item.id], busy: false } }));
    }
  }

  return <div className={styles.stack}>
    <div className={styles.feedHeading}><PageHeading title="建议广场"><LhButton type="button" variant="ghost" disabled={notificationBusy} aria-pressed={tab === "notifications"} onClick={() => { setTab("notifications"); notifications.reload(); }}>我的通知{(notifications.data?.unreadCount ?? 0) > 0 && <span className={styles.badge} aria-label={`${notifications.data!.unreadCount} 条未读`}>{notifications.data!.unreadCount}</span>}</LhButton><LhButton ref={publishButton} type="button" variant="primary" aria-haspopup="dialog" onClick={() => setComposing(true)}>提建议</LhButton></PageHeading></div>
    {composing && <ComposerDialog key={viewer.userId} viewer={viewer} onCancel={closeComposer} onPublished={(item) => { setPublished(item); closeComposer(); setTab("feed"); setBrowse({ scope: "all", sort: "latest", category: "", status: "", page: 1 }); feed.reload(); }} />}
    {published && !feed.error && <LhStateNotice tone="success">建议已发布。<Link className={styles.link} href={`/feedback/${encodeURIComponent(published.id)}`}>查看“{published.title}”</Link></LhStateNotice>}
    {tab === "feed" ? <>
      <section className={styles.feedNavigation} aria-label="建议浏览">
        <div className={styles.browseRow}>
          <div className={styles.feedTabs} role="group" aria-label="浏览范围">
            {([{ value: "all", label: "全部建议" }, { value: "participated", label: "我参与的" }, { value: "mine", label: "我发起的" }] as const).map((option) => <button key={option.value} type="button" aria-pressed={scope === option.value} aria-describedby={option.value === "participated" ? "participated-scope-hint" : undefined} onClick={() => setBrowse({ scope: option.value, page: 1 })}>{option.label}</button>)}
          </div>
          <span id="participated-scope-hint" className="sr-only">包括你发起、赞同或评论过的建议。</span>
          <div className={styles.browseControls}>
            <label className={styles.browseSelect}><span>排序</span><select aria-label="建议排序" value={sort} onChange={(event) => setBrowse({ sort: event.target.value as FeedbackBrowse["sort"], page: 1 })}><option value="latest">最新发布</option><option value="popular">最多赞同</option></select></label>
            <label className={styles.browseSelect}><span>状态</span><select aria-label="处理状态" value={status} onChange={(event) => setBrowse({ status: event.target.value, page: 1 })}><option value="">全部状态</option>{SUGGESTION_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
        </div>
        <div ref={categoryRow} className={styles.categoryRow} role="group" aria-label="建议类型"><button type="button" aria-pressed={!category} onClick={() => setBrowse({ category: "", page: 1 })}>全部类型</button>{SUGGESTION_CATEGORIES.map((option) => <button type="button" key={option.value} aria-pressed={category === option.value} onClick={() => setBrowse({ category: option.value, page: 1 })}>{option.label}</button>)}</div>
      </section>
      {feed.loading && <BoardLoading />}
      {feed.error && <BoardError message={feed.error} retry={feed.reload} />}
      {feed.data && <>
        {feed.data.items.length === 0 ? <LhEmptyState
          title={status ? `暂无“${statusLabel(status)}”的建议` : "暂无建议"}
          description={category || status || scope !== "all" ? `当前范围：${[scope === "participated" && "我参与的", scope === "mine" && "我发起的", category && categoryLabel(category), status && statusLabel(status)].filter(Boolean).join(" · ")}。` : "把你希望改进的地方写下来，一起讨论下一步。"}
          action={category || status ? <LhButton type="button" onClick={() => setBrowse({ category: "", status: "", page: 1 })}>清除类型和状态筛选</LhButton> : scope !== "all" ? <LhButton type="button" onClick={() => setBrowse({ scope: "all", page: 1 })}>查看全部建议</LhButton> : undefined}
        /> : <ul className={styles.feed} aria-label="建议列表">{feed.data.items.map((item) => <li key={item.id}><SuggestionFeedCard item={item} returnTo={returnTo} busy={feed.loading || !!likeStates[item.id]?.busy} error={likeStates[item.id]?.error} onLike={() => void toggleLike(item)} /></li>)}</ul>}
        {!feed.loading && <ReadingListPosition key={returnTo} returnTo={returnTo} />}
        {totalPages > 1 && <nav className={styles.toolbar} aria-label="建议分页"><LhButton type="button" disabled={page <= 1} onClick={() => setBrowse({ page: page - 1 })}>上一页</LhButton><span aria-live="polite">第 {page} / {totalPages} 页</span><LhButton type="button" disabled={page >= totalPages} onClick={() => setBrowse({ page: page + 1 })}>下一页</LhButton></nav>}
      </>}
    </> : <section className={styles.stack} aria-label="我的通知">
      <LhButton type="button" variant="ghost" onClick={() => setTab("feed")}>返回建议广场</LhButton><div className={styles.toolbar}><h2 className={styles.sectionTitle}>我的通知</h2><LhButton type="button" disabled={notificationBusy || notifications.loading || !notifications.data?.items.some((item) => !item.readAt)} onClick={() => void markRead(notifications.data!.items.filter((item) => !item.readAt).map((item) => item.id))}>将已加载通知标为已读</LhButton></div>
      {notifications.loading && <BoardLoading />}
      {notifications.error && <BoardError message={notifications.error} retry={notifications.reload} />}
      {notificationError && <BoardError message={notificationError} />}
      {notifications.data?.items.length === 0 && <LhEmptyState title="暂无通知" description="建议有新回应或收到回复时，会在这里提醒你。" />}
      <ul className={styles.feed}>{notifications.data?.items.map((item) => <li key={item.id}><LhPanel className={`${styles.panel} ${styles.notification} ${!item.readAt ? styles.unread : ""}`}><div className={styles.meta}>{!item.readAt && <span>未读</span>}<BoardTime value={item.createdAt} /></div><Link className={styles.link} href={`/feedback/${encodeURIComponent(item.suggestionId)}`}>{item.title}</Link><p className={styles.plain}>{item.message}</p>{!item.readAt && <div><LhButton type="button" disabled={notificationBusy || notifications.loading} onClick={() => void markRead([item.id])}>标为已读</LhButton></div>}</LhPanel></li>)}</ul>
      {notifications.data?.nextCursor && <LhButton type="button" disabled={notificationBusy || notifications.loading} onClick={() => void moreNotifications()}>{notificationBusy ? "加载中…" : "更多通知"}</LhButton>}
    </section>}
  </div>;
}

export function SuggestionFeedCard({ item, returnTo = "/feedback", busy, error, onLike }: { item: SuggestionSummary; returnTo?: string; busy: boolean; error?: string; onLike: () => void }) {
  const href = `/feedback/${encodeURIComponent(item.id)}`;
  return <LhCard className={`${styles.panel} ${styles.feedCard}`}>
    <ReadingEntryLink href={href} returnTo={returnTo} entryId={readingEntryId(item.id)} className={styles.cardMain} aria-label={`查看建议：${item.title}`}>
      <span className={styles.avatar} aria-hidden="true">{Array.from(item.author.name)[0]}</span>
      <div className={styles.cardCopy}>
        <h2 className={styles.title}>{item.title}</h2>
        <p className={styles.excerpt}>{item.excerpt}</p>
      </div>
    </ReadingEntryLink>
    <div className={styles.cardMeta}>
          <span className={styles.cardAuthor} title={item.author.name}>{item.author.name}</span>
          <span className={styles.cardTime}><BoardTime value={item.createdAt} /></span>
          <span className={styles.cardCategory} title={categoryLabel(item.category)}><span className={styles.desktopCategory}>{categoryLabel(item.category)}</span><span className={styles.mobileCategory}>{item.category === "platform" ? "平台体验" : item.category === "knowledge" ? "内容知识" : categoryLabel(item.category)}</span></span>
          <span className={styles.cardStatus}><StatusBadge status={item.status} /></span>
          {item.latestResponse && <span className={styles.responseHint} title={`${item.latestResponse.actor.name}：${item.latestResponse.note}`}>有管理员回应</span>}
    </div>
    <div className={styles.postActions}>
      <button type="button" disabled={busy} aria-pressed={item.likedByMe} aria-busy={busy} aria-label={`${item.likedByMe ? "取消赞同" : "赞同"}「${item.title}」，${item.likeCount} 人赞同`} onClick={onLike}><Heart aria-hidden="true" fill={item.likedByMe ? "currentColor" : "none"} /><span title={String(item.likeCount)}>{compactCount(item.likeCount)}</span></button>
      <ReadingEntryLink href={`${href}#discussion`} returnTo={returnTo} entryId={readingEntryId(`${item.id}-discussion`)} scroll={false} aria-label={`评论「${item.title}」，${item.commentCount} 条评论`}><MessageCircle aria-hidden="true" /><span title={String(item.commentCount)}>{compactCount(item.commentCount)}</span></ReadingEntryLink>
    </div>
    {error && <div className={styles.cardError}><BoardError message={error} /></div>}
  </LhCard>;
}

function compactCount(count: number): string {
  if (count >= 10000) return `${Math.floor(count / 10000)}万`;
  return count >= 1000 ? `${Math.floor(count / 1000)}千` : String(count);
}

export function ComposerDialog({ viewer, onPublished, onCancel }: { viewer: BoardViewer; onPublished: (item: SuggestionDetail) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLInputElement>("#suggestion-title")?.focus();
    return () => element?.close();
  }, []);
  function close() { dialog.current?.close(); onCancel(); }
  function published(item: SuggestionDetail) { dialog.current?.close(); onPublished(item); }
  return <dialog ref={dialog} className={styles.composerDialog} aria-labelledby="publish-heading" onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}><PublishSuggestion viewer={viewer} onPublished={published} onCancel={close} onBusyChange={setBusy} /></dialog>;
}

export function PublishSuggestion({ viewer, onPublished, onCancel, onBusyChange }: { viewer: BoardViewer; onPublished: (item: SuggestionDetail) => void; onCancel: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [draft, setDraft] = useState(() => readSuggestionDraft(viewer.userId));
  const { category, title, content } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const authorized = useRef(captureBoardAuthorization(viewer.userId));
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function updateDraft(patch: Partial<typeof draft>) {
    if (!authorized.current()) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    writeSuggestionDraft(viewer.userId, next);
  }
  function discardDraft() {
    clearSuggestionDraft(viewer.userId);
    onCancel();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) { setError("请填写建议标题。"); titleInput.current?.focus(); return; }
    if (!content.trim()) { setError("请填写建议内容。"); contentInput.current?.focus(); return; }
    setBusy(true); onBusyChange?.(true); setError("");
    try {
      const item = await boardRequest<SuggestionDetail>("/api/feedback", { method: "POST", body: { category, title: title.trim(), content: content.trim() }, csrfToken: viewer.csrfToken }, viewer.userId);
      if (authorized.current()) {
        const currentDraft = readSuggestionDraft(viewer.userId);
        if (currentDraft.category === draft.category && currentDraft.title === draft.title && currentDraft.content === draft.content) {
          clearSuggestionDraft(viewer.userId);
        }
        if (mounted.current) onPublished(item);
      }
    }
    catch (error) { setError(error instanceof Error ? error.message : "发布失败，请重试。"); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-label="发布建议" noValidate>
    <h2 id="publish-heading" className={styles.sectionTitle}>提出你的建议</h2>
    <p className={styles.meta}>以 {viewer.displayName} 的身份发布。所有内容仅员工可见。</p>
    <fieldset disabled={busy}>
      <BoardSelect label="建议分类" value={category} required onChange={(event) => updateDraft({ category: event.target.value as SuggestionCategory })}>{SUGGESTION_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</BoardSelect>
      <LhTextField ref={titleInput} id="suggestion-title" label="建议标题" required maxLength={SUGGESTION_LIMITS.title} value={title} onChange={(event) => updateDraft({ title: event.target.value })} helperText={`用一句话说明建议，最多 ${SUGGESTION_LIMITS.title} 字。`} />
      <LhTextArea ref={contentInput} id="suggestion-content" label="建议内容" required rows={6} maxLength={SUGGESTION_LIMITS.content} value={content} onChange={(event) => updateDraft({ content: event.target.value })} helperText={`描述当前问题和希望的改进，仅支持文字，最多 ${SUGGESTION_LIMITS.content} 字。`} />
    </fieldset>
    {error && <BoardError message={error} />}
    <div className={styles.actions}>
      <LhButton type="submit" variant="primary" disabled={busy} aria-busy={busy}>{busy ? "发布中…" : "确认发布"}</LhButton>
      <LhButton type="button" disabled={busy} onClick={onCancel}>暂存并关闭</LhButton>
      {(title || content || category !== emptySuggestionDraft.category) && <LhButton type="button" variant="ghost" disabled={busy} onClick={discardDraft}>放弃草稿</LhButton>}
    </div>
  </form>;
}
