import { existsSync, readFileSync } from "node:fs";
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

describe("lighthouse design system contract", () => {
  it("exposes Classic Amber as the only runtime theme through globals and Tailwind aliases", () => {
    const globals = readProjectFile("src/app/globals.css");
    const layout = readProjectFile("src/app/layout.tsx");

    [
      "--lh-page: #f3efe0;",
      "--lh-ink: #2c2c2c;",
      "--lh-classic-amber: #d97706;",
      "--lh-primary: var(--lh-classic-amber);",
      "--lh-action: var(--lh-classic-amber);",
      "--lh-deck: var(--lh-page);",
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

    [
      'data-lighthouse-theme="truth"',
      'data-lighthouse-typeface="hei"',
      'data-lighthouse-interface="modern"',
      'html[data-lighthouse-theme="goodness"]',
      'html[data-lighthouse-theme="beauty"]',
      'html[data-lighthouse-theme="love"]',
      'html[data-lighthouse-theme="happiness"]',
      'html[data-lighthouse-typeface="hei"]',
      'html[data-lighthouse-typeface="wenkai"]',
    ].forEach((token) => {
      expect(globals + layout).not.toContain(token);
    });

    expect(layout).toContain('data-lighthouse-interface="classic"');
    expect(layout).not.toContain("data-lighthouse-theme=");
    expect(layout).not.toContain("data-lighthouse-typeface=");
    expect(globals).not.toContain("--color-amber");
  });

  it("defines Classic Amber as the fixed interface layer", () => {
    const globals = readProjectFile("src/app/globals.css");

    expect(globals).toContain('html[data-lighthouse-interface="classic"]');
    expect(globals).not.toContain('html[data-lighthouse-interface="classic"][data-lighthouse-theme]');
    expect(globals).toContain("--lh-classic-amber");
    expect(globals).toContain("--lh-primary: var(--lh-classic-amber);");
    expect(globals).toContain("--lh-action: var(--lh-classic-amber);");
    expect(globals).toContain('html[data-lighthouse-interface="classic"] body::before');
    expect(globals).toContain("--lh-card-radius");
    expect(globals).toContain("--lh-card-shadow");
  });

  it("gives Classic Amber a legacy shell instead of only modern token tweaks", () => {
    const globals = readProjectFile("src/app/globals.css");
    const appShell = readProjectFile("src/components/layout/AppShell.tsx");
    const header = readProjectFile("src/components/layout/Header.tsx");
    const navigation = readProjectFile("src/components/layout/Navigation.tsx");
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");

    [
      "--font-serif-stack",
      "--lh-classic-sidebar-width: 240px;",
      "--lh-classic-sidebar-collapsed-width: 80px;",
      'html[data-lighthouse-interface="classic"] [data-lh-shell]',
      'html[data-lighthouse-interface="classic"] [data-lh-header-bar]',
      'html[data-lighthouse-interface="classic"] [data-lh-sidebar]',
      'html[data-lighthouse-interface="classic"] [data-lh-nav-link]',
      'html[data-lighthouse-interface="classic"] [data-lh-page-hero]',
      'html[data-lighthouse-interface="classic"] [data-lh-card]',
      "font-family: var(--font-serif-stack);",
      "background: rgba(255, 255, 255, 0.4);",
      "box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);",
      "drop-shadow(0 0 8px rgba(217, 119, 6, 0.5))",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    [
      "data-lh-shell",
      "data-lh-main",
      "data-lh-main-frame",
      "md:pl-[var(--lh-classic-main-offset)]",
      "md:pl-[var(--lh-classic-main-collapsed-offset)]",
    ].forEach((token) => {
      expect(appShell).toContain(token);
    });

    ["data-lh-header", "data-lh-header-bar"].forEach((token) => {
      expect(header).toContain(token);
    });

    ["data-lh-sidebar", "data-lh-logo", "data-lh-nav-link", "data-lh-sidebar-toggle"].forEach((token) => {
      expect(navigation).toContain(token);
    });

    ["data-lh-panel", "data-lh-card", "data-lh-chip", "data-lh-page-hero"].forEach((token) => {
      expect(primitives).toContain(token);
    });

    expect(header).not.toContain("<ThemeSwitcher");
    expect(navigation).not.toContain("<ThemeSwitcher");
  });

  it("lets Hermit inherit the Classic editorial chat layout", () => {
    const globals = readProjectFile("src/app/globals.css");
    const hermitPage = readProjectFile("src/app/hermit/page.tsx");
    const chatPanel = readProjectFile("src/components/hermit/ChatPanel.tsx");
    const chatInput = readProjectFile("src/components/hermit/ChatInput.tsx");
    const messageBubble = readProjectFile("src/components/hermit/MessageBubble.tsx");

    [
      "data-lh-hermit-page",
      "data-lh-hermit-intro",
      "data-lh-hermit-title",
      "data-lh-hermit-title-cn",
      "data-lh-hermit-title-en",
      "data-lh-hermit-description",
      "data-lh-hermit-chat-frame",
    ].forEach((token) => {
      expect(hermitPage).toContain(token);
    });

    [
      "data-lh-hermit-panel",
      "data-lh-hermit-panel-header",
      "data-lh-hermit-main",
      "data-lh-hermit-empty",
      "data-lh-hermit-suggested-question",
      "data-lh-hermit-footer",
    ].forEach((token) => {
      expect(chatPanel).toContain(token);
    });

    ["data-lh-chat-input", "data-lh-chat-textarea", "data-lh-chat-submit"].forEach((token) => {
      expect(chatInput).toContain(token);
    });

    ["data-lh-message-row", "data-lh-message-avatar", "data-lh-message-bubble"].forEach((token) => {
      expect(messageBubble).toContain(token);
    });

    [
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-page]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-panel][data-lh-panel]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-panel-header]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-main]',
      'html[data-lighthouse-interface="classic"] [data-lh-chat-input]',
      'html[data-lighthouse-interface="classic"] [data-lh-message-bubble]',
      "--font-noto-stack:",
      "--font-noto: var(--font-noto-stack);",
      "font-family: var(--font-noto-stack);",
      "box-shadow: none;",
      "display: none;",
      "background: transparent;",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });
  });

  it("keeps a fixed body typeface without runtime typeface switching", () => {
    const globals = readProjectFile("src/app/globals.css");

    expect(globals).toContain("--font-hei-stack:");
    expect(globals).toContain("--font-sans-stack: var(--font-hei-stack);");
    expect(globals).not.toContain("--font-wenkai-stack:");
    expect(globals).not.toContain("LXGW WenKai");
    expect(globals).not.toContain("霞鹜文楷");
    expect(globals).not.toContain('html[data-lighthouse-typeface="hei"]');
    expect(globals).not.toContain('html[data-lighthouse-typeface="wenkai"]');
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
    const valueRowColors = [...heartPage.matchAll(/"--value-color": "(#[0-9a-f]{6})"/g)].map((match) => match[1]);

    expect(valueRowColors).toEqual(["#6ab0a5", "#728a69", "#806c9f", "#c74f5a", "#f1a77d"]);
    expect(heartPage).toContain("valueToneStyles");
    expect(heartPage).toContain("lg:grid-cols-[250px_minmax(0,1fr)]");
    expect(heartPage).toContain("color-mix(in srgb, var(--value-soft) 54%");
    expect(heartPage).toContain("color-mix(in srgb, var(--value-soft) 22%");
    expect(heartPage).toContain("borderColor: \"var(--value-line)\"");
    expect(heartPage).not.toContain("linear-gradient(115deg");
    expect(heartPage).not.toContain("linear-gradient(145deg");
  });

  it("does not mount runtime theme or typeface switching in the app shell", () => {
    const appearanceModePath = join(process.cwd(), "src/components/layout/appearance-mode.ts");
    const header = readProjectFile("src/components/layout/Header.tsx");
    const navigation = readProjectFile("src/components/layout/Navigation.tsx");
    const layout = readProjectFile("src/app/layout.tsx");
    const appShell = header + navigation + layout;

    [
      "data-theme-choice",
      "data-typeface-choice",
      "data-interface-choice",
      "THEME_STORAGE_KEY",
      "TYPEFACE_STORAGE_KEY",
      "INTERFACE_STORAGE_KEY",
      "INTERFACE_MODES",
    ].forEach((token) => {
      expect(appShell).not.toContain(token);
    });

    expect(existsSync(appearanceModePath)).toBe(false);
    expect(layout).toContain('data-lighthouse-interface="classic"');
    expect(header).not.toContain("@/components/layout/ThemeSwitcher");
    expect(navigation).not.toContain("@/components/layout/ThemeSwitcher");
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
