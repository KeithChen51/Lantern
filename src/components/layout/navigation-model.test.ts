import { afterEach, describe, expect, it } from "vitest";
import { getVisibleNavItems, NAV_ITEMS } from "./navigation-model";

const originalShowWorkshop = process.env.NEXT_PUBLIC_SHOW_WORKSHOP;

afterEach(() => {
  process.env.NEXT_PUBLIC_SHOW_WORKSHOP = originalShowWorkshop;
});

describe("navigation model", () => {
  it("keeps the full module registry available", () => {
    const expectedLabels = ["价值起点", "外部标杆", "内部实践", "行动指南", "AI问答"];

    expect(NAV_ITEMS.map((item) => item.label)).toEqual(expectedLabels);
  });

  it("hides the public Workshop entry by default during internal preview", () => {
    delete process.env.NEXT_PUBLIC_SHOW_WORKSHOP;
    const expectedLabels = ["价值起点", "外部标杆", "内部实践", "AI问答"];

    expect(getVisibleNavItems("normal_user").map((item) => item.label)).toEqual(expectedLabels);
    expect(getVisibleNavItems("highest_admin").map((item) => item.label)).toEqual(expectedLabels);
    expect(getVisibleNavItems(null).map((item) => item.label)).toEqual(expectedLabels);
  });

  it("shows Workshop when the public feature flag is enabled", () => {
    process.env.NEXT_PUBLIC_SHOW_WORKSHOP = "true";
    const expectedLabels = ["价值起点", "外部标杆", "内部实践", "行动指南", "AI问答"];

    expect(getVisibleNavItems("normal_user").map((item) => item.label)).toEqual(expectedLabels);
  });

  it("uses Heart as the home route and keeps Mirror under /mirror", () => {
    expect(NAV_ITEMS.find((item) => item.subLabel === "本心")?.href).toBe("/");
    expect(NAV_ITEMS.find((item) => item.subLabel === "镜鉴")?.href).toBe("/mirror");
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
