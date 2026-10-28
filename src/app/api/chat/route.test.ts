import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  employee: vi.fn(), limit: vi.fn(), mutation: vi.fn(), upsertSession: vi.fn(), upsertMessage: vi.fn(), addRetrievalTrace: vi.fn(), run: vi.fn(), verify: vi.fn(), resolve: vi.fn(), get: vi.fn(), search: vi.fn(),
}));
vi.mock("@/lib/hermit/dsh-runtime", () => ({ runDshTurn: mocks.run, verifyDshInstallation: mocks.verify }));
vi.mock("@/lib/hermit/attachments", () => ({ resolveHermitAttachments: mocks.resolve }));
vi.mock("@/modules/knowledge-hub/runtime", () => ({ isKnowledgeHubEnabled: () => mocks.enabled, getSiteKnowledgeHub: () => ({ get: mocks.get, search: mocks.search }) }));
vi.mock("@/modules/hermit", async () => {
  const { createHermitChatService } = await import("@/modules/hermit/service");
  return { createHermitChatService, hermitChatRepository: { upsertSession: mocks.upsertSession, upsertMessage: mocks.upsertMessage, addRetrievalTrace: mocks.addRetrievalTrace } };
});
vi.mock("@/modules/auth/access", () => ({ requireSiteVisitor: mocks.employee, enforceGuestRequestLimit: mocks.limit, assertWebMutation: mocks.mutation,
  authErrorResponse: (error: {status?: number}) => Response.json({ error: "access rejected" }, { status: error.status ?? 503 }) }));
import { AppError } from "@/shared/errors";
const principal = { userId: "employee-a", account: "a", displayName: "Employee A", grantId: "grant-a", credentialId: "web-a", channel: "web", capabilities: ["hermit:chat", "hermit:attachment:self"], expiresAt: Date.now() + 3600000 };
import { POST } from "./route";

const question = { id: "u1", role: "user", parts: [{ type: "text", text: "客户一直追问交车时间怎么办？" }] };
const request = (body: unknown) => new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) });
const skill = { resourceId: "method", versionId: "method-v1", title: "服务分析方法", source: "灯塔" };
const skillResource = () => ({ id: skill.resourceId, type: "skill", title: skill.title, source: skill.source, summary: "方法说明", tags: [], visibility: "public", archived: false, validity: "effective",
  version: { id: skill.versionId, number: 1, publishedAt: "2026-10-27T00:00:00Z", markdown: "# SKILL_METHOD_BODY", citations: [],
    files: [{ path: "SKILL.md", mediaType: "text/markdown", contentBase64: Buffer.from("# SKILL_METHOD_BODY").toString("base64"), checksum: "skill" }] } });
describe("DSH chat transport boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.employee.mockResolvedValue(principal); mocks.mutation.mockImplementation(() => {}); mocks.upsertSession.mockResolvedValue(undefined);
    vi.stubEnv("HERMIT_RUNTIME", "dsh"); vi.stubEnv("DATABASE_URL", "test-audit-enabled");
    mocks.upsertMessage.mockImplementation(async input => ({ id: "stored-" + input.externalMessageId, ...input }));
    mocks.verify.mockResolvedValue({}); mocks.resolve.mockResolvedValue([]);
    mocks.get.mockResolvedValue({ id: "guide", type: "document", title: "服务指引", summary: "沟通方法", tags: [], visibility: "internal", source: "灯塔", validity: "effective", version: { id: "v1", number: 1, publishedAt: "2026-10-12T00:00:00Z", markdown: "保持透明沟通", citations: [], files: [] } });
    mocks.search.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 20 });
    mocks.run.mockImplementation(async ({ onText, tools }) => {
      await tools.knowledge_read.execute({ resourceId: "guide", versionId: "v1" });
      onText("先确认事实，再说明下一次反馈时间。");
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); mocks.enabled = true; });
  it("binds each attempt to the persisted latest user rather than client retry or source metadata", async () => {
    mocks.run.mockImplementation(async ({ onText }) => onText("Answer"));
    const body = { id: "retry-session", messages: [{ ...question, metadata: { hermitTurn: { userMessageId: "foreign", startedAt: Number.MAX_SAFE_INTEGER } } }],
      retryOf: "foreign-answer", hermitTurn: { userMessageId: "foreign" } };
    await (await POST(request(body))).text();
    await (await POST(request(body))).text();
    const attempts = mocks.upsertMessage.mock.calls.map(call => call[0]).filter(message => message.role === "assistant");
    expect(attempts).toHaveLength(2);
    expect(attempts[0].externalMessageId).not.toBe(attempts[1].externalMessageId);
    for (const attempt of attempts) expect(attempt.metadata.hermitTurn).toMatchObject({ userMessageId: "stored-u1", startedAt: expect.any(Number) });
    expect(attempts[1].metadata.hermitTurn.startedAt).toBeGreaterThan(attempts[0].metadata.hermitTurn.startedAt);
    expect(mocks.upsertMessage.mock.calls.find(call => call[0].role === "user")?.[0].metadata).not.toHaveProperty("hermitTurn");
  });
  it.each([401, 503])("rejects authentication %s before body, storage, attachments or model work", async status => {
    mocks.employee.mockRejectedValue(new AppError("unauthorized", "access rejected", status));
    const req = request({ messages: [question] });
    const getReader = vi.spyOn(req.body!, "getReader");
    expect((await POST(req)).status).toBe(status);
    expect(getReader).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.upsertSession).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("rejects expired, tool-channel, and missing chat capability principals before work", async () => {
    for (const invalid of [{ ...principal, expiresAt: 1 }, { ...principal, channel: "cli" }, { ...principal, capabilities: ["knowledge:read"] }]) {
      mocks.employee.mockResolvedValue(invalid);
      expect([401, 403]).toContain((await POST(request({ messages: [question] }))).status);
    }
    expect(mocks.upsertSession).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("persists guest owner through the real service and counts one chat request across all rechecks", async () => {
    const guest = { ...principal, kind: "guest", userId: "guest:a" };
    mocks.employee.mockResolvedValue(guest);
    const response = await POST(request({ id: "guest-session", messages: [question] }));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('"type":"error"');
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(guest, "chat");
    expect(mocks.employee.mock.calls.length).toBeGreaterThan(3);
    for (const call of mocks.upsertSession.mock.calls) expect(call[0]).toMatchObject({ userId: null, guestId: "guest:a" });
    for (const call of mocks.upsertMessage.mock.calls) expect(call[0]).toMatchObject({ userId: null, guestId: "guest:a" });
    expect(mocks.addRetrievalTrace).toHaveBeenCalledWith(expect.objectContaining({ userId: null, guestId: "guest:a" }));
  });
  it("rechecks guest CSRF and revocation before every model continuation", async () => {
    mocks.employee.mockResolvedValue({ ...principal, kind: "guest", userId: "guest:a" });
    mocks.run.mockImplementation(async ({ assertAccess, onText }) => {
      await assertAccess(); onText("Allowed");
      mocks.mutation.mockImplementation(() => { throw new AppError("forbidden", "CSRF changed", 403); });
      await assertAccess(); onText("Must not appear");
    });
    const stream = await (await POST(request({ messages: [question] }))).text();
    expect(stream).toContain("Allowed"); expect(stream).not.toContain("Must not appear");
    expect(stream).toContain('"type":"error"'); expect(mocks.limit).toHaveBeenCalledTimes(1);
  });
  it("rejects guest rate limit before reading body or doing AI work", async () => {
    mocks.limit.mockRejectedValueOnce(new AppError("forbidden", "rate limit", 429));
    const req = request({ messages: [question] });
    const reader = vi.spyOn(req.body!, "getReader");
    expect((await POST(req)).status).toBe(429);
    expect(reader).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each(["guest-b", "employee"])("stops a guest request when identity changes to %s before model start", async kind => {
    const guest = { ...principal, kind: "guest", userId: "guest:a" };
    mocks.employee.mockResolvedValueOnce(guest).mockResolvedValue({ ...guest, kind: kind === "employee" ? "employee" : "guest", userId: kind === "employee" ? guest.userId : "guest:b" });
    expect((await POST(request({ messages: [question] }))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.upsertMessage).not.toHaveBeenCalled();
  });
  it("rejects a foreign session before attachment, knowledge or runtime work", async () => {
    mocks.upsertSession.mockRejectedValue(new AppError("forbidden", "foreign session", 403));
    expect((await POST(request({ id: "foreign", messages: [question], attachmentIds: ["file"], documentContext: { resourceId: "guide", versionId: "v1" } }))).status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("rechecks revocation before model start and each tool call", async () => {
    mocks.run.mockImplementation(async ({ tools }) => {
      mocks.employee.mockRejectedValue(new AppError("unauthorized", "revoked", 401));
      await tools.knowledge_read.execute({ resourceId: "guide", versionId: "v1" });
    });
    const stream = await (await POST(request({ messages: [question] }))).text();
    expect(stream).toContain('"type":"error"'); expect(mocks.get).not.toHaveBeenCalled();
  });
  it("interrupts a quiet model request within the revocation polling bound and clears its timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      mocks.run.mockImplementation(async ({ signal }) => {
        mocks.employee.mockRejectedValue(new AppError("unauthorized", "revoked", 401));
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("revoked")), { once: true }));
      });
      const response = await POST(request({ messages: [question] }));
      const consuming = response.text();
      await vi.advanceTimersByTimeAsync(5000);
      expect(await consuming).toContain('"type":"error"');
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("passes the trusted access check to DSH for model continuations", async () => {
    mocks.run.mockImplementation(async ({ assertAccess, onText }) => {
      await assertAccess(); onText("Allowed");
      mocks.employee.mockRejectedValue(new AppError("unauthorized", "revoked", 401));
      await assertAccess(); onText("Must not appear");
    });
    const stream = await (await POST(request({ messages: [question] }))).text();
    expect(stream).toContain("Allowed"); expect(stream).not.toContain("Must not appear");
    expect(stream).toContain('"type":"error"');
  });
  it("rejects a missing CSRF credential before parsing the request", async () => {
    mocks.mutation.mockImplementation(() => { throw new AppError("forbidden", "CSRF", 403); });
    expect((await POST(request("invalid body"))).status).toBe(403);
    expect(mocks.upsertSession).not.toHaveBeenCalled();
  });
  it("persists actual reads with empty context through the real service without displaying cards", async () => {
    const response = await POST(request({ messages: [question] }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    const stream = await response.text();
    expect(stream).toContain('"type":"text-delta"');
    expect(stream).not.toContain('"type":"data-document"');
    expect(stream).toContain('"citations":[],"recommendations":[]');
    expect(mocks.addRetrievalTrace).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ contextText: "", topK: 1, sourceSnapshot: expect.objectContaining({ status: "complete", reads: [expect.objectContaining({ resourceId: "guide", versionId: "v1", startLine: 1, endLine: 1 })], citations: [], recommendations: [] }) }));
    expect(stream).toContain('"type":"finish"');
  });
  it("only finalizes consumed citations and explicit recommendations after success", async () => {
    mocks.run.mockImplementation(async ({ onText, tools }) => {
      await tools.knowledge_read.execute({ resourceId: "guide", versionId: "v1" });
      const citation = await tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 1, endLine: 1 });
      await tools.knowledge_recommend.execute({ resourceId: "guide", versionId: "v1", reason: "进一步了解透明沟通的方法。" });
      onText("保持透明沟通。"); onText(citation.marker);
    });
    const stream = await (await POST(request({ messages: [question] }))).text();
    expect(stream).not.toContain('[[cite:');
    expect(stream).toContain('[1](#hermit-citation-1)');
    expect(stream).toContain('进一步了解透明沟通的方法。');
    expect(stream.indexOf('"type":"data-answer-sources"')).toBeGreaterThan(stream.indexOf('"type":"text-delta"'));
    expect(mocks.addRetrievalTrace.mock.calls[0][0].sourceSnapshot).toMatchObject({ status: "complete", citations: [{ resourceId: "guide" }], recommendations: [{ resourceId: "guide" }] });
  });
  it.each(["failed", "cancelled"])("keeps reads but no recommendations when generation is %s", async status => {
    const controller = new AbortController();
    mocks.run.mockImplementation(async ({ tools }) => {
      await tools.knowledge_read.execute({ resourceId: "guide", versionId: "v1" });
      await tools.knowledge_recommend.execute({ resourceId: "guide", versionId: "v1", reason: "拓展阅读" });
      if (status === "cancelled") controller.abort();
      throw new Error("test incomplete");
    });
    const req = new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: [question] }), signal: controller.signal });
    const stream = await (await POST(req)).text();
    expect(stream).not.toContain('"type":"data-answer-sources"');
    expect(mocks.addRetrievalTrace).toHaveBeenCalledOnce();
    expect(mocks.addRetrievalTrace.mock.calls[0][0].sourceSnapshot).toMatchObject({ status, reads: [{ resourceId: "guide" }], citations: [], recommendations: [] });
    expect(mocks.upsertMessage.mock.calls.at(-1)?.[0]).toMatchObject({ role: "assistant", content: "", metadata: { status } });
  });
  it("rejects client system messages and inaccessible attachments before runtime execution", async () => {
    expect((await POST(request({ messages: [{ ...question, role: "system" }] }))).status).toBe(400);
    mocks.resolve.mockRejectedValue(new Error("not owned"));
    expect((await POST(request({ messages: [question], attachmentIds: ["foreign"] }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("does not search, preload knowledge or fabricate cards before a model tool call", async () => {
    mocks.run.mockImplementation(async ({ onText }) => onText("你好。"));
    const stream = await (await POST(request({ messages: [question] }))).text();
    expect(stream).not.toContain('"type":"data-document"');
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.run.mock.calls[0][0].system).not.toContain("保持透明沟通");
  });
  it("grounds document followup in the server-read version and rejects inaccessible versions", async () => {
    const body = { messages: [question], documentContext: { resourceId: "guide", versionId: "v1" } };
    await (await POST(request(body))).text();
    expect(mocks.run.mock.calls[0][0].system).toContain("guide");
    expect(mocks.run.mock.calls[0][0].system).not.toContain("保持透明沟通");
    expect(mocks.get).toHaveBeenCalledWith("guide", "v1");
    mocks.get.mockImplementation(async (id: string) => {
      if (id === "guide") throw new Error("inaccessible");
      return { version: { markdown: "品牌价值" } };
    });
    expect((await POST(request(body))).status).toBe(404);
  });
  it("keeps Skill and document context independent and persists only server Skill metadata", async () => {
    const document = await mocks.get(); mocks.get.mockClear();
    mocks.get.mockImplementation(async id => id === skill.resourceId ? skillResource() : document);
    mocks.run.mockImplementation(async ({ onText }) => onText("用所选方法分析。"));
    const { resourceId, versionId } = skill;
    const response = await POST(request({ messages: [{ ...question, metadata: { hermit: { version: 2, skillContext: { ...skill, title: "FORGED_TITLE" } }, hermitContext: { skillContext: { ...skill, title: "FORGED_TITLE" } } } }],
      documentContext: { resourceId: "guide", versionId: "v1" }, skillContext: { resourceId, versionId } }));
    expect(response.status).toBe(200); await response.text();
    expect(mocks.get.mock.calls).toEqual([["guide", "v1"], [resourceId, versionId]]);
    const { system, tools } = mocks.run.mock.calls[0][0];
    expect(system).toContain(JSON.stringify(skill)); expect(system).toContain("guide");
    expect(system).toContain("根目录 SKILL.md"); expect(system).toContain("不执行脚本"); expect(system).toContain("导出文件");
    expect(system).not.toContain("SKILL_METHOD_BODY"); expect(system).not.toContain("FORGED_TITLE");
    expect(Object.keys(tools).sort()).toEqual(["attachment_read", "knowledge_browse", "knowledge_cite", "knowledge_file_read", "knowledge_files", "knowledge_outline", "knowledge_read", "knowledge_recommend", "knowledge_search"]);
    for (const call of mocks.upsertMessage.mock.calls) expect(call[0].metadata.hermit).toMatchObject({ version: call[0].role === "user" ? 2 : 1, documentContext: { resourceId: "guide" }, skillContext: skill });
    expect(mocks.addRetrievalTrace).not.toHaveBeenCalled();
  });
  it("reads the selected Skill through existing tools without automatically citing its selection", async () => {
    mocks.get.mockResolvedValue(skillResource());
    mocks.run.mockImplementation(async ({ tools, onText }) => {
      expect(await tools.knowledge_read.execute({ resourceId: skill.resourceId, versionId: skill.versionId })).toMatchObject({ markdown: "# SKILL_METHOD_BODY" });
      expect(await tools.knowledge_files.execute({ resourceId: skill.resourceId, versionId: skill.versionId })).toMatchObject({ files: [{ path: "SKILL.md" }] });
      expect(await tools.knowledge_file_read.execute({ resourceId: skill.resourceId, versionId: skill.versionId, path: "SKILL.md" })).toMatchObject({ text: "# SKILL_METHOD_BODY" });
      onText("根据已读取的方法分析。" );
    });
    const stream = await (await POST(request({ messages: [question], skillContext: { resourceId: skill.resourceId, versionId: skill.versionId } }))).text();
    expect(stream).not.toContain('"type":"error"'); expect(stream).toContain('"citations":[],"recommendations":[]');
    expect(mocks.addRetrievalTrace.mock.calls[0][0].sourceSnapshot.reads).toEqual(expect.arrayContaining([expect.objectContaining({ resourceId: skill.resourceId, versionId: skill.versionId, path: "SKILL.md" })]));
  });
  it.each([[], [skill], null, { resourceId: "../method", versionId: "v1" }, { resourceId: "method" }, { resourceId: "method", versionId: "v1", title: "forged" }])("rejects malformed or multiple Skill context %j before knowledge or model work", async skillContext => {
    expect((await POST(request({ messages: [question], skillContext }))).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.upsertMessage).not.toHaveBeenCalled();
  });
  it.each(["document", "tool"])("rejects a %s selected as a Skill before model execution", async type => {
    mocks.get.mockResolvedValue({ ...skillResource(), type });
    expect((await POST(request({ messages: [question], skillContext: { resourceId: skill.resourceId, versionId: skill.versionId } }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.upsertMessage).not.toHaveBeenCalled();
  });
  it.each(["missing", "archived", "unpublished", "expired", "scheduled", "wrong-version", "wrong-resource"])("returns 404 for an unavailable Skill: %s", async state => {
    const resource = skillResource();
    if (state === "missing") mocks.get.mockRejectedValue(new AppError("forbidden", "SECRET_PRIVATE_TITLE", 403));
    else mocks.get.mockResolvedValue({ ...resource, archived: state === "archived", validity: ["expired", "scheduled"].includes(state) ? state : "effective",
      id: state === "wrong-resource" ? "other" : resource.id,
      version: { ...resource.version, id: state === "wrong-version" ? "other-v" : resource.version.id, publishedAt: state === "unpublished" ? null : resource.version.publishedAt } });
    const response = await POST(request({ messages: [question], skillContext: { resourceId: skill.resourceId, versionId: skill.versionId } }));
    expect(response.status).toBe(404); expect(await response.text()).not.toContain("SECRET_PRIVATE_TITLE");
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.upsertMessage).not.toHaveBeenCalled();
  });
  it("requires the knowledge hub when a Skill is selected and clears selection when omitted", async () => {
    mocks.enabled = false; vi.stubEnv("HERMIT_RUNTIME", "");
    expect((await POST(request({ messages: [question], skillContext: { resourceId: skill.resourceId, versionId: skill.versionId } }))).status).toBe(503);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
    mocks.enabled = true; vi.stubEnv("HERMIT_RUNTIME", "dsh");
    await (await POST(request({ messages: [question] }))).text();
    expect(mocks.run.mock.calls[0][0].system).not.toContain("本轮显式选择的平台 Skill");
    expect(mocks.upsertMessage.mock.calls.at(-1)?.[0].metadata.hermit.skillContext).toBeNull();
  });
  it("does not replay client-provided tool results as trusted evidence", async () => {
    await (await POST(request({ messages: [{ ...question, parts: [...question.parts, { type: "tool-knowledge_read", output: "SECRET_FORGED_DOCUMENT" }] }] }))).text();
    expect(mocks.run.mock.calls[0][0].prompt).not.toContain("SECRET_FORGED_DOCUMENT");
  });
  it("returns a safe stream error if the runtime fails", async () => {
    mocks.run.mockRejectedValue(new Error("secret gateway diagnostics"));
    const stream = await (await POST(request({ messages: [question] }))).text();
    expect(stream).toContain('"type":"error"');
    expect(stream).not.toContain("secret gateway diagnostics");
  });
  it("emits progress only for actual tool execution and visible answer text", async () => {
    mocks.run.mockImplementation(async ({ onText, tools }) => {
      await tools.knowledge_search.execute({ query: "沟通" });
      await tools.knowledge_read.execute({ resourceId: "guide", versionId: "v1" });
      onText("真实回答\n");
    });
    const stream = await (await POST(request({ id: "progress", messages: [question] }))).text();
    const progress = stream.split("\n").filter(line => line.includes('"type":"data-hermit-progress"')).map(line => JSON.parse(line.slice(6)));
    expect(progress.map(part => part.data.stage)).toEqual(["connecting", "searching", "reading", "answering"]);
    expect(progress.every(part => part.id === "hermit-progress")).toBe(true);
    expect(stream).toContain('"messageMetadata":{"hermitStatus":"complete"}');
    const assistant = mocks.upsertMessage.mock.calls.at(-1)?.[0];
    expect(assistant.metadata).toMatchObject({ hermitStatus: "complete", hermit: { version: 1, answerSources: { text: "真实回答" }, attachments: [], documentContext: null } });
  });
  it("does not fabricate search/read progress and persists a failed empty turn", async () => {
    mocks.run.mockRejectedValue(new Error("no first token"));
    const stream = await (await POST(request({ messages: [question] }))).text();
    expect(stream).toContain('"stage":"connecting"');
    expect(stream).not.toContain('"stage":"searching"'); expect(stream).not.toContain('"stage":"reading"'); expect(stream).not.toContain('"stage":"answering"');
    expect(mocks.upsertMessage.mock.calls.at(-1)?.[0]).toMatchObject({ role: "assistant", content: "", metadata: { hermitStatus: "failed" } });
  });
});


describe("ordinary chat progressive tool loop", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("searches metadata then reads a version before answering, without embeddings", async () => {
    vi.clearAllMocks();
    mocks.employee.mockResolvedValue(principal); mocks.mutation.mockImplementation(() => {}); mocks.upsertSession.mockResolvedValue(undefined);
    vi.stubEnv("HERMIT_RUNTIME", ""); vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OPENAI_API_KEY", "local-test-only"); vi.stubEnv("OPENAI_API_MODE", "chat");
    vi.stubEnv("OPENAI_EXTRA_HEADERS", "");
    vi.stubEnv("EMBEDDING_BASE_URL", "http://127.0.0.1:1/must-not-be-used");
    mocks.employee.mockResolvedValue(principal); mocks.mutation.mockImplementation(() => {}); mocks.upsertSession.mockResolvedValue(undefined);
    mocks.resolve.mockResolvedValue([]);
    mocks.get.mockResolvedValue({ id: "guide", type: "document", title: "服务指引", summary: "沟通方法", tags: [], visibility: "internal", source: "灯塔", validity: "effective", version: { id: "v1", number: 1, publishedAt: "2026-10-12T00:00:00Z", markdown: "独有正文：保持透明沟通", citations: [], files: [] } });
    mocks.search.mockResolvedValue({ items: [{ id: "guide", type: "document", title: "服务指引", summary: "沟通方法", source: "灯塔", tags: [], visibility: "internal", versionId: "v1", version: 1, validity: "effective", excerpt: "不应预先披露的正文" }], total: 1, offset: 0, limit: 20 });
    const calls: Array<{ url: string; body: string }> = [];
    const gateway = createServer(async (req, res) => {
      let body = ""; for await (const chunk of req) body += chunk;
      calls.push({ url: req.url ?? "", body });
      const index = calls.length;
      const functionCall = [
        { name: "knowledge_search", arguments: '{"query":"沟通"}' },
        { name: "knowledge_read", arguments: '{"resourceId":"guide","versionId":"v1"}' },
        { name: "knowledge_cite", arguments: '{"resourceId":"guide","versionId":"v1","startLine":1,"endLine":1}' },
        { name: "knowledge_recommend", arguments: '{"resourceId":"guide","versionId":"v1","reason":"了解沟通依据"}' },
      ][index - 1];
      const delta = index <= 4 ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${index}`, type: "function", function: functionCall }] } : { role: "assistant", content: "依据服务指引，保持透明沟通。[[cite:1]]" };
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const choice of [{ index: 0, delta, finish_reason: null }, { index: 0, delta: {}, finish_reason: index <= 4 ? "tool_calls" : "stop" }]) {
        res.write(`data: ${JSON.stringify({ id: "local", object: "chat.completion.chunk", created: 1, model: "test", choices: [choice] })}\n\n`);
      }
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>(resolve => gateway.listen(0, "127.0.0.1", resolve));
    const address = gateway.address(); if (!address || typeof address === "string") throw new Error("missing gateway");
    vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${address.port}/v1`);
    try {
      const response = await POST(request({ messages: [question] }));
      const stream = await response.text();
      expect(stream).not.toContain('"type":"error"');
      expect(stream).toContain("依据服务指引");
      expect(stream).not.toContain('"type":"data-document"');
      expect(calls).toHaveLength(5);
      expect(stream).toContain("[1](#hermit-citation-1)");
      expect(stream).toContain("了解沟通依据");
      expect(calls.every(call => call.url === "/v1/chat/completions")).toBe(true);
      expect(calls[0].body).not.toContain("独有正文");
      expect(calls[1].body).not.toContain("不应预先披露");
      expect(calls[2].body).toContain("独有正文");
      expect(mocks.get).toHaveBeenCalledWith("guide", "v1");
      expect(mocks.run).not.toHaveBeenCalled();
    } finally { gateway.closeAllConnections(); await new Promise<void>(resolve => gateway.close(() => resolve())); }
  }, 20000);
});
