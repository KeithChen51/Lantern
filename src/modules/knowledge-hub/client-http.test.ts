import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/shared/errors";
import { KnowledgeHub } from "./service";
import { MemoryHubStore } from "./test-store";
import { knowledgeFileId, type KnowledgeIndexListing } from "./index-reader";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), employee: vi.fn(), store: null as MemoryHubStore | null,
  storage: vi.fn(), listing: vi.fn<() => Promise<KnowledgeIndexListing>>(),
}));
vi.mock("@/modules/auth/access", () => ({ requireKnowledgeClient: mocks.guard, requireEmployee: mocks.employee, requireSiteVisitor: mocks.employee,
  authErrorResponse: (error: { status?: number }) => Response.json({ error: "auth" }, { status: error.status ?? 503, headers: { "Cache-Control": "no-store" } }) }));
vi.mock("@/infrastructure/db", () => ({ prisma: {} }));
vi.mock("./prisma-store", () => ({ PrismaHubStore: class { constructor() { mocks.storage(); return mocks.store!; } } }));
vi.mock("./manager", () => ({ createKnowledgeManager: () => ({ list: mocks.listing }) }));
import { clientResourceGet, type ClientResourceOperation } from "./client-http";
import { GET as webGet } from "@/app/api/resources/[id]/route";
const context = { params: Promise.resolve({ id: "policy" }) };
const request = (query = "") => new Request(`https://example.test/api/client/v1/resources/policy${query}`, { headers: { authorization: "Bearer fixture" } });
let hub: KnowledgeHub;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_MODE", "iam");
  vi.stubEnv("KNOWLEDGE_HUB_DRIVER", "mysql");
  vi.stubEnv("KNOWLEDGE_HUB_ENABLED", "true");
  vi.stubEnv("DATABASE_URL", "unused-test-database");
  mocks.store = new MemoryHubStore();
  hub = new KnowledgeHub(mocks.store);
  mocks.guard.mockResolvedValue({ userId: "employee", credentialId: crypto.randomUUID(), channel: "cli", capabilities: ["knowledge:read"] });
  mocks.employee.mockResolvedValue({ userId: "employee" });
});
afterEach(() => vi.unstubAllEnvs());
async function publish() {
  const first = await hub.import({ id: "policy", type: "document", title: "Published title", source: "Published source", summary: "Published summary", tags: ["published"], markdown: Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"), files: [{ path: "example.txt", mediaType: "text/plain", contentBase64: Buffer.from("x".repeat(15_000)).toString("base64") }] });
  await hub.publish("policy", first.versionId); return first;
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
    const draft = await hub.import({ id: "policy", type: "document", title: "DRAFT SECRET", source: "DRAFT SOURCE", summary: "DRAFT SUMMARY", tags: ["DRAFT TAG"], markdown: "DRAFT BODY", files: [{ path: "secret.txt", mediaType: "text/plain", contentBase64: "YQ==" }] });
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
    const first = await publish();
    await hub.archive("policy");
    for (const operation of ["get", "outline", "read", "files", "files/read", "download"] as ClientResourceOperation[]) {
      const query = `?versionId=${first.versionId}${operation === "files/read" ? "&path=example.txt" : operation === "download" ? "&fileId=package" : ""}`;
      expect((await clientResourceGet(request(query), operation, context)).status).toBe(404);
    }
    expect((await (await clientResourceGet(request(), "search")).json()).items).toEqual([]);
    const store = new MemoryHubStore(); mocks.store = store; hub = new KnowledgeHub(store); const published = await publish();
    await store.transaction(async tx => { const value = (await tx.getResource("policy"))!; value.publishedVersionId = null; await tx.saveResource(value); });
    expect((await clientResourceGet(request(`?versionId=${published.versionId}&fileId=package`), "download", context)).status).toBe(404);
  });
  it("rejects cross-resource version IDs and unbounded or unknown queries", async () => {
    await publish(); const other = await hub.import({ id: "other", type: "document", title: "Other", source: "test", markdown: "Other" }); await hub.publish("other", other.versionId);
    expect((await clientResourceGet(request(`?versionId=${other.versionId}`), "read", context)).status).toBe(404);
    for (const query of ["?limit=101", "?offset=-1", "?includeInactive=true", "?limit=1&limit=2"]) expect((await clientResourceGet(request(query), "search")).status).toBe(400);
    vi.stubEnv("KNOWLEDGE_HUB_ENABLED", "false"); const response = await clientResourceGet(request(), "get", context); expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("uses the dealer's published public view for every knowledge operation", async () => {
    const source = {
      id: "policy", type: "document", title: "Internal history", source: "Fixture",
      visibility: "internal", markdown: "# Internal history",
      files: [{ path: "notes.txt", mediaType: "text/plain", contentBase64: Buffer.from("internal attachment").toString("base64") }],
    };
    const internal = await hub.import(source);
    await hub.publish(source.id, internal.versionId);
    const restricted = await hub.import({ ...source, id: "restricted", title: "Internal resource" });
    await hub.publish("restricted", restricted.versionId);

    const changeVisibility = (visibility: "public" | "internal") => mocks.store!.transaction(async tx => {
      const resource = (await tx.getResource(source.id))!;
      await tx.saveResource({ ...resource, visibility });
    });
    await changeVisibility("public");
    const visible = await hub.import({
      ...source, title: "Public policy", visibility: "public", markdown: "# Public policy",
      files: [{ ...source.files[0], contentBase64: Buffer.from("public attachment").toString("base64") }],
    });
    await hub.publish(source.id, visible.versionId);
    const draft = await hub.import({ ...source, title: "Unpublished draft", visibility: "public", markdown: "# Draft" });
    const listingTime = "2026-01-01T00:00:00.000Z";
    mocks.listing.mockResolvedValue({
      folders: [
        { id: "public-folder", name: "Public folder", parentId: null, deleted: false },
        { id: "internal-folder", name: "Internal folder", parentId: null, deleted: false },
      ],
      resources: [
        { id: "policy", name: "Unpublished draft.md", title: "Unpublished draft", folderId: "public-folder",
          type: "document", visibility: "public", archived: false, publishedVersionId: visible.versionId, latestVersionId: draft.versionId, updatedAt: listingTime },
        { id: "restricted", name: "Internal resource.md", title: "Internal resource", folderId: "internal-folder",
          type: "document", visibility: "internal", archived: false, publishedVersionId: restricted.versionId, latestVersionId: restricted.versionId, updatedAt: listingTime },
      ],
    });
    const employee = await (await clientResourceGet(request(`?versionId=${internal.versionId}`), "read", context)).json();
    expect(employee.markdown).toContain("Internal history");
    mocks.guard.mockResolvedValue({ kind: "dealer", userId: "dealer", credentialId: crypto.randomUUID(), channel: "cli", capabilities: ["knowledge:read"] });
    const search = await (await clientResourceGet(request(), "search")).json();
    expect(search).toMatchObject({ total: 1, items: [{ title: "Public policy", versionId: visible.versionId }] });
    expect(await (await clientResourceGet(request("?visibility=internal"), "search")).json()).toMatchObject({ total: 0, items: [] });
    const browse = await (await clientResourceGet(request(), "browse")).json();
    expect(browse).toMatchObject({ folders: [{ id: "public-folder", name: "Public folder" }], total: 1 });
    expect((await clientResourceGet(request("?folderId=internal-folder"), "browse")).status).toBe(404);
    const folder = await (await clientResourceGet(request("?folderId=public-folder"), "browse")).json();
    expect(folder.resources).toMatchObject([{ title: "Public policy", name: "Public policy", versionId: visible.versionId }]);

    const operations = [
      ["get", ""], ["outline", ""], ["read", ""], ["files", ""], ["files/read", "&path=notes.txt"],
      ["download", "&fileId=package"], ["download", "&fileId=markdown"], ["download", `&fileId=${knowledgeFileId("notes.txt")}`],
    ] as const;
    const restrictedContext = { params: Promise.resolve({ id: "restricted" }) };
    for (const [operation, suffix] of operations) {
      for (const versionId of [internal.versionId, draft.versionId]) {
        expect((await clientResourceGet(request(`?versionId=${versionId}${suffix}`), operation, context)).status).toBe(404);
      }
      expect((await clientResourceGet(request(`?versionId=${restricted.versionId}${suffix}`), operation, restrictedContext)).status).toBe(404);
      expect((await clientResourceGet(request(`?versionId=${visible.versionId}${suffix}`), operation, context)).status).toBe(200);
    }
    const response = await clientResourceGet(request(`?versionId=${visible.versionId}&fileId=${knowledgeFileId("notes.txt")}`), "download", context);
    expect(await response.text()).toBe("public attachment");

    await changeVisibility("internal");
    expect((await clientResourceGet(request(`?versionId=${visible.versionId}`), "read", context)).status).toBe(404);
    expect(await (await clientResourceGet(request(), "search")).json()).toMatchObject({ total: 0, items: [] });
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
