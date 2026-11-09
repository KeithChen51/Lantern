import { SUGGESTION_CATEGORIES, SUGGESTION_STATUSES } from "@/modules/feedback/board-types";
import { safeReadingAnchor } from "@/components/knowledge/reading-return";

export type FeedbackBrowse = {
  view: "latest" | "popular" | "participated";
  category: string;
  status: string;
  mine: boolean;
  page: number;
};

export function readFeedbackBrowse(params: Pick<URLSearchParams, "get">): FeedbackBrowse {
  const view = params.get("view");
  const category = params.get("category") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page"));
  return {
    view: view === "popular" || view === "participated" ? view : "latest",
    category: SUGGESTION_CATEGORIES.some(item => item.value === category) ? category : "",
    status: SUGGESTION_STATUSES.some(item => item.value === status) ? status : "",
    mine: params.get("mine") === "true",
    page: Number.isSafeInteger(page) && page > 0 && page <= 1000 ? page : 1,
  };
}

export function feedbackListHref(browse: FeedbackBrowse): string {
  const query = new URLSearchParams();
  if (browse.view !== "latest") query.set("view", browse.view);
  if (browse.category) query.set("category", browse.category);
  if (browse.status) query.set("status", browse.status);
  if (browse.mine) query.set("mine", "true");
  if (browse.page > 1) query.set("page", String(browse.page));
  return `/feedback${query.size ? `?${query}` : ""}`;
}

/** Only this board's list and validated card anchors may be return destinations. */
export function feedbackReturnHref(params: Pick<URLSearchParams, "get">): string {
  const value = params.get("returnTo");
  if (!value || value.length > 2048 || !/^\/feedback(?:\?|$)/.test(value)) return "/feedback";
  const url = new URL(value, "https://lighthouse.invalid");
  const target = feedbackListHref(readFeedbackBrowse(url.searchParams));
  const anchor = safeReadingAnchor(params.get("returnAnchor"));
  return `${target}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;
}
