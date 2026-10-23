import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { listGames } from "@/modules/games";
import GamesPage from "./page";

afterEach(() => vi.unstubAllEnvs());

describe("game cover requests", () => {
  it("loads protected covers directly so the browser sends its session cookie", () => {
    vi.stubEnv("NEXT_PUBLIC_SHOW_GAMES", "true");
    const html = renderToStaticMarkup(GamesPage());
    const images = html.match(/<img\b[^>]*>/g) ?? [];
    expect(images).toHaveLength(listGames().length);
    for (const [index, game] of listGames().entries()) {
      expect(images[index]).toContain(`src="${game.cover.src}"`);
      expect(images[index]).toContain(`alt="${game.cover.alt}"`);
      expect(images[index]).toContain('loading="lazy"');
      expect(images[index]).not.toContain("/_next/image");
    }
  });
});
