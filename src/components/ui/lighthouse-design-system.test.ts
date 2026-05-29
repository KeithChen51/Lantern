import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function extractThemeBlock(globals: string, theme: string) {
  const block = globals.match(new RegExp(`html\\[data-lighthouse-theme="${theme}"\\]\\s*{([\\s\\S]*?)\\n}`))?.[1] ?? "";
  expect(block).not.toBe("");
  return block;
}

function extractTypefaceBlock(globals: string, typeface: string) {
  const block = globals.match(new RegExp(`html\\[data-lighthouse-typeface="${typeface}"\\]\\s*{([\\s\\S]*?)\\n}`))?.[1] ?? "";
  expect(block).not.toBe("");
  return block;
}

describe("lighthouse design system contract", () => {
  it("exposes the selected truth theme through globals and Tailwind aliases", () => {
    const globals = readProjectFile("src/app/globals.css");

    [
      "--lh-page: #f4f3ea;",
      "--lh-ink: #324a4e;",
      "--lh-primary: #2f7d80;",
      "--lh-signal: #d9b34d;",
      "--lh-deck: #eef3ea;",
      "--lh-max: 1220px;",
      "--color-panel-soft: var(--lh-panel-soft);",
      "--color-chart: var(--lh-chart);",
      "--color-chart-strong: var(--lh-chart-strong);",
      "--color-brass: var(--lh-brass);",
      "--color-brass-soft: var(--lh-brass-soft);",
      "--container-lighthouse: var(--lh-max);",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });
  });

  it("defines the five value themes and removes the former harbor and amber runtime themes", () => {
    const globals = readProjectFile("src/app/globals.css");

    const expectedThemeTokens = {
      goodness: ["--lh-page: #f8f0e4;", "--lh-primary: #647d5d;", "--lh-action: #d48670;"],
      beauty: ["--lh-page: #fff1e8;", "--lh-primary: #806c9f;", "--lh-signal: #d76f85;"],
      love: ["--lh-page: #fff0e7;", "--lh-primary: #c74f5a;", "--lh-action: #f0b27e;"],
      happiness: ["--lh-page: #fff0df;", "--lh-primary: #d97957;", "--lh-action: #d86d62;"],
    };

    Object.entries(expectedThemeTokens).forEach(([theme, tokens]) => {
      const block = extractThemeBlock(globals, theme);
      tokens.forEach((token) => expect(block).toContain(token));
      expect(block).not.toContain("--lh-deck: #0e334b;");
    });

    expect(globals).not.toContain('data-lighthouse-theme="harbor"');
    expect(globals).not.toContain('data-lighthouse-theme="amber"');
    expect(globals).not.toContain("--color-amber");
  });

  it("defines both body typeface modes", () => {
    const globals = readProjectFile("src/app/globals.css");
    const heiBlock = extractTypefaceBlock(globals, "hei");
    const wenkaiBlock = extractTypefaceBlock(globals, "wenkai");

    expect(globals).toContain("--font-hei-stack:");
    expect(globals).toContain("--font-wenkai-stack:");
    expect(globals).toContain("LXGW WenKai");
    expect(globals).toContain("霞鹜文楷");
    expect(heiBlock).toContain("--font-sans-stack: var(--font-hei-stack);");
    expect(wenkaiBlock).toContain("--font-sans-stack: var(--font-wenkai-stack);");
  });

  it("keeps inverse emphasis surfaces safe for light value-theme decks", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");

    expect(heartPage).toContain("bg-[linear-gradient(135deg,var(--color-primary-deep),var(--color-primary))]");
    expect(heartPage).not.toContain("bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] p-6 text-panel");
  });

  it("wires the value theme and typeface switcher into the app shell", () => {
    const themeSwitcher = readProjectFile("src/components/layout/ThemeSwitcher.tsx");
    const header = readProjectFile("src/components/layout/Header.tsx");
    const navigation = readProjectFile("src/components/layout/Navigation.tsx");
    const layout = readProjectFile("src/app/layout.tsx");

    [
      '"truth"',
      '"goodness"',
      '"beauty"',
      '"love"',
      '"happiness"',
      '"hei"',
      '"wenkai"',
      "lighthouse-app-theme-v2",
      "lighthouse-app-typeface",
      "data-lighthouse-theme",
      "data-lighthouse-typeface",
      "data-theme-choice",
      "data-typeface-choice",
    ].forEach((token) => {
      expect(themeSwitcher).toContain(token);
    });

    expect(themeSwitcher).not.toContain('"harbor"');
    expect(themeSwitcher).not.toContain('"amber"');
    expect(header).toContain("<ThemeSwitcher />");
    expect(navigation).toContain("<ThemeSwitcher />");
    expect(layout).toContain('data-lighthouse-theme="truth"');
    expect(layout).toContain('data-lighthouse-typeface="hei"');
  });

  it("keeps reusable primitives broad enough for page-level refactors", () => {
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");

    [
      "LhButton",
      "LhIconButton",
      "LhPanel",
      "LhCard",
      "LhChip",
      "LhStatusBadge",
      "LhTextField",
      "LhTextArea",
      "LhSearchBox",
      "LhPageHero",
      "LhDataTableShell",
      "LhCallout",
      "LhMetricTile",
    ].forEach((componentName) => {
      expect(primitives).toMatch(new RegExp(`export (?:const|function) ${componentName}\\b`));
    });
  });
});
