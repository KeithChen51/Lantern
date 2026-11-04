import { describe, expect, it } from "vitest";
import { AppError } from "@/shared/errors";
import {
  readSuggestionComment, readSuggestionCreate, readSuggestionQuery, readSuggestionUpdate,
} from "./board-validation";

const create = { category: "culture", title: " 建议标题 ", content: " 第一行\r\n第二行 " };
const update = { category: "culture", status: "accepted", note: "安排落实", expectedUpdatedAt: "2026-11-04T00:00:00.000Z" };

describe("suggestion input boundaries", () => {
  it("trims text and preserves plain text including markup without interpreting it", () => {
    expect(readSuggestionCreate(create)).toEqual({ category: "culture", title: "建议标题", content: "第一行\n第二行" });
    expect(readSuggestionComment({ content: " <script>plain text</script> " }).content).toBe("<script>plain text</script>");
  });

  it.each([
    null, [], {}, { ...create, title: " " }, { ...create, title: "x".repeat(101) },
    { ...create, content: "x".repeat(4001) }, { ...create, category: "external" },
    { ...create, title: "two\nlines" }, { ...create, content: "control\u0000value" },
    { ...create, authorId: "forged" }, { ...create, attachments: [] },
  ])("rejects invalid creation input %#", (payload) => {
    expect(() => readSuggestionCreate(payload)).toThrow(AppError);
    try { readSuggestionCreate(payload); } catch (error) { expect(error).toMatchObject({ status: 400 }); }
  });

  it("accepts boundary lengths and requires a note for every administrator update", () => {
    expect(readSuggestionCreate({ category: "other", title: "x".repeat(100), content: "x".repeat(4000) }).content.length).toBe(4000);
    expect(readSuggestionUpdate(update).relatedSuggestionId).toBeNull();
    expect(readSuggestionUpdate({ ...update, note: "x".repeat(2000) }).note.length).toBe(2000);
    expect(() => readSuggestionUpdate({ ...update, note: " " })).toThrow(AppError);
    expect(() => readSuggestionUpdate({ ...update, status: "closed" })).toThrow(AppError);
    expect(() => readSuggestionUpdate({ ...update, note: "x".repeat(2001) })).toThrow(AppError);
  });

  it.each(["invalid", "2026-02-30T00:00:00.000Z", "2026-11-04", "2026-11-04T00:00:00Z"]) (
    "rejects a malformed optimistic version %s", (expectedUpdatedAt) => {
      expect(() => readSuggestionUpdate({ ...update, expectedUpdatedAt })).toThrow(AppError);
    },
  );

  it("bounds comment length and reply identifiers", () => {
    expect(readSuggestionComment({ content: "x".repeat(2000), replyToId: "comment-1" }).replyToId).toBe("comment-1");
    for (const payload of [{ content: " " }, { content: "x".repeat(2001) }, { content: "ok", replyToId: "bad/id" }]) {
      expect(() => readSuggestionComment(payload)).toThrow(AppError);
    }
  });

  it("parses combined filters with bounded pages and trimmed search", () => {
    expect(readSuggestionQuery(new URLSearchParams("category=platform&status=in_progress&mine=true&sort=popular&page=2&q=+搜索+")))
      .toEqual({ category: "platform", status: "in_progress", mine: true, sort: "popular", page: 2, q: "搜索" });
    expect(readSuggestionQuery(new URLSearchParams("mine=0&q=+"))).toEqual({ mine: false, sort: "latest", page: 1 });
  });

  it.each(["page=0", "page=1001", "page=1.5", "page=1e2", "mine=maybe", "sort=bad", "category=bad",
    "status=bad", "page=1&page=2", "extra=true", `q=${"x".repeat(101)}`, "q=line%0Abreak"]) (
    "rejects malformed query %s", (query) => {
      expect(() => readSuggestionQuery(new URLSearchParams(query))).toThrow(AppError);
    },
  );
});
