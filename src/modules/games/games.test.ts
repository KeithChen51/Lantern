import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findGame, listGames } from "./registry";

describe("games preview registry", () => {
  it("previews both games without exposing unfinished entry routes", () => {
    const games = listGames();
    expect(games.map((game) => game.title)).toEqual(["灯塔：服务文化之旅", "精诚服务店"]);
    for (const game of games) {
      expect(game.status).toBe("planned");
      expect(game.href).toBeUndefined();
      expect(existsSync(join(process.cwd(), "public", game.cover.src))).toBe(true);
    }
  });
  it("finds a registered game", () => {
    expect(findGame("voyage")?.title).toBe("灯塔：服务文化之旅");
  });
  it("returns null for an unknown slug", () => {
    expect(findGame("unknown-game")).toBeNull();
  });
});
