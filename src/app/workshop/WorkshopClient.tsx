"use client";

import * as React from "react";
import { Icon } from "@iconify/react";
import { useSearchParams } from "next/navigation";
import { AdminWorkshopClient } from "../admin/workshop/AdminWorkshopClient";
import {
  LhButton,
  LhCard,
  LhChip,
  LhPageHero,
  LhPanel,
  LhSearchBox,
  LhSectionHeader,
  LhStatusBadge,
  LhTextArea,
  LhTextField,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons, type LighthouseIcon } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";
import {
  getVisibleWorkshopSections,
  isWorkshopSectionId,
  type WorkshopRole,
  type WorkshopSectionId,
} from "./workshop-sections";

type PublishedGuide = {
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
  publishedAt: string;
};

type ContributionStat = {
  userId: string;
  displayName: string;
  storeName: string | null;
  submittedCount: number;
  publishedCount: number;
  latestPublishedAt: string | null;
};

type Submission = {
  id: string;
  title: string;
  roleName: string;
  storeName: string | null;
  serviceScenario: string | null;
  principleRef: string | null;
  doText: string;
  howText: string | null;
  dontText: string;
  status: string;
  aiReviewResult: { passed: boolean; reason: string } | null;
  updatedAt: string;
};

type FormState = {
  title: string;
  roleName: string;
  storeName: string;
  serviceScenario: string;
  principleRef: string;
  doText: string;
  howText: string;
  dontText: string;
};

type PreviewIdentityResponse = {
  data?: {
    current?: {
      role?: string;
    } | null;
  };
};

type BadgeTone = React.ComponentProps<typeof LhStatusBadge>["tone"];
type NoticeTone = "success" | "danger" | "info";

const roles = ["全部岗位", "服务顾问", "理赔顾问", "休息区服务专员", "备件人员", "维修人员", "洗车人员", "其他后台支持人员"];

const initialForm: FormState = {
  title: "客户等待超预期时的主动说明",
  roleName: "服务顾问",
  storeName: "星河店",
  serviceScenario: "维修等待",
  principleRef: "本心 / 主动透明",
  doText: "",
  howText: "",
  dontText: "",
};

const sectionCopy: Record<WorkshopSectionId, { title: string; description: string; icon: LighthouseIcon }> = {
  public: {
    title: "公开区",
    description: "只展示已审核发布的岗位应做/避免，便于一线按角色、场景检索和复用。",
    icon: lighthouseIcons.document,
  },
  submit: {
    title: "提交区",
    description: "把服务经验写成角色、场景、应做、方法、避免，先进入系统初审，再进入管理员审核。",
    icon: lighthouseIcons.add,
  },
  personal: {
    title: "个人区",
    description: "查看草稿、待审核、退回和已发布状态，按退回原因修改后重提。",
    icon: lighthouseIcons.user,
  },
  review: {
    title: "审核区",
    description: "品牌方最高管理员在这里完成最后编辑、发布或退回。",
    icon: lighthouseIcons.admin,
  },
};

const statusMeta: Record<string, { label: string; tone: BadgeTone; description: string }> = {
  draft: { label: "草稿", tone: "info", description: "尚未提交，可继续编辑。" },
  submitted: { label: "已提交", tone: "info", description: "已进入初审流程。" },
  ai_rejected: { label: "初审退回", tone: "danger", description: "补齐可执行细节后再提交。" },
  pending_admin_review: { label: "待管理员审核", tone: "warning", description: "等待品牌管理员最终确认。" },
  admin_rejected: { label: "管理员退回", tone: "danger", description: "按审核意见修改后重提。" },
  published: { label: "已发布", tone: "success", description: "已进入公开区，可被引用。" },
  withdrawn: { label: "已撤回", tone: "neutral", description: "内容已撤回。" },
};

const formFields: Array<[keyof FormState, string, string]> = [
  ["title", "标题", "标题要帮助审核人快速判断内容类型。"],
  ["roleName", "适用岗位", "用于后续按角色筛选应做/避免。"],
  ["storeName", "门店", "保留来源，便于追溯。"],
  ["serviceScenario", "服务场景", "例如维修等待、交车解释、客户投诉。"],
  ["principleRef", "理念依据", "连接本心原则或已有案例。"],
];

function isSubmissionEditable(status: string) {
  return status === "draft" || status === "ai_rejected" || status === "admin_rejected";
}

function submissionToForm(submission: Submission): FormState {
  return {
    title: submission.title,
    roleName: submission.roleName,
    storeName: submission.storeName ?? "",
    serviceScenario: submission.serviceScenario ?? "",
    principleRef: submission.principleRef ?? "",
    doText: submission.doText,
    howText: submission.howText ?? "",
    dontText: submission.dontText,
  };
}

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
    throw new Error(payload.error?.message ?? `请求失败：${response.status}`);
  }

  return payload.data as T;
}

function toWorkshopRole(role: string | undefined): WorkshopRole | null {
  return role === "normal_user" || role === "highest_admin" ? role : null;
}

async function fetchWorkshopRole(): Promise<WorkshopRole | null> {
  const response = await fetch("/api/preview-identity", { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as PreviewIdentityResponse;
  if (!response.ok) return null;
  return toWorkshopRole(payload.data?.current?.role);
}

function getStatusMeta(status: string) {
  return statusMeta[status] ?? { label: status, tone: "neutral" as BadgeTone, description: "未知状态。" };
}

function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status);
  return <LhStatusBadge tone={meta.tone}>{meta.label}</LhStatusBadge>;
}

function StateNotice({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  const icon =
    tone === "success" ? lighthouseIcons.status : tone === "danger" ? lighthouseIcons.warning : lighthouseIcons.info;
  return (
    <div
      className={cn(
        "mb-6 flex items-start gap-3 rounded-sm border px-4 py-3 text-sm font-bold leading-6",
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

function SectionTabs({
  sections,
  current,
  onChange,
}: {
  sections: ReturnType<typeof getVisibleWorkshopSections>;
  current: WorkshopSectionId;
  onChange: (section: WorkshopSectionId) => void;
}) {
  return (
    <div className="mb-8 flex max-w-full flex-wrap gap-2 pb-2">
      {sections.map(({ id, label }) => {
        const active = current === id;
        const copy = sectionCopy[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm border px-4 text-sm font-extrabold transition-[background,border-color,color]",
              active
                ? "border-primary bg-primary-soft text-primary-deep"
                : "border-line bg-panel text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            <Icon icon={copy.icon} className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function WorkshopHero({ onCreate }: { onCreate: () => void }) {
  return (
    <LhPageHero
      className="mb-6"
      title="把现场做对的事，写成大家都能用的行动指南。"
      description={
        <p>
          一次处理得好的等待安抚、一次少走弯路的解释、一次有效的跨岗配合，都值得留下来。写清角色、场景、应该怎么做、哪些话不要说，审核通过后就会成为门店同事可参考的应做与避免。
        </p>
      }
      asideTitle="发布流程"
      asideItems={[
        { title: "提交", description: "角色、场景、应做、方法、避免" },
        { title: "初审", description: "检查可执行性与重复内容" },
        { title: "发布", description: "最高管理员编辑后进入公开区" },
      ]}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-muted">先写清一个具体场景，比写一套大原则更有用。</p>
          <LhButton
            type="button"
            variant="primary"
            icon={<Icon icon={lighthouseIcons.add} className="h-4 w-4" />}
            onClick={onCreate}
          >
            提交行动建议
          </LhButton>
        </div>
      }
    />
  );
}

function ContributionBoard({ items }: { items: ContributionStat[] }) {
  return (
    <LhPanel className="p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-surface-quiet text-primary-deep">
          <Icon icon={lighthouseIcons.cupStar} className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-xl font-extrabold text-ink">贡献榜单</h3>
          <p className="text-sm text-muted">按已发布条目展示门店和个人。</p>
        </div>
      </div>
      <div className="grid gap-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.userId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sm border border-line bg-panel px-3 py-3">
              <span className="min-w-0 text-sm font-bold text-ink-soft">
                {item.storeName ? `${item.storeName} · ` : ""}
                {item.displayName}
              </span>
              <LhChip tone="success">{item.publishedCount} 条</LhChip>
            </div>
          ))
        ) : (
          <p className="rounded-sm border border-dashed border-line bg-surface-quiet p-4 text-sm leading-6 text-muted">
            暂无已发布贡献。发布后会显示门店和个人贡献。
          </p>
        )}
      </div>
    </LhPanel>
  );
}

function GuideSnippet({ label, text, tone }: { label: string; text: string; tone: BadgeTone }) {
  return (
    <div className="min-w-0 rounded-sm border border-line bg-surface-quiet p-4">
      <LhChip tone={tone}>{label}</LhChip>
      <p className="mt-3 text-sm leading-7 text-ink-soft">{text}</p>
    </div>
  );
}

function GuideCard({ guide }: { guide: PublishedGuide }) {
  const snippets = [
    { label: "应做", tone: "success" as BadgeTone, text: guide.doText },
    { label: "方法", tone: "info" as BadgeTone, text: guide.howText ?? "待管理员补充执行说明。" },
    { label: "避免", tone: "danger" as BadgeTone, text: guide.dontText },
  ].filter((snippet) => snippet.text.trim().length > 0);

  return (
    <LhCard className="grid gap-5 p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            {[guide.roleName, guide.serviceScenario, guide.principleRef].filter(Boolean).map((tag) => (
              <LhChip key={tag} tone="primary">
                {tag}
              </LhChip>
            ))}
            <LhStatusBadge tone="success">已发布</LhStatusBadge>
          </div>
          <h3 className="text-xl font-extrabold leading-snug text-ink">{guide.title}</h3>
        </div>
        <span className="text-sm font-extrabold text-muted">
          {new Date(guide.publishedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
        </span>
      </div>

      <div className={cn("grid gap-3", snippets.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {snippets.map((snippet) => (
          <GuideSnippet key={snippet.label} label={snippet.label} tone={snippet.tone} text={snippet.text} />
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4 text-sm font-bold text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>
          {guide.storeName ? `${guide.storeName} · ` : ""}
          {guide.submitterName}
        </span>
        <span className="inline-flex items-center gap-2 text-primary-deep">
          可作为路引引用素材
          <Icon icon={lighthouseIcons.arrowRightUp} className="h-4 w-4" />
        </span>
      </div>
    </LhCard>
  );
}

function StatusReference() {
  return (
    <LhPanel className="p-5">
      <h3 className="text-xl font-extrabold text-ink">状态系统</h3>
      <p className="mt-2 text-sm leading-6 text-muted">颜色只表达类型，文案解释下一步。</p>
      <div className="mt-5 grid gap-3">
        {["draft", "pending_admin_review", "published", "admin_rejected"].map((status) => {
          const meta = getStatusMeta(status);
          return (
            <div key={status} className="grid gap-2 rounded-sm border border-line bg-panel p-3">
              <LhStatusBadge tone={meta.tone}>{meta.label}</LhStatusBadge>
              <p className="text-sm leading-6 text-muted">{meta.description}</p>
            </div>
          );
        })}
      </div>
    </LhPanel>
  );
}

function PublicSection({
  guides,
  leaderboard,
  loading,
  query,
  selectedRole,
  onQueryChange,
  onRoleChange,
  onCreate,
}: {
  guides: PublishedGuide[];
  leaderboard: ContributionStat[];
  loading: boolean;
  query: string;
  selectedRole: string;
  onQueryChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <LhPanel className="p-5">
          <LhSectionHeader
            eyebrow="已发布指南"
            title="已发布指南"
            description="来自管理员审核发布的应做/避免内容。先筛选角色和场景，再进入可执行动作。"
            action={
              <LhButton type="button" variant="primary" icon={<Icon icon={lighthouseIcons.add} className="h-4 w-4" />} onClick={onCreate}>
                提交行动建议
              </LhButton>
            }
          />
          <div className="mt-5 grid gap-4">
            <LhSearchBox
              aria-label="搜索岗位、场景或关键词"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索岗位、场景或关键词"
            />
            <div className="flex max-w-full flex-wrap gap-2">
              {roles.map((role) => (
                <button
                  type="button"
                  key={role}
                  onClick={() => onRoleChange(role)}
                  className={cn(
                    "min-h-9 rounded-sm border px-3 text-sm font-bold transition-[background,border-color,color]",
                    selectedRole === role
                      ? "border-primary bg-primary-soft text-primary-deep"
                      : "border-line bg-panel text-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </LhPanel>

        {loading ? (
          <StateNotice tone="info">
            <Icon icon={lighthouseIcons.refresh} className="mr-2 inline h-4 w-4 animate-spin" />
            正在加载行动指南
          </StateNotice>
        ) : guides.length > 0 ? (
          guides.map((guide) => <GuideCard key={guide.id} guide={guide} />)
        ) : (
          <LhPanel className="border-dashed p-8 text-center">
            <Icon icon={lighthouseIcons.document} className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-base font-bold text-ink">当前范围内还没有已发布指南。</p>
            <p className="mt-2 text-sm leading-6 text-muted">提交通过审核后会出现在这里。</p>
          </LhPanel>
        )}
      </div>
      <ContributionBoard items={leaderboard} />
    </section>
  );
}

function SubmissionForm({
  form,
  editingSubmissionId,
  submitting,
  onUpdate,
  onSubmit,
  onCancelEdit,
}: {
  form: FormState;
  editingSubmissionId: string | null;
  submitting: boolean;
  onUpdate: (key: keyof FormState, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-sm border border-line bg-surface p-5 text-ink shadow-lh-sm">
      <LhSectionHeader
        eyebrow="提交内容"
        title={editingSubmissionId ? "修改应做/避免" : "提交应做/避免"}
        description={
          editingSubmissionId
            ? "当前修改的是已退回内容，提交后会重新进入初审。"
            : "至少填写应做或避免一项。方法用于补充具体执行方式。"
        }
        action={
          editingSubmissionId ? (
            <LhButton
              type="button"
              variant="quiet"
              icon={<Icon icon={lighthouseIcons.close} className="h-4 w-4" />}
              onClick={onCancelEdit}
            >
              取消修改
            </LhButton>
          ) : null
        }
      />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {formFields.map(([field, label, helperText]) => (
          <LhTextField
            key={field}
            label={label}
            helperText={helperText}
            value={form[field]}
            onChange={(event) => onUpdate(field, event.target.value)}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-4">
        <LhTextArea
          label="应做：应该做什么"
          helperText="写成一线可直接执行的动作。"
          value={form.doText}
          onChange={(event) => onUpdate("doText", event.target.value)}
          rows={3}
        />
        <LhTextArea
          label="方法：具体怎么做"
          helperText="用于补充步骤、话术或检查点。"
          value={form.howText}
          onChange={(event) => onUpdate("howText", event.target.value)}
          rows={3}
        />
        <LhTextArea
          label="避免：不要做什么"
          helperText="明确禁止或应避免的动作。"
          value={form.dontText}
          onChange={(event) => onUpdate("dontText", event.target.value)}
          rows={3}
        />
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <LhButton
          type="submit"
          disabled={submitting}
          variant="primary"
          icon={
            <Icon
              icon={submitting ? lighthouseIcons.refresh : lighthouseIcons.send}
              className={cn("h-4 w-4", submitting && "animate-spin")}
            />
          }
        >
          {editingSubmissionId ? "保存并重新初审" : "提交并进入初审"}
        </LhButton>
      </div>
    </form>
  );
}

function ReviewRules() {
  return (
    <LhPanel className="p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-info-soft text-info">
          <Icon icon={lighthouseIcons.info} className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-xl font-extrabold text-ink">初审规则</h3>
          <p className="text-sm text-muted">先保证投稿能进入结构化审核。</p>
        </div>
      </div>
      <div className="grid gap-3">
        {["至少填写应做或避免一项", "未与已发布指南重复", "可执行动作明确"].map((item) => (
          <div key={item} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 rounded-sm border border-line bg-panel p-3">
            <Icon icon={lighthouseIcons.status} className="mt-0.5 h-5 w-5 text-success" />
            <span className="text-sm font-bold leading-6 text-ink-soft">{item}</span>
          </div>
        ))}
      </div>
    </LhPanel>
  );
}

function SubmitSection({
  form,
  editingSubmissionId,
  submitting,
  onUpdate,
  onSubmit,
  onCancelEdit,
}: {
  form: FormState;
  editingSubmissionId: string | null;
  submitting: boolean;
  onUpdate: (key: keyof FormState, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <SubmissionForm
        form={form}
        editingSubmissionId={editingSubmissionId}
        submitting={submitting}
        onUpdate={onUpdate}
        onSubmit={onSubmit}
        onCancelEdit={onCancelEdit}
      />
      <ReviewRules />
    </section>
  );
}

function SubmissionRecord({ item, onEdit }: { item: Submission; onEdit: (submission: Submission) => void }) {
  const meta = getStatusMeta(item.status);
  return (
    <LhCard className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap gap-2">
          <StatusBadge status={item.status} />
          <LhChip tone="primary">{item.roleName}</LhChip>
          {item.serviceScenario && <LhChip tone="neutral">{item.serviceScenario}</LhChip>}
        </div>
        <h3 className="text-xl font-extrabold leading-snug text-ink">{item.title}</h3>
        <p className="mt-2 text-sm font-bold text-muted">最近更新：{new Date(item.updatedAt).toLocaleString("zh-CN")}</p>
        <p className="mt-2 text-sm leading-6 text-muted">{meta.description}</p>
        {item.aiReviewResult && !item.aiReviewResult.passed && (
          <p className="mt-3 rounded-sm border border-danger/25 bg-danger-soft p-3 text-sm font-bold leading-6 text-danger">
            退回原因：{item.aiReviewResult.reason}
          </p>
        )}
      </div>
      {isSubmissionEditable(item.status) && (
        <LhButton
          type="button"
          variant="secondary"
          icon={<Icon icon={lighthouseIcons.edit} className="h-4 w-4" />}
          onClick={() => onEdit(item)}
        >
          {item.status === "draft" ? "继续编辑" : "修改后重提"}
        </LhButton>
      )}
    </LhCard>
  );
}

function PersonalSection({
  submissions,
  onCreate,
  onEdit,
}: {
  submissions: Submission[];
  onCreate: () => void;
  onEdit: (submission: Submission) => void;
}) {
  const counts = submissions.reduce<Record<string, number>>((acc, submission) => {
    acc[submission.status] = (acc[submission.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <LhPanel className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-sm border border-line bg-surface-quiet text-primary-deep">
            <Icon icon={lighthouseIcons.user} className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-ink">我的提交</h2>
            <p className="text-sm text-muted">当前演示用户</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {["draft", "pending_admin_review", "published", "admin_rejected"].map((status) => {
            const meta = getStatusMeta(status);
            return (
              <div key={status} className="rounded-sm border border-line bg-panel p-3">
                <p className="text-2xl font-extrabold text-ink">{counts[status] ?? 0}</p>
                <p className="mt-1 text-xs font-bold text-muted">{meta.label}</p>
              </div>
            );
          })}
        </div>
        <LhButton
          type="button"
          variant="primary"
          className="mt-5 w-full"
          icon={<Icon icon={lighthouseIcons.add} className="h-4 w-4" />}
          onClick={onCreate}
        >
          新建提交
        </LhButton>
      </LhPanel>

      <LhPanel className="p-5">
        <LhSectionHeader eyebrow="个人记录" title="提交记录" description="草稿、待审核、已发布、需修改都在这里回看。" />
        <div className="mt-5 grid gap-4">
          {submissions.length > 0 ? (
            submissions.map((item) => <SubmissionRecord key={item.id} item={item} onEdit={onEdit} />)
          ) : (
            <p className="rounded-sm border border-dashed border-line bg-surface-quiet p-5 text-sm leading-6 text-muted">
              还没有提交记录。先从提交区创建一条岗位应做/避免。
            </p>
          )}
        </div>
      </LhPanel>
    </section>
  );
}

export function WorkshopClient() {
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const [currentRole, setCurrentRole] = React.useState<WorkshopRole | null>(null);
  const visibleSections = React.useMemo(() => getVisibleWorkshopSections(currentRole), [currentRole]);
  const [section, setSection] = React.useState<WorkshopSectionId>("public");
  const [guides, setGuides] = React.useState<PublishedGuide[]>([]);
  const [leaderboard, setLeaderboard] = React.useState<ContributionStat[]>([]);
  const [submissions, setSubmissions] = React.useState<Submission[]>([]);
  const [selectedRole, setSelectedRole] = React.useState("全部岗位");
  const [query, setQuery] = React.useState("");
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [editingSubmissionId, setEditingSubmissionId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    fetchWorkshopRole()
      .then((nextRole) => {
        if (isMounted) setCurrentRole(nextRole);
      })
      .catch(() => {
        if (isMounted) setCurrentRole(null);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isWorkshopSectionId(requestedSection)) return;
    const canShowRequestedSection = visibleSections.some((item) => item.id === requestedSection);
    setSection(canShowRequestedSection ? requestedSection : "public");
  }, [requestedSection, visibleSections]);

  React.useEffect(() => {
    if (!visibleSections.some((item) => item.id === section)) {
      setSection("public");
    }
  }, [section, visibleSections]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedRole !== "全部岗位") params.set("roleName", selectedRole);
      if (query.trim()) params.set("query", query.trim());
      const guideUrl = params.size > 0 ? `/api/workshop/guides?${params}` : "/api/workshop/guides";
      const [nextGuides, nextLeaderboard, nextSubmissions] = await Promise.all([
        fetchData<PublishedGuide[]>(guideUrl),
        fetchData<ContributionStat[]>("/api/workshop/leaderboard"),
        fetchData<Submission[]>("/api/workshop/submissions"),
      ]);
      setGuides(nextGuides);
      setLeaderboard(nextLeaderboard);
      setSubmissions(nextSubmissions);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [query, selectedRole]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  function updateForm(key: keyof FormState, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function startNewSubmission() {
    setEditingSubmissionId(null);
    setForm(initialForm);
    setFeedback("");
    setError("");
    setSection("submit");
  }

  function startEditingSubmission(submission: Submission) {
    setEditingSubmissionId(submission.id);
    setForm(submissionToForm(submission));
    setError("");
    setFeedback(
      submission.aiReviewResult?.reason
        ? `请根据退回原因修改后重新提交：${submission.aiReviewResult.reason}`
        : "请修改内容后重新提交审核。",
    );
    setSection("submit");
  }

  async function submitForReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback("");
    setError("");

    try {
      const draft = editingSubmissionId
        ? await fetchData<Submission>(`/api/workshop/submissions/${editingSubmissionId}`, {
            method: "PATCH",
            body: JSON.stringify({
              ...form,
              serviceScenario: form.serviceScenario,
            }),
          })
        : await fetchData<Submission>("/api/workshop/submissions", {
            method: "POST",
            body: JSON.stringify({
              ...form,
              serviceScenario: form.serviceScenario,
            }),
          });
      const reviewed = await fetchData<Submission>(`/api/workshop/submissions/${draft.id}/submit`, {
        method: "POST",
      });
      setFeedback(
        reviewed.status === "pending_admin_review"
          ? "初审通过，已进入品牌方管理员审核队列。"
          : `初审未通过：${reviewed.aiReviewResult?.reason ?? "需要补充内容"}`,
      );
      setForm({ ...initialForm, doText: "", howText: "", dontText: "" });
      setEditingSubmissionId(null);
      setSection("personal");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl min-w-0">
      <WorkshopHero onCreate={startNewSubmission} />
      <SectionTabs sections={visibleSections} current={section} onChange={setSection} />

      {error && <StateNotice tone="danger">{error}</StateNotice>}
      {feedback && <StateNotice tone="success">{feedback}</StateNotice>}

      {section === "public" && (
        <PublicSection
          guides={guides}
          leaderboard={leaderboard}
          loading={loading}
          query={query}
          selectedRole={selectedRole}
          onQueryChange={setQuery}
          onRoleChange={setSelectedRole}
          onCreate={startNewSubmission}
        />
      )}

      {section === "submit" && (
        <SubmitSection
          form={form}
          editingSubmissionId={editingSubmissionId}
          submitting={submitting}
          onUpdate={updateForm}
          onSubmit={submitForReview}
          onCancelEdit={startNewSubmission}
        />
      )}

      {section === "personal" && (
        <PersonalSection submissions={submissions} onCreate={startNewSubmission} onEdit={startEditingSubmission} />
      )}

      {section === "review" && (
        <section>
          <AdminWorkshopClient embedded />
        </section>
      )}

      <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-sm border border-line bg-surface-quiet p-4 text-sm font-bold leading-6 text-muted">
          <Icon icon={lighthouseIcons.workshop} className="mr-2 inline h-4 w-4 text-primary" />
          当前页面展示已发布指南、贡献榜单和个人提交记录。
        </div>
        <StatusReference />
      </div>
    </div>
  );
}
