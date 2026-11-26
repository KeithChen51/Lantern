import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { enabled } = vi.hoisted(() => ({ enabled: vi.fn(() => true) }));
vi.mock("@/modules/wecom-publications/configuration", () => ({ publicationEnabled: enabled }));

import { PlatformAdminNav } from "../PlatformAdminNav";

afterEach(() => enabled.mockReturnValue(true));

describe("publication administration navigation", () => {
  it("requires explicit publishing capability independently of analytics access", () => {
    const analyticsOnly = renderToStaticMarkup(<PlatformAdminNav active="analytics" canViewAnalytics />);
    expect(analyticsOnly).not.toContain("/admin/wecom-publications");
    const publishingOnly = renderToStaticMarkup(<PlatformAdminNav active="wecom-publications" canViewAnalytics={false} canPublishWecom />);
    expect(publishingOnly).toContain('href="/admin/wecom-publications"');
    expect(publishingOnly).not.toContain('href="/admin/analytics"');
  });

  it("hides the publication entry until the service is enabled", () => {
    enabled.mockReturnValue(false);
    const html = renderToStaticMarkup(<PlatformAdminNav active="knowledge" canViewAnalytics canPublishWecom />);
    expect(html).not.toContain("/admin/wecom-publications");
  });
});
