import { describe, expect, it } from "vitest";
import { isPreviewIdentityId, PREVIEW_IDENTITY_IDS, PREVIEW_USER_COOKIE } from "./preview";

describe("preview identity metadata", () => {
  it("keeps the preview identity boundary explicit", () => {
    expect(PREVIEW_USER_COOKIE).toBe("lighthouse_preview_user_id");
    expect(PREVIEW_IDENTITY_IDS).toEqual(["user-demo", "admin-demo"]);
    expect(isPreviewIdentityId("user-demo")).toBe(true);
    expect(isPreviewIdentityId("admin-demo")).toBe(true);
    expect(isPreviewIdentityId("unknown-user")).toBe(false);
  });
});
