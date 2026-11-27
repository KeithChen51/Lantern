"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { authFetch } from "@/components/auth/auth-fetch";
import { createConversationId as createRequestId } from "@/components/hermit/conversation-id";
import { LhButton, LhCallout, LhChip } from "@/components/ui/lighthouse-primitives";
import type { ChannelInfo, PublicationAudience, PublicationChannel, PublicationDelivery, PublicationDraft, PublicationTarget, PublicationTask } from "@/modules/wecom-publications/contracts";
import { audienceLabel, beijingSchedule, beijingTime, parseAudienceIds, previewDocument } from "./presentation";
import styles from "./wecom-publications.module.css";

const ROOT = "/api/admin/wecom-publications";
type Preview = { html: string; cover: string };
type TargetInput = { selected: boolean; kind: PublicationAudience["kind"]; ids: string };
type ScheduleInput = { draftId: string; scheduledAt: string; targets: PublicationTarget[]; requestId: string };
const statusLabels: Record<PublicationDelivery["status"], string> = {
  queued: "待发送", preparing: "正在准备素材", sending: "正在发送", accepted: "已受理", partial: "部分受理", failed: "发送失败", unknown: "待核验",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${ROOT}${path}`, init);
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message || "操作未完成，请重试。");
  if (!result) throw new Error("未取得操作结果，请刷新后核对。");
  return result as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作未完成，请重试。";
}

function statusTone(status: PublicationDelivery["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "partial" || status === "unknown") return "warning";
  return status === "failed" ? "danger" : "neutral";
}

export function AdminWecomPublications({ channels }: { channels: ChannelInfo[] }) {
  const [draft, setDraft] = useState<PublicationDraft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dark, setDark] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [tasksError, setTasksError] = useState("");
  const [notice, setNotice] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [targets, setTargets] = useState<Record<PublicationChannel, TargetInput>>({
    group: { selected: false, kind: "members", ids: "" },
    auto: { selected: false, kind: "members", ids: "" },
  });
  const [tasks, setTasks] = useState<PublicationTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [lookupId, setLookupId] = useState("");
  const [pending, setPending] = useState<ScheduleInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const requestKeys = useRef(new Map<string, string>());
  const retryKeys = useRef(new Map<string, string>());
  const form = useRef<HTMLFormElement>(null);
  const channelLabels = new Map(channels.map(channel => [channel.id, channel.label]));

  const reloadTasks = useCallback(async (signal?: AbortSignal) => {
    setLoadingTasks(true);
    setTasksError("");
    try { setTasks((await api<{ tasks: PublicationTask[] }>("/tasks", { signal })).tasks); }
    catch (error) { if (!signal?.aborted) setTasksError(errorMessage(error)); }
    finally { if (!signal?.aborted) setLoadingTasks(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reloadTasks(controller.signal);
    return () => controller.abort();
  }, [reloadTasks]);

  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
    if (!pending && dialog.current?.open) dialog.current.close();
  }, [pending]);

  async function loadPreview(id: string) {
    setPreviewLoading(true);
    try { setPreview(await api<Preview>(`/drafts/${encodeURIComponent(id)}/preview`)); }
    catch (error) { setUploadError(errorMessage(error)); }
    finally { setPreviewLoading(false); }
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setUploadError("");
    setNotice("");
    try {
      const result = await api<{ draft: PublicationDraft }>("/drafts", { method: "POST", body: new FormData(event.currentTarget) });
      setDraft(result.draft);
      await loadPreview(result.draft.id);
    } catch (error) { setUploadError(errorMessage(error)); }
    finally { setUploading(false); }
  }

  function changeTarget(id: PublicationChannel, update: Partial<TargetInput>) {
    setTargets(current => ({ ...current, [id]: { ...current[id], ...update } }));
    setScheduleError("");
  }

  function reviewSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScheduleError("");
    if (!draft || !preview) { setScheduleError("请先保存稿件并查看预览。"); return; }
    try {
      const time = beijingSchedule(scheduledAt);
      if (new Date(time).getTime() <= Date.now()) throw new Error("发送时间须晚于当前北京时间。");
      const selected: PublicationTarget[] = channels.filter(channel => targets[channel.id].selected).map(channel => {
        const input = targets[channel.id];
        if (input.kind === "all") return { channel: channel.id, audience: { kind: "all" } };
        const ids = parseAudienceIds(input.ids);
        if (!ids.length) throw new Error(`请填写${channel.label}的${input.kind === "members" ? "成员账号" : "部门 ID"}。`);
        if (ids.includes("@all")) throw new Error("发送全员请使用「应用全员」选项。");
        return { channel: channel.id, audience: { kind: input.kind, ids } };
      });
      if (!selected.length) throw new Error("请选择至少一个发布应用。");
      const signature = JSON.stringify({ draftId: draft.id, scheduledAt: time, targets: selected });
      const requestId = requestKeys.current.get(signature) ?? createRequestId();
      requestKeys.current.set(signature, requestId);
      setPending({ draftId: draft.id, scheduledAt: time, targets: selected, requestId });
    } catch (error) { setScheduleError(errorMessage(error)); }
  }

  function mergeTask(task: PublicationTask) {
    setTasks(current => [task, ...current.filter(item => item.id !== task.id)]);
  }

  async function confirmSchedule() {
    if (!pending || submitting) return;
    setSubmitting(true);
    setScheduleError("");
    try {
      const { task } = await api<{ task: PublicationTask }>("/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending),
      });
      mergeTask(task);
      setPending(null);
      setNotice(`排期已保存。任务编号 ${task.id}。`);
    } catch (error) { setScheduleError(`${errorMessage(error)} 可再次确认，系统会沿用本次提交编号。`); }
    finally { setSubmitting(false); }
  }

  async function lookupTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTasksError("");
    setLoadingTasks(true);
    try {
      const { task } = await api<{ task: PublicationTask }>(`/tasks/${encodeURIComponent(lookupId.trim())}`);
      mergeTask(task);
      setNotice(`已查到任务 ${task.id}。`);
    } catch (error) { setTasksError(errorMessage(error)); }
    finally { setLoadingTasks(false); }
  }

  async function retryDelivery(task: PublicationTask, channel: PublicationChannel) {
    const key = `${task.id}/${channel}`;
    const requestId = retryKeys.current.get(key) ?? createRequestId();
    retryKeys.current.set(key, requestId);
    setRetrying(key);
    setTasksError("");
    try {
      const result = await api<{ task: PublicationTask }>(`/tasks/${encodeURIComponent(task.id)}/retry`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, requestId }),
      });
      mergeTask(result.task);
      retryKeys.current.delete(key);
      setNotice(`${channelLabels.get(channel)}已重新排队。`);
    } catch (error) { setTasksError(errorMessage(error)); }
    finally { setRetrying(""); }
  }

  return <div className={styles.page}>
    <div className={styles.workbench}>
      <section className={styles.panel} aria-labelledby="draft-heading">
        <h2 id="draft-heading">稿件与素材</h2>
        <form ref={form} className={styles.form} onSubmit={saveDraft}>
          <fieldset disabled={uploading || Boolean(draft)} className={styles.fields}>
            <label>标题<input name="title" required maxLength={128} /></label>
            <label>摘要<textarea name="digest" required rows={3} maxLength={512} /></label>
            <div className={styles.twoColumns}>
              <label>作者（选填）<input name="author" maxLength={64} /></label>
              <label>原文链接（选填）<input name="sourceUrl" type="url" placeholder="https://" /></label>
            </div>
            <label>HTML 正文<input name="html" type="file" accept=".html,.htm,text/html" required /></label>
            <label>封面<input name="cover" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" required /></label>
            <label>正文配图（选填，最多 10 张）<input name="images" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple /></label>
            <p className={styles.caption}>配图文件名须与 HTML 中的图片引用对应，上传合计不超过 32 MB。</p>
          </fieldset>
          {draft ? <div className={styles.actions}>
            <p className={styles.caption}>稿件版本 <code>{draft.id}</code></p>
            <LhButton type="button" onClick={() => { setDraft(null); setPreview(null); setUploadError(""); setNotice(""); }}>更换稿件</LhButton>
          </div> : <LhButton type="submit" variant="primary" disabled={uploading}>{uploading ? "正在保存稿件…" : "保存并预览"}</LhButton>}
        </form>
        {uploadError && <div role="alert" className={styles.feedback}><LhCallout tone="danger">{uploadError}</LhCallout>
          {draft && !preview && <LhButton type="button" disabled={previewLoading} onClick={() => { setUploadError(""); void loadPreview(draft.id); }}>重新加载预览</LhButton>}</div>}
      </section>

      <section className={styles.panel} aria-labelledby="preview-heading">
        <div className={styles.sectionHeading}><h2 id="preview-heading">发布预览</h2>
          <div className={styles.switch} aria-label="预览配色">
            <button type="button" aria-pressed={!dark} onClick={() => setDark(false)}>浅色</button>
            <button type="button" aria-pressed={dark} onClick={() => setDark(true)}>深色</button>
          </div>
        </div>
        {previewLoading ? <p className={styles.empty} role="status">正在读取预览…</p> : draft && preview ? <>
          <article className={styles.messageCard} aria-label="消息卡片预览">
            <Image src={preview.cover} width={400} height={225} unoptimized alt="消息封面" />
            <div><h3>{draft.title}</h3><p>{draft.digest}</p></div>
          </article>
          <iframe className={styles.articlePreview} title="企微正文手机预览" sandbox="" referrerPolicy="no-referrer" srcDoc={previewDocument(preview.html, dark)} />
          <p className={styles.caption}>正文按手机窄屏预览，客户端效果以企微实收为准。</p>
        </> : <p className={styles.empty}>保存稿件后，在这里查看消息卡片和正文。</p>}
      </section>
    </div>

    <section className={styles.panel} aria-labelledby="schedule-heading">
      <h2 id="schedule-heading">发送应用与时间</h2>
      {channels.length === 0 ? <LhCallout tone="warning">尚无可用发布应用，请完成应用配置后重试。</LhCallout> : <form onSubmit={reviewSchedule} className={styles.form}>
        <div className={styles.targetGrid}>
          {channels.map(channel => <fieldset className={styles.target} key={channel.id}>
            <legend><label className={styles.check}><input type="checkbox" checked={targets[channel.id].selected} onChange={event => changeTarget(channel.id, { selected: event.target.checked })} />{channel.label}</label></legend>
            <label>发送对象<select aria-label={`${channel.label}发送对象`} disabled={!targets[channel.id].selected} value={targets[channel.id].kind} onChange={event => changeTarget(channel.id, { kind: event.target.value as TargetInput["kind"] })}>
              <option value="members">指定成员</option><option value="departments">指定部门</option><option value="all">应用全员</option>
            </select></label>
            {targets[channel.id].kind === "all" ? <p className={styles.caption}>以发送时此应用的可见范围为准。</p> : <label>{targets[channel.id].kind === "members" ? "成员账号" : "部门 ID"}<textarea aria-label={`${channel.label}${targets[channel.id].kind === "members" ? "成员账号" : "部门 ID"}`} rows={2} disabled={!targets[channel.id].selected} value={targets[channel.id].ids} onChange={event => changeTarget(channel.id, { ids: event.target.value })} placeholder="多个对象用换行或逗号分隔" /></label>}
            <p className={styles.caption}>封面上限 {channel.coverLimit / 1024 / 1024} MB，单张正文图上限 {channel.bodyImageLimit / 1024 / 1024} MB。使用此企业的账号或部门 ID。</p>
          </fieldset>)}
        </div>
        <label className={styles.timeField}>发送时间（北京时间）<input type="datetime-local" step="60" required value={scheduledAt} onChange={event => { setScheduledAt(event.target.value); setScheduleError(""); }} /></label>
        {scheduleError && !pending && <div role="alert"><LhCallout tone="danger">{scheduleError}</LhCallout></div>}
        <LhButton type="submit" variant="primary" disabled={!draft || !preview || uploading}>核对并确认排期</LhButton>
      </form>}
    </section>

    <p className={styles.notice} role="status" aria-live="polite">{notice}</p>

    <section className={styles.panel} aria-labelledby="tasks-heading">
      <div className={styles.sectionHeading}><h2 id="tasks-heading">发布任务</h2><LhButton type="button" disabled={loadingTasks} onClick={() => void reloadTasks()}>{loadingTasks ? "正在刷新…" : "刷新任务"}</LhButton></div>
      <form className={styles.lookup} onSubmit={lookupTask}><label htmlFor="publication-task-id">任务编号</label><input id="publication-task-id" value={lookupId} onChange={event => setLookupId(event.target.value)} required /><LhButton type="submit" disabled={loadingTasks || !lookupId.trim()}>查询</LhButton></form>
      {tasksError && <div role="alert" className={styles.feedback}><LhCallout tone="danger">{tasksError}</LhCallout></div>}
      {loadingTasks && tasks.length === 0 ? <p className={styles.empty} role="status">正在读取任务…</p> : tasks.length === 0 ? <p className={styles.empty}>暂无发布任务。</p> : <div className={styles.taskList}>
        {tasks.map(task => <article className={styles.task} key={task.id}>
          <div className={styles.sectionHeading}><div><h3>{task.draft.title}</h3><p className={styles.caption}>任务 <code>{task.id}</code></p></div><p className={styles.caption}>{beijingTime(task.scheduledAt)} 北京时间</p></div>
          <p className={styles.caption}>稿件版本 <code>{task.draft.id}</code> · 操作人 {task.actor.account}</p>
          {task.deliveries.map(delivery => <div className={styles.delivery} key={delivery.channel}>
            <div className={styles.sectionHeading}><strong>{channelLabels.get(delivery.channel) ?? delivery.channel}</strong><LhChip tone={statusTone(delivery.status)}>{statusLabels[delivery.status]}</LhChip></div>
            <p className={styles.recipient}>{audienceLabel(delivery.audience)}</p>
            <div className={styles.receipt}>
              {delivery.attemptedAt && <span>实际执行 {beijingTime(delivery.attemptedAt)} 北京时间</span>}
              {delivery.finishedAt && <span>结果记录 {beijingTime(delivery.finishedAt)} 北京时间</span>}
              {delivery.messageId && <span>消息 ID <code>{delivery.messageId}</code></span>}
              <span>已尝试 {delivery.attempts} 次</span>
            </div>
            {delivery.errorMessage && <p className={styles.deliveryError}>{delivery.errorMessage}{delivery.errorCode ? `（${delivery.errorCode}）` : ""}</p>}
            {delivery.issues && <RecipientProblems issues={delivery.issues} />}
            {delivery.status === "unknown" && <p className={styles.caption}>请依据通道回执或收件人实收核验本次发送结果。</p>}
            {delivery.status === "failed" && <LhButton type="button" size="sm" disabled={Boolean(retrying)} onClick={() => void retryDelivery(task, delivery.channel)}>{retrying === `${task.id}/${delivery.channel}` ? "正在提交…" : `重试${channelLabels.get(delivery.channel) ?? "此应用"}`}</LhButton>}
          </div>)}
        </article>)}
      </div>}
    </section>

    <dialog ref={dialog} className={styles.dialog} aria-labelledby="confirm-publication-title" onCancel={event => { if (submitting) event.preventDefault(); }} onClose={() => { if (!submitting) setPending(null); }}>
      <h2 id="confirm-publication-title">确认企微发布排期</h2>
      {pending && draft && <>
        <h3>{draft.title}</h3>
        <p className={styles.caption}>稿件版本 <code>{pending.draftId}</code></p>
        <p className={styles.confirmTime}>{beijingTime(pending.scheduledAt)} 北京时间</p>
        <ul className={styles.confirmTargets}>{pending.targets.map(target => <li key={target.channel}><strong>{channelLabels.get(target.channel)}</strong><p>{audienceLabel(target.audience)}</p></li>)}</ul>
        <p className={styles.caption}>灯塔将在到点后自动执行，关闭页面或 DSH 对话后排期仍会保留。</p>
        {scheduleError && <div role="alert" className={styles.feedback}><LhCallout tone="danger">{scheduleError}</LhCallout></div>}
        <div className={styles.dialogActions}><LhButton type="button" disabled={submitting} onClick={() => setPending(null)}>返回修改</LhButton><LhButton type="button" variant="primary" disabled={submitting} onClick={() => void confirmSchedule()}>{submitting ? "正在保存排期…" : "确认排期"}</LhButton></div>
      </>}
    </dialog>
  </div>;
}

function RecipientProblems({ issues }: { issues: NonNullable<PublicationDelivery["issues"]> }) {
  const problems = [
    ["无效成员", issues.invalidUsers], ["无效部门", issues.invalidDepartments],
    ["无效标签", issues.invalidTags], ["无接口许可成员", issues.unlicensedUsers],
  ] as const;
  return <>{problems.filter(([, ids]) => ids.length > 0).map(([label, ids]) => <p className={styles.deliveryError} key={label}>{label} · {ids.join("、")}</p>)}</>;
}
