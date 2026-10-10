import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_admin", async importOriginal => ({
  ...await importOriginal<typeof import("../../_admin")>(),
  requireAdminPortalFromHeaders: vi.fn(),
}));

import { GET, POST } from "./route";
import { GET as preview } from "./[id]/route";
import { GET as download } from "./[id]/download/route";
import { POST as upload } from "./upload/route";
import { assertKnowledgeManagerStorage } from "@/modules/knowledge-hub/manager-storage";

afterEach(() => vi.unstubAllEnvs());

describe("knowledge manager storage boundary", () => {
  it("rejects every admin entry point before reading or writing a different MySQL database", async () => {
    vi.stubEnv("KNOWLEDGE_HUB_DRIVER", "sqlite");
    vi.stubEnv("DATABASE_URL", "mysql://unused:unused@127.0.0.1:1/unused");
    const request = new Request("http://localhost/api/admin/knowledge?version=explicit-version");
    const context = { params: Promise.resolve({ id: "example" }) };
    for (const response of await Promise.all([
      GET(request), POST(request), preview(request, context), download(request, context), upload(request),
    ])) {
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).toContain("SQLite");
    }
  });

  it("preserves the default and explicit MySQL mode", () => {
    vi.stubEnv("KNOWLEDGE_HUB_DRIVER", "");
    expect(assertKnowledgeManagerStorage).not.toThrow();
    vi.stubEnv("KNOWLEDGE_HUB_DRIVER", "mysql");
    expect(assertKnowledgeManagerStorage).not.toThrow();
  });
});
