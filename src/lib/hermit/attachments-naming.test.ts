import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";

const canonical = Symbol.for("lighthouse.hermit.attachment-store");
const legacy = Symbol.for("lantern.hermit.attachment-store");
const cache = globalThis as typeof globalThis & { [canonical]?: Map<string, unknown>; [legacy]?: Map<string, unknown> };
afterEach(() => { delete cache[canonical]; delete cache[legacy]; vi.resetModules(); });

it("retains the hot reload cache but rejects old anonymous entries", async () => {
  vi.resetModules();
  delete cache[canonical];
  const id = randomUUID(), ownerId = "a".repeat(43);
  const entry = { id, name: "existing.txt", size: 20, text: "Existing attachment", ownerId, expiresAt: Date.now() + 60_000 };
  cache[legacy] = new Map([[id, entry]]);
  const { resolveHermitAttachments } = await import("./attachments");
  expect(cache[canonical]).toBe(cache[legacy]);
  const principal = { userId: "employee", account: "employee", displayName: "Employee", grantId: "grant", credentialId: "session", channel: "web" as const, capabilities: ["hermit:attachment:self" as const], expiresAt: Date.now() + 60000 };
  await expect(resolveHermitAttachments(principal, [id])).rejects.toMatchObject({ status: 404 });
});
