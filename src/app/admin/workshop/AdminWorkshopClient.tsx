"use client";

import * as React from "react";
import { Icon } from "@iconify/react";
import {
  LhButton,
  LhChip,
  LhPanel,
  LhSectionHeader,
  LhStatusBadge,
  LhTextArea,
  LhTextField,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";

type Submission = {
  id: string;
  title: string;
  roleName: string;
  serviceScenario: string | null;
  principleRef: string | null;
  doText: string;
  howText: string | null;
  dontText: string;
  submitterName: string;
  storeName: string | null;
  submittedAt: string | null;
};

type EditableSubmission = Pick<
  Submission,
  "title" | "roleName" | "serviceScenario" | "principleRef" | "doText" | "howText" | "dontText"
>;

type AdminWorkshopClientProps = {
  embedded?: boolean;
};

type ReviewFilter = "all" | "ready" | "needs_context";
type NoticeTone = "success" | "danger" | "info";

const metaFields: Array<[keyof EditableSubmission, string, string]> = [
  ["title", "标题", "让公开指南一眼能判断场景和动作。"],
  ["roleName", "岗位", "用于公开区筛选。"],
  ["serviceScenario", "场景", "把经验固定到真实服务情境。"],
  ["principleRef", "理念依据", "连接本心原则、案例或规范来源。"],
];

const contentFields: Array<[keyof EditableSubmission, string, string, number]> = [
  ["doText", "Do", "应该鼓励的一线动作。", 5],
  ["howText", "How", "补充步骤、话术或检查点。", 5],
  ["dontText", "Don't", "明确禁止或应避免的动作。", 5],
];

async function fetchData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Request failed: ${response.status}`);
  }

  return payload.data as T;
}

function toEditable(submission: Submission): EditableSubmission {
  return {
    title: submission.title,
    roleName: submission.roleName,
    serviceScenario: submission.serviceScenario,
    principleRef: submission.principleRef,
    doText: submission.doText,
    howText: submission.howText,
    dontText: submission.dontText,
  };
}

function isReadyForPublish(edit: EditableSubmission) {
  return Boolean(
    edit.title.trim() &&
      edit.roleName.trim() &&
      (edit.serviceScenario ?? "").trim() &&
      (edit.principleRef ?? "").trim() &&
      (edit.doText.trim() || edit.dontText.trim()),
  );
}

function StateNotice({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  const icon =
    tone === "success" ? lighthouseIcons.status : tone === "danger" ? lighthouseIcons.warning : lighthouseIcons.info;
  return (
    <div
      className={cn(
        "mb-5 flex items-start gap-3 rounded-md border px-4 py-3 text-sm font-bold leading-6",
        tone === "success" && "border-success/25 bg-success-soft text-success",
        tone === "danger" && "border-danger/25 bg-danger-soft text-danger",
        tone === "info" && "border-info/25 bg-info-soft text-info",
      )}
    >
      <Icon icon={icon} className="mt-0.5 h-5 w-5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function AdminHeader({
  embedded,
  loading,
  onRefresh,
}: {
  embedded: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <LhPanel className={cn("mb-6 p-5", !embedded && "mx-1 md:mx-4")}>
      <LhSectionHeader
        eyebrow="Admin Review"
        title={embedded ? "审核队列" : "Workshop 审核"}
        description="品牌方最高管理员在这里做最后编辑、发布或退回。队列只处理 AI 初审通过后的 Do and Don't。"
        action={
          <LhButton
            type="button"
            variant="secondary"
            icon={<Icon icon={lighthouseIcons.refresh} className={cn("h-4 w-4", loading && "animate-spin")} />}
            onClick={onRefresh}
            disabled={loading}
          >
            刷新队列
          </LhButton>
        }
      />
    </LhPanel>
  );
}

function QueueSummary({ submissions, edits }: { submissions: Submission[]; edits: Record<string, EditableSubmission> }) {
  const readyCount = submissions.filter((submission) => isReadyForPublish(edits[submission.id] ?? toEditable(submission))).length;
  const needsContext = submissions.length - readyCount;
  const stats = [
    { label: "待审核", value: submissions.length, note: "AI 初审通过后进入队列", icon: "solar:clock-circle-bold" },
    { label: "信息完整", value: readyCount, note: "具备发布所需字段", icon: lighthouseIcons.status },
    { label: "需补来源", value: needsContext, note: "缺少场景、原则或动作", icon: lighthouseIcons.warning },
  ];

  return (
    <div className="mb-5 grid gap-3 md:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-md border border-line bg-panel p-4 shadow-lh-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted">{stat.label}</span>
            <Icon icon={stat.icon} className="h-5 w-5 text-primary" />
          </div>
          <p className="text-3xl font-extrabold text-ink">{stat.value}</p>
          <p className="mt-2 text-sm leading-6 text-muted">{stat.note}</p>
        </div>
      ))}
    </div>
  );
}

function FilterBar({
  value,
  submissions,
  edits,
  onChange,
}: {
  value: ReviewFilter;
  submissions: Submission[];
  edits: Record<string, EditableSubmission>;
  onChange: (value: ReviewFilter) => void;
}) {
  const readyCount = submissions.filter((submission) => isReadyForPublish(edits[submission.id] ?? toEditable(submission))).length;
  const options: Array<{ id: ReviewFilter; label: string; count: number }> = [
    { id: "all", label: "全部待审", count: submissions.length },
    { id: "ready", label: "信息完整", count: readyCount },
    { id: "needs_context", label: "需补来源", count: submissions.length - readyCount },
  ];

  return (
    <div className="mb-5 flex max-w-full flex-wrap gap-2 pb-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-sm border px-3 text-sm font-extrabold transition-[background,border-color,color]",
            value === option.id
              ? "border-primary bg-primary-soft text-primary-deep"
              : "border-line bg-panel text-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {option.label}
          <span className="rounded-full bg-surface-quiet px-2 py-0.5 text-xs">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

function SourcePanel({ submission, ready }: { submission: Submission; ready: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface-quiet p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LhStatusBadge tone="warning">待审核</LhStatusBadge>
        <LhChip tone={ready ? "success" : "danger"}>{ready ? "信息完整" : "需补来源"}</LhChip>
      </div>
      <dl className="grid gap-3 text-sm">
        {[
          ["提交人", submission.submitterName],
          ["门店", submission.storeName ?? "未记录"],
          ["提交时间", submission.submittedAt ? new Date(submission.submittedAt).toLocaleString("zh-CN") : "未记录"],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted">{label}</dt>
            <dd className="font-bold leading-6 text-ink-soft">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReviewField({
  label,
  helperText,
  value,
  onChange,
}: {
  label: string;
  helperText: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return <LhTextField label={label} helperText={helperText} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function ReviewTextArea({
  label,
  helperText,
  rows,
  value,
  onChange,
}: {
  label: string;
  helperText: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <LhTextArea
      label={label}
      helperText={helperText}
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ActionPanel({
  submission,
  isBusy,
  rejectComment,
  onRejectCommentChange,
  onPublish,
  onReject,
}: {
  submission: Submission;
  isBusy: boolean;
  rejectComment: string;
  onRejectCommentChange: (value: string) => void;
  onPublish: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <h3 className="text-xl font-extrabold text-ink">审核动作</h3>
      <p className="mt-2 text-sm leading-6 text-muted">发布会进入公共指南；退回会带原因回到贡献者个人区。</p>
      <LhTextArea
        label="退回说明"
        helperText="退回时必须让贡献者知道下一步怎么改。"
        rows={4}
        value={rejectComment}
        onChange={(event) => onRejectCommentChange(event.target.value)}
        placeholder="请补充可执行细节后重新提交。"
        className="mt-4"
      />
      <div className="mt-4 grid gap-3">
        <LhButton
          type="button"
          disabled={isBusy}
          variant="primary"
          icon={
            <Icon icon={isBusy ? lighthouseIcons.refresh : lighthouseIcons.publish} className={cn("h-4 w-4", isBusy && "animate-spin")} />
          }
          onClick={onPublish}
        >
          编辑后发布
        </LhButton>
        <LhButton
          type="button"
          disabled={isBusy}
          variant="danger"
          icon={<Icon icon={lighthouseIcons.reject} className="h-4 w-4" />}
          onClick={onReject}
        >
          退回修改
        </LhButton>
      </div>
      <p className="mt-4 rounded-sm border border-info/25 bg-info-soft p-3 text-xs font-bold leading-6 text-info">
        <Icon icon={lighthouseIcons.info} className="mr-1 inline h-4 w-4" />
        当前审核对象：{submission.title}
      </p>
    </div>
  );
}

function ReviewCard({
  submission,
  edit,
  isBusy,
  rejectComment,
  onEditChange,
  onRejectCommentChange,
  onPublish,
  onReject,
}: {
  submission: Submission;
  edit: EditableSubmission;
  isBusy: boolean;
  rejectComment: string;
  onEditChange: (field: keyof EditableSubmission, value: string) => void;
  onRejectCommentChange: (value: string) => void;
  onPublish: () => void;
  onReject: () => void;
}) {
  const ready = isReadyForPublish(edit);

  return (
    <article className="grid gap-5 rounded-md border border-line bg-surface p-5 shadow-lh-sm xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <LhChip tone="primary">
              <Icon icon={lighthouseIcons.workshop} className="h-4 w-4" />
              Workshop Contribution
            </LhChip>
            <ReviewField
              label="标题"
              helperText="审核人可以直接编辑为公开指南标题。"
              value={edit.title}
              onChange={(value) => onEditChange("title", value)}
            />
          </div>
          <SourcePanel submission={submission} ready={ready} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {metaFields.slice(1).map(([field, label, helperText]) => (
            <ReviewField
              key={field}
              label={label}
              helperText={helperText}
              value={(edit[field] ?? "") as string}
              onChange={(value) => onEditChange(field, value)}
            />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {contentFields.map(([field, label, helperText, rows]) => (
            <ReviewTextArea
              key={field}
              label={label}
              helperText={helperText}
              rows={rows}
              value={(edit[field] ?? "") as string}
              onChange={(value) => onEditChange(field, value)}
            />
          ))}
        </div>
      </div>

      <ActionPanel
        submission={submission}
        isBusy={isBusy}
        rejectComment={rejectComment}
        onRejectCommentChange={onRejectCommentChange}
        onPublish={onPublish}
        onReject={onReject}
      />
    </article>
  );
}

export function AdminWorkshopClient({ embedded = false }: AdminWorkshopClientProps) {
  const [submissions, setSubmissions] = React.useState<Submission[]>([]);
  const [edits, setEdits] = React.useState<Record<string, EditableSubmission>>({});
  const [rejectComments, setRejectComments] = React.useState<Record<string, string>>({});
  const [filter, setFilter] = React.useState<ReviewFilter>("all");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextSubmissions = await fetchData<Submission[]>("/api/admin/workshop/submissions");
      setSubmissions(nextSubmissions);
      setEdits(Object.fromEntries(nextSubmissions.map((submission) => [submission.id, toEditable(submission)])));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredSubmissions = React.useMemo(
    () =>
      submissions.filter((submission) => {
        const edit = edits[submission.id] ?? toEditable(submission);
        if (filter === "ready") return isReadyForPublish(edit);
        if (filter === "needs_context") return !isReadyForPublish(edit);
        return true;
      }),
    [edits, filter, submissions],
  );

  function updateEdit(id: string, field: keyof EditableSubmission, value: string) {
    setEdits((previous) => ({
      ...previous,
      [id]: {
        ...previous[id],
        [field]: value,
      },
    }));
  }

  async function publish(id: string) {
    setBusyId(id);
    setMessage("");
    setError("");
    try {
      await fetchData(`/api/admin/workshop/submissions/${id}/publish`, {
        method: "POST",
        body: JSON.stringify(edits[id]),
      });
      setMessage("已发布为公共指南。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "发布失败");
    } finally {
      setBusyId("");
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    setMessage("");
    setError("");
    try {
      await fetchData(`/api/admin/workshop/submissions/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ comment: rejectComments[id] || "请补充可执行细节后重新提交。" }),
      });
      setMessage("已退回提交。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "退回失败");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className={embedded ? "" : "mx-auto max-w-7xl"}>
      <AdminHeader embedded={embedded} loading={loading} onRefresh={() => void loadData()} />

      {message && <StateNotice tone="success">{message}</StateNotice>}
      {error && <StateNotice tone="danger">{error}</StateNotice>}

      <section className={embedded ? "" : "px-1 md:px-4"}>
        <QueueSummary submissions={submissions} edits={edits} />
        <FilterBar value={filter} submissions={submissions} edits={edits} onChange={setFilter} />

        {loading ? (
          <StateNotice tone="info">
            <Icon icon={lighthouseIcons.refresh} className="mr-2 inline h-4 w-4 animate-spin" />
            正在加载待审核提交
          </StateNotice>
        ) : submissions.length === 0 ? (
          <LhPanel className="border-dashed p-8 text-center">
            <Icon icon={lighthouseIcons.status} className="mx-auto h-8 w-8 text-success" />
            <p className="mt-3 text-base font-bold text-ink">当前没有待审核提交。</p>
            <p className="mt-2 text-sm leading-6 text-muted">一线投稿通过初审后，会进入这里等待最终确认。</p>
          </LhPanel>
        ) : filteredSubmissions.length === 0 ? (
          <LhPanel className="border-dashed p-8 text-center">
            <Icon icon={lighthouseIcons.search} className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-base font-bold text-ink">当前筛选下没有提交。</p>
            <p className="mt-2 text-sm leading-6 text-muted">切换到全部待审可查看完整队列。</p>
          </LhPanel>
        ) : (
          <div className="grid gap-5">
            {filteredSubmissions.map((submission) => {
              const edit = edits[submission.id] ?? toEditable(submission);
              const isBusy = busyId === submission.id;
              return (
                <ReviewCard
                  key={submission.id}
                  submission={submission}
                  edit={edit}
                  isBusy={isBusy}
                  rejectComment={rejectComments[submission.id] ?? ""}
                  onEditChange={(field, value) => updateEdit(submission.id, field, value)}
                  onRejectCommentChange={(value) =>
                    setRejectComments((previous) => ({ ...previous, [submission.id]: value }))
                  }
                  onPublish={() => void publish(submission.id)}
                  onReject={() => void reject(submission.id)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
