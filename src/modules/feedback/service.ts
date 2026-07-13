import { AppError } from "@/shared/errors";
import {
  FEEDBACK_CATEGORY_OPTIONS,
  FEEDBACK_FIELD_LIMITS,
  isValidFeedbackEmail,
  type FeedbackCategory,
  type FeedbackInput,
  type FeedbackIssuePayload,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError("validation_error", `${fieldName} is required.`, 422);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new AppError("validation_error", `${fieldName} is too long.`, 422);
  }

  return result;
}

function readOptionalString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AppError("validation_error", `${fieldName} must be a string.`, 422);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new AppError("validation_error", `${fieldName} is too long.`, 422);
  }

  return result || null;
}

function readCategory(value: unknown): FeedbackCategory {
  if (typeof value === "string" && FEEDBACK_CATEGORY_OPTIONS.some((option) => option.value === value)) {
    return value as FeedbackCategory;
  }

  throw new AppError("validation_error", "category is invalid.", 422);
}

function readOptionalEmail(value: unknown) {
  const contact = readOptionalString(value, "contact", FEEDBACK_FIELD_LIMITS.contact);
  if (contact && !isValidFeedbackEmail(contact)) {
    throw new AppError("validation_error", "contact must be a valid email address.", 422);
  }
  return contact;
}

export function readFeedbackInput(value: unknown): FeedbackInput {
  if (!isRecord(value)) {
    throw new AppError("validation_error", "Feedback payload is invalid.", 422);
  }

  return {
    category: readCategory(value.category),
    title: readRequiredString(value.title, "title", FEEDBACK_FIELD_LIMITS.title),
    description: readRequiredString(value.description, "description", FEEDBACK_FIELD_LIMITS.description),
    sourcePath: readOptionalString(value.sourcePath, "sourcePath", FEEDBACK_FIELD_LIMITS.sourcePath),
    contact: readOptionalEmail(value.contact),
  };
}

function getCategoryLabel(category: FeedbackCategory) {
  return FEEDBACK_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? "其他";
}

export function formatFeedbackIssue(
  input: FeedbackInput,
  submittedAt = new Date(),
): FeedbackIssuePayload {
  const categoryLabel = getCategoryLabel(input.category);

  return {
    title: `[意见反馈][${categoryLabel}] ${input.title}`,
    body: [
      "## 反馈类型",
      categoryLabel,
      "",
      "## 反馈内容",
      input.description,
      "",
      "## 当前页面 / 模块",
      input.sourcePath ?? "未提供",
      "",
      "## 提交人 / 联系方式",
      input.contact ?? "未提供",
      "",
      "## 提交时间",
      submittedAt.toISOString(),
    ].join("\n"),
  };
}
