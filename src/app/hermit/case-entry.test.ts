import { beforeEach, describe, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ get: vi.fn(), enabled: true }));
vi.mock("@/modules/knowledge-hub/runtime", () => ({ getSiteKnowledgeHub: () => ({ get: runtime.get }), isKnowledgeHubEnabled: () => runtime.enabled }));
import { resolveCaseEntry } from "./case-entry";
import { caseEntryPrompt, mirrorHermitHref, MIRROR_CASE_ID, appendCaseQuestion } from "@/components/hermit/case-entry";

beforeEach(() => { vi.resetAllMocks(); runtime.enabled = true; });
describe("Mirror case intake", () => {
  it("passes editable questions but resolves citation identity from the readable current publication", async () => {
    runtime.get.mockResolvedValue({ id: MIRROR_CASE_ID, title: "云游胖东来", source: "镜鉴", version: { id: "published-v3" } });
    const query = Object.fromEntries(new URL(mirrorHermitHref("等待超期时要说明哪些事实？"), "https://lighthouse.test").searchParams);
    const entry = await resolveCaseEntry({ ...query, resourceId: "untrusted-other-resource" } as Parameters<typeof resolveCaseEntry>[0]);
    expect(entry?.prompt).toContain("等待超期时要说明哪些事实？");
    expect(entry?.document).toMatchObject({ resourceId: MIRROR_CASE_ID, versionId: "published-v3" });
    expect(runtime.get).toHaveBeenCalledExactlyOnceWith(MIRROR_CASE_ID);
  });
  it("does not claim unavailable, unpublished or forbidden documents are attached", async () => {
    runtime.get.mockRejectedValue(new Error("not_found"));
    expect(await resolveCaseEntry({ from: "mirror-pang-dong-lai" })).toMatchObject({ document: null, notice: expect.stringContaining("无法引用") });
    runtime.enabled = false; runtime.get.mockClear();
    expect((await resolveCaseEntry({ from: "mirror-pang-dong-lai" }))?.document).toBeNull();
    expect(runtime.get).not.toHaveBeenCalled();
  });
  it("ignores unknown entry points and bounds duplicate or oversized question parameters", async () => {
    expect(await resolveCaseEntry({ from: "https://example.com", question: "x" })).toBeUndefined();
    expect(await resolveCaseEntry({ from: ["mirror-pang-dong-lai"] })).toBeUndefined();
    expect(runtime.get).not.toHaveBeenCalled();
    expect(caseEntryPrompt({ from: "mirror-pang-dong-lai", question: "x".repeat(801) })).not.toContain("xxx");
    expect(caseEntryPrompt({ from: "mirror-pang-dong-lai", question: ["a", "b"] })).toContain("汽车售后门店");
  });
  it("appends explicitly accepted case questions without replacing an unsent draft", () => {
    expect(appendCaseQuestion("原现场描述", "案例问题")).toBe("原现场描述\n\n案例问题");
    expect(appendCaseQuestion("", "案例问题")).toBe("案例问题");
  });
});
