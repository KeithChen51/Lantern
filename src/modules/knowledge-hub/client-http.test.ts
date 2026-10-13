import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/shared/errors";
import { KnowledgeHub } from "./service";
import { MemoryHubStore } from "./test-store";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), employee: vi.fn(), enabled: true, hub: null as KnowledgeHub | null, storage: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireKnowledgeClient: mocks.guard, requireEmployee: mocks.employee,
  authErrorResponse: (error: { status?: number }) => Response.json({ error: "auth" }, { status: error.status ?? 503, headers: { "Cache-Control": "no-store" } }) }));
vi.mock("./runtime", () => ({ isKnowledgeHubEnabled: () => mocks.enabled, getKnowledgeHub: () => { mocks.storage(); return mocks.hub!; } }));
import { clientResourceGet, type ClientResourceOperation } from "./client-http";
import { GET as webGet } from "@/app/api/resources/[id]/route";
const context = { params: Promise.resolve({ id: "policy" }) };
const request = (query = "") => new Request(`https://example.test/api/client/v1/resources/policy${query}`, { headers: { authorization: "Bearer fixture" } });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("KNOWLEDGE_HUB_DRIVER", "sqlite"); mocks.enabled = true; mocks.hub = new KnowledgeHub(new MemoryHubStore()); mocks.guard.mockResolvedValue({ userId: "employee", credentialId: crypto.randomUUID(), channel: "cli", capabilities: ["knowledge:read"] }); mocks.employee.mockResolvedValue({ userId: "employee" }); });
async function publish() {
  const first = await mocks.hub!.import({ id: "policy", type: "document", title: "Published title", source: "Published source", summary: "Published summary", tags: ["published"], markdown: Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"), files: [{ path: "example.txt", mediaType: "text/plain", contentBase64: Buffer.from("x".repeat(15_000)).toString("base64") }] });
  await mocks.hub!.publish("policy", first.versionId); return first;
}
describe("bearer knowledge HTTP boundary", () => {
  it.each([401, 403, 503])("rejects anonymous, revoked/expired and forbidden clients before parsing/storage (%s)", async status => {
    mocks.guard.mockRejectedValue(new AppError("unauthorized", "denied", status));
    expect((await clientResourceGet(request("?limit=bad"), "search")).status).toBe(status); expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("isolates employee-cookie resource API from tool grants", async () => {
    mocks.employee.mockRejectedValue(new AppError("unauthorized", "web required", 401));
    expect((await webGet(request(), context)).status).toBe(401); expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("returns bounded published metadata and bodies without draft fields or embedded files", async () => {
    const first = await publish();
    const draft = await mocks.hub!.import({ id: "policy", type: "document", title: "DRAFT SECRET", source: "DRAFT SOURCE", summary: "DRAFT SUMMARY", tags: ["DRAFT TAG"], markdown: "DRAFT BODY", files: [{ path: "secret.txt", mediaType: "text/plain", contentBase64: "YQ==" }] });
    const metadata = await (await clientResourceGet(request(), "get", context)).json();
    expect(metadata).toMatchObject({ title: "Published title", summary: "Published summary", versionId: first.versionId });
    expect(JSON.stringify(metadata)).not.toContain("DRAFT"); expect(metadata.version).toBe(1); expect(metadata).not.toHaveProperty("markdown"); expect(metadata).not.toHaveProperty("files");
    const body = await (await clientResourceGet(request(`?versionId=${first.versionId}&lineCount=120`), "read", context)).json();
    expect(body.markdown.split("\n").length).toBeLessThanOrEqual(120); expect(body.markdown.length).toBeLessThanOrEqual(12_000); expect(body.truncated).toBe(true);
    const text = await (await clientResourceGet(request(`?versionId=${first.versionId}&path=example.txt`), "files/read", context)).json(); expect(text.text).toHaveLength(12_000);
    expect((await clientResourceGet(request(`?versionId=${draft.versionId}`), "outline", context)).status).toBe(404);
    expect((await clientResourceGet(request(`?versionId=${first.versionId}&startLine=1&offset=0`), "read", context)).status).toBe(400);
  });
  it("rechecks archive and unpublish for every endpoint and historical version", async () => {
    const first = await publish(); const hub = mocks.hub!;
    await hub.archive("policy");
    for (const operation of ["get", "outline", "read", "files", "files/read", "download"] as ClientResourceOperation[]) {
      const query = `?versionId=${first.versionId}${operation === "files/read" ? "&path=example.txt" : operation === "download" ? "&fileId=package" : ""}`;
      expect((await clientResourceGet(request(query), operation, context)).status).toBe(404);
    }
    expect((await (await clientResourceGet(request(), "search")).json()).items).toEqual([]);
    const store = new MemoryHubStore(); mocks.hub = new KnowledgeHub(store); const published = await publish();
    await store.transaction(async tx => { const value = (await tx.getResource("policy"))!; value.publishedVersionId = null; await tx.saveResource(value); });
    expect((await clientResourceGet(request(`?versionId=${published.versionId}&fileId=package`), "download", context)).status).toBe(404);
  });
  it("rejects cross-resource version IDs and unbounded or unknown queries", async () => {
    await publish(); const other = await mocks.hub!.import({ id: "other", type: "document", title: "Other", source: "test", markdown: "Other" }); await mocks.hub!.publish("other", other.versionId);
    expect((await clientResourceGet(request(`?versionId=${other.versionId}`), "read", context)).status).toBe(404);
    for (const query of ["?limit=101", "?offset=-1", "?includeInactive=true", "?limit=1&limit=2"]) expect((await clientResourceGet(request(query), "search")).status).toBe(400);
    mocks.enabled = false; const response = await clientResourceGet(request(), "get", context); expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("enforces a bounded per-credential request window", async () => {
    mocks.guard.mockResolvedValue({ credentialId: crypto.randomUUID() });
    for (let i = 0; i < 120; i++) expect((await clientResourceGet(request(), "search")).status).toBe(200);
    expect((await clientResourceGet(request(), "search")).status).toBe(429);
  });
});


it("discovers opaque version-bound file download identifiers and reserved package downloads", async () => {
  const first = await publish();
  const listed = await (await clientResourceGet(request(`?versionId=${first.versionId}`), "files", context)).json();
  expect(listed.files[0].fileId).toMatch(/^[a-f0-9]{64}$/); expect(listed.downloads.map((item: {fileId: string}) => item.fileId)).toEqual(["package", "markdown"]);
  const response = await clientResourceGet(request(`?versionId=${first.versionId}&fileId=${listed.files[0].fileId}`), "download", context);
  expect(response.status).toBe(200); expect((await response.text()).length).toBe(15_000); expect(response.headers.get("x-resource-version")).toBe(first.versionId);
  expect((await clientResourceGet(request(`?versionId=${first.versionId}&fileId=example.txt`), "download", context)).status).toBe(400);
  expect((await clientResourceGet(request(`?versionId=${first.versionId}&fileId=${"0".repeat(64)}`), "download", context)).status).toBe(404);
  expect((await clientResourceGet(request(`?versionId=${first.versionId}&fileId=package`), "download", context)).headers.get("content-type")).toBe("application/zip");
});
