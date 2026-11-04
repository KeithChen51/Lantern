import { afterEach, describe, expect, it, vi } from "vitest";
import { boardRequest, captureBoardAuthorization, markBoardNotificationsRead } from "./board-client";

afterEach(() => vi.unstubAllGlobals());

describe("suggestion board HTTP boundary", () => {
  it("reads private data without browser caching", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { items: [] } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(boardRequest("/api/feedback?mine=true")).resolves.toEqual({ items: [] });
    expect(fetcher).toHaveBeenCalledWith("/api/feedback?mine=true", { cache: "no-store", credentials: "same-origin" });
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])("sends the verified CSRF token for %s mutations", async (method) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { saved: true } }));
    vi.stubGlobal("fetch", fetcher);
    const body = { content: "普通文字 <script>\n第二行" };
    await boardRequest("/api/feedback/1", { method, body, csrfToken: "employee-csrf" });
    expect(fetcher).toHaveBeenCalledWith("/api/feedback/1", expect.objectContaining({ method, headers: { "Content-Type": "application/json", "x-csrf-token": "employee-csrf" }, body: JSON.stringify(body) }));
  });

  it.each([401, 403])("provides an employee login recovery message on %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "internal auth detail" } }, { status })));
    await expect(boardRequest("/api/feedback")).rejects.toThrow("从“我的”重新登录员工账号");
  });

  it("explains the refresh workflow on an admin update conflict", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "conflict" } }, { status: 409 })));
    await expect(boardRequest("/api/feedback/1")).rejects.toThrow("核对最新状态后重新提交");
  });

  it("keeps useful validation messages and rejects invalid success payloads", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: { message: "标题超过上限" } }, { status: 400 })).mockResolvedValueOnce(Response.json({ unexpected: true })).mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(boardRequest("/api/feedback")).rejects.toThrow("标题超过上限");
    await expect(boardRequest("/api/feedback")).rejects.toThrow("无法读取返回内容");
    await expect(boardRequest("/api/feedback")).rejects.toThrow("操作未完成");
  });

  it("marks 121 loaded notifications in sequential batches of at most 50", async () => {
    const ids = Array.from({ length: 121 }, (_, index) => `notification-${index}`);
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ data: { updated: true } })));
    vi.stubGlobal("fetch", fetcher);
    const completed: string[][] = [];
    await markBoardNotificationsRead([...ids, ids[0]], "employee-csrf", "batch-employee", (batch) => completed.push(batch));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(completed.map((batch) => batch.length)).toEqual([50, 50, 21]);
    expect(completed.flat()).toEqual(ids);
    for (const [index, [, options]] of fetcher.mock.calls.entries()) expect(JSON.parse(options.body).ids).toEqual(completed[index]);
  });

  it("retains only the successful batch when the next mark-read request fails and stops", async () => {
    const ids = Array.from({ length: 121 }, (_, index) => `notification-${index}`);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: { updated: true } })).mockResolvedValueOnce(Response.json({ error: { message: "暂时无法标记" } }, { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const completed: string[][] = [];
    await expect(markBoardNotificationsRead(ids, "employee-csrf", "partial-batch-employee", (batch) => completed.push(batch))).rejects.toThrow("暂时无法标记");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(completed).toEqual([ids.slice(0, 50)]);
  });
});


it.each([401, 403])("invalidates pending write guards for the denied employee on %s", async (status) => {
  const owner = `guard-owner-${status}`;
  const pending = captureBoardAuthorization(owner);
  const otherEmployee = captureBoardAuthorization(`other-${status}`);
  expect(pending()).toBe(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "denied" } }, { status })));
  await expect(boardRequest("/api/feedback", undefined, owner)).rejects.toThrow();
  expect(pending()).toBe(false);
  expect(otherEmployee()).toBe(true);
});
