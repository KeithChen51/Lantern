"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhBackLink, LhButton, LhEmptyState, LhPanel, LhStateNotice, LhTextArea, LhTextField } from "@/components/ui/lighthouse-primitives";
import { SUGGESTION_CATEGORIES, SUGGESTION_STATUSES, SUGGESTION_LIMITS, type BoardViewer, type SuggestionCategory, type SuggestionComment, type SuggestionDetail, type SuggestionListResult, type SuggestionStatus } from "@/modules/feedback/board-types";
import { BoardRequestError, boardRequest, useBoardResource } from "./board-client";
import { BoardError, BoardLoading, BoardSelect, BoardTime, SuggestionMeta, statusLabel } from "./board-ui";
import styles from "./board.module.css";

export function SuggestionDetailView({ id, viewer }: { id: string; viewer: BoardViewer }) {
  const endpoint = `/api/feedback/${encodeURIComponent(id)}`;
  const resource = useBoardResource<SuggestionDetail>(endpoint, viewer.userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<SuggestionComment | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [hiding, setHiding] = useState<string | null>(null);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const item = resource.data;
  const locked = busy || commentBusy || moreBusy || resource.loading;

  async function toggleLike() {
    if (!item) return;
    setBusy(true); setError("");
    try {
      const result = await boardRequest<{ liked: boolean; likeCount: number }>(`${endpoint}/like`, { method: "PUT", body: { liked: !item.likedByMe }, csrfToken: viewer.csrfToken }, viewer.userId);
      resource.update({ ...item, likedByMe: result.liked, likeCount: result.likeCount });
    } catch (error) { setError(error instanceof Error ? error.message : "赞同操作未完成，请重试。"); }
    finally { setBusy(false); }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    if (!comment.trim()) { setCommentError("请先填写评论内容。"); commentInput.current?.focus(); return; }
    setCommentBusy(true); setCommentError("");
    try {
      const created = await boardRequest<SuggestionComment>(`${endpoint}/comments`, { method: "POST", body: { content: comment.trim(), replyToId: replyTo?.id ?? null }, csrfToken: viewer.csrfToken }, viewer.userId);
      resource.update({ ...item, comments: [...item.comments, created], commentCount: item.commentCount + 1 });
      setComment(""); setReplyTo(null);
      commentInput.current?.focus();
    } catch (error) { setCommentError(error instanceof Error ? error.message : "评论未发送，请重试。"); }
    finally { setCommentBusy(false); }
  }

  async function loadComments() {
    if (!item?.nextCommentCursor) return;
    setMoreBusy(true); setMoreError("");
    try {
      const next = await boardRequest<{ items: SuggestionComment[]; nextCursor: string | null }>(`${endpoint}/comments?cursor=${encodeURIComponent(item.nextCommentCursor)}`, undefined, viewer.userId);
      const seen = new Set(item.comments.map((entry) => entry.id));
      resource.update({ ...item, comments: [...item.comments, ...next.items.filter((entry) => !seen.has(entry.id))], nextCommentCursor: next.nextCursor });
    } catch (error) { setMoreError(error instanceof Error ? error.message : "加载评论失败，请重试。"); }
    finally { setMoreBusy(false); }
  }

  async function hideComment(commentId: string) {
    if (!item) return;
    setBusy(true); setError("");
    try {
      await boardRequest(`${endpoint}/comments/${encodeURIComponent(commentId)}`, { method: "DELETE", csrfToken: viewer.csrfToken }, viewer.userId);
      resource.update({ ...item, comments: item.comments.map((entry) => entry.id === commentId ? { ...entry, hidden: true, content: "" } : entry) });
      setHiding(null);
      if (replyTo?.id === commentId) setReplyTo(null);
    } catch (error) { setError(error instanceof Error ? error.message : "隐藏评论失败，请重试。"); }
    finally { setBusy(false); }
  }

  const events = item ? [...item.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  return <div className={`${styles.page} ${styles.stack}`} data-lh-page="feedback-detail">
    <div><LhBackLink href="/feedback">返回建议广场</LhBackLink></div>
    {resource.loading && <>{!item && <PageHeading title="建议详情" />}<BoardLoading /></>}
    {resource.error && <>{!item && <PageHeading title="建议详情" />}<BoardError message={resource.error} retry={resource.reload} /></>}
    {item && <>
      <PageHeading title={item.title} />
      <LhPanel className={`${styles.panel} ${styles.stack}`} aria-label="建议内容">
        <SuggestionMeta item={item} />
        <p className={styles.plain}>{item.content}</p>
        {item.relatedSuggestion && <p>关联建议：<Link className={styles.link} href={`/feedback/${encodeURIComponent(item.relatedSuggestion.id)}`}>{item.relatedSuggestion.title}</Link></p>}
        <div className={styles.toolbar}><LhButton type="button" disabled={locked} aria-pressed={item.likedByMe} aria-busy={busy} variant={item.likedByMe ? "primary" : "secondary"} onClick={() => void toggleLike()}>{item.likedByMe ? "已赞同" : "赞同"} · {item.likeCount}</LhButton><span className={styles.meta}>更新于 <BoardTime value={item.updatedAt} /></span></div>
      </LhPanel>
      {error && <BoardError message={error} />}
      <LhPanel className={`${styles.panel} ${styles.stack}`} aria-label="管理员回应">
        <h2 className={styles.sectionTitle}>处理进展</h2>
        {events.length === 0 ? <p className={styles.meta}>建议已收到，等待管理员回应。</p> : <>
          <EventResponse event={events[0]} latest />
          {events.length > 1 && <details className={styles.history}><summary>查看 {events.length - 1} 条历史回应</summary><ol className={styles.feed}>{events.slice(1).map((event) => <li key={event.id}><EventResponse event={event} /></li>)}</ol></details>}
        </>}
      </LhPanel>

      <LhPanel id="discussion" className={`${styles.panel} ${styles.stack} ${styles.discussion}`} aria-label="评论与回复">
        <h2 className={styles.sectionTitle}>评论与回复 · {item.commentCount}</h2>
        <form className={styles.form} onSubmit={submitComment} noValidate aria-label="发表评论">
          {replyTo && <LhStateNotice action={<LhButton type="button" disabled={commentBusy} onClick={() => { setReplyTo(null); commentInput.current?.focus(); }}>取消回复</LhButton>}>正在回复 {replyTo.author.name}</LhStateNotice>}
          <LhTextArea ref={commentInput} id="suggestion-comment" label={replyTo ? `回复 ${replyTo.author.name}` : "你的评论"} required rows={4} maxLength={SUGGESTION_LIMITS.comment} helperText={`仅支持文字，最多 ${SUGGESTION_LIMITS.comment} 字。`} value={comment} disabled={commentBusy} onChange={(event) => setComment(event.target.value)} />
          {commentError && <BoardError message={commentError} />}
          <div><LhButton type="submit" variant="primary" disabled={locked} aria-busy={commentBusy}>{commentBusy ? "发送中…" : replyTo ? "发送回复" : "发表评论"}</LhButton></div>
        </form>
        {item.comments.length === 0 && <LhEmptyState title="还没有评论" description="分享你的看法或补充具体场景。" />}
        <ol className={styles.feed}>{item.comments.map((entry) => <li key={entry.id} id={`comment-${entry.id}`} className={`${styles.comment} ${entry.replyToId ? styles.reply : ""}`}>
          <div className={styles.meta}><span>{entry.author.name}</span><BoardTime value={entry.createdAt} />{entry.replyToAuthorName && <span>回复 {entry.replyToAuthorName}</span>}</div>
          <p className={styles.plain}>{entry.hidden ? "此评论已被管理员隐藏" : entry.content}</p>
          {!entry.hidden && <div className={styles.actions}><LhButton type="button" variant="ghost" disabled={locked} onClick={() => { setReplyTo(entry); commentInput.current?.focus(); }}>回复 {entry.author.name}</LhButton>{viewer.canManage && (hiding === entry.id ? <><span>确认隐藏此评论？</span><LhButton type="button" variant="danger" disabled={locked} onClick={() => void hideComment(entry.id)}>确认隐藏</LhButton><LhButton type="button" disabled={locked} onClick={() => setHiding(null)}>取消</LhButton></> : <LhButton type="button" variant="ghost" disabled={locked} onClick={() => setHiding(entry.id)}>隐藏评论</LhButton>)}</div>}
        </li>)}</ol>
        {moreError && <BoardError message={moreError} />}
        {item.nextCommentCursor && <LhButton type="button" disabled={locked} onClick={() => void loadComments()}>{moreBusy ? "加载中…" : "加载更多评论"}</LhButton>}
      </LhPanel>
      {viewer.canManage && <details className={styles.managerArea}><summary>管理员处理 · 更新进展与回应</summary><LhPanel className={styles.panel}><ManageSuggestion key={item.id} item={item} viewer={viewer} disabled={locked} onUpdated={resource.update} onRefresh={resource.reload} onBusyChange={setBusy} /></LhPanel></details>}
    </>}
  </div>;
}

export function EventResponse({ event, latest = false }: { event: SuggestionDetail["events"][number]; latest?: boolean }) {
  return <div className={styles.response}>{latest && <strong>最新回应</strong>}<div className={styles.meta}><span>{event.actor.name}</span><BoardTime value={event.createdAt} /><span>{event.fromStatus === event.toStatus ? statusLabel(event.toStatus) : `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`}</span></div><p className={styles.plain}>{event.note}</p></div>;
}

export function ManageSuggestion({ item, viewer, disabled, onUpdated, onRefresh, onBusyChange }: { item: SuggestionDetail; viewer: BoardViewer; disabled: boolean; onUpdated: (item: SuggestionDetail) => void; onRefresh: () => void; onBusyChange?: (busy: boolean) => void }) {
  const fieldsFor = (value: SuggestionDetail, review: boolean) => ({ id: value.id, revision: value.updatedAt, status: value.status, category: value.category, related: value.relatedSuggestion?.id ?? "", selectedTitle: value.relatedSuggestion?.title ?? "", review });
  const [fields, setFields] = useState(() => fieldsFor(item, false));
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const choices = useBoardResource<SuggestionListResult>(`/api/feedback?sort=latest&page=1&q=${encodeURIComponent(query)}`, viewer.userId);
  // Adjust before committing a render so a refreshed revision never displays stale controls.
  if (fields.id !== item.id || fields.revision !== item.updatedAt) {
    const sameSuggestion = fields.id === item.id;
    setFields(fieldsFor(item, sameSuggestion));
    setConflicted(false);
    setSaved(false);
    setError("");
    if (!sameSuggestion) { setNote(""); setSearch(""); setQuery(""); }
  }
  const { status, category, related, selectedTitle } = fields;
  const relatedOptions = (choices.data?.items ?? []).filter((entry) => entry.id !== item.id);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (conflicted || fields.review) { setError("请刷新并核对最新处理信息后再保存回应。"); return; }
    if (!note.trim()) { setError("每次更新都需要填写回应说明。"); noteInput.current?.focus(); return; }
    setBusy(true); onBusyChange?.(true); setError(""); setSaved(false);
    try {
      const updated = await boardRequest<SuggestionDetail>(`/api/feedback/${encodeURIComponent(item.id)}`, { method: "PATCH", csrfToken: viewer.csrfToken, body: { status, category, note: note.trim(), relatedSuggestionId: related || null, expectedUpdatedAt: item.updatedAt } }, viewer.userId);
      setFields(fieldsFor(updated, false)); onUpdated(updated); setNote(""); setSaved(true);
    } catch (error) { if (error instanceof BoardRequestError && error.status === 409) setConflicted(true); setError(error instanceof Error ? error.message : "更新失败，请重试。"); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <form className={styles.form} aria-label="管理员处理建议" noValidate onSubmit={submit}>
    <h2 className={styles.sectionTitle}>处理建议</h2>
    <p className={styles.meta}>可以直接选择目标状态。状态、分类或关联建议的每次更新，都需留下回应说明。</p>
    {fields.review && <LhStateNotice tone="warning" action={<LhButton type="button" disabled={busy || disabled} onClick={() => setFields((current) => ({ ...current, review: false }))}>已核对最新信息</LhButton>}>建议已更新。处理状态、分类和关联建议已同步为最新值；回应草稿已保留，请核对后再保存。</LhStateNotice>}
    <fieldset disabled={busy || disabled}>
      <div className={styles.filters}><BoardSelect label="处理状态" value={status} onChange={(event) => setFields((current) => ({ ...current, status: event.target.value as SuggestionStatus }))}>{SUGGESTION_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</BoardSelect><BoardSelect label="建议分类" value={category} onChange={(event) => setFields((current) => ({ ...current, category: event.target.value as SuggestionCategory }))}>{SUGGESTION_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</BoardSelect></div>
      <LhTextField id="related-search" label="搜索关联建议" optionalLabel="选填" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入建议标题关键词" />
      <div><LhButton type="button" onClick={() => { setQuery(search.trim()); if (query === search.trim()) choices.reload(); }}>搜索建议</LhButton></div>
      {choices.loading && <BoardLoading />}
      {choices.error && <BoardError message={choices.error} retry={choices.reload} />}
      <BoardSelect label="关联建议（选填）" value={related} onChange={(event) => setFields((current) => ({ ...current, related: event.target.value, selectedTitle: relatedOptions.find((entry) => entry.id === event.target.value)?.title ?? "" }))}><option value="">不关联</option>{related && !relatedOptions.some((entry) => entry.id === related) && <option value={related}>{selectedTitle || "当前关联建议"}</option>}{relatedOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</BoardSelect>
      {choices.data && relatedOptions.length === 0 && <p className={styles.meta}>没有匹配的建议，可更换关键词。</p>}
      <LhTextArea ref={noteInput} id="manager-note" label="回应说明" required rows={5} maxLength={SUGGESTION_LIMITS.note} helperText={`说明判断依据或后续安排，最多 ${SUGGESTION_LIMITS.note} 字。回应将对员工展示。`} value={note} onChange={(event) => setNote(event.target.value)} />
    </fieldset>
    {error && <BoardError message={error} />}
    {saved && <LhStateNotice tone="success">回应已保存。</LhStateNotice>}
    <div className={styles.actions}><LhButton type="submit" variant="primary" disabled={busy || disabled || conflicted || fields.review} aria-busy={busy}>{busy ? "保存中…" : "保存回应"}</LhButton><LhButton type="button" disabled={busy || disabled} onClick={onRefresh}>刷新详情</LhButton></div>
  </form>;
}
