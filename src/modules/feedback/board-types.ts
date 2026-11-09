/** Shared, JSON-safe contract for the employee suggestion board. */
export const SUGGESTION_CATEGORIES = [
  { value: "platform", label: "平台功能与体验" },
  { value: "culture", label: "服务文化" },
  { value: "knowledge", label: "内容与知识" },
  { value: "other", label: "其他" },
] as const;
export const SUGGESTION_STATUSES = [
  { value: "pending", label: "待回应" },
  { value: "reviewing", label: "评估中" },
  { value: "accepted", label: "已采纳" },
  { value: "in_progress", label: "推进中" },
  { value: "implemented", label: "已落实" },
  { value: "declined", label: "不采纳" },
] as const;
export const SUGGESTION_LIMITS = { title: 100, content: 4000, comment: 2000, note: 2000 } as const;
export type SuggestionCategory = typeof SUGGESTION_CATEGORIES[number]["value"];
export type SuggestionStatus = typeof SUGGESTION_STATUSES[number]["value"];
export type BoardActor = { userId: string; canManage: boolean };
export type BoardViewer = { userId: string; displayName: string; csrfToken: string; canManage: boolean };
export type BoardAuthor = { id: string; name: string };
export type SuggestionSummary = {
  id: string; title: string; category: SuggestionCategory; status: SuggestionStatus;
  author: BoardAuthor; createdAt: string; updatedAt: string;
  likeCount: number; commentCount: number; likedByMe: boolean;
  excerpt: string;
  latestResponse: { note: string; actor: BoardAuthor; createdAt: string } | null;
};
export type SuggestionComment = {
  id: string; author: BoardAuthor; content: string; createdAt: string;
  replyToId: string | null; replyToAuthorName: string | null; hidden: boolean;
};
export type SuggestionEvent = {
  id: string; actor: BoardAuthor; note: string; createdAt: string;
  fromStatus: SuggestionStatus; toStatus: SuggestionStatus;
};
export type SuggestionDetail = SuggestionSummary & {
  content: string; comments: SuggestionComment[]; nextCommentCursor: string | null;
  events: SuggestionEvent[];
  relatedSuggestion: { id: string; title: string } | null;
};
export type SuggestionListQuery = {
  category?: SuggestionCategory; status?: SuggestionStatus; mine?: boolean; participated?: boolean;
  sort?: "latest" | "popular"; page?: number; q?: string;
};
export type SuggestionListResult = { items: SuggestionSummary[]; total: number; page: number; pageSize: number };
export type SuggestionCreateInput = { category: SuggestionCategory; title: string; content: string };
export type SuggestionUpdateInput = {
  status: SuggestionStatus; category: SuggestionCategory; note: string;
  relatedSuggestionId: string | null; expectedUpdatedAt: string;
};
export type SuggestionCommentInput = { content: string; replyToId?: string | null };
export type BoardNotification = {
  id: string; suggestionId: string; title: string; message: string;
  createdAt: string; readAt: string | null;
};
export type BoardNotificationResult = { items: BoardNotification[]; unreadCount: number; nextCursor: string | null };
