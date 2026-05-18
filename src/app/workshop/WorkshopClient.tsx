"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FilePlus2,
  Loader2,
  MessageSquareText,
  PencilLine,
  Search,
  Send,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { AdminWorkshopClient } from "../admin/workshop/AdminWorkshopClient";
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
    throw new Error(payload.error?.message ?? `Request failed: ${response.status}`);
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

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "published"
      ? "bg-emerald-100 text-emerald-800"
      : status === "pending_admin_review"
        ? "bg-amber/10 text-amber"
        : status.includes("rejected")
          ? "bg-red-100 text-red-800"
          : "bg-ink/5 text-ink/55";

  const labelMap: Record<string, string> = {
    draft: "草稿",
    submitted: "已提交",
    ai_rejected: "AI 初审退回",
    pending_admin_review: "待管理员审核",
    admin_rejected: "管理员退回",
    published: "已发布",
    withdrawn: "已撤回",
  };

  return <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{labelMap[status] ?? status}</span>;
}

function ContributionBoard({ items }: { items: ContributionStat[] }) {
  return (
    <aside className="min-w-0 rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber" />
        <h3 className="font-serif text-xl text-ink">贡献榜单</h3>
      </div>
      <div className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.userId} className="flex items-center justify-between rounded-xl bg-paper/60 px-3 py-3">
              <span className="text-sm text-ink/70">
                {item.storeName ? `${item.storeName} · ` : ""}
                {item.displayName}
              </span>
              <span className="text-xs font-semibold text-amber">{item.publishedCount} 条</span>
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-paper/60 p-4 text-sm leading-relaxed text-ink/45">暂无已发布贡献。</p>
        )}
      </div>
    </aside>
  );
}

function GuideCard({ guide }: { guide: PublishedGuide }) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {[guide.roleName, guide.serviceScenario, guide.principleRef, "已发布"].filter(Boolean).map((tag) => (
              <span key={tag} className="rounded-full bg-ink/5 px-3 py-1 text-xs text-ink/55">
                {tag}
              </span>
            ))}
          </div>
          <h3 className="font-serif text-2xl leading-snug text-ink">{guide.title}</h3>
        </div>
        <span className="text-xs font-medium tracking-[0.2em] text-ink/30">
          {new Date(guide.publishedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <GuideSnippet label="DO" tone="amber" text={guide.doText} />
        <GuideSnippet label="HOW" tone="paper" text={guide.howText ?? "待管理员补充执行说明。"} />
        <GuideSnippet label="DON'T" tone="red" text={guide.dontText} />
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-ink/5 pt-4 text-sm text-ink/50 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {guide.storeName ? `${guide.storeName} · ` : ""}
          {guide.submitterName}
        </span>
        <span className="inline-flex items-center gap-1 text-amber">
          可纳入 Hermit 推荐素材
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </article>
  );
}

function GuideSnippet({ label, tone, text }: { label: string; tone: "amber" | "paper" | "red"; text: string }) {
  const toneClass =
    tone === "amber" ? "bg-amber/10 text-amber" : tone === "red" ? "bg-red-100/60 text-red-700/75" : "bg-paper/70 text-ink/35";

  return (
    <div className={`rounded-xl p-4 ${toneClass}`}>
      <p className="mb-2 text-xs font-bold tracking-[0.2em]">{label}</p>
      <p className="text-sm leading-relaxed text-ink/75">{text}</p>
    </div>
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
          ? "AI 初审通过，已进入品牌方管理员审核队列。"
          : `AI 初审未通过：${reviewed.aiReviewResult?.reason ?? "需要补充内容"}`,
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
      <div className="mb-12 px-4">
        <h1 className="mb-4 flex flex-wrap items-baseline gap-3 text-4xl font-bold md:text-5xl">
          <span className="font-noto text-ink">共创</span>
          <span className="font-serif text-3xl italic text-amber opacity-90 md:text-4xl">Workshop</span>
        </h1>
        <div className="max-w-3xl space-y-4 break-words font-serif text-lg leading-relaxed text-ink/60">
          <p>把本心里的原则，写成一线可执行的 Do & Don&apos;t。</p>
          <p>
            共创面向长期开放提交。员工可以围绕岗位、服务场景和价值原则沉淀经验；品牌管理员在同一个板块内审核、编辑并发布为公共指南。
          </p>
        </div>
        <div className="mt-6 flex max-w-full flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
          <span className="max-w-full break-words rounded-full border border-amber/30 bg-amber/10 px-4 py-2 text-sm font-medium text-amber">
            长期开放共创
          </span>
          <span className="max-w-full break-words rounded-full border border-white/70 bg-white/35 px-4 py-2 text-sm text-ink/55">
            AI 初审 · 审核发布 · 执行指南
          </span>
        </div>
      </div>

      <div className="mb-8 flex max-w-full gap-2 overflow-x-auto px-4 pb-2">
        {visibleSections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-all ${
              section === id
                ? "border-amber/30 bg-amber/10 text-amber"
                : "border-white/70 bg-white/35 text-ink/60 hover:border-ink/10 hover:bg-white/55 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-4 mb-6 break-words rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}
      {feedback && (
        <div className="mx-4 mb-6 break-words rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      {section === "public" && (
        <section className="grid gap-6 px-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <div className="min-w-0 rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h2 className="font-serif text-2xl text-ink md:text-3xl">已发布指南</h2>
                  <p className="mt-2 text-sm text-ink/55">来自管理员审核发布的 Do & Don&apos;t 内容。</p>
                </div>
                <button
                  type="button"
                  onClick={startNewSubmission}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber px-5 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(217,119,6,0.22)] transition-transform hover:-translate-y-0.5 sm:w-fit"
                >
                  <FilePlus2 className="h-4 w-4" />
                  提交新的 Do & Don&apos;t
                </button>
              </div>
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索岗位、场景或关键词"
                  className="w-full rounded-full border border-transparent bg-white/55 py-3 pl-11 pr-4 text-sm text-ink outline-none transition-all placeholder:text-ink/30 focus:border-amber/20 focus:bg-white/70"
                />
              </div>
              <div className="flex max-w-full flex-wrap gap-2">
                {roles.map((role) => (
                  <button
                    type="button"
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-all ${
                      selectedRole === role
                        ? "border-amber/30 bg-amber/10 text-amber"
                        : "border-white/70 bg-white/35 text-ink/60 hover:border-ink/10 hover:bg-white/55 hover:text-ink"
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 rounded-2xl bg-white/35 p-8 text-sm text-ink/45">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载 Workshop 数据
              </div>
            ) : guides.length > 0 ? (
              guides.map((guide) => <GuideCard key={guide.id} guide={guide} />)
            ) : (
              <div className="rounded-2xl border border-dashed border-ink/15 bg-white/35 p-8 text-center text-sm text-ink/45">
                当前范围内还没有已发布指南。提交通过审核后会出现在这里。
              </div>
            )}
          </div>
          <ContributionBoard items={leaderboard} />
        </section>
      )}

      {section === "submit" && (
        <section className="grid gap-6 px-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form
            onSubmit={submitForReview}
            className="rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="font-serif text-2xl text-ink md:text-3xl">
                  {editingSubmissionId ? "修改 Do & Don't" : "提交 Do & Don't"}
                </h2>
                {editingSubmissionId && (
                  <p className="mt-2 text-sm text-ink/55">当前修改的是已退回内容，提交后会重新进入 AI 初审。</p>
                )}
              </div>
              {editingSubmissionId && (
                <button
                  type="button"
                  onClick={startNewSubmission}
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-white/70 bg-white/35 px-4 py-2 text-sm text-ink/55 transition-colors hover:border-ink/10 hover:bg-white/55 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                  取消修改
                </button>
              )}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ["title", "标题"],
                ["roleName", "适用岗位"],
                ["storeName", "门店"],
                ["serviceScenario", "服务场景"],
                ["principleRef", "理念依据"],
              ].map(([field, label]) => (
                <label key={field} className="space-y-2">
                  <span className="text-sm font-medium text-ink/60">{label}</span>
                  <input
                    value={form[field as keyof FormState]}
                    onChange={(event) => updateForm(field as keyof FormState, event.target.value)}
                    className="w-full rounded-xl border border-white/70 bg-paper/70 px-4 py-3 text-sm text-ink outline-none focus:border-amber/30"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-4">
              {[
                ["doText", "Do：应该做什么"],
                ["howText", "How：具体怎么做"],
                ["dontText", "Don't：绝对不能做什么"],
              ].map(([field, label]) => (
                <label key={field} className="space-y-2">
                  <span className="text-sm font-medium text-ink/60">{label}</span>
                  <textarea
                    value={form[field as keyof FormState]}
                    onChange={(event) => updateForm(field as keyof FormState, event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-white/70 bg-paper/70 px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-amber/30"
                  />
                </label>
              ))}
            </div>
            <div className="mt-5">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-amber px-6 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(217,119,6,0.22)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {editingSubmissionId ? "保存并重新初审" : "提交并进入初审"}
              </button>
            </div>
          </form>

          <aside className="rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-amber" />
              <h3 className="font-serif text-xl text-ink">初审规则</h3>
            </div>
            <div className="space-y-3">
              {["结构完整", "未与已发布指南重复", "可执行动作明确"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-xl bg-paper/60 p-3 text-sm text-ink/65">
                  <CheckCircle2 className="h-4 w-4 text-amber" />
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </section>
      )}

      {section === "personal" && (
        <section className="grid gap-6 px-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber/10 text-amber">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-2xl text-ink">我的共创</h2>
                <p className="text-sm text-ink/45">当前演示用户</p>
              </div>
            </div>
            <button
              type="button"
              onClick={startNewSubmission}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink/5 px-5 py-3 text-sm font-medium text-ink/65 transition-colors hover:bg-amber/10 hover:text-amber"
            >
              <FilePlus2 className="h-4 w-4" />
              新建提交
            </button>
          </aside>

          <div className="rounded-2xl border border-white/60 bg-white/40 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm">
            <h2 className="font-serif text-2xl text-ink md:text-3xl">提交记录</h2>
            <div className="mt-6 grid gap-4">
              {submissions.length > 0 ? (
                submissions.map((item) => (
                  <article
                    key={item.id}
                    className="flex flex-col gap-4 rounded-xl bg-paper/60 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <h3 className="font-serif text-xl text-ink">{item.title}</h3>
                      <p className="mt-1 flex items-center gap-1 text-sm text-ink/45">
                        <Clock3 className="h-3.5 w-3.5" />
                        最近更新：{new Date(item.updatedAt).toLocaleString("zh-CN")}
                      </p>
                      {item.aiReviewResult && !item.aiReviewResult.passed && (
                        <p className="mt-2 max-w-2xl break-words text-sm text-rose-700/75">
                          退回原因：{item.aiReviewResult.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <StatusBadge status={item.status} />
                      {isSubmissionEditable(item.status) && (
                        <button
                          type="button"
                          onClick={() => startEditingSubmission(item)}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-4 py-2 text-sm font-medium text-amber transition-colors hover:bg-amber/15"
                        >
                          <PencilLine className="h-4 w-4" />
                          {item.status === "draft" ? "继续编辑" : "修改后重提"}
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-xl bg-paper/60 p-5 text-sm text-ink/45">还没有提交记录。</p>
              )}
            </div>
          </div>
        </section>
      )}

      {section === "review" && (
        <section className="px-4">
          <AdminWorkshopClient embedded />
        </section>
      )}

      <div className="mt-10 px-4">
        <div className="rounded-2xl border border-white/60 bg-white/30 p-4 text-sm text-ink/45">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-amber" />
            当前页面通过 Phase 1 Workshop API 读取指南、榜单和个人提交。
          </div>
        </div>
      </div>
    </div>
  );
}
