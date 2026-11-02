import { afterEach, describe, expect, it } from "vitest";
import { getVisibleNavItems, NAV_ITEMS } from "./navigation-model";

const originalShowGames = process.env.NEXT_PUBLIC_SHOW_GAMES;

afterEach(() => {
  if (originalShowGames === undefined) delete process.env.NEXT_PUBLIC_SHOW_GAMES;
  else process.env.NEXT_PUBLIC_SHOW_GAMES = originalShowGames;
});

describe("navigation model", () => {
  it("shows one platform management entry only for a management capability, never legacy role labels", () => {
    expect(getVisibleNavItems(["knowledge:manage"]).filter(item => item.href === "/admin")).toEqual([
      expect.objectContaining({ subLabel: "平台管理", href: "/admin" }),
    ]);
    expect(getVisibleNavItems(["knowledge:manage", "analytics:summary"]).filter(item => item.href.startsWith("/admin"))).toHaveLength(1);
    expect(getVisibleNavItems(["content:read", "knowledge:read"]).some(item => item.href.startsWith("/admin"))).toBe(false);
    expect(getVisibleNavItems("highest_admin").some(item => item.href.startsWith("/admin"))).toBe(false);
  });
  it("keeps the active module registry available", () => {
    const expectedLabels = ["价值起点", "外部标杆", "内部实践", "文化游戏", "AI问答"];

    expect(NAV_ITEMS.map((item) => item.label)).toEqual(expectedLabels);
  });

  it("shows the active modules by default during internal preview", () => {
    delete process.env.NEXT_PUBLIC_SHOW_GAMES;
    const expectedLabels = ["价值起点", "外部标杆", "内部实践", "文化游戏", "AI问答"];

    expect(getVisibleNavItems("normal_user").map((item) => item.label)).toEqual(expectedLabels);
    expect(getVisibleNavItems("highest_admin").map((item) => item.label)).toEqual(expectedLabels);
    expect(getVisibleNavItems(null).map((item) => item.label)).toEqual(expectedLabels);
  });

  it("shows Games when the public feature flag is enabled", () => {
    process.env.NEXT_PUBLIC_SHOW_GAMES = "true";
    const expectedLabels = ["价值起点", "外部标杆", "内部实践", "文化游戏", "AI问答"];

    expect(getVisibleNavItems("normal_user").map((item) => item.label)).toEqual(expectedLabels);
  });

  it("hides Games only when explicitly disabled", () => {
    process.env.NEXT_PUBLIC_SHOW_GAMES = "false";
    expect(getVisibleNavItems("normal_user").some((item) => item.href === "/games")).toBe(false);
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
      "启航",
      "路引",
    ]);
  });
});
