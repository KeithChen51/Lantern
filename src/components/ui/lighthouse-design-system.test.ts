import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("lighthouse design system contract", () => {
  it("exposes the Harbor Signal support tokens through globals and Tailwind aliases", () => {
    const globals = readProjectFile("src/app/globals.css");

    [
      "--lh-panel-soft: #f7fbfa;",
      "--lh-chart: #e8f3f1;",
      "--lh-chart-strong: #d2e5e5;",
      "--lh-action: #176e8b;",
      "--lh-action-deep: #0f5268;",
      "--lh-brass: #b4874d;",
      "--lh-brass-soft: #f2e6d3;",
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

  it("defines an amber gold runtime theme alongside Harbor Signal", () => {
    const globals = readProjectFile("src/app/globals.css");
    const amberTheme = globals.match(/html\[data-lighthouse-theme="amber"\]\s*{([\s\S]*?)\n}/)?.[1] ?? "";

    expect(amberTheme).toContain("--lh-page: #f6f0e4;");
    expect(amberTheme).toContain("--lh-ink: #2f2a23;");
    expect(amberTheme).toContain("--lh-signal: #b9822e;");
    expect(amberTheme).toContain("--lh-action: #d4a04a;");
    expect(amberTheme).toContain("--lh-action-deep: #b77f2f;");
    expect(amberTheme).toContain("--lh-deck: #efe0c7;");
    expect(amberTheme).toContain("--lh-deck-text: #3e3326;");
    expect(amberTheme).toContain("--lh-deck-panel-active: rgba(255, 248, 235, 0.82);");
    expect(amberTheme).not.toContain("--lh-deck: #3a3026;");
    expect(amberTheme).not.toContain("--lh-signal: #d97706;");
    expect(amberTheme).not.toContain("#0e334b");
  });

  it("keeps inverse emphasis surfaces safe for light amber deck colors", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");

    expect(heartPage).toContain("bg-[linear-gradient(135deg,var(--color-primary-deep),var(--color-primary))]");
    expect(heartPage).not.toContain("bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] p-6 text-panel");
  });

  it("wires the palette switcher into the app shell", () => {
    const themeSwitcher = readProjectFile("src/components/layout/ThemeSwitcher.tsx");
    const header = readProjectFile("src/components/layout/Header.tsx");
    const layout = readProjectFile("src/app/layout.tsx");

    expect(themeSwitcher).toContain("lighthouse-app-theme");
    expect(themeSwitcher).toContain("data-lighthouse-theme");
    expect(themeSwitcher).toContain("琥珀金");
    expect(header).toContain("<ThemeSwitcher />");
    expect(layout).toContain('data-lighthouse-theme="harbor"');
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
