"use client";

import * as React from "react";
import { Icon } from "@iconify/react";
import { LhButton, LhCallout, LhLoadingGlyph, LhStateNotice, LhTextArea, LhTextField } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import {
  FEEDBACK_CATEGORY_OPTIONS,
  FEEDBACK_FIELD_LIMITS,
  isValidFeedbackEmail,
  type FeedbackCategory,
  type FeedbackIssueReference,
} from "@/modules/feedback/types";

type FeedbackFormValues = {
  category: FeedbackCategory;
  title: string;
  description: string;
  contact: string;
};

type FeedbackField = "title" | "description" | "contact";
type FeedbackFieldErrors = Partial<Record<FeedbackField, string>>;
type FeedbackFieldElement = HTMLInputElement | HTMLTextAreaElement;
type SubmitStatus = "idle" | "submitting" | "success" | "error";

const CATEGORY_GUIDANCE: Record<FeedbackCategory, { placeholder: string; helperText: string }> = {
  suggestion: {
    placeholder: "例如：希望在镜鉴中增加按模块筛选",
    helperText: "说明你希望增加或改进什么。",
  },
  bug: {
    placeholder: "请描述发生了什么，以及你原本期望看到什么",
    helperText: "如能补充操作步骤，后续定位会更快。",
  },
  content: {
    placeholder: "请说明需要修正的内容和建议版本",
    helperText: "可附上页面位置或正确表述。",
  },
  other: {
    placeholder: "请补充你想告诉我们的内容",
    helperText: "描述越具体，后续跟进越容易。",
  },
};

function createInitialValues(): FeedbackFormValues {
  return {
    category: "suggestion",
    title: "",
    description: "",
    contact: "",
  };
}

function validateDraft(values: FeedbackFormValues): FeedbackFieldErrors {
  const errors: FeedbackFieldErrors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const contact = values.contact.trim();

  if (!title) errors.title = "请用一句话说明问题或建议。";
  else if (title.length > FEEDBACK_FIELD_LIMITS.title) errors.title = `一句话说明不能超过 ${FEEDBACK_FIELD_LIMITS.title} 个字。`;

  if (!description) errors.description = "请补充详细说明。";
  else if (description.length > FEEDBACK_FIELD_LIMITS.description) errors.description = `详细说明不能超过 ${FEEDBACK_FIELD_LIMITS.description} 个字。`;

  if (contact.length > FEEDBACK_FIELD_LIMITS.contact) errors.contact = "联系邮箱过长。";
  else if (contact && !isValidFeedbackEmail(contact)) errors.contact = "请输入有效的联系邮箱，例如 name@byd.com。";

  return errors;
}

export function FeedbackForm({ initialSourcePath }: { initialSourcePath: string }) {
  const [values, setValues] = React.useState(createInitialValues);
  const [errors, setErrors] = React.useState<FeedbackFieldErrors>({});
  const [status, setStatus] = React.useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [issueReference, setIssueReference] = React.useState<FeedbackIssueReference | null>(null);
  const fieldRefs = React.useRef<Partial<Record<FeedbackField, FeedbackFieldElement | null>>>({});

  const isSubmitting = status === "submitting";
  const isFormValid = Object.keys(validateDraft(values)).length === 0;
  const categoryGuidance = CATEGORY_GUIDANCE[values.category];
  const sourcePathLabel = initialSourcePath || "未识别当前页面";

  const setFieldRef = (field: FeedbackField) => (element: FeedbackFieldElement | null) => {
    fieldRefs.current[field] = element;
  };

  const resetErrorStatus = () => {
    if (status === "error") setStatus("idle");
  };

  const updateCategory = (category: FeedbackCategory) => {
    setValues((current) => ({ ...current, category }));
    resetErrorStatus();
  };

  const updateField = (field: FeedbackField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    resetErrorStatus();
  };

  const validateField = (field: FeedbackField) => {
    const nextError = validateDraft(values)[field];
    setErrors((current) => {
      const next = { ...current };
      if (nextError) next[field] = nextError;
      else delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draftErrors = validateDraft(values);
    setErrors(draftErrors);

    const firstInvalidField = (Object.keys(draftErrors) as FeedbackField[])[0];
    if (firstInvalidField) {
      fieldRefs.current[firstInvalidField]?.focus();
      return;
    }

    setStatus("submitting");
    setErrorMessage("");
    setIssueReference(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, sourcePath: initialSourcePath || null }),
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { issue?: FeedbackIssueReference };
        error?: { message?: unknown };
      } | null;

      if (!response.ok) {
        const message = typeof payload?.error?.message === "string" ? payload.error.message : "反馈未提交，请稍后重试。";
        throw new Error(message);
      }

      setStatus("success");
      setIssueReference(payload?.data?.issue ?? null);
      setErrors({});
      setValues(createInitialValues());
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "反馈未提交，请稍后重试。");
    }
  };

  return (
    <form data-lh-feedback-form onSubmit={handleSubmit} noValidate className="grid">
      <div data-lh-feedback-body className="grid gap-5">
        <fieldset className="grid" disabled={isSubmitting}>
          <legend className="text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-ink">
            反馈类型
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
              <label key={option.value} className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="category"
                  value={option.value}
                  checked={values.category === option.value}
                  onChange={() => updateCategory(option.value)}
                  required
                />
                <span className="flex min-h-11 items-center justify-center rounded-[var(--lh-control-radius)] border border-line-strong bg-panel px-3 text-center text-[length:var(--type-control)] font-[var(--weight-bold)] leading-[var(--leading-control)] text-muted transition-[background,border-color,color,box-shadow,transform] hover:border-primary/50 hover:text-ink peer-checked:border-primary/40 peer-checked:bg-primary-soft peer-checked:text-primary-text peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[var(--lh-focus-offset)] peer-focus-visible:outline-[var(--lh-focus-outline)] peer-focus-visible:shadow-[var(--shadow-focus)]">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <LhTextField
          ref={setFieldRef("title")}
          id="feedback-title"
          name="title"
          type="text"
          label="一句话说明"
          helperText="用一句话概括问题或建议。"
          error={errors.title}
          value={values.title}
          onChange={(event) => updateField("title", event.target.value)}
          onBlur={() => validateField("title")}
          placeholder="例如：希望增加按模块筛选"
          maxLength={FEEDBACK_FIELD_LIMITS.title}
          disabled={isSubmitting}
          required
        />

        <LhTextArea
          ref={setFieldRef("description")}
          id="feedback-description"
          name="description"
          label="详细说明"
          helperText={categoryGuidance.helperText}
          error={errors.description}
          value={values.description}
          onChange={(event) => updateField("description", event.target.value)}
          onBlur={() => validateField("description")}
          placeholder={categoryGuidance.placeholder}
          maxLength={FEEDBACK_FIELD_LIMITS.description}
          disabled={isSubmitting}
          required
          className="min-h-40"
        />

        <LhTextField
          ref={setFieldRef("contact")}
          id="feedback-contact"
          name="contact"
          type="email"
          autoComplete="email"
          label="联系邮箱"
          optionalLabel="选填"
          helperText="需要进一步沟通时填写，我们只会用于跟进本次反馈。"
          error={errors.contact}
          value={values.contact}
          onChange={(event) => updateField("contact", event.target.value)}
          onBlur={() => validateField("contact")}
          placeholder="name@byd.com"
          maxLength={FEEDBACK_FIELD_LIMITS.contact}
          disabled={isSubmitting}
        />

        <LhCallout tone="neutral" title="提交说明">
          <span data-lh-feedback-context className="block">
            反馈页面：<span className="font-[var(--weight-bold)] text-ink">{sourcePathLabel}</span>
          </span>
          <span className="mt-2 block border-t border-current/15 pt-2">
            反馈将进入内部问题列表。请勿填写客户个人信息、账号、密钥等敏感信息。
          </span>
        </LhCallout>

        {status === "success" ? (
          <LhStateNotice
            data-lh-feedback-status
            tone="success"
            aria-live="polite"
            icon={<Icon icon={lighthouseIcons.status} aria-hidden="true" />}
          >
            反馈已提交
            {issueReference?.number ? (
              <>
                ，编号 {issueReference.url ? (
                  <a href={issueReference.url} target="_blank" rel="noreferrer" className="font-[var(--weight-bold)] underline underline-offset-2">#{issueReference.number}</a>
                ) : <strong>#{issueReference.number}</strong>}
              </>
            ) : null}
            。
          </LhStateNotice>
        ) : null}

        {status === "error" ? (
          <LhStateNotice
            data-lh-feedback-status
            tone="danger"
            icon={<Icon icon={lighthouseIcons.warning} aria-hidden="true" />}
          >
            {errorMessage || "反馈未提交，请稍后重试。"}
          </LhStateNotice>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end">
        <LhButton
          type="submit"
          variant="primary"
          disabled={!isFormValid || isSubmitting}
          aria-busy={isSubmitting}
          icon={isSubmitting ? <LhLoadingGlyph label="提交中" /> : <Icon icon={lighthouseIcons.send} className="h-4 w-4" aria-hidden="true" />}
        >
          {isSubmitting ? "提交中…" : status === "error" ? "重新提交" : "提交反馈"}
        </LhButton>
      </div>
    </form>
  );
}
