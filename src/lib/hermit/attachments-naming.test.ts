import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";

const canonical = Symbol.for("lighthouse.hermit.attachment-store");
const legacy = Symbol.for("lantern.hermit.attachment-store");
const cache = globalThis as typeof globalThis & { [canonical]?: Map<string, unknown>; [legacy]?: Map<string, unknown> };
afterEach(() => { delete cache[canonical]; delete cache[legacy]; vi.resetModules(); });

it("reuses the legacy process cache during hot reload and retains ownership checks", async () => {
  vi.resetModules();
  delete cache[canonical];
  const id = randomUUID(), ownerId = "a".repeat(43);
  const entry = { id, name: "existing.txt", size: 20, text: "Existing attachment", ownerId, expiresAt: Date.now() + 60_000 };
  cache[legacy] = new Map([[id, entry]]);
  const { resolveHermitAttachments } = await import("./attachments");
  expect(cache[canonical]).toBe(cache[legacy]);
  const request = new Request("http://localhost", { headers: { cookie: `lh_hermit_attachment_owner=${ownerId}` } });
  expect(await resolveHermitAttachments(request, [id])).toEqual([{ id, name: entry.name, size: entry.size, text: entry.text }]);
  const otherOwner = new Request("http://localhost", { headers: { cookie: `lh_hermit_attachment_owner=${"b".repeat(43)}` } });
  await expect(resolveHermitAttachments(otherOwner, [id])).rejects.toMatchObject({ status: 404 });
});
