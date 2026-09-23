import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeHub } from "./service";
import { MemoryHubStore } from "./test-store";
import { GET as search } from "@/app/api/resources/route";
import { GET as get } from "@/app/api/resources/[id]/route";
import { GET as file } from "@/app/api/resources/[id]/files/route";

const runtime = vi.hoisted(() => ({ enabled: true, hub: null as KnowledgeHub | null }));
vi.mock("./runtime", () => ({ isKnowledgeHubEnabled: () => runtime.enabled, getKnowledgeHub: () => runtime.hub! }));
const context = { params: Promise.resolve({ id: "whitepaper" }) };
const request = (suffix = "") => new Request(`http://localhost/api/resources/whitepaper${suffix}`);

beforeEach(() => {
  runtime.enabled = true;
  runtime.hub = new KnowledgeHub(new MemoryHubStore());
});

describe("public resource HTTP boundary", () => {
  it("shares published versions with the service, hides drafts, and pins downloads", async () => {
    const hub = runtime.hub!;
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
    const hub = runtime.hub!;
    const result = await hub.import({ id: "whitepaper", type: "document", title: "包", source: "测试", markdown: "包", files: [{ path: "demo.html", mediaType: "text/html", contentBase64: Buffer.from("<script>alert(1)</script>").toString("base64") }] });
    await hub.publish("whitepaper", result.versionId);
    const response = await file(request(`?version=${result.versionId}&path=demo.html`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await file(request("?path=missing"), context)).status).toBe(404);
    expect((await search(new Request("http://localhost/api/resources?limit=-1"))).status).toBe(400);
    runtime.enabled = false;
    expect((await get(request(), context)).status).toBe(503);
    expect((await search(new Request("http://localhost/api/resources"))).status).toBe(503);
  });
});
