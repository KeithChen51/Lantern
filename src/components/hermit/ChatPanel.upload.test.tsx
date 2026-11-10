import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  session: { kind: "guest", user: { id: "guest:a" } },
  fetch: vi.fn(),
}));
// Exercise ChatPanel's real upload handlers without adding a browser/DOM test
// dependency. Hook state is irrelevant to the queued asynchronous control flow.
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [typeof value === "function" ? value() : value, vi.fn()],
  useMemo: (factory: () => unknown) => factory(),
  useEffect: vi.fn(),
  useLayoutEffect: (setup: () => (() => void) | void) => { const cleanup = setup(); if (cleanup) harness.cleanups.push(cleanup); },
}));
vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ messages: [], status: "ready", sendMessage: vi.fn(), regenerate: vi.fn(), stop: vi.fn(), clearError: vi.fn() }) }));
vi.mock("@/components/auth/SessionContext", () => ({ useEmployeeSession: () => harness.session }));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: harness.fetch }));
vi.mock("@/hooks/use-lighthouse-motion", () => ({ useLhReducedMotion: () => false }));
import { useHermitAttachments } from "./useHermitAttachments";

function SelectTwoFiles() {
  const handlers = useHermitAttachments("guest:a");
  handlers.handleFilesSelected([new File(["private A"], "first.txt"), new File(["private B"], "second.txt")] as unknown as FileList);
  return { onRetryAttachment: handlers.handleRetryAttachment };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
beforeEach(() => { vi.clearAllMocks(); harness.cleanups = []; harness.session = { kind: "guest", user: { id: "guest:a" } }; });
afterEach(() => { for (const cleanup of harness.cleanups) cleanup(); });

describe("ChatPanel attachment batch lifecycle", () => {
  it.each([true, false])("aborts the pending upload and never posts the second file after identity remount (fetch honors abort: %s)", async honorsAbort => {
    let completeFirst!: (response: Response) => void;
    let firstSignal!: AbortSignal;
    harness.fetch.mockImplementation((_url: string, init: RequestInit) => {
      firstSignal = init.signal!;
      return new Promise<Response>((resolve, reject) => {
        completeFirst = resolve;
        if (honorsAbort) firstSignal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    });
    const handlers = SelectTwoFiles();
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledTimes(1));
    handlers.onRetryAttachment({ localId: "queued-retry", name: "retry.txt", size: 5, status: "error", file: new File(["retry"], "retry.txt") });
    const firstInit = harness.fetch.mock.calls[0][1] as RequestInit;
    expect(firstInit.method).toBe("POST");
    expect(((firstInit.body as FormData).get("file") as File).name).toBe("first.txt");
    expect(firstSignal.aborted).toBe(false);
    // SessionProvider replaces the keyed subtree while file one is pending.
    // Old authFetch would now see B, making any second POST an ownership leak.
    harness.session = { kind: "guest", user: { id: "guest:b" } };
    for (const cleanup of harness.cleanups) cleanup();
    expect(firstSignal.aborted).toBe(true);
    if (!honorsAbort) completeFirst(Response.json({ id: "late-a", status: "ready" }));
    await flush();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps normal two-file uploads sequential and aborts the active file's own signal on unmount", async () => {
    let completeFirst!: (response: Response) => void;
    let completeSecond!: (response: Response) => void;
    harness.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { completeFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { completeSecond = resolve; }));
    SelectTwoFiles();
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledTimes(1));
    await flush(); expect(harness.fetch).toHaveBeenCalledTimes(1);
    completeFirst(Response.json({ id: "first", status: "ready" }));
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledTimes(2));
    const requests = harness.fetch.mock.calls.map(([, init]) => init as RequestInit);
    expect(requests.map(init => ((init.body as FormData).get("file") as File).name)).toEqual(["first.txt", "second.txt"]);
    expect(requests[0].signal).not.toBe(requests[1].signal);
    expect(requests[0].signal?.aborted).toBe(false);
    for (const cleanup of harness.cleanups) cleanup();
    expect(requests[1].signal?.aborted).toBe(true);
    completeSecond(Response.json({ id: "second", status: "ready" }));
    await flush();
  });
});
