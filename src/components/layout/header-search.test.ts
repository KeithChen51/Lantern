import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveHeaderSearch } from "./header-search";

const originalShowWorkshop = process.env.NEXT_PUBLIC_SHOW_WORKSHOP;

afterEach(() => {
  process.env.NEXT_PUBLIC_SHOW_WORKSHOP = originalShowWorkshop;
});

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("header search", () => {
  it("routes Chinese and common module terms to the matching page", () => {
    expect(resolveHeaderSearch("本心")?.href).toBe("/");
    expect(resolveHeaderSearch("外部标杆")?.href).toBe("/mirror");
    expect(resolveHeaderSearch("内部实践")?.href).toBe("/action");
    expect(resolveHeaderSearch("行动指南")).toBeNull();
    expect(resolveHeaderSearch("AI问答")?.href).toBe("/hermit");
  });

  it("accepts partial mixed-case terms used by real users", () => {
    expect(resolveHeaderSearch("ai")?.href).toBe("/hermit");
    expect(resolveHeaderSearch("审核")?.href).toBe("/admin/workshop");
    expect(resolveHeaderSearch("指南")?.href).toBe("/admin/workshop");
  });

  it("routes public Workshop terms when the feature flag is enabled", () => {
    process.env.NEXT_PUBLIC_SHOW_WORKSHOP = "true";

    expect(resolveHeaderSearch("行动指南")?.href).toBe("/workshop");
    expect(resolveHeaderSearch("共创")?.href).toBe("/workshop");
  });

  it("does not treat an empty query as a route match", () => {
    expect(resolveHeaderSearch("   ")).toBeNull();
  });

  it("keeps search model external and wires classic shell styling tokens", () => {
    const header = readProjectFile("src/components/layout/Header.tsx");
    const navigation = readProjectFile("src/components/layout/Navigation.tsx");
    const appShell = readProjectFile("src/components/layout/AppShell.tsx");

    expect(navigation).toContain("getHeaderSearchMatches");
    expect(navigation).toContain("resolveHeaderSearch");
    expect(header).not.toContain("const SEARCH_TARGETS");
    expect(header).toContain("rounded-[var(--lh-card-radius)]");
    expect(header).toContain("[backdrop-filter:var(--lh-shell-blur)]");
    expect(navigation).toContain("rounded-[var(--lh-card-radius)]");
    expect(navigation).toContain("rounded-[var(--lh-control-radius)]");
    expect(navigation).toContain("shadow-[var(--lh-card-shadow)]");
    expect(appShell).toContain("selection:bg-primary-soft");
  });
});
