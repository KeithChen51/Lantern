import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { currentVersion, releases } from "@/lib/releases";
import UpdatesPage from "./page";

describe("user-facing release history", () => {
  it("shows the real current version and user changes without deployment details", () => {
    const html = renderToStaticMarkup(<UpdatesPage />);
    expect(html).toContain(`当前版本 ${currentVersion}`);
    expect(html).toContain(releases[0].title);
    expect(html).toContain("OA");
    expect(html).toContain("访客");
    for (const internalDetail of ["LIGHTHOUSE_BUILD_BRANCH", "Jenkinsfile", "MANIFEST_UNKNOWN", "数据库迁移", "租户 API Key"]) {
      expect(html).not.toContain(internalDetail);
    }
    expect(html).not.toContain('id="v1.2.1"');
    expect(html).not.toContain('id="v1.3.3-beta.1"');
    expect(html).toContain('id="v1.0.0"');
  });
});
