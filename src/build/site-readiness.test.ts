import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(), access: vi.fn(), knowledge: vi.fn(), chats: vi.fn(),
}));
vi.mock("@/modules/auth/site-access-config", () => ({ readSiteAccessConfig: mocks.config }));
vi.mock("@/infrastructure/db", () => ({ prisma: {
  accessRecord: { findFirst: mocks.access },
  hubVersion: { findFirst: mocks.knowledge },
  chatSession: { findFirst: mocks.chats },
} }));

import { GET } from "@/app/api/health/ready/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(null);
  mocks.knowledge.mockResolvedValue(null);
  mocks.chats.mockResolvedValue(null);
});

describe("site readiness", () => {
  it.each(["guest", "iam", "portal"])("accepts valid %s config only after checking persisted schema", async (mode) => {
    mocks.config.mockReturnValue({ mode });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ready" });
    expect(mocks.config).toHaveBeenCalledOnce();
    expect(mocks.access).toHaveBeenCalledWith({ select: { id: true } });
    expect(mocks.knowledge).toHaveBeenCalledWith({ select: { id: true, metadata: true } });
    expect(mocks.chats).toHaveBeenCalledWith({ select: { id: true, guestId: true } });
  });

  it("fails closed before querying the database when site config is invalid", async () => {
    mocks.config.mockImplementation(() => { throw new Error("private config detail"); });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"unavailable"}');
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.chats).not.toHaveBeenCalled();
  });

  it.each(["access", "knowledge", "chats"] as const)("refuses a missing %s schema instead of reporting connectivity alone", async (query) => {
    mocks.config.mockReturnValue({ mode: "guest" });
    mocks[query].mockRejectedValue(new Error("private database/schema detail"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
