"use client";

import * as React from "react";
import { Icon } from "@iconify/react";
import { useSearchParams } from "next/navigation";
import { AdminWorkshopClient } from "../admin/workshop/AdminWorkshopClient";
import {
  LhButton,
  LhChip,
  LhEmptyState,
  LhLoadingGlyph,
  LhMetaList,
  LhPageHero,
  LhPanel,
  LhSearchBox,
  LhSectionHeader,
  LhSegmentedControl,
  LhStateNotice,
  LhStatusBadge,
  LhSubmissionCard,
  LhTextArea,
  LhTextField,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons, type LighthouseIcon } from "@/components/ui/lighthouse-icons";
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
type NoticeTone = React.ComponentProps<typeof LhStateNotice>["tone"];

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
    <LhStateNotice data-lh-workshop-notice tone={tone} icon={<Icon icon={icon} />}>
      {children}
    </LhStateNotice>
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
    <LhSegmentedControl
      data-lh-workshop-section-tabs
      label="Workshop 分区"
      options={sections.map(({ id, label }) => ({
        value: id,
        label,
        icon: <Icon icon={sectionCopy[id].icon} />,
      }))}
      value={current}
      onChange={onChange}
    />
  );
}

function WorkshopHero({ onCreate }: { onCreate: () => void }) {
  return (
    <LhPageHero
      data-lh-workshop-hero
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
        <div data-lh-workshop-hero-footer>
          <p>先写清一个具体场景，比写一套大原则更有用。</p>
          <LhButton
            type="button"
            variant="primary"
            icon={<Icon icon={lighthouseIcons.add} />}
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
    <LhPanel data-lh-workshop-side-panel>
      <div data-lh-workshop-panel-header>
        <span data-lh-workshop-panel-icon>
          <Icon icon={lighthouseIcons.cupStar} />
        </span>
        <div>
          <h3>贡献榜单</h3>
          <p>按已发布条目展示门店和个人。</p>
        </div>
      </div>
      {items.length > 0 ? (
        <LhMetaList
          items={items.map((item) => ({
            label: item.storeName ? `${item.storeName} · ${item.displayName}` : item.displayName,
            value: <LhChip tone="success">{item.publishedCount} 条</LhChip>,
          }))}
        />
      ) : (
        <LhEmptyState
          tone="neutral"
          title="暂无已发布贡献"
          description="发布后会显示门店和个人贡献。"
        />
      )}
    </LhPanel>
  );
}

function GuideSnippet({ label, text, tone }: { label: string; text: string; tone: BadgeTone }) {
  return (
    <div data-lh-workshop-snippet>
      <LhChip tone={tone}>{label}</LhChip>
      <p>{text}</p>
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
    <LhSubmissionCard
      title={guide.title}
      badges={
        <>
          {[guide.roleName, guide.serviceScenario, guide.principleRef].filter(Boolean).map((tag) => (
            <LhChip key={tag} tone="primary">
              {tag}
            </LhChip>
          ))}
          <LhStatusBadge tone="success">已发布</LhStatusBadge>
        </>
      }
      meta={
        <>
          {new Date(guide.publishedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
        </>
      }
      footer={
        <>
          <span>
            {guide.storeName ? `${guide.storeName} · ` : ""}
            {guide.submitterName}
          </span>
          <span data-lh-workshop-card-link>
            可作为路引引用素材
            <Icon icon={lighthouseIcons.arrowRightUp} />
          </span>
        </>
      }
    >
      <div data-lh-workshop-snippet-grid data-count={snippets.length}>
        {snippets.map((snippet) => (
          <GuideSnippet key={snippet.label} label={snippet.label} tone={snippet.tone} text={snippet.text} />
        ))}
      </div>
    </LhSubmissionCard>
  );
}

function StatusReference() {
  return (
    <LhPanel data-lh-workshop-side-panel>
      <div data-lh-workshop-panel-heading>
        <h3>状态系统</h3>
        <p>颜色只表达类型，文案解释下一步。</p>
      </div>
      <LhMetaList
        items={["draft", "pending_admin_review", "published", "admin_rejected"].map((status) => {
          const meta = getStatusMeta(status);
          return {
            label: <LhStatusBadge tone={meta.tone}>{meta.label}</LhStatusBadge>,
            value: meta.description,
          };
        })}
      />
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
    <section data-lh-workshop-two-column>
      <div data-lh-workshop-main-column>
        <LhPanel data-lh-workshop-filter-panel>
          <LhSectionHeader
            eyebrow="已发布指南"
            title="已发布指南"
            description="来自管理员审核发布的应做/避免内容。先筛选角色和场景，再进入可执行动作。"
            action={
              <LhButton type="button" variant="primary" icon={<Icon icon={lighthouseIcons.add} />} onClick={onCreate}>
                提交行动建议
              </LhButton>
            }
          />
          <div data-lh-workshop-filter-controls>
            <LhSearchBox
              aria-label="搜索岗位、场景或关键词"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索岗位、场景或关键词"
            />
            <LhSegmentedControl
              data-lh-workshop-role-filter
              label="岗位筛选"
              options={roles.map((role) => ({ value: role, label: role }))}
              value={selectedRole}
              onChange={onRoleChange}
            />
          </div>
        </LhPanel>

        {loading ? (
          <StateNotice tone="info">正在加载行动指南</StateNotice>
        ) : guides.length > 0 ? (
          guides.map((guide) => <GuideCard key={guide.id} guide={guide} />)
        ) : (
          <LhEmptyState
            tone="primary"
            icon={<Icon icon={lighthouseIcons.document} />}
            title="当前范围内还没有已发布指南。"
            description="提交通过审核后会出现在这里。"
          />
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
    <form data-lh-workshop-form onSubmit={onSubmit}>
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
              icon={<Icon icon={lighthouseIcons.close} />}
              onClick={onCancelEdit}
            >
              取消修改
            </LhButton>
          ) : null
        }
      />
      <div data-lh-workshop-form-grid>
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
      <div data-lh-workshop-form-stack>
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
      <div data-lh-workshop-form-actions>
        <LhButton
          type="submit"
          disabled={submitting}
          variant="primary"
          icon={submitting ? <LhLoadingGlyph label="正在提交" /> : <Icon icon={lighthouseIcons.send} />}
        >
          {editingSubmissionId ? "保存并重新初审" : "提交并进入初审"}
        </LhButton>
      </div>
    </form>
  );
}

function ReviewRules() {
  return (
    <LhPanel data-lh-workshop-side-panel>
      <div data-lh-workshop-panel-header>
        <span data-lh-workshop-panel-icon>
          <Icon icon={lighthouseIcons.info} />
        </span>
        <div>
          <h3>初审规则</h3>
          <p>先保证投稿能进入结构化审核。</p>
        </div>
      </div>
      <LhMetaList
        items={["至少填写应做或避免一项", "未与已发布指南重复", "可执行动作明确"].map((item) => ({
          icon: <Icon icon={lighthouseIcons.status} />,
          label: item,
          value: "进入结构化审核前必须满足。",
        }))}
      />
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
    <section data-lh-workshop-two-column>
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
    <LhSubmissionCard
      title={item.title}
      badges={
        <>
          <StatusBadge status={item.status} />
          <LhChip tone="primary">{item.roleName}</LhChip>
          {item.serviceScenario && <LhChip tone="neutral">{item.serviceScenario}</LhChip>}
        </>
      }
      meta={
        <>
          最近更新：{new Date(item.updatedAt).toLocaleString("zh-CN")}
        </>
      }
      action={
        isSubmissionEditable(item.status) ? (
          <LhButton
            type="button"
            variant="secondary"
            icon={<Icon icon={lighthouseIcons.edit} />}
            onClick={() => onEdit(item)}
          >
            {item.status === "draft" ? "继续编辑" : "修改后重提"}
          </LhButton>
        ) : null
      }
    >
      <p data-lh-workshop-card-note>{meta.description}</p>
        {item.aiReviewResult && !item.aiReviewResult.passed && (
          <p data-lh-workshop-rejection>
            退回原因：{item.aiReviewResult.reason}
          </p>
        )}
    </LhSubmissionCard>
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
    <section data-lh-workshop-personal-layout>
      <LhPanel data-lh-workshop-side-panel>
        <div data-lh-workshop-panel-header>
          <span data-lh-workshop-panel-icon>
            <Icon icon={lighthouseIcons.user} />
          </span>
          <div>
            <h2>我的提交</h2>
            <p>当前演示用户</p>
          </div>
        </div>
        <div data-lh-workshop-stat-grid>
          {["draft", "pending_admin_review", "published", "admin_rejected"].map((status) => {
            const meta = getStatusMeta(status);
            return (
              <div key={status} data-lh-workshop-stat>
                <p>{counts[status] ?? 0}</p>
                <span>{meta.label}</span>
              </div>
            );
          })}
        </div>
        <LhButton
          type="button"
          variant="primary"
          data-lh-workshop-full-button
          icon={<Icon icon={lighthouseIcons.add} />}
          onClick={onCreate}
        >
          新建提交
        </LhButton>
      </LhPanel>

      <LhPanel data-lh-workshop-record-panel>
        <LhSectionHeader eyebrow="个人记录" title="提交记录" description="草稿、待审核、已发布、需修改都在这里回看。" />
        <div data-lh-workshop-card-list>
          {submissions.length > 0 ? (
            submissions.map((item) => <SubmissionRecord key={item.id} item={item} onEdit={onEdit} />)
          ) : (
            <LhEmptyState title="还没有提交记录" description="先从提交区创建一条岗位应做/避免。" />
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
    <div data-lh-workshop-page data-lh-page-archetype="workflow">
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

      <div data-lh-workshop-footer-grid>
        <LhStateNotice tone="neutral" icon={<Icon icon={lighthouseIcons.workshop} />}>
          当前页面展示已发布指南、贡献榜单和个人提交记录。
        </LhStateNotice>
        <StatusReference />
      </div>
    </div>
  );
}
