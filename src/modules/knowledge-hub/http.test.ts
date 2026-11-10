import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeHub } from "./service";
import { MemoryHubStore } from "./test-store";
import { GET as search } from "@/app/api/resources/route";
import { GET as get } from "@/app/api/resources/[id]/route";
import { GET as file } from "@/app/api/resources/[id]/files/route";
import { GET as download } from "@/app/api/resources/[id]/download/route";

const fixture = vi.hoisted(() => ({ store: null as MemoryHubStore | null, kind: "employee" as "employee" | "guest" | "dealer" }));
vi.mock("@/modules/auth/access", () => ({ requireSiteVisitor: async () => ({ kind: fixture.kind, userId: "viewer" }), authErrorResponse: () => Response.json({ error: "auth" }, { status: 401 }) }));
vi.mock("@/infrastructure/db", () => ({ prisma: {} }));
vi.mock("./prisma-store", () => ({ PrismaHubStore: class { constructor() { return fixture.store!; } } }));
const context = { params: Promise.resolve({ id: "whitepaper" }) };
const request = (suffix = "") => new Request(`http://localhost/api/resources/whitepaper${suffix}`);

let hub: KnowledgeHub;
beforeEach(() => {
  fixture.kind = "employee";
  fixture.store = new MemoryHubStore();
  hub = new KnowledgeHub(fixture.store);
  vi.stubEnv("AUTH_MODE", "iam");
  vi.stubEnv("KNOWLEDGE_HUB_ENABLED", "true");
  vi.stubEnv("KNOWLEDGE_HUB_DRIVER", "mysql");
  vi.stubEnv("DATABASE_URL", "unused-test-database");
});
afterEach(() => vi.unstubAllEnvs());

describe("public resource HTTP boundary", () => {
  it("shares published versions with the service, hides drafts, and pins downloads", async () => {
    const original = { id: "whitepaper", type: "document", title: "白皮书", source: "测试", markdown: "# 服务\n第一版" };
    const first = await hub.import(original);
    expect((await get(request(), context)).status).toBe(404);
    expect((await search(new Request("http://localhost/api/resources"))).status).toBe(200);
    await hub.publish(original.id, first.versionId);
    const next = await hub.import({ ...original, markdown: "# 服务\n第二版" });
    expect((await get(request(`?version=${next.versionId}`), context)).status).toBe(404);
    await hub.publish(original.id, next.versionId);
    const result = await search(new Request("http://localhost/api/resources?q=服务"));
    expect(await result.json()).toEqual(await hub.search({ query: "服务" }));
    const download = await get(request(`?version=${first.versionId}&format=md`), context);
    expect(await download.text()).toBe(original.markdown);
    expect(download.headers.get("x-resource-version")).toBe(first.versionId);
    expect(download.headers.get("cache-control")).toBe("no-store");
    await hub.archive(original.id);
    expect((await get(request(`?version=${first.versionId}`), context)).status).toBe(404);
  });

  it("downloads active attachments without executing them and rejects invalid search", async () => {
    const result = await hub.import({ id: "whitepaper", type: "document", title: "包", source: "测试", markdown: "包", files: [{ path: "demo.html", mediaType: "text/html", contentBase64: Buffer.from("<script>alert(1)</script>").toString("base64") }] });
    await hub.publish("whitepaper", result.versionId);
    const response = await file(request(`?version=${result.versionId}&path=demo.html`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await file(request("?path=missing"), context)).status).toBe(404);
    expect((await search(new Request("http://localhost/api/resources?limit=-1"))).status).toBe(400);
    vi.stubEnv("KNOWLEDGE_HUB_ENABLED", "false");
    expect((await get(request(), context)).status).toBe(503);
    expect((await search(new Request("http://localhost/api/resources"))).status).toBe(503);
  });

  it("keeps dealer search, version reads, files and package downloads inside the published public audience", async () => {
    const draft = {
      id: "whitepaper", type: "document", title: "受限原版", source: "测试", visibility: "internal", markdown: "# 内部资料",
      files: [{ path: "notes.txt", mediaType: "text/plain", contentBase64: Buffer.from("内部附件").toString("base64") }],
    };
    const hidden = await hub.import(draft);
    await hub.publish(draft.id, hidden.versionId);
    await fixture.store!.transaction(async tx => {
      const resource = (await tx.getResource(draft.id))!;
      await tx.saveResource({ ...resource, visibility: "public" });
    });
    const visible = await hub.import({ ...draft, title: "公开修订", visibility: "public", markdown: "# 公开资料",
      files: [{ path: "notes.txt", mediaType: "text/plain", contentBase64: Buffer.from("公开附件").toString("base64") }] });
    await hub.publish(draft.id, visible.versionId);
    const unpublished = await hub.import({ ...draft, title: "公开草稿", visibility: "public", markdown: "# 草稿正文" });

    fixture.kind = "dealer";
    const dealerSearch = await search(new Request("http://localhost/api/resources"));
    expect(await dealerSearch.json()).toMatchObject({ total: 1, items: [{ title: "公开修订", versionId: visible.versionId }] });
    for (const { versionId } of [hidden, unpublished]) {
      expect((await get(request(`?version=${versionId}&format=md`), context)).status).toBe(404);
      expect((await file(request(`?version=${versionId}&path=notes.txt`), context)).status).toBe(404);
      expect((await download(request(`?version=${versionId}`), context)).status).toBe(404);
    }
    expect(await (await get(request("?format=md"), context)).text()).toBe("# 公开资料");
    expect(await (await file(request("?path=notes.txt"), context)).text()).toBe("公开附件");
    expect((await download(request(), context)).headers.get("content-type")).toBe("application/zip");

    fixture.kind = "employee";
    expect(await (await get(request(`?version=${hidden.versionId}&format=md`), context)).text()).toBe("# 内部资料");
  });
});
