import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), importResource: vi.fn() }));
vi.mock("../../../_admin", () => ({ requireAdminPortalFromHeaders: mocks.authorize, adminJsonError: () => Response.json({ error: "Forbidden" }, { status: 403 }) }));
vi.mock("@/modules/knowledge-hub/manager", () => ({ importManagedResource: mocks.importResource }));
import { POST } from "./route";
import { HubError } from "@/modules/knowledge-hub/service";
const url = "http://localhost:3301/api/admin/knowledge/upload";
function request(files = [new File(["# 资料\n\n正文"], "doc.md")]) {
  const data = new FormData();
  data.append("type", "document");
  files.forEach(file => data.append("files", file));
  return new Request(url, { method: "POST", body: data, headers: { origin: "http://localhost:3301" } });
}
beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockImplementation(() => {}); mocks.importResource.mockImplementation(async (_input, _folder, name) => ({ name, resourceId: "id", versionId: "v1" })); });
describe("admin knowledge upload boundary", () => {
  it("rejects unauthorized requests before importing", async () => {
    mocks.authorize.mockImplementation(() => { throw new Error("Forbidden"); });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.importResource).not.toHaveBeenCalled();
  });
  it("rejects cross origin and oversized requests", async () => {
    const cross = request(); cross.headers.set("origin", "https://other.example");
    expect((await POST(cross)).status).toBe(403);
    const large = request(); large.headers.set("content-length", "20000000");
    expect((await POST(large)).status).toBe(400);
    expect(mocks.importResource).not.toHaveBeenCalled();
  });
  it("returns each result when one file conflicts and another succeeds", async () => {
    mocks.importResource.mockRejectedValueOnce(new HubError("conflict", "同名文件"));
    const response = await POST(request([new File(["# A"], "a.md"), new File(["# B"], "b.md")]));
    expect(await response.json()).toMatchObject({ results: [{ name: "a.md", code: "conflict" }, { name: "b.md", resourceId: "id" }] });
    expect(mocks.importResource).toHaveBeenCalledTimes(2);
  });
});
