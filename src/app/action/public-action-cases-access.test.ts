import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicActionCaseBySlug, getPublicActionCaseSummaries } from "./public-action-cases";

const { enabled, managedGet, managedList, search } = vi.hoisted(() => ({ enabled: vi.fn(), managedGet: vi.fn(), managedList: vi.fn(), search: vi.fn() }));
vi.mock("@/modules/knowledge-hub/runtime", () => ({ isKnowledgeHubEnabled: enabled, getKnowledgeHub: () => ({ search }) }));
vi.mock("@/modules/content", () => ({ actionCaseService: { getPublishedActionCaseBySlug: managedGet, listPublishedActionCases: managedList } }));
beforeEach(() => { enabled.mockReset(); managedGet.mockReset(); managedList.mockReset(); search.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
describe("Action publication ownership", () => {
  it("never revives a missing hub resource from the old static or managed store", async () => {
    enabled.mockReturnValue(true);
    expect(await getPublicActionCaseBySlug("driver-partner-rest-area")).toBeNull();
    expect(managedGet).not.toHaveBeenCalled();
  });
  it("fails closed when the production knowledge hub is disabled", async () => {
    enabled.mockReturnValue(false); vi.stubEnv("NODE_ENV", "production");
    await expect(getPublicActionCaseSummaries()).rejects.toMatchObject({ status: 503 });
    await expect(getPublicActionCaseBySlug("driver-partner-rest-area")).rejects.toMatchObject({ status: 503 });
    expect(managedGet).not.toHaveBeenCalled(); expect(managedList).not.toHaveBeenCalled();
  });
  it("lists only published hub search results when the hub owns content", async () => {
    enabled.mockReturnValue(true); search.mockResolvedValue({ items: [], total: 0 });
    expect(await getPublicActionCaseSummaries()).toEqual([]); expect(managedList).not.toHaveBeenCalled();
  });
});
