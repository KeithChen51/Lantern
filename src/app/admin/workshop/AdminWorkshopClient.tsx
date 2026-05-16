"use client";

import * as React from "react";
import { CheckCircle2, Loader2, RefreshCw, Send, XCircle } from "lucide-react";

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

export function AdminWorkshopClient() {
  const [submissions, setSubmissions] = React.useState<Submission[]>([]);
  const [edits, setEdits] = React.useState<Record<string, EditableSubmission>>({});
  const [rejectComments, setRejectComments] = React.useState<Record<string, string>>({});
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
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-col gap-4 pl-1 md:flex-row md:items-end md:justify-between md:pl-4">
        <div>
          <span className="rounded-full border border-amber/25 bg-amber/10 px-4 py-2 text-sm font-medium text-amber">
            品牌方最高管理员
          </span>
          <h1 className="mt-5 font-serif text-4xl text-ink md:text-5xl">Workshop 审核</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex w-fit items-center gap-2 rounded-full bg-ink/5 px-5 py-3 text-sm font-medium text-ink/65 transition-colors hover:bg-white/60 hover:text-ink"
        >
          <RefreshCw className="h-4 w-4" />
          刷新队列
        </button>
      </div>

      {message && (
        <div className="mb-5 mx-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 md:mx-4">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-5 mx-1 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 md:mx-4">{error}</div>
      )}

      <section className="px-1 md:px-4">
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white/35 p-8 text-sm text-ink/45">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载待审核提交
          </div>
        ) : submissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink/15 bg-white/35 p-8 text-center text-sm text-ink/45">
            当前没有待审核提交。
          </div>
        ) : (
          <div className="grid gap-5">
            {submissions.map((submission) => {
              const edit = edits[submission.id] ?? toEditable(submission);
              const isBusy = busyId === submission.id;
              return (
                <article
                  key={submission.id}
                  className="grid gap-5 rounded-2xl border border-white/60 bg-white/45 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] backdrop-blur-sm xl:grid-cols-[1fr_320px]"
                >
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm text-ink/45">
                          {submission.storeName ? `${submission.storeName} · ` : ""}
                          {submission.submitterName}
                        </p>
                        <input
                          value={edit.title}
                          onChange={(event) => updateEdit(submission.id, "title", event.target.value)}
                          className="mt-2 w-full bg-transparent font-serif text-3xl leading-snug text-ink outline-none"
                        />
                      </div>
                      <span className="w-fit rounded-full bg-amber/10 px-3 py-1 text-xs font-medium text-amber">待审核</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      {[
                        ["roleName", "岗位"],
                        ["serviceScenario", "场景"],
                        ["principleRef", "理念依据"],
                      ].map(([field, label]) => (
                        <label key={field} className="space-y-2">
                          <span className="text-sm font-medium text-ink/55">{label}</span>
                          <input
                            value={(edit[field as keyof EditableSubmission] ?? "") as string}
                            onChange={(event) => updateEdit(submission.id, field as keyof EditableSubmission, event.target.value)}
                            className="w-full rounded-xl border border-white/70 bg-paper/70 px-4 py-3 text-sm text-ink outline-none focus:border-amber/30"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      {[
                        ["doText", "Do"],
                        ["howText", "How"],
                        ["dontText", "Don't"],
                      ].map(([field, label]) => (
                        <label key={field} className="space-y-2">
                          <span className="text-sm font-medium text-ink/55">{label}</span>
                          <textarea
                            value={(edit[field as keyof EditableSubmission] ?? "") as string}
                            onChange={(event) => updateEdit(submission.id, field as keyof EditableSubmission, event.target.value)}
                            rows={5}
                            className="w-full resize-none rounded-xl border border-white/70 bg-paper/70 px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-amber/30"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <aside className="rounded-2xl bg-paper/60 p-4">
                    <h3 className="font-serif text-xl text-ink">处理</h3>
                    <textarea
                      value={rejectComments[submission.id] ?? ""}
                      onChange={(event) =>
                        setRejectComments((previous) => ({ ...previous, [submission.id]: event.target.value }))
                      }
                      rows={4}
                      placeholder="退回说明"
                      className="mt-4 w-full resize-none rounded-xl border border-white/70 bg-white/65 px-4 py-3 text-sm text-ink outline-none placeholder:text-ink/30 focus:border-amber/30"
                    />
                    <div className="mt-4 flex flex-col gap-3">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void publish(submission.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-amber px-5 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(217,119,6,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        编辑后发布
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void reject(submission.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-ink/5 px-5 py-3 text-sm font-medium text-ink/65 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <XCircle className="h-4 w-4" />
                        退回修改
                      </button>
                    </div>
                    <p className="mt-4 flex items-center gap-2 text-xs leading-relaxed text-ink/45">
                      <CheckCircle2 className="h-4 w-4 text-amber" />
                      发布后会进入公共指南，并更新贡献榜。
                    </p>
                  </aside>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
