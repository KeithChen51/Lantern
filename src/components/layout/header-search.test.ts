import { describe, expect, it } from "vitest";
import { resolveHeaderSearch } from "./header-search";

describe("header search", () => {
  it("routes Chinese and common module terms to the matching page", () => {
    expect(resolveHeaderSearch("本心")?.href).toBe("/");
    expect(resolveHeaderSearch("外部标杆")?.href).toBe("/mirror");
    expect(resolveHeaderSearch("内部实践")?.href).toBe("/action");
    expect(resolveHeaderSearch("行动指南")?.href).toBe("/workshop");
    expect(resolveHeaderSearch("AI问答")?.href).toBe("/hermit");
  });

  it("accepts partial mixed-case terms used by real users", () => {
    expect(resolveHeaderSearch("ai")?.href).toBe("/hermit");
    expect(resolveHeaderSearch("审核")?.href).toBe("/admin/workshop");
    expect(resolveHeaderSearch("指南")?.href).toBe("/workshop");
  });

  it("does not treat an empty query as a route match", () => {
    expect(resolveHeaderSearch("   ")).toBeNull();
  });
});
