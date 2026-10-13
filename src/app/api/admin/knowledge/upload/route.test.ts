import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/shared/errors";
import JSZip from "jszip";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), mutation: vi.fn(), importResource: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireKnowledgeAdmin: mocks.authorize, assertWebMutation: mocks.mutation, authErrorResponse: (error: { status?: number }) => Response.json({ error: "Forbidden" }, { status: error.status ?? 403 }) }));
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
const principal = { userId: "employee", account: "employee", grantId: "grant-1", credentialId: "session-1" };
beforeEach(() => { vi.resetAllMocks(); mocks.authorize.mockResolvedValue(principal); mocks.mutation.mockImplementation((request: Request) => { if (request.headers.get("origin") !== "http://localhost:3301") throw new AppError("forbidden", "Forbidden", 403); }); mocks.importResource.mockImplementation(async (_input, _folder, name) => ({ name, resourceId: "id", versionId: "v1" })); });
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
  it("accepts the browser origin through Docker port mapping", async () => {
    const incoming = request();
    incoming.headers.set("host", "localhost:3301");
    const proxied = new Request("http://0.0.0.0:3000/api/admin/knowledge/upload", incoming);
    expect((await POST(proxied)).status).toBe(200);
    expect(mocks.importResource).toHaveBeenCalledOnce();
  });
  it("returns each result when one file conflicts and another succeeds", async () => {
    mocks.importResource.mockRejectedValueOnce(new HubError("conflict", "同名文件"));
    const response = await POST(request([new File(["# A"], "a.md"), new File(["# B"], "b.md")]));
    expect(await response.json()).toMatchObject({ results: [{ name: "a.md", code: "conflict" }, { name: "b.md", resourceId: "id" }] });
    expect(mocks.importResource).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 503])("stops before the first import when post-parse authorization fails (%s)", async status => {
    mocks.authorize.mockResolvedValueOnce(principal).mockRejectedValueOnce(new AppError("forbidden", "denied", status));
    const incoming = request();
    expect((await POST(incoming)).status).toBe(status);
    expect(incoming.bodyUsed).toBe(true); expect(mocks.importResource).not.toHaveBeenCalled();
  });
  it.each(["userId", "account", "grantId", "credentialId"])("rejects changed %s before import", async key => {
    mocks.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, [key]: "changed" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.importResource).not.toHaveBeenCalled();
  });
  it("stops a two-file batch on revocation after exactly one successful import", async () => {
    mocks.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce(principal).mockRejectedValueOnce(new AppError("unauthorized", "revoked", 401));
    const response = await POST(request([new File(["# A"], "a.md"), new File(["# B"], "b.md")]));
    expect(response.status).toBe(401);
    expect(mocks.importResource).toHaveBeenCalledOnce();
    expect(mocks.importResource.mock.calls[0][2]).toBe("a.md");
  });
  it("checks CSRF before parsing and before each batch mutation", async () => {
    const incoming = request([new File(["# A"], "a.md"), new File(["# B"], "b.md")]), bodyUsed: boolean[] = [];
    mocks.mutation.mockImplementation(() => { bodyUsed.push(incoming.bodyUsed); });
    expect((await POST(incoming)).status).toBe(200);
    expect(bodyUsed).toEqual([false, true, true]);
    expect(mocks.authorize).toHaveBeenCalledTimes(3);
    for (const call of mocks.authorize.mock.calls) expect(call).toEqual([incoming, { write: true }]);
  });
  it("rejects a failed second CSRF check without importing", async () => {
    mocks.mutation.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new AppError("forbidden", "csrf", 403); });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.importResource).not.toHaveBeenCalled();
  });
  it.each([false, true])("rechecks a real Skill ZIP after unpacking (revoked=%s)", async revoked => {
    const zip = new JSZip();
    zip.file("SKILL.md", "---\nname: sample-skill\ndescription: sample\n---\n# Skill instructions\nRead the document.");
    zip.file("references/document.md", "# Reference");
    const data = new FormData();
    data.append("type", "skill");
    data.append("files", new File([new Uint8Array(await zip.generateAsync({ type: "uint8array" }))], "sample-skill.zip"));
    if (revoked) mocks.authorize.mockResolvedValueOnce(principal).mockRejectedValueOnce(new AppError("unauthorized", "revoked", 401));
    const response = await POST(new Request(url, { method: "POST", body: data, headers: { origin: "http://localhost:3301" } }));
    expect(response.status).toBe(revoked ? 401 : 200);
    expect(mocks.importResource).toHaveBeenCalledTimes(revoked ? 0 : 1);
    if (!revoked) expect(mocks.importResource.mock.calls[0][0].files.map((file: { path: string }) => file.path)).toEqual(["SKILL.md", "references/document.md"]);
  });
});
