import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, enabled, channelInfo } = vi.hoisted(() => ({ admin: vi.fn(), enabled: vi.fn(), channelInfo: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requirePublicationAdmin: admin }));
vi.mock("@/modules/wecom-publications/configuration", () => ({ publicationEnabled: enabled, getPublicationChannelInfo: channelInfo }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./AdminWecomPublications", () => ({ AdminWecomPublications: () => <p>企微发布工作区</p> }));

import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  admin.mockResolvedValue({ capabilities: ["wecom:publish", "analytics:summary"] });
  enabled.mockReturnValue(true);
  channelInfo.mockReturnValue([]);
});

describe("publication page access", () => {
  it.each([401, 403, 503])("rejects unauthorized access before reading publishing configuration (%s)", async status => {
    admin.mockRejectedValue({ status, message: "private identity detail" });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("企微发布工作区");
    expect(html).not.toContain("private identity detail");
    expect(enabled).not.toHaveBeenCalled();
    expect(channelInfo).not.toHaveBeenCalled();
  });

  it("loads the workspace after administrator authorization", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(admin).toHaveBeenCalledOnce();
    expect(html).toContain("企微发布工作区");
    expect(html).toContain('href="/admin/wecom-publications"');
    expect(html).toContain('aria-current="page"');
  });

  it("explains service setup when the administrator opens a disabled feature", async () => {
    enabled.mockReturnValue(false);
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("企微发布尚未启用");
    expect(html).not.toContain("企微发布工作区");
    expect(channelInfo).not.toHaveBeenCalled();
  });
});
