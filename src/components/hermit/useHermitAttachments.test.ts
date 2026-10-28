import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermitAttachment } from "./types";

const harness = vi.hoisted(() => ({
  stateSlot: 0, refSlot: 0, states: [] as unknown[], refs: [] as Array<{ current: unknown }>,
  cleanups: [] as Array<() => void>, mounted: false, fetch: vi.fn(),
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const slot = harness.stateSlot++;
    if (!(slot in harness.states)) harness.states[slot] = typeof initial === "function" ? initial() : initial;
    return [harness.states[slot], (next: unknown) => { harness.states[slot] = typeof next === "function" ? next(harness.states[slot]) : next; }];
  },
  useRef: (initial: unknown) => { const slot = harness.refSlot++; return harness.refs[slot] ??= { current: initial }; },
  useLayoutEffect: (setup: () => (() => void) | void) => { if (!harness.mounted) { const cleanup = setup(); if (cleanup) harness.cleanups.push(cleanup); } },
}));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: harness.fetch }));
import { useHermitAttachments } from "./useHermitAttachments";

function AttachmentHarness() {
  return useHermitAttachments("guest:a", undefined, "conversation-a");
}
function render() {
  harness.stateSlot = 0; harness.refSlot = 0;
  const value = AttachmentHarness();
  harness.mounted = true;
  return value;
}
function select(...names: string[]) { render().handleFilesSelected(names.map(name => new File(["text"], name)) as unknown as FileList); }
function pendingFile(name: string) { return render().attachments.find(file => file.name === name)!; }
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
beforeEach(() => { vi.clearAllMocks(); harness.stateSlot = 0; harness.refSlot = 0; harness.states = []; harness.refs = []; harness.cleanups = []; harness.mounted = false; });
afterEach(() => { for (const cleanup of harness.cleanups) cleanup(); });

describe("Hermit attachment cancellation and recovery", () => {
  it("releases a cancelled file immediately and suppresses its late failure even when transport ignores abort", async () => {
    let complete!: (response: Response) => void;
    harness.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }))
      .mockResolvedValueOnce(Response.json({ id: "new", status: "ready" }));
    select("cancelled.txt");
    await vi.waitFor(() => expect(pendingFile("cancelled.txt")).toBeDefined());
    const init = harness.fetch.mock.calls[0][1] as RequestInit;
    expect((init.body as FormData).get("conversationId")).toBe("conversation-a");
    await render().handleRemoveAttachment(pendingFile("cancelled.txt"));
    await vi.waitFor(() => expect(render().isUploadingAttachments).toBe(false));
    expect(init.signal?.aborted).toBe(true);
    expect(render().attachments).toEqual([]);
    select("new.txt");
    await vi.waitFor(() => expect(pendingFile("new.txt")?.status).toBe("ready"));
    complete(Response.json({ error: { message: "late error" } }, { status: 422 }));
    await flush();
    expect(render().uploadError).toBeNull();
    expect(render().attachments.map(file => file.name)).toEqual(["new.txt"]);
  });

  it("cleans up only the cancelled late success without removing the new upload", async () => {
    let complete!: (response: Response) => void;
    harness.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }))
      .mockResolvedValueOnce(Response.json({ id: "new", status: "ready" }))
      .mockResolvedValueOnce(Response.json({ deleted: true }));
    select("cancelled.txt");
    await vi.waitFor(() => expect(pendingFile("cancelled.txt")).toBeDefined());
    await render().handleRemoveAttachment(pendingFile("cancelled.txt"));
    await vi.waitFor(() => expect(render().isUploadingAttachments).toBe(false));
    select("new.txt");
    await vi.waitFor(() => expect(pendingFile("new.txt")?.status).toBe("ready"));
    complete(Response.json({ id: "cancelled-server-id", status: "ready" }));
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledTimes(3));
    expect(harness.fetch.mock.calls[2][1]).toMatchObject({ method: "DELETE", body: JSON.stringify({ id: "cancelled-server-id" }) });
    expect(render().attachments).toEqual([expect.objectContaining({ id: "new", status: "ready" })]);
  });

  it("does not clean up a late success after its identity scope has ended", async () => {
    let complete!: (response: Response) => void;
    harness.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }));
    select("cancelled.txt");
    await vi.waitFor(() => expect(pendingFile("cancelled.txt")).toBeDefined());
    await render().handleRemoveAttachment(pendingFile("cancelled.txt"));
    await vi.waitFor(() => expect(render().isUploadingAttachments).toBe(false));
    for (const cleanup of harness.cleanups) cleanup();
    complete(Response.json({ id: "old-identity-id", status: "ready" }));
    await flush();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });

  it("continues the rest of a batch after cancellation and stays busy until that file finishes", async () => {
    let completeSecond!: (response: Response) => void;
    harness.fetch.mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { completeSecond = resolve; }));
    select("first.txt", "second.txt");
    await vi.waitFor(() => expect(pendingFile("first.txt")).toBeDefined());
    await render().handleRemoveAttachment(pendingFile("first.txt"));
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledTimes(2));
    expect(render().isUploadingAttachments).toBe(true);
    expect(render().attachments.map(file => file.name)).toEqual(["second.txt"]);
    completeSecond(Response.json({ id: "second", status: "ready" }));
    await vi.waitFor(() => expect(render().isUploadingAttachments).toBe(false));
  });

  it("clears the failed file's global error when the file is removed", async () => {
    harness.fetch.mockResolvedValueOnce(Response.json({ error: { message: "文件无法解析。" } }, { status: 422 }));
    select("broken.txt");
    await vi.waitFor(() => expect(pendingFile("broken.txt")?.status).toBe("error"));
    expect(render().uploadError).toBe("文件无法解析。");
    await render().handleRemoveAttachment(pendingFile("broken.txt"));
    expect(render().attachments).toEqual([]);
    expect(render().uploadError).toBeNull();
  });

  it("preserves the card and a retryable removal when server cleanup fails", async () => {
    harness.fetch.mockResolvedValueOnce(Response.json({ id: "ready", status: "ready" }))
      .mockResolvedValueOnce(Response.json({ error: "busy" }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ deleted: true }));
    select("ready.txt");
    await vi.waitFor(() => expect(pendingFile("ready.txt")?.status).toBe("ready"));
    const file: HermitAttachment = pendingFile("ready.txt");
    await render().handleRemoveAttachment(file);
    expect(pendingFile("ready.txt")).toBeDefined();
    expect(render().uploadError).toContain("再次点击移除");
    await render().handleRemoveAttachment(file);
    expect(render().attachments).toEqual([]);
    expect(render().uploadError).toBeNull();
  });
});


