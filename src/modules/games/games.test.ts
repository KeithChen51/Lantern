import { describe, expect, it } from "vitest";
import { findGame, listGames } from "./registry";

describe("games registry (skeleton)", () => {
  it("lists no games before the first game is registered", () => {
    expect(listGames()).toEqual([]);
  });

  it("returns null for an unknown slug", () => {
    expect(findGame("voyage")).toBeNull();
  });
});
