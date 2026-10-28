import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ slot: 0, refSlot: 0, states: [] as unknown[], refs: [] as Array<{ current: unknown }>, fetch: vi.fn(), push: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const slot = harness.slot++;
    if (!(slot in harness.states)) harness.states[slot] = typeof initial === "function" ? initial() : initial;
    return [harness.states[slot], (next: unknown) => { harness.states[slot] = typeof next === "function" ? next(harness.states[slot]) : next; }];
  },
  useRef: (initial: unknown) => { const slot = harness.refSlot++; return harness.refs[slot] ??= { current: initial }; },
  useMemo: (factory: () => unknown) => factory(), useCallback: (callback: unknown) => callback, useEffect: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: harness.push }) }));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: (...args: unknown[]) => harness.fetch(...args) }));
vi.mock("@/components/knowledge/ResourceView", () => ({ resourceLabels: { case: "参悟案例", document: "知识文档", notice: "通知", skill: "技能", tool: "工具" } }));
import { AdminKnowledgeManager } from "./AdminKnowledgeManager";
import { LhButton, LhIconButton } from "@/components/ui/lighthouse-primitives";

function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(child => find(child, type));
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [...(element.type === type ? [element as ReactElement<Record<string, unknown>>] : []), ...find(element.props.children, type)];
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node ? text((node as ReactElement<{ children?: ReactNode }>).props.children) : "";
}
function render() { harness.slot = 0; harness.refSlot = 0; return AdminKnowledgeManager(); }
function button(label: string) {
  const found = find(render(), LhButton).find(element => text(element.props.children as ReactNode) === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found.props.onClick as () => Promise<void> | void;
}
function pick(file: File) {
  const input = find(render(), "input").find(element => element.props.type === "file");
  (input?.props.onChange as (event: unknown) => void)({ target: { files: [file] }, currentTarget: { value: "" } });
}
function closePreview() { (find(render(), "button").find(element => element.props["aria-label"] === "关闭")?.props.onClick as () => void)(); }
function preview(index = 0) { (find(render(), LhIconButton).filter(element => element.props.label === "预览资源")[index].props.onClick as (event: unknown) => void)({ stopPropagation() {} }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
const resource = (id: string) => ({ id, name: `${id}.md`, title: id, folderId: null, type: "case", visibility: "internal", archived: false, publishedVersionId: null, latestVersionId: `${id}-v1`, updatedAt: "2026-10-28" });
const listing = { folders: [{ id: "folder-b", name: "目录 B", parentId: null, deleted: false }], resources: [resource("a"), resource("b")], protectedIds: [] };
const previewData = (id: string) => ({ ...resource(id), version: { id: `${id}-v1`, number: 1, title: id, markdown: `# ${id}`, files: [], publishedAt: null } });
beforeEach(() => {
  vi.clearAllMocks(); harness.slot = 0; harness.refSlot = 0; harness.states = [listing, false]; harness.refs = [];
  harness.fetch.mockImplementation(async (url: string) => Response.json(url === "/api/admin/knowledge" ? listing : {}));
});
afterEach(() => vi.unstubAllGlobals());

describe("knowledge manager async interaction handlers", () => {
  it("returns to knowledge resources and confirms only when an upload remains", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    button("返回知识资源")();
    expect(harness.push).toHaveBeenCalledExactlyOnceWith("/search");
    expect(confirm).not.toHaveBeenCalled();
    harness.push.mockClear();
    pick(new File(["A"], "A.md"));
    button("返回知识资源")();
    expect(confirm).toHaveBeenCalledOnce(); expect(harness.push).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); button("返回知识资源")();
    expect(harness.push).toHaveBeenCalledExactlyOnceWith("/search");
  });
  it("keeps a loading preview closed when its request eventually finishes", async () => {
    const pending = deferred<Response>();
    harness.fetch.mockReturnValue(pending.promise);
    preview(); closePreview();
    pending.resolve(Response.json(previewData("a"))); await flush();
    expect(find(render(), "div").some(element => element.props.role === "dialog")).toBe(false);
  });
  it("does not reopen a closed preview or allow an older request to replace the next one", async () => {
    const a = deferred<Response>(), b = deferred<Response>();
    harness.fetch.mockImplementation((url: string) => url.includes("/a?") ? a.promise : b.promise);
    preview(); closePreview(); preview(1);
    b.resolve(Response.json(previewData("b"))); await flush();
    a.resolve(Response.json(previewData("a"))); await flush();
    expect(text(find(render(), "h2").find(element => element.props.id === "knowledge-preview-title")?.props.children as ReactNode)).toBe("b");
    closePreview();
    expect(find(render(), "div").some(element => element.props.role === "dialog")).toBe(false);
  });
  it("does not reopen a preview closed during publication", async () => {
    const publication = deferred<Response>();
    harness.fetch.mockImplementation(async (url: string, init?: RequestInit) => init?.method === "POST" ? publication.promise : Response.json(url === "/api/admin/knowledge" ? listing : previewData("a")));
    preview(); await flush(); button("手动发布")(); closePreview();
    publication.resolve(Response.json({})); await flush();
    expect(find(render(), "div").some(element => element.props.role === "dialog")).toBe(false);
    expect(harness.fetch.mock.calls.filter(([url]) => String(url).includes("/a?"))).toHaveLength(1);
  });
  it("keeps a later selection, including the same path, after the submitted upload succeeds", async () => {
    const upload = deferred<Response>();
    harness.fetch.mockImplementation((url: string) => url.endsWith("/upload") ? upload.promise : Promise.resolve(Response.json(listing)));
    pick(new File(["old"], "A.md")); const submit = button("上传并生成草稿"); submit(); submit();
    pick(new File(["new"], "A.md")); pick(new File(["B"], "B.md"));
    upload.resolve(Response.json({ results: [{ name: "A.md", resourceId: "a" }] })); await flush();
    expect(text(render())).toContain("待导入 2 项");
    const calls = harness.fetch.mock.calls.filter(([url]) => String(url).endsWith("/upload"));
    expect(calls).toHaveLength(1);
    const next = deferred<Response>(); harness.fetch.mockImplementation((url: string) => url.endsWith("/upload") ? next.promise : Promise.resolve(Response.json(listing)));
    button("上传并生成草稿")();
    const files = (harness.fetch.mock.calls.at(-1)?.[1].body as FormData).getAll("files") as File[];
    expect(files.map(file => file.name)).toEqual(["A.md", "B.md"]);
    expect(await files[0].text()).toBe("new");
    next.resolve(Response.json({ results: [{ name: "A.md" }, { name: "B.md" }] })); await flush();
  });
  it("retries only the failed batch at its original target, leaving new files for the next upload", async () => {
    const first = deferred<Response>();
    harness.fetch.mockImplementation((url: string) => url.endsWith("/upload") ? first.promise : Promise.resolve(Response.json(listing)));
    pick(new File(["A"], "A.md")); button("上传并生成草稿")(); pick(new File(["B"], "B.md"));
    (find(render(), "button").find(element => text(element.props.children as ReactNode).startsWith("目录 B"))?.props.onClick as () => void)();
    (find(render(), "select").find(element => element.props.value === "document")?.props.onChange as (event: unknown) => void)({ target: { value: "case" } });
    first.resolve(Response.json({ results: [{ name: "A.md", code: "conflict", error: "同名" }] })); await flush();
    expect(text(render())).toContain("待导入 2 项");
    const retry = deferred<Response>(); harness.fetch.mockImplementation((url: string) => url.endsWith("/upload") ? retry.promise : Promise.resolve(Response.json(listing)));
    button("覆盖")();
    const form = harness.fetch.mock.calls.at(-1)?.[1].body as FormData;
    expect(form.get("folderId")).toBe(""); expect(form.get("type")).toBe("document");
    expect((form.getAll("files") as File[]).map(file => file.name)).toEqual(["A.md"]);
    retry.resolve(Response.json({ results: [{ name: "A.md" }] })); await flush();
    expect(text(render())).toContain("待导入 1 项");
    const last = deferred<Response>(); harness.fetch.mockImplementation((url: string) => url.endsWith("/upload") ? last.promise : Promise.resolve(Response.json(listing)));
    button("上传并生成草稿")();
    const lastForm = harness.fetch.mock.calls.at(-1)?.[1].body as FormData;
    expect(lastForm.get("folderId")).toBe("folder-b"); expect(lastForm.get("type")).toBe("case");
    expect((lastForm.getAll("files") as File[]).map(file => file.name)).toEqual(["B.md"]);
    last.resolve(Response.json({ results: [{ name: "B.md" }] })); await flush();
  });
});
