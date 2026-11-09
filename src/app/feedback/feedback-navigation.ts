import { SUGGESTION_CATEGORIES, SUGGESTION_STATUSES } from "@/modules/feedback/board-types";
import { safeReadingAnchor } from "@/components/knowledge/reading-return";

export type FeedbackBrowse = {
  scope: "all" | "participated" | "mine";
  sort: "latest" | "popular";
  category: string;
  status: string;
  page: number;
};

export function readFeedbackBrowse(params: Pick<URLSearchParams, "get">): FeedbackBrowse {
  const scope = params.get("scope");
  const sort = params.get("sort");
  const legacyView = params.get("view");
  const category = params.get("category") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page"));
  return {
    // Keep links shared before scope and sorting became independent readable.
    scope: scope === "all" || scope === "participated" || scope === "mine" ? scope
      : params.get("mine") === "true" ? "mine" : legacyView === "participated" ? "participated" : "all",
    sort: sort === "latest" || sort === "popular" ? sort : legacyView === "popular" ? "popular" : "latest",
    category: SUGGESTION_CATEGORIES.some(item => item.value === category) ? category : "",
    status: SUGGESTION_STATUSES.some(item => item.value === status) ? status : "",
    page: Number.isSafeInteger(page) && page > 0 && page <= 1000 ? page : 1,
  };
}

export function feedbackListHref(browse: FeedbackBrowse): string {
  const query = new URLSearchParams();
  if (browse.scope !== "all") query.set("scope", browse.scope);
  if (browse.sort !== "latest") query.set("sort", browse.sort);
  if (browse.category) query.set("category", browse.category);
  if (browse.status) query.set("status", browse.status);
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
