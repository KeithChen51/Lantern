import { describe, expect, it } from "vitest";
import { getVisibleNavItems, NAV_ITEMS } from "./navigation-model";

describe("navigation model", () => {
  it("keeps the primary app navigation to five modules for every identity", () => {
    const expectedLabels = ["Heart", "Mirror", "Action", "Workshop", "Hermit"];

    expect(NAV_ITEMS.map((item) => item.label)).toEqual(expectedLabels);
    expect(getVisibleNavItems("normal_user").map((item) => item.label)).toEqual(expectedLabels);
    expect(getVisibleNavItems("highest_admin").map((item) => item.label)).toEqual(expectedLabels);
    expect(getVisibleNavItems(null).map((item) => item.label)).toEqual(expectedLabels);
  });

  it("uses Heart as the home route and keeps Mirror under /mirror", () => {
    expect(NAV_ITEMS.find((item) => item.label === "Heart")?.href).toBe("/");
    expect(NAV_ITEMS.find((item) => item.label === "Mirror")?.href).toBe("/mirror");
  });

  it("keeps readable Chinese module names in the sidebar", () => {
    expect(NAV_ITEMS.map((item) => item.subLabel)).toEqual([
      "本心",
      "镜鉴",
      "笃行",
      "共创",
      "路引",
    ]);
  });
});
