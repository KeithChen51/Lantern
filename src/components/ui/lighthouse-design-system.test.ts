import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCssBlock(source: string, selector: string, mustContain?: string) {
  const matcher = new RegExp(`(^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{`, "gm");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(source))) {
    const braceIndex = match.index + match[0].lastIndexOf("{");
    let depth = 0;

    for (let index = braceIndex; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) {
        blocks.push(source.slice(braceIndex + 1, index));
        break;
      }
    }
  }

  const block = mustContain ? blocks.find((candidate) => candidate.includes(mustContain)) : blocks[0];
  expect(block ?? "").not.toBe("");
  return block ?? "";
}

function extractCssVariables(block: string) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
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
      "--lh-primary: #6ab0a5;",
      "--lh-signal: #7ca7b8;",
      "--lh-action: #e8c872;",
      "--lh-deck: #f8f6ee;",
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

  it("keeps runtime value-theme core colors aligned with the kit", () => {
    const kit = readProjectFile("docs/design/lighthouse-warm-happiness-kits.html");
    const globals = readProjectFile("src/app/globals.css");
    const themeSwitcher = readProjectFile("src/components/layout/ThemeSwitcher.tsx");

    const contracts = [
      { theme: "truth", kitSelector: ".palette", kitMustContain: "--panel-bg", runtimeSelector: ":root" },
      { theme: "goodness", kitSelector: ".palette-a2", runtimeSelector: 'html[data-lighthouse-theme="goodness"]' },
      { theme: "beauty", kitSelector: ".palette-c1", runtimeSelector: 'html[data-lighthouse-theme="beauty"]' },
      { theme: "love", kitSelector: ".palette-c2", runtimeSelector: 'html[data-lighthouse-theme="love"]' },
      { theme: "happiness", kitSelector: ".palette-happiness", runtimeSelector: 'html[data-lighthouse-theme="happiness"]' },
    ];

    const tokenMap = [
      ["--panel-bg", "--lh-page"],
      ["--panel-surface", "--lh-panel"],
      ["--panel-surface-2", "--lh-fog"],
      ["--panel-ink", "--lh-ink"],
      ["--panel-muted", "--lh-muted"],
      ["--panel-primary", "--lh-primary"],
      ["--panel-secondary", "--lh-signal"],
      ["--panel-accent", "--lh-action"],
      ["--panel-accent-2", "--lh-brass"],
    ];

    contracts.forEach((contract) => {
      const kitVars = extractCssVariables(extractCssBlock(kit, contract.kitSelector, contract.kitMustContain));
      const runtimeVars = extractCssVariables(extractCssBlock(globals, contract.runtimeSelector));
      const swatch = themeSwitcher.match(new RegExp(`\\{ id: "${contract.theme}"[^}]+swatch: "([^"]+)"`))?.[1];

      tokenMap.forEach(([kitToken, runtimeToken]) => {
        expect(runtimeVars[runtimeToken], `${contract.theme} ${runtimeToken}`).toBe(kitVars[kitToken]);
      });
      expect(swatch, `${contract.theme} switcher swatch`).toBe(kitVars["--panel-primary"]);
      expect(runtimeVars["--lh-deck"], `${contract.theme} deck must stay light`).not.toBe("#0e334b");
    });

    expect(globals).not.toContain('data-lighthouse-theme="harbor"');
    expect(globals).not.toContain('data-lighthouse-theme="amber"');
    expect(globals).not.toContain("--color-amber");
  });

  it("defines Classic Amber as a separate interface layer", () => {
    const globals = readProjectFile("src/app/globals.css");

    expect(globals).toContain('html[data-lighthouse-interface="classic"]');
    expect(globals).toContain("--lh-classic-amber");
    expect(globals).toContain('html[data-lighthouse-interface="classic"] body::before');
    expect(globals).toContain("--lh-card-radius");
    expect(globals).toContain("--lh-card-shadow");
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

  it("keeps the page background flat so long pages do not darken at the bottom", () => {
    const globals = readProjectFile("src/app/globals.css");
    const bodyBlock = extractCssBlock(globals, "body");
    const bodyBeforeBlock = extractCssBlock(globals, "body::before");

    expect(bodyBlock).toContain("background: var(--color-page);");
    expect(bodyBlock).not.toContain("linear-gradient(180deg, var(--color-page-start)");
    expect(bodyBlock).not.toContain("var(--color-page-end) 100%");
    expect(bodyBeforeBlock).toContain("background: transparent;");
    expect(bodyBeforeBlock).not.toContain("--lh-body-accent-rgb");
  });

  it("keeps inverse emphasis surfaces safe for light value-theme decks", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");

    expect(heartPage).toContain("bg-[linear-gradient(135deg,var(--color-primary-deep),var(--color-primary))]");
    expect(heartPage).not.toContain("bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] p-6 text-panel");
  });

  it("uses the selected value-theme accents to layer the heart value rows", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");
    const themeSwitcher = readProjectFile("src/components/layout/ThemeSwitcher.tsx");
    const switcherSwatches = [...themeSwitcher.matchAll(/swatch: "(#[0-9a-f]{6})"/g)].map((match) => match[1]);
    const valueRowColors = [...heartPage.matchAll(/"--value-color": "(#[0-9a-f]{6})"/g)].map((match) => match[1]);

    expect(valueRowColors).toEqual(switcherSwatches);
    expect(heartPage).toContain("valueToneStyles");
    expect(heartPage).toContain("lg:grid-cols-[250px_minmax(0,1fr)]");
    expect(heartPage).toContain("color-mix(in srgb, var(--value-soft) 54%");
    expect(heartPage).toContain("color-mix(in srgb, var(--value-soft) 22%");
    expect(heartPage).toContain("borderColor: \"var(--value-line)\"");
    expect(heartPage).not.toContain("linear-gradient(115deg");
    expect(heartPage).not.toContain("linear-gradient(145deg");
  });

  it("wires the value theme and typeface switcher into the app shell", () => {
    const themeSwitcher = readProjectFile("src/components/layout/ThemeSwitcher.tsx");
    const appearanceMode = readProjectFile("src/components/layout/appearance-mode.ts");
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
      "INTERFACE_MODES",
      "data-theme-choice",
      "data-typeface-choice",
      "data-interface-choice",
    ].forEach((token) => {
      expect(themeSwitcher).toContain(token);
    });

    [
      "lighthouse-app-theme-v2",
      "lighthouse-app-typeface",
      "lighthouse-app-interface",
      "data-lighthouse-theme",
      "data-lighthouse-typeface",
      "data-lighthouse-interface",
      '"modern"',
      '"classic"',
    ].forEach((token) => {
      expect(appearanceMode).toContain(token);
    });

    expect(themeSwitcher).not.toContain('"harbor"');
    expect(themeSwitcher).not.toContain('"amber"');
    expect(themeSwitcher).toContain('isActive ? "border-panel/75 bg-panel');
    expect(themeSwitcher).toContain('border-line bg-[var(--theme-swatch)]');
    expect(header).toContain("<ThemeSwitcher />");
    expect(navigation).toContain("<ThemeSwitcher />");
    expect(layout).toContain('data-lighthouse-theme="truth"');
    expect(layout).toContain('data-lighthouse-typeface="hei"');
    expect(layout).toContain('data-lighthouse-interface="modern"');
  });

  it("keeps reusable primitives broad enough for page-level refactors", () => {
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const featureCard = readProjectFile("src/components/ui/FeatureCard.tsx");

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

    expect(primitives).toContain("rounded-[var(--lh-card-radius)]");
    expect(primitives).toContain("shadow-[var(--lh-card-shadow)]");
    expect(primitives).toContain("rounded-[var(--lh-control-radius)]");
    expect(featureCard).toContain("aspect-[1.618/1]");
    expect(featureCard).toContain("rounded-[var(--lh-card-radius)]");
  });
});
