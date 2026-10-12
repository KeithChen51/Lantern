import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HeartPage from "./page";

vi.mock("@/components/heart/HeartMotion", () => ({ HeartMotion: () => null }));

afterEach(() => vi.unstubAllEnvs());

describe("Home/Heart brand layout", () => {
  it.each(["false", "true"])("keeps the full brand composition when knowledge hub is %s", (enabled) => {
    vi.stubEnv("KNOWLEDGE_HUB_ENABLED", enabled);
    const html = renderToStaticMarkup(HeartPage());
    for (const marker of ["data-lh-home-brand-hero", "data-lh-heart-prologue", "data-lh-heart-origin", "data-lh-heart-values", "data-lh-heart-value-scroll"]) {
      expect(html).toContain(marker);
    }
    expect(html.match(/data-lh-heart-value-item=/g)).toHaveLength(5);
    expect(html).not.toContain("data-lh-resource");
  });
});
