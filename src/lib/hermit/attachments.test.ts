import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "@/app/api/hermit/attachments/route";
import {
  HERMIT_ATTACHMENT_MAX_FILE_BYTES,
  resolveHermitAttachments,
  resetHermitAttachmentStoreForTests,
} from "./attachments";

const auth = vi.hoisted(() => ({ employee: vi.fn(), mutation: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireEmployee: auth.employee, assertWebMutation: auth.mutation,
  authErrorResponse: (error: {status?: number}) => Response.json({ error: "access rejected" }, { status: error.status ?? 503 }) }));
import { AppError } from "@/shared/errors";
import type { Principal } from "@/modules/auth/access";
const employee = (id = "a", credentialId = "web-" + id): Principal => ({ userId: "employee-" + id, account: id, displayName: id, grantId: "grant-" + id, credentialId, channel: "web", capabilities: ["hermit:attachment:self", "hermit:chat"], expiresAt: Date.now() + 3600000 });
beforeEach(() => {
  vi.clearAllMocks();
  auth.employee.mockImplementation(async (request: Request) => employee(request.headers.get("cookie") === "employee-b" ? "b" : "a"));
  auth.mutation.mockImplementation(() => {});
});
const nodeRequire = createRequire(import.meta.url);

afterEach(() => {
  resetHermitAttachmentStoreForTests();
});

async function upload(name: string, contents: Buffer | string, cookie?: string) {
  const formData = new FormData();
  const blobPart = typeof contents === "string" ? contents : (new Uint8Array(contents) as unknown as ArrayBufferView<ArrayBuffer>);
  formData.append("file", new File([blobPart], name));
  const request = new Request("http://localhost/api/hermit/attachments", {
    method: "POST",
    body: formData,
    headers: cookie ? { cookie } : undefined,
  });
  const response = await POST(request);
  const body = await response.json();
  return { response, body, cookie: cookie ?? "employee-a" };
}

function makePdf(text: string) {
  const content = `BT\n/F1 18 Tf\n72 200 Td\n(${text}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

describe("Hermit attachment API", () => {
  it("accepts UTF-8 text and resolves it only for the owning employee and web session", async () => {
    const first = await upload("现场记录.md", "交车时间待确认\n下一次反馈：周五");
    expect(first.response.status).toBe(201);
    expect(first.response.headers.get("set-cookie")).toBeNull();
    expect(first.body).toMatchObject({ name: "现场记录.md", status: "ready" });

    const resolved = await resolveHermitAttachments(
      employee(),
      [first.body.id],
    );
    expect(resolved[0]).toMatchObject({ id: first.body.id, name: "现场记录.md", text: "交车时间待确认\n下一次反馈：周五" });

    await upload("其他.txt", "另一位用户的内容", "employee-b");
    await expect(
      resolveHermitAttachments(
        employee("b"),
        [first.body.id],
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it.each([401, 503])("rejects auth %s before upload/delete body parsing", async status => {
    auth.employee.mockRejectedValue(new AppError("unauthorized", "expired", status));
    for (const handler of [POST, DELETE]) {
      const req = new Request("http://localhost/api/hermit/attachments", { method: handler === POST ? "POST" : "DELETE", body: "malformed" });
      const getReader = vi.spyOn(req.body!, "getReader");
      expect((await handler(req)).status).toBe(status); expect(getReader).not.toHaveBeenCalled();
    }
  });
  it("rejects another web session and does not let another employee delete an upload", async () => {
    const ready = await upload("ready.txt", "private");
    await expect(resolveHermitAttachments(employee("a", "web-a-new"), [ready.body.id])).rejects.toMatchObject({ status: 404 });
    const deletion = await DELETE(new Request("http://localhost/api/hermit/attachments", { method: "DELETE", headers: { cookie: "employee-b" }, body: JSON.stringify({ id: ready.body.id }) }));
    expect(deletion.status).toBe(404);
    expect((await resolveHermitAttachments(employee(), [ready.body.id]))[0].text).toBe("private");
  });
  it("requires capability and CSRF before reading attachment data", async () => {
    auth.mutation.mockImplementation(() => { throw new AppError("forbidden", "csrf", 403); });
    expect((await upload("ready.txt", "text")).response.status).toBe(403);
    auth.mutation.mockImplementation(() => {});
    auth.employee.mockResolvedValue({ ...employee(), capabilities: ["knowledge:read"] });
    expect((await upload("ready.txt", "text")).response.status).toBe(403);
  });
  it("expires uploads and rejects expired principals", async () => {
    const ready = await upload("ready.txt", "text");
    const realNow = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(realNow + 31 * 60 * 1000);
    try { await expect(resolveHermitAttachments(employee(), [ready.body.id])).rejects.toMatchObject({ status: 404 }); }
    finally { now.mockRestore(); }
    await expect(resolveHermitAttachments({ ...employee(), expiresAt: 1 }, [])).rejects.toMatchObject({ status: 401 });
  });
  it("never stores content if an upload aborts during parsing", async () => {
    const { saveHermitAttachment, HERMIT_ATTACHMENT_MAX_FILES_PER_OWNER } = await import("./attachments");
    const controller = new AbortController();
    const file = new File(["cancelled"], "cancelled.txt");
    vi.spyOn(file, "arrayBuffer").mockImplementation(async () => { controller.abort(); return new TextEncoder().encode("cancelled").buffer; });
    await expect(saveHermitAttachment(new Request("http://localhost", { signal: controller.signal }), file, employee())).rejects.toThrow();
    // All five slots remain available after the aborted parse.
    for (let index = 0; index < HERMIT_ATTACHMENT_MAX_FILES_PER_OWNER; index++) expect((await upload(`${index}.txt`, "ready")).response.status).toBe(201);
  });
  it("removes a parsed upload when revocation is detected before returning it", async () => {
    auth.employee.mockResolvedValueOnce(employee()).mockResolvedValueOnce(employee()).mockRejectedValueOnce(new AppError("unauthorized", "revoked", 401));
    expect((await upload("revoked.txt", "private")).response.status).toBe(401);
    auth.employee.mockResolvedValue(employee());
    for (let index = 0; index < 5; index++) expect((await upload(`${index}.txt`, "ready")).response.status).toBe(201);
  });
  it("extracts text from PDF and DOCX samples", async () => {
    const pdf = await upload("交车说明.pdf", makePdf("Hermit attachment"));
    expect(pdf.response.status).toBe(201);
    const pdfText = await resolveHermitAttachments(employee(), [pdf.body.id]);
    expect(pdfText[0].text).toContain("Hermit attachment");

    const fixturePath = path.join(path.dirname(nodeRequire.resolve("mammoth")), "..", "test", "test-data", "single-paragraph.docx");
    const docx = await upload("服务说明.docx", await readFile(fixturePath), pdf.cookie);
    expect(docx.response.status).toBe(201);
    const docxText = await resolveHermitAttachments(employee(), [docx.body.id]);
    expect(docxText[0].text).toBe("Walking on imported air");
  });

  it("rejects unsupported formats, oversized files, duplicate ids, and deletes by owner", async () => {
    const unsupported = await upload("旧版.doc", "not supported");
    expect(unsupported.response.status).toBe(415);
    expect(unsupported.body.error.message).toContain(".doc");

    const oversized = await upload("too-large.txt", Buffer.alloc(HERMIT_ATTACHMENT_MAX_FILE_BYTES + 1, 65));
    expect(oversized.response.status).toBe(413);

    const ready = await upload("ready.txt", "ready");
    await expect(
      resolveHermitAttachments(employee(), [ready.body.id, ready.body.id]),
    ).rejects.toMatchObject({ code: "validation_error", status: 422 });

    const deleted = await DELETE(
      new Request("http://localhost/api/hermit/attachments", {
        method: "DELETE",
        headers: { cookie: ready.cookie, "content-type": "application/json" },
        body: JSON.stringify({ id: ready.body.id }),
      }),
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id: ready.body.id, deleted: true });
    await expect(
      resolveHermitAttachments(employee(), [ready.body.id]),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("bounds uploads even without Content-Length and rejects empty PDF text", async () => {
    const response = await POST(new Request("http://localhost/api/hermit/attachments", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=sample" },
      body: new Uint8Array(12 * 1024 * 1024 + 1),
    }));
    expect(response.status).toBe(413);
    const scanned = await upload("scan.pdf", makePdf(""));
    expect(scanned.response.status).toBe(422);
    expect(scanned.body.error.message).toContain("扫描");
  });

  it("requires exactly one file field", async () => {
    const response = await POST(new Request("http://localhost/api/hermit/attachments", { method: "POST", body: new FormData() }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "validation_error" } });
  });
});
