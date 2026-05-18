import { describe, expect, it } from "vitest";
import { canAccessAdminWorkshop } from "./access";

describe("auth access rules", () => {
  it("denies Admin Workshop access to normal users", () => {
    expect(canAccessAdminWorkshop({ roles: ["normal_user"] })).toBe(false);
  });

  it("allows Admin Workshop access to the highest administrator", () => {
    expect(canAccessAdminWorkshop({ roles: ["normal_user", "highest_admin"] })).toBe(true);
  });
});
