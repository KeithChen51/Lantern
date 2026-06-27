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
      "--color-brass-text: var(--lh-brass-text);",
      "--color-brass-soft: var(--lh-brass-soft);",
      "--color-primary-text: var(--lh-primary-text);",
      "--color-signal-text: var(--lh-brass-text);",
      "--color-danger-text: var(--lh-danger-text);",
      "--color-warning-text: var(--lh-warning-text);",
      "--color-success-text: var(--lh-success-text);",
      "--color-info-text: var(--lh-info-text);",
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

  it("maps Classic Amber accessibility tokens into runtime CSS", () => {
    const globals = readProjectFile("src/app/globals.css");
    const tokensDoc = readProjectFile("docs/design/tokens.md");

    [
      "--lh-primary-text: #9b5c14;",
      "--lh-primary-deep: var(--lh-primary-text);",
      "--lh-brass-text: #806744;",
      "--lh-signal-deep: var(--lh-brass-text);",
      "--lh-danger-text: #965040;",
      "--lh-focus-outline: var(--lh-primary-text);",
      "--lh-focus-offset: 3px;",
      "--lh-focus-halo: rgba(217, 119, 6, 0.18);",
      "--shadow-focus: 0 0 0 3px var(--lh-focus-halo);",
      "--lh-ease-out: cubic-bezier(0.22, 1, 0.36, 1);",
      "--lh-ease-standard: cubic-bezier(0.25, 1, 0.5, 1);",
      "--lh-motion-fast: 160ms;",
      "--lh-motion-medium: 280ms;",
      "--lh-motion-slow: 520ms;",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    [
      "`--lh-motion-fast` | `160ms`",
      "`--lh-motion-medium` | `280ms`",
      "`--lh-motion-slow` | `520ms`",
      "`--lh-ease-standard` | `cubic-bezier(0.25, 1, 0.5, 1)`",
      "`--lh-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)`",
    ].forEach((token) => {
      expect(tokensDoc).toContain(token);
    });

    const focusVisibleBlock = extractCssBlock(globals, ":focus-visible");

    expect(focusVisibleBlock).toContain("outline: 2px solid var(--lh-focus-outline);");
    expect(focusVisibleBlock).toContain("outline-offset: var(--lh-focus-offset);");
    expect(focusVisibleBlock).toContain("box-shadow: var(--shadow-focus);");
    expect(focusVisibleBlock).not.toContain("outline: none;");
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

    expect(globals).toContain('--font-hei-stack: "PingFang SC", "PingFang TC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans SC", sans-serif;');
    expect(globals).toContain('--font-serif-stack: "Source Han Serif SC", "Noto Serif SC", "Songti SC", SimSun, serif;');
    expect(globals).toContain('--font-noto-stack: "Source Han Serif SC", "Noto Serif SC", "Songti SC", SimSun, serif;');
    expect(globals).toContain("--font-sans-stack: var(--font-hei-stack);");
    expect(globals).not.toContain("--font-hei-stack: Aptos");
    expect(globals).not.toContain("Playfair Display");
    expect(globals).not.toContain("--font-wenkai-stack:");
    expect(globals).not.toContain("LXGW WenKai");
    expect(globals).not.toContain("霞鹜文楷");
    expect(globals).not.toContain('html[data-lighthouse-typeface="hei"]');
    expect(globals).not.toContain('html[data-lighthouse-typeface="wenkai"]');
  });

  it("maps typography roles into runtime CSS tokens and Tailwind aliases", () => {
    const globals = readProjectFile("src/app/globals.css");

    [
      "--type-caption: 0.75rem;",
      "--type-label: 0.8125rem;",
      "--type-control: 0.875rem;",
      "--type-body: 0.9375rem;",
      "--type-reading: 1rem;",
      "--type-lead: 1.25rem;",
      "--type-h3: 1.5625rem;",
      "--type-h2: 1.9375rem;",
      "--type-display: clamp(2.5rem, 5vw, 4.5rem);",
      "--title-page: clamp(2rem, 3vw, 2.75rem);",
      "--title-section: var(--type-h2);",
      "--title-card: var(--type-lead);",
      "--leading-control: 1.25rem;",
      "--leading-body: 1.5rem;",
      "--leading-reading: 1.75rem;",
      "--tracking-kicker: 0.12em;",
      "--weight-bold: 700;",
      "--weight-extrabold: 800;",
      "--weight-black: 900;",
      "--text-control: var(--type-control);",
      "--text-title-page: var(--title-page);",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });
  });

  it("keeps shared primitives and navigation bound to typography tokens", () => {
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const navigation = readProjectFile("src/components/layout/Navigation.tsx");
    const sharedSources = primitives + navigation;

    [
      "text-[length:var(--type-control)]",
      "text-[length:var(--type-caption)]",
      "text-[length:var(--type-body)]",
      "text-[length:var(--type-reading)]",
      "text-[length:var(--title-page)]",
      "font-[var(--weight-bold)]",
      "font-[var(--weight-extrabold)]",
      "font-[var(--weight-black)]",
      "leading-[var(--leading-control)]",
      "leading-[var(--leading-caption)]",
      "leading-[var(--leading-body)]",
      "tracking-[var(--tracking-kicker)]",
      "focus-visible:border-[var(--lh-focus-outline)]",
      "data-lh-nav-sub-label",
      "data-lh-nav-label",
    ].forEach((token) => {
      expect(sharedSources).toContain(token);
    });

    [
      /\btext-xs\b/,
      /\btext-sm\b/,
      /\btext-base\b/,
      /\btext-2xl\b/,
      /\btext-3xl\b/,
      /\bfont-bold\b/,
      /\bfont-extrabold\b/,
      /\bleading-6\b/,
      /outline-none/,
      /focus:border-signal/,
      /text-primary-deep/,
    ].forEach((pattern) => {
      expect(sharedSources).not.toMatch(pattern);
    });
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

  it("keeps the Heart homepage cohesive as an editorial prologue instead of colored card fragments", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");
    const globals = readProjectFile("src/app/globals.css");
    const visualSpec = readProjectFile("docs/design/lighthouse-classic-amber-visual-spec.html");

    [
      "data-lh-heart-page",
      "data-lh-heart-prologue",
      "data-lh-heart-origin",
      "data-lh-heart-value-scroll",
      "data-lh-heart-guide-list",
      "data-lh-heart-closing",
      "data-lh-heart-title-line",
    ].forEach((token) => {
      expect(heartPage).toContain(token);
      expect(globals).toContain(`[${token}]`);
    });

    expect(heartPage).not.toContain("valueToneStyles");
    expect(heartPage).not.toContain("--value-color");
    expect(heartPage).not.toContain("bg-[linear-gradient(135deg,var(--color-primary-deep),var(--color-primary))]");
    expect(heartPage).not.toContain("md:grid-cols-3");
    expect(heartPage).not.toContain("xl:grid-cols-4");
    expect(globals).toContain("[data-lh-heart-value-item]");
    expect(globals).toContain("[data-lh-heart-guide-link]");
    expect(globals).toContain("@keyframes lh-heart-rise-in");
    expect(globals).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toContain("transition: background-color var(--lh-motion-medium) var(--lh-ease-standard), border-color var(--lh-motion-medium) var(--lh-ease-standard), transform var(--lh-motion-medium) var(--lh-ease-out);");
    expect(visualSpec).toContain('<section id="motion" class="section">');
    expect(visualSpec).toContain("--lh-motion-fast: 160ms;");
    expect(visualSpec).toContain("首页/本心文化序章收至 36-57px");
    expect(visualSpec).toContain("Home / Heart Cultural Prologue");
    expect(visualSpec).toContain("prefers-reduced-motion");
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
      "LhBackLink",
      "LhContentProse",
      "LhStateNotice",
      "LhEmptyState",
    ].forEach((componentName) => {
      expect(primitives).toMatch(new RegExp(`export (?:const|function) ${componentName}\\b`));
    });

    expect(primitives).toContain("rounded-[var(--lh-card-radius)]");
    expect(primitives).toContain("shadow-[var(--lh-card-shadow)]");
    expect(primitives).toContain("rounded-[var(--lh-control-radius)]");
    expect(featureCard).toContain("aspect-[1.618/1]");
    expect(featureCard).toContain("rounded-[var(--lh-card-radius)]");
  });

  it("uses readable text tokens for primitive states and local Solar search icons", () => {
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const icons = readProjectFile("src/components/ui/lighthouse-icons.ts");
    const iconData = readProjectFile("src/components/ui/lighthouse-icon-data.ts");

    [
      "text-primary-text",
      "text-signal-text",
      "text-brass-text",
      "text-success-text",
      "text-warning-text",
      "text-danger-text",
      "text-info-text",
      "focus-visible:border-[var(--lh-focus-outline)]",
    ].forEach((token) => {
      expect(primitives).toContain(token);
    });

    [
      /(^|[\s"`])text-primary(?=[\s"`])/,
      /(^|[\s"`])text-brass(?=[\s"`])/,
      /(^|[\s"`])text-danger(?=[\s"`])/,
      /(^|[\s"`])text-warning(?=[\s"`])/,
      /(^|[\s"`])text-success(?=[\s"`])/,
      /(^|[\s"`])text-info(?=[\s"`])/,
      /focus:border-signal/,
      /focus:border-danger/,
    ].forEach((pattern) => {
      expect(primitives).not.toMatch(pattern);
    });

    expect(icons).toContain('search: solarIcon("magnifer-bold-duotone")');
    expect(icons).not.toContain('search: solarIcon("magnifer-linear")');
    expect(iconData).toContain('"magnifer-bold-duotone"');
  });

  it("promotes Action page reading patterns into page-level primitives", () => {
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const globals = readProjectFile("src/app/globals.css");
    const actionPage = readProjectFile("src/app/action/page.tsx");
    const actionDetail = readProjectFile("src/app/action/ActionCaseDetailView.tsx");
    const componentsDoc = readProjectFile("docs/design/components.md");
    const patternsDoc = readProjectFile("docs/design/patterns.md");

    [
      "data-lh-back-link",
      "data-lh-content-prose",
      "data-lh-state-notice",
      "data-lh-empty-state",
    ].forEach((token) => {
      expect(primitives).toContain(token);
    });

    [
      "LhBackLink",
      "LhContentProse",
      "LhStateNotice",
      "LhEmptyState",
    ].forEach((componentName) => {
      expect(primitives).toMatch(new RegExp(`export (?:const|function) ${componentName}\\b`));
      expect(componentsDoc).toContain(componentName);
    });

    expect(actionPage).toContain("LhEmptyState");
    expect(actionDetail).toContain("LhBackLink");
    expect(actionDetail).toContain("LhContentProse");
    expect(actionDetail).not.toContain("function BackLink");
    expect(actionDetail).not.toContain("action-case-prose");
    expect(actionDetail).not.toContain("h1: ({ children }) => <h2 className");
    expect(actionDetail).not.toContain("h2: ({ children }) => <h3 className");
    expect(actionDetail).not.toContain("h3: ({ children }) => <h4 className");
    expect(globals).toContain("[data-lh-back-link]:focus-visible");
    expect(globals).toContain("box-shadow: 0 0 0 3px var(--lh-focus-halo) !important;");
    expect(globals).toContain("filter: drop-shadow(0 0 2px var(--lh-focus-halo));");

    [
      /outline-none/,
      /(^|[\s"`])text-primary(?=[\s"`])/,
      /(^|[\s"`])text-danger(?=[\s"`])/,
    ].forEach((pattern) => {
      expect(primitives).not.toMatch(pattern);
    });

    expect(patternsDoc).toContain("Action case runtime template");
    expect(patternsDoc).toContain("Markdown or long-form case body uses `LhContentProse`");
  });
});
