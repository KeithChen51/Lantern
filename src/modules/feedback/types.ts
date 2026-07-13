export const FEEDBACK_CATEGORY_OPTIONS = [
  { value: "suggestion", label: "功能建议" },
  { value: "bug", label: "问题反馈" },
  { value: "content", label: "内容纠错" },
  { value: "other", label: "其他" },
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORY_OPTIONS)[number]["value"];

export const FEEDBACK_FIELD_LIMITS = {
  title: 120,
  description: 4000,
  sourcePath: 240,
  contact: 120,
} as const;

export type FeedbackInput = {
  category: FeedbackCategory;
  title: string;
  description: string;
  sourcePath: string | null;
  contact: string | null;
};

export type FeedbackIssuePayload = {
  title: string;
  body: string;
};

export type FeedbackIssueReference = {
  number: string | null;
  url: string | null;
};

export function isValidFeedbackEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
