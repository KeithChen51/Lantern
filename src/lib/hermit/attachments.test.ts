import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DELETE, POST } from "@/app/api/hermit/attachments/route";
import {
  HERMIT_ATTACHMENT_MAX_FILE_BYTES,
  resolveHermitAttachments,
  resetHermitAttachmentStoreForTests,
} from "./attachments";

const nodeRequire = createRequire(import.meta.url);

afterEach(() => {
  resetHermitAttachmentStoreForTests();
});

function cookieFrom(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toMatch(/lh_hermit_attachment_owner=[A-Za-z0-9_-]+/);
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Lax");
  return setCookie!.split(";", 1)[0];
}

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
  return { response, body, cookie: cookie ?? (response.ok ? cookieFrom(response) : "") };
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
  it("accepts UTF-8 text and resolves it only for the owning browser cookie", async () => {
    const first = await upload("现场记录.md", "交车时间待确认\n下一次反馈：周五");
    expect(first.response.status).toBe(201);
    expect(first.body).toMatchObject({ name: "现场记录.md", status: "ready" });

    const resolved = await resolveHermitAttachments(
      new Request("http://localhost", { headers: { cookie: first.cookie } }),
      [first.body.id],
    );
    expect(resolved[0]).toMatchObject({ id: first.body.id, name: "现场记录.md", text: "交车时间待确认\n下一次反馈：周五" });

    const other = await upload("其他.txt", "另一位用户的内容");
    await expect(
      resolveHermitAttachments(
        new Request("http://localhost", { headers: { cookie: other.cookie } }),
        [first.body.id],
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("extracts text from PDF and DOCX samples", async () => {
    const pdf = await upload("交车说明.pdf", makePdf("Hermit attachment"));
    expect(pdf.response.status).toBe(201);
    const pdfText = await resolveHermitAttachments(new Request("http://localhost", { headers: { cookie: pdf.cookie } }), [pdf.body.id]);
    expect(pdfText[0].text).toContain("Hermit attachment");

    const fixturePath = path.join(path.dirname(nodeRequire.resolve("mammoth")), "..", "test", "test-data", "single-paragraph.docx");
    const docx = await upload("服务说明.docx", await readFile(fixturePath), pdf.cookie);
    expect(docx.response.status).toBe(201);
    const docxText = await resolveHermitAttachments(new Request("http://localhost", { headers: { cookie: pdf.cookie } }), [docx.body.id]);
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
      resolveHermitAttachments(new Request("http://localhost", { headers: { cookie: ready.cookie } }), [ready.body.id, ready.body.id]),
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
      resolveHermitAttachments(new Request("http://localhost", { headers: { cookie: ready.cookie } }), [ready.body.id]),
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
