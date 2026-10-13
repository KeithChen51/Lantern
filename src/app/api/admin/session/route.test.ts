import { describe, expect, it } from "vitest";
import { POST, DELETE } from "./route";
import { GET as previewGet, POST as previewPost } from "../../preview-identity/route";
import { POST as feedback } from "../../feedback/route";
import { GET as actionGet, POST as actionPost } from "../action-cases/route";
describe("retired privilege entry points", () => {
  it.each([POST, DELETE, previewGet, previewPost, feedback, actionGet, actionPost])("returns gone without issuing an identity cookie", handler => {
    const response = handler();
    expect(response.status).toBe(410);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
