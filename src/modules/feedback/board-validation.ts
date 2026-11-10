import { AppError } from "@/shared/errors";
import {
  SUGGESTION_CATEGORIES, SUGGESTION_LIMITS, SUGGESTION_STATUSES,
  type SuggestionCategory, type SuggestionCommentInput, type SuggestionCreateInput,
  type SuggestionListQuery, type SuggestionStatus, type SuggestionUpdateInput,
} from "./board-types";

const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const categories = SUGGESTION_CATEGORIES.map(({ value }) => value);
const statuses = SUGGESTION_STATUSES.map(({ value }) => value);

function invalid(message: string): never {
  throw new AppError("validation_error", message, 400);
}

function object(payload: unknown, allowed: string[]): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalid("请求内容无效。");
  const result = payload as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) invalid("请求包含不支持的字段。");
  return result;
}

function text(value: unknown, label: string, limit: number, singleLine = false): string {
  if (typeof value !== "string" || controls.test(value)) invalid(`${label}格式无效。`);
  const result = value.replace(/\r\n?/g, "\n").trim();
  if (!result || result.length > limit || (singleLine && /[\n\t]/.test(result))) {
    invalid(`${label}不能为空且最多 ${limit} 字。`);
  }
  return result;
}

function category(value: unknown): SuggestionCategory {
  if (!categories.includes(value as SuggestionCategory)) invalid("请选择有效的建议类型。");
  return value as SuggestionCategory;
}

function status(value: unknown): SuggestionStatus {
  if (!statuses.includes(value as SuggestionStatus)) invalid("请选择有效的处理状态。");
  return value as SuggestionStatus;
}

export function readBoardId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,191}$/.test(value)) invalid("记录标识无效。");
  return value;
}

export function readSuggestionCreate(payload: unknown): SuggestionCreateInput {
  const input = object(payload, ["category", "title", "content"]);
  return {
    category: category(input.category),
    title: text(input.title, "标题", SUGGESTION_LIMITS.title, true),
    content: text(input.content, "建议内容", SUGGESTION_LIMITS.content),
  };
}

export function readSuggestionUpdate(payload: unknown): SuggestionUpdateInput {
  const input = object(payload, ["status", "category", "note", "relatedSuggestionId", "expectedUpdatedAt"]);
  const timestamp = input.expectedUpdatedAt;
  if (typeof timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)
      || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    invalid("建议版本无效，请刷新后重试。");
  }
  return {
    category: category(input.category), status: status(input.status),
    note: text(input.note, "处理说明", SUGGESTION_LIMITS.note),
    relatedSuggestionId: input.relatedSuggestionId == null ? null : readBoardId(input.relatedSuggestionId),
    expectedUpdatedAt: timestamp,
  };
}

export function readSuggestionComment(payload: unknown): SuggestionCommentInput {
  const input = object(payload, ["content", "replyToId"]);
  return {
    content: text(input.content, "评论", SUGGESTION_LIMITS.comment),
    replyToId: input.replyToId == null ? null : readBoardId(input.replyToId),
  };
}

export function readSuggestionQuery(params: URLSearchParams): SuggestionListQuery {
  const allowed = ["category", "status", "mine", "participated", "sort", "page", "q"];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid("筛选参数无效。");
  }
  const result: SuggestionListQuery = { page: 1, sort: "latest", mine: false };
  if (params.has("category")) result.category = category(params.get("category"));
  if (params.has("status")) result.status = status(params.get("status"));
  if (params.has("mine")) {
    const mine = params.get("mine");
    if (!["true", "false", "1", "0"].includes(mine!)) invalid("我的建议筛选无效。");
    result.mine = mine === "true" || mine === "1";
  }
  if (params.has("participated")) {
    const participated = params.get("participated");
    if (!["true", "false", "1", "0"].includes(participated!)) invalid("参与建议筛选无效。");
    result.participated = participated === "true" || participated === "1";
  }
  if (params.has("sort")) {
    const sort = params.get("sort");
    if (sort !== "latest" && sort !== "popular") invalid("排序参数无效。");
    result.sort = sort;
  }
  if (params.has("page")) {
    const page = params.get("page")!;
    if (!/^[1-9]\d{0,3}$/.test(page) || Number(page) > 1000) invalid("页码应在 1 至 1000 之间。");
    result.page = Number(page);
  }
  if (params.has("q")) {
    const q = params.get("q")!;
    if (controls.test(q) || /[\n\r\t]/.test(q) || q.trim().length > 100) invalid("搜索内容最多 100 字且不能换行。");
    if (q.trim()) result.q = q.trim();
  }
  return result;
}
