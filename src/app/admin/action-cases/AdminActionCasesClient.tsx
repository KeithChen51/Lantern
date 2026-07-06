"use client";

import * as React from "react";
import { Icon } from "@iconify/react";
import {
  LhButton,
  LhCallout,
  LhCard,
  LhChip,
  LhDataTableShell,
  LhLoadingGlyph,
  LhSectionHeader,
  LhStatusBadge,
  LhTextArea,
  LhTextField,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import type { ActionCaseCoverImage, ActionCaseRecord, ParsedActionCaseMarkdown } from "@/modules/content";

type FormState = {
  id: string;
  slug: string;
  title: string;
  date: string;
  tags: string;
  summary: string;
  markdown: string;
  sourceFileName: string;
  coverImage: ActionCaseCoverImage | null;
};

const emptyForm: FormState = {
  id: "",
  slug: "",
  title: "",
  date: new Date().toISOString().slice(0, 10),
  tags: "",
  summary: "",
  markdown: "",
  sourceFileName: "",
  coverImage: null,
};

async function fetchData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败：${response.status}`);
  }
  return payload.data as T;
}

function toFormState(actionCase: ActionCaseRecord): FormState {
  return {
    id: actionCase.id,
    slug: actionCase.slug,
    title: actionCase.title,
    date: actionCase.date,
    tags: actionCase.tags.join(", "),
    summary: actionCase.summary,
    markdown: actionCase.markdown,
    sourceFileName: "",
    coverImage: actionCase.coverImage,
  };
}

function applyParsed(parsed: ParsedActionCaseMarkdown): FormState {
  return {
    id: "",
    slug: parsed.slug,
    title: parsed.title,
    date: parsed.date,
    tags: parsed.tags.join(", "),
    summary: parsed.summary,
    markdown: parsed.markdown,
    sourceFileName: parsed.sourceFileName ?? "",
    coverImage: null,
  };
}

export function AdminActionCasesClient() {
  const [items, setItems] = React.useState<ActionCaseRecord[]>([]);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [markdownFile, setMarkdownFile] = React.useState<File | null>(null);
  const [coverFile, setCoverFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  const loadItems = React.useCallback(async () => {
    setError("");
    try {
      setItems(await fetchData<ActionCaseRecord[]>("/api/admin/action-cases"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载案例失败。");
    }
  }, []);

  React.useEffect(() => {
    void loadItems();
  }, [loadItems]);

  function updateField(field: keyof FormState, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function parseMarkdown() {
    setBusy("parse");
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      if (markdownFile) {
        formData.append("file", markdownFile);
      } else {
        formData.append("markdown", form.markdown);
      }
      const parsed = await fetchData<ParsedActionCaseMarkdown>("/api/admin/action-cases/parse", {
        method: "POST",
        body: formData,
      });
      setForm(applyParsed(parsed));
      setMessage("Markdown 已解析，请检查元数据和预览内容。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "解析失败。");
    } finally {
      setBusy("");
    }
  }

  async function saveDraft() {
    setBusy("save");
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      for (const [key, value] of Object.entries({
        id: form.id,
        slug: form.slug,
        title: form.title,
        date: form.date,
        tags: form.tags,
        summary: form.summary,
        markdown: form.markdown,
        sourceFileName: form.sourceFileName,
        coverImageJson: form.coverImage ? JSON.stringify(form.coverImage) : "",
      })) {
        formData.append(key, value);
      }
      if (coverFile) {
        formData.append("coverImage", coverFile);
      }
      const saved = await fetchData<ActionCaseRecord>("/api/admin/action-cases", {
        method: "POST",
        body: formData,
      });
      setForm(toFormState(saved));
      setCoverFile(null);
      setMessage("草稿已保存。确认无误后再手动发布。");
      await loadItems();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存草稿失败。");
    } finally {
      setBusy("");
    }
  }

  async function publishCurrent() {
    if (!form.id) return;
    setBusy("publish");
    setError("");
    setMessage("");
    try {
      const published = await fetchData<ActionCaseRecord>(`/api/admin/action-cases/${form.id}/publish`, {
        method: "POST",
      });
      setForm(toFormState(published));
      setMessage("案例已发布到笃行页面。");
      await loadItems();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "发布失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <LhSectionHeader
        eyebrow="笃行案例"
        title="案例维护"
        description="上传参悟案例 Markdown，系统保留标题结构并生成草稿；发布前可以手动修正元数据和封面图。"
      />

      {message && <LhCallout tone="success" icon={<Icon icon={lighthouseIcons.status} className="h-4 w-4" />}>{message}</LhCallout>}
      {error && <LhCallout tone="danger" icon={<Icon icon={lighthouseIcons.warning} className="h-4 w-4" />}>{error}</LhCallout>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <LhCard className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-extrabold text-ink">
              Markdown 文档
              <input
                type="file"
                accept=".md,.markdown"
                className="rounded-[var(--lh-control-radius)] border border-line-strong bg-panel px-4 py-3 text-sm text-ink"
                onChange={(event) => setMarkdownFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="grid gap-2 text-sm font-extrabold text-ink">
              封面图
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="rounded-[var(--lh-control-radius)] border border-line-strong bg-panel px-4 py-3 text-sm text-ink"
                onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <LhButton
              type="button"
              variant="secondary"
              disabled={busy === "parse"}
              icon={busy === "parse" ? <LhLoadingGlyph label="正在解析" /> : <Icon icon={lighthouseIcons.document} className="h-4 w-4" />}
              onClick={() => void parseMarkdown()}
            >
              解析 Markdown
            </LhButton>
            <LhButton
              type="button"
              variant="primary"
              disabled={busy === "save"}
              icon={busy === "save" ? <LhLoadingGlyph label="正在保存" /> : <Icon icon={lighthouseIcons.save} className="h-4 w-4" />}
              onClick={() => void saveDraft()}
            >
              保存草稿
            </LhButton>
            <LhButton
              type="button"
              variant="signal"
              disabled={!form.id || busy === "publish"}
              icon={busy === "publish" ? <LhLoadingGlyph label="正在发布" /> : <Icon icon={lighthouseIcons.publish} className="h-4 w-4" />}
              onClick={() => void publishCurrent()}
            >
              发布
            </LhButton>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <LhTextField label="Slug" value={form.slug} onChange={(event) => updateField("slug", event.target.value)} />
            <LhTextField label="日期" type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} />
            <LhTextField label="标题" value={form.title} onChange={(event) => updateField("title", event.target.value)} className="md:col-span-2" />
            <LhTextField label="标签" helperText="用逗号分隔" value={form.tags} onChange={(event) => updateField("tags", event.target.value)} className="md:col-span-2" />
          </div>
          <LhTextArea label="摘要" value={form.summary} onChange={(event) => updateField("summary", event.target.value)} />
          <LhTextArea label="Markdown 正文" value={form.markdown} onChange={(event) => updateField("markdown", event.target.value)} className="min-h-96 font-mono text-sm" />
        </LhCard>

        <aside className="space-y-5">
          <LhCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-ink">当前草稿</h2>
              <LhStatusBadge tone={form.id ? "warning" : "neutral"}>{form.id ? "可发布" : "未保存"}</LhStatusBadge>
            </div>
            <p className="mt-4 text-sm leading-7 text-ink-soft">{form.summary || "解析 Markdown 后会生成摘要，保存前可手动修改。"}</p>
            {form.coverImage && (
              <div
                aria-label="封面图预览"
                className="mt-4 aspect-[16/9] w-full rounded-[var(--lh-card-radius)] bg-cover bg-center"
                style={{ backgroundImage: `url("${form.coverImage.url}")` }}
              />
            )}
          </LhCard>

          <LhDataTableShell>
            <table>
              <thead>
                <tr>
                  <th>案例</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button type="button" className="text-left font-bold text-primary-deep hover:underline" onClick={() => setForm(toFormState(item))}>
                        {item.title}
                      </button>
                      <p className="mt-1 text-xs text-muted">{item.slug}</p>
                    </td>
                    <td>
                      <LhChip tone={item.publishedVersionNo ? "success" : "warning"}>{item.publishedVersionNo ? "已发布" : "草稿"}</LhChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </LhDataTableShell>
        </aside>
      </div>
    </div>
  );
}
