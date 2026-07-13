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

const migratedDesignSystemFiles = [
  "src/app/hermit/page.tsx",
  "src/components/hermit/ChatPanel.tsx",
  "src/components/hermit/ChatInput.tsx",
  "src/components/hermit/MessageBubble.tsx",
  "src/app/workshop/WorkshopClient.tsx",
] as const;

const migratedMotionContractFiles = [
  "src/components/layout/Navigation.tsx",
  "src/components/layout/AppShell.tsx",
  "src/components/layout/Header.tsx",
  "src/components/ui/lighthouse-primitives.tsx",
  "src/components/ui/FeatureCard.tsx",
  "src/components/heart/HomeBrandHero.tsx",
  "src/components/hermit/ChatPanel.tsx",
  "src/components/hermit/ChatInput.tsx",
  "src/components/hermit/MessageBubble.tsx",
  "src/app/action/page.tsx",
  "src/app/mirror/page.tsx",
  "src/app/workshop/WorkshopClient.tsx",
  "src/app/admin/AdminHome.tsx",
  "src/app/admin/AdminLoginClient.tsx",
  "src/app/admin/action-cases/AdminActionCasesClient.tsx",
  "src/app/admin/workshop/AdminWorkshopClient.tsx",
] as const;

const forbiddenLocalMotionUtilities = [
  /\bduration-(?:150|200|300|500|700)\b/,
  /\banimate-spin\b/,
  /\btransition-all\b/,
  /transition:\s*all/,
] as const;

const forbiddenLocalVisualUtilities = [
  /\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/,
  /\bfont-(?:bold|extrabold|black)\b/,
  /\brounded-sm\b/,
  /\bshadow-lh(?:-sm|-md|-deck)?\b/,
  /\b[hw]-(?:3\.5|4|5|9)\b/,
  /bg-\[linear-gradient/,
  /text-primary-deep/,
  /text-muted/,
  /text-ink-soft/,
  /style=\{\{[^}]*?(?:borderColor|boxShadow|background|color):/,
] as const;

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
      "--lh-motion-popover: 180ms;",
      "--lh-motion-medium: 280ms;",
      "--lh-motion-slow: 520ms;",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    [
      "`--lh-motion-fast` | `160ms`",
      "`--lh-motion-popover` | `180ms`",
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

  it("keeps operational forms readable and aligned with shared field primitives", () => {
    const globals = readProjectFile("src/app/globals.css");
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const tokensDoc = readProjectFile("docs/design/tokens.md");

    [
      "--lh-muted: color-mix(in srgb, #2c2c2c 72%, white);",
      "--lh-on-primary: #242424;",
      "--lh-primary-hover: #d27200;",
      "--color-on-primary: var(--lh-on-primary);",
      "--color-primary-hover: var(--lh-primary-hover);",
      "font-family: inherit;",
      'html[data-lighthouse-interface="classic"] [data-lh-operational-page-header] h1',
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    expect(globals).not.toContain("font: inherit;");

    [
      "text-[color:var(--color-on-primary)]",
      "hover:bg-[color:var(--color-primary-hover)]",
      "export function LhOperationalPageHeader",
      "data-lh-operational-page-header",
      "data-lh-field",
      "optionalLabel?: React.ReactNode",
      "`${id}-helper`",
      "`${id}-error`",
    ].forEach((token) => {
      expect(primitives).toContain(token);
    });

    [
      "`--color-muted` | `color-mix(in srgb, #2c2c2c 72%, white)`",
      "`--color-on-primary` | `#242424`",
      "`--color-primary-hover` | `#d27200`",
    ].forEach((token) => {
      expect(tokensDoc).toContain(token);
    });
  });

  it("defines the shared form rhythm contract across runtime, primitives, and design docs", () => {
    const globals = readProjectFile("src/app/globals.css");
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const tokensDoc = readProjectFile("docs/design/tokens.md");
    const componentsDoc = readProjectFile("docs/design/components.md");
    const doDontDoc = readProjectFile("docs/design/do-dont.md");
    const visualSpec = readProjectFile("docs/design/lighthouse-classic-amber-visual-spec.html");

    [
      "--lh-form-label-control-gap: 0.5rem;",
      "--lh-form-control-message-gap: 0.5rem;",
      "--lh-form-message-gap: 0.5rem;",
      "--lh-form-field-gap: 1.25rem;",
      "--lh-form-content-action-gap: 1.5rem;",
      "--lh-form-legend-choice-gap: 0.5rem;",
      "[data-lh-form-stack]",
      "[data-lh-field-control]",
      "[data-lh-field-messages]",
      "[data-lh-field-group]",
      "[data-lh-choice-group]",
      "[data-lh-form-actions]",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    [
      "export function LhFieldGroup",
      "export const LhChoiceGroup",
      "data-lh-field-label",
      "data-lh-field-control",
      "data-lh-field-messages",
      "data-lh-field-group",
      "data-lh-field-legend",
      "data-lh-choice-group",
    ].forEach((token) => {
      expect(primitives).toContain(token);
    });

    expect(primitives).toContain("helperText &&");
    expect(primitives).toContain("error &&");
    expect(primitives).not.toContain('data-lh-field className="grid gap-2"');

    [tokensDoc, componentsDoc, doDontDoc, visualSpec].forEach((document) => {
      expect(document).toContain("--lh-form-field-gap");
      expect(document).toContain("LhFieldGroup");
      expect(document).toContain("LhChoiceGroup");
    });
  });

  it("defines the runtime motion contract before page-level animation work", () => {
    const globals = readProjectFile("src/app/globals.css");
    const motionHooks = readProjectFile("src/hooks/use-lighthouse-motion.ts");
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const navigation = readProjectFile("src/components/layout/Navigation.tsx");
    const chatPanel = readProjectFile("src/components/hermit/ChatPanel.tsx");
    const tokensDoc = readProjectFile("docs/design/tokens.md");
    const componentsDoc = readProjectFile("docs/design/components.md");
    const patternsDoc = readProjectFile("docs/design/patterns.md");
    const doDontDoc = readProjectFile("docs/design/do-dont.md");

    [
      "export function useLhReducedMotion",
      "export function useLhScrollProgress",
      "export function useLhElementScrollProgress",
      'window.matchMedia("(prefers-reduced-motion: reduce)")',
      "window.requestAnimationFrame",
      'window.addEventListener("scroll", scheduleUpdate, { passive: true })',
    ].forEach((token) => {
      expect(motionHooks).toContain(token);
    });

    [
      "[data-lh-popover]",
      "@keyframes lh-popover-enter",
      "[data-lh-loading-glyph]",
      "@keyframes lh-loading-rotate",
      "--lh-motion-popover: 180ms;",
      "@media (prefers-reduced-motion: reduce)",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    [
      "export function LhLoadingGlyph",
      "data-lh-loading-glyph",
      "role=\"status\"",
      "aria-label={label}",
    ].forEach((token) => {
      expect(primitives).toContain(token);
    });

    [
      "useLhScrollProgress",
      "data-lh-popover",
      "aria-expanded={isSearchOpen}",
      "aria-expanded={isOpen}",
    ].forEach((token) => {
      expect(navigation).toContain(token);
    });

    expect(chatPanel).toContain('behavior: prefersReducedMotion ? "auto" : "smooth"');
    expect(globals).not.toContain("transition-property: width, height, top, left, padding");
    expect(globals).not.toContain("transition-duration: 300ms");

    [
      "Runtime scroll effects use `useLhScrollProgress` or `useLhElementScrollProgress`",
      "Anchored popovers use `[data-lh-popover]`",
      "Loading indicators use `LhLoadingGlyph`",
      "New motion behavior",
      "naked `duration-150`, `duration-300`, `transition-all`, or `transition: all`",
    ].forEach((token) => {
      expect(`${tokensDoc}\n${componentsDoc}\n${patternsDoc}\n${doDontDoc}`).toContain(token);
    });
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
      'html[data-lighthouse-interface="classic"] [data-lh-sidebar][data-expanded="false"]:not([data-mobile])',
      'html[data-lighthouse-interface="classic"] [data-lh-nav-link]',
      'html[data-lighthouse-interface="classic"] [data-lh-home-brand-hero]',
      'html[data-lighthouse-interface="classic"] [data-lh-page-hero]',
      'html[data-lighthouse-interface="classic"] [data-lh-card]',
      "font-family: var(--font-serif-stack);",
      "--lh-surface: rgba(255, 255, 255, 0.64);",
      "--lh-surface-solid: rgba(255, 255, 255, 0.76);",
      "--lh-work-shadow: 0 16px 42px rgba(76, 54, 26, 0.08);",
      "drop-shadow(0 0 8px rgba(217, 119, 6, 0.5))",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    [
      "data-lh-shell",
      "data-lh-home-shell",
      "data-lh-main",
      "data-lh-home-main",
      "data-lh-main-frame",
      "React.useState(false)",
      "md:pl-[var(--lh-classic-main-offset)]",
      "md:pl-[var(--lh-classic-main-collapsed-offset)]",
    ].forEach((token) => {
      expect(appShell).toContain(token);
    });

    ["data-lh-header", "data-lh-header-bar"].forEach((token) => {
      expect(header).toContain(token);
    });

    [
      "data-lh-sidebar",
      "data-lh-logo",
      "data-lh-nav-link",
      "data-lh-sidebar-toggle",
      "data-lh-sidebar-nav-group",
      "data-lh-sidebar-notification-button",
    ].forEach((token) => {
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
    const systemPrompt = readProjectFile("src/lib/hermit/system-prompt.ts");
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const chatPanelContract = `${chatPanel}\n${primitives}`;
    const chatInputContract = `${chatInput}\n${primitives}`;
    const messageBubbleContract = `${messageBubble}\n${primitives}`;
    const hermitCss = globals.slice(
      globals.indexOf('html[data-lighthouse-interface="classic"] [data-lh-hermit-page]'),
      globals.indexOf('html[data-lighthouse-interface="classic"] [data-lh-meta-list]'),
    );

    [
      "data-lh-hermit-page",
      "data-lh-hermit-intro",
      "data-lh-hermit-title",
      "data-lh-hermit-title-cn",
      "data-lh-hermit-title-en",
      "data-lh-hermit-chat-frame",
      'data-lh-page-archetype="tool-workspace"',
    ].forEach((token) => {
      expect(hermitPage).toContain(token);
    });

    [
      "getLocalGreeting",
      "isVisibleMessage",
      "shouldShowThinkingIndicator",
      "visibleMessages",
      "showThinkingIndicator",
      "深夜辛苦了",
      "我们来讨论什么服务场景？",
      "data-lh-hermit-start",
      "data-lh-hermit-start-inner",
      "data-lh-hermit-start-title",
      "data-lh-hermit-greeting",
      "data-lh-hermit-start-input",
      "data-lh-hermit-start-examples",
      "getConversationTitle",
      "data-lh-hermit-conversation",
      "data-lh-hermit-conversation-bar",
      "data-lh-hermit-conversation-topic",
      "data-lh-hermit-conversation-status",
      "data-lh-hermit-main",
      "data-lh-hermit-footer",
      "data-lh-hermit-composer",
      "LhSuggestionList",
      "hideLabel",
      "交车时间未定，客户持续追问",
      "客户诉求与门店成本冲突",
      "客户情绪升高，先稳住第一句话",
    ].forEach((token) => {
      expect(chatPanel).toContain(token);
    });

    expect(chatPanel).not.toContain("<button");
    expect(chatPanel).not.toMatch(/data-lh-hermit-start-example(?:[\s=>]|$)/);

    ["LhChatShell", "LhChatHeader", "LhChatFooter", "data-lh-hermit-panel-header"].forEach((token) => {
      expect(chatPanel).not.toContain(token);
    });

    ["data-lh-chat-input", "data-lh-chat-input-grid", "data-lh-chat-textarea", "data-lh-chat-submit"].forEach((token) => {
      expect(chatInputContract).toContain(token);
    });

    ["data-lh-focus-origin", "focusIntentRef", "onPointerDownCapture", "onKeyDownCapture", "onFocusCapture", "onBlurCapture"].forEach((token) => {
      expect(chatInput).toContain(token);
    });

    ["data-lh-message-row", "data-lh-message-avatar", "data-lh-message-bubble", "data-lh-message-prose"].forEach((token) => {
      expect(messageBubbleContract).toContain(token);
    });

    expect(messageBubbleContract).toContain("data-lh-message-meta-note");
    expect(messageBubbleContract).toContain("splitAssistantAnswer");
    expect(messageBubbleContract).toContain("data-lh-answer-structure");
    expect(messageBubbleContract).toContain("data-lh-answer-section");
    expect(messageBubbleContract).toContain('import remarkGfm from "remark-gfm"');
    expect(messageBubbleContract).toContain("remarkPlugins={[remarkGfm]}");
    expect(messageBubbleContract).toContain("normalizeMarkdownTableSeparators");
    expect(messageBubbleContract).toContain("data-lh-message-table-wrap");
    expect(messageBubbleContract).toContain("data-lh-message-table");
    expect(messageBubbleContract).toContain("直接建议");
    expect(messageBubbleContract).toContain("判断依据");
    expect(messageBubbleContract).toContain("相关案例 / 规范");
    expect(messageBubbleContract).toContain("下一步动作");
    expect(messageBubbleContract).toContain('label = "思考中"');
    expect(chatPanel).toContain('<TypingIndicator label="思考中" />');

    ["LhSuggestionList", "data-lh-suggestion-list", "data-lh-suggestion-button", "data-lh-hermit-start-examples"].forEach((token) => {
      expect(chatPanelContract).toContain(token);
    });

    [
      "LhChatShell",
      "LhChatHeader",
      "LhChatMain",
      "LhChatFooter",
      "LhChatInputShell",
      "LhChatTextarea",
      "LhChatSubmitButton",
      "LhMessageRow",
      "LhMessageAvatar",
      "LhMessageBubble",
      "LhSuggestionList",
    ].forEach((token) => {
      expect(primitives).toContain(token);
    });

    [
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-page]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-conversation]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-conversation-bar]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-composer]',
      'html[data-lighthouse-interface="classic"] [data-lh-chat-scroll-content]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-start]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-start-title]',
      'html[data-lighthouse-interface="classic"] [data-lh-suggestion-button]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-main]',
      'html[data-lighthouse-interface="classic"] [data-lh-chat-input]',
      'html[data-lighthouse-interface="classic"] [data-lh-message-bubble]',
      'html[data-lighthouse-interface="classic"] [data-lh-hermit-conversation] [data-lh-message-bubble]',
      'html[data-lighthouse-interface="classic"] [data-lh-message-prose]',
      'html[data-lighthouse-interface="classic"] [data-lh-message-table-wrap]',
      'html[data-lighthouse-interface="classic"] [data-lh-message-table]',
      'html[data-lighthouse-interface="classic"] [data-lh-answer-structure]',
      'html[data-lighthouse-interface="classic"] [data-lh-answer-section]',
      "@keyframes lh-message-enter",
      "prefers-reduced-motion: no-preference",
      "prefers-reduced-motion: reduce",
      "--font-noto-stack:",
      "--font-noto: var(--font-noto-stack);",
      "font-family: var(--font-noto-stack);",
      "border-color: transparent !important;",
      "box-shadow: none !important;",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    ["0 30px", "0 36px", "0 24px 70px", "0 28px 78px"].forEach((token) => {
      expect(hermitCss).not.toContain(token);
    });

    expect(hermitCss).not.toMatch(/\[data-lh-chat-textarea\][^{]*:focus[\s\S]{0,180}outline:\s*0/);
    expect(hermitCss).toContain("outline: 2px solid var(--lh-focus-outline);");
    expect(hermitCss).toContain("outline-offset: var(--lh-focus-offset);");
    expect(hermitCss).toContain("box-shadow: var(--shadow-focus);");
    expect(hermitCss).toContain('[data-lh-chat-input][data-lh-focus-origin="pointer"] [data-lh-chat-textarea]:focus-visible');
    expect(hermitCss).toContain("outline-color: transparent;");
    expect(hermitCss).toContain('[data-lh-chat-input][data-lh-focus-origin="keyboard"] [data-lh-chat-textarea]:focus-visible');
    expect(hermitCss).toContain("outline: 2px solid color-mix(in srgb, var(--lh-focus-outline) 70%, transparent);");
    expect(hermitCss).not.toMatch(/\[data-lh-chat-input\]\[data-lh-focus-origin="pointer"\][\s\S]{0,180}outline:\s*(?:0|none)/);
    expect(chatInput).not.toContain("outline-none");
    expect(`${chatPanel}\n${chatInput}\n${messageBubble}`).not.toMatch(/\banimate-/);
    expect(systemPrompt).toContain("合法 GFM 表格语法");
    expect(systemPrompt).toContain("|---|---|");
    expect(systemPrompt).toContain("不要使用中文长横线");
  });

  it("lets Workshop inherit shared page-level primitives before full page migration", () => {
    const globals = readProjectFile("src/app/globals.css");
    const workshop = readProjectFile("src/app/workshop/WorkshopClient.tsx");
    const primitives = readProjectFile("src/components/ui/lighthouse-primitives.tsx");
    const contract = `${workshop}\n${primitives}`;

    [
      "LhMetaList",
      "LhSegmentedControl",
      "LhSubmissionCard",
      "LhStateNotice",
      "LhEmptyState",
    ].forEach((token) => {
      expect(workshop).toContain(token);
    });

    [
      "data-lh-meta-list",
      "data-lh-segmented-control",
      "data-lh-segment",
      "data-lh-submission-card",
      "data-lh-submission-card-header",
      "data-lh-submission-card-footer",
      "data-lh-workshop-page",
      "data-lh-workshop-section-tabs",
      "data-lh-workshop-two-column",
      "data-lh-workshop-filter-panel",
      "data-lh-workshop-form",
      "data-lh-workshop-card-list",
      "data-lh-workshop-footer-grid",
    ].forEach((token) => {
      expect(contract).toContain(token);
      expect(globals).toContain(token);
    });
  });

  it("keeps a fixed body typeface without runtime typeface switching", () => {
    const globals = readProjectFile("src/app/globals.css");

    expect(globals).toContain('@font-face');
    expect(globals).toContain('font-family: "Source Han Sans SC";');
    expect(globals).toContain('url("/fonts/brand/source-han-sans-cn/SourceHanSansCN-Regular.otf") format("opentype")');
    expect(globals).toContain('url("/fonts/brand/source-han-sans-cn/SourceHanSansCN-Medium.otf") format("opentype")');
    expect(globals).toContain('url("/fonts/brand/source-han-sans-cn/SourceHanSansCN-Bold.otf") format("opentype")');
    expect(globals).toContain('url("/fonts/brand/smiley-sans/SmileySans-Oblique.woff2") format("woff2")');
    expect(globals).toContain('--font-hei-stack: "Source Han Sans SC", "PingFang SC", "PingFang TC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif;');
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

  it("keeps migrated pages from defining local visual utilities after migration", () => {
    migratedDesignSystemFiles.forEach((file) => {
      const source = readProjectFile(file);

      forbiddenLocalVisualUtilities.forEach((pattern) => {
        expect(source, `${file} should inherit visual styles from Lighthouse primitives instead of ${pattern}`).not.toMatch(pattern);
      });
    });
  });

  it("keeps migrated motion surfaces on the Lighthouse runtime contract", () => {
    migratedMotionContractFiles.forEach((file) => {
      const source = readProjectFile(file);

      forbiddenLocalMotionUtilities.forEach((pattern) => {
        expect(source, `${file} should use motion tokens and shared primitives instead of ${pattern}`).not.toMatch(pattern);
      });
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

  it("binds migrated pages to runtime page archetypes instead of one-off visual treatments", () => {
    const globals = readProjectFile("src/app/globals.css");
    const heartPage = readProjectFile("src/app/heart/page.tsx");
    const hermitPage = readProjectFile("src/app/hermit/page.tsx");
    const actionPage = readProjectFile("src/app/action/page.tsx");
    const workshopPage = readProjectFile("src/app/workshop/WorkshopClient.tsx");
    const visualSpec = readProjectFile("docs/design/lighthouse-classic-amber-visual-spec.html");
    const patternsDoc = readProjectFile("docs/design/patterns.md");

    [
      'data-lh-page-archetype="cultural-reading"',
      'data-lh-page-archetype="tool-workspace"',
      'data-lh-page-archetype="case-workflow"',
      'data-lh-page-archetype="workflow"',
    ].forEach((token) => {
      expect(`${heartPage}\n${hermitPage}\n${actionPage}\n${workshopPage}\n${visualSpec}\n${patternsDoc}`).toContain(token);
    });

    [
      '[data-lh-page-archetype="cultural-reading"]',
      '[data-lh-page-archetype="tool-workspace"]',
      '[data-lh-page-archetype="case-workflow"]',
      '[data-lh-page-archetype="workflow"]',
      "--lh-ink-readable: rgba(44, 44, 44, 0.76);",
      "--lh-surface-reading: rgba(255, 255, 255, 0.52);",
      "--lh-page-shadow: 0 10px 30px rgba(86, 64, 32, 0.06);",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    expect(actionPage).toContain("data-lh-action-card");
    expect(actionPage).toContain("data-lh-action-question");
    expect(actionPage).toContain("data-lh-action-keynodes");
    expect(hermitPage).not.toContain('className="hidden"');
    expect(globals).not.toContain("filter: blur(3px)");
  });

  it("documents page-level style contracts for Heart and Hermit before page-specific styling", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");
    const hermitPage = readProjectFile("src/app/hermit/page.tsx");
    const visualSpec = readProjectFile("docs/design/lighthouse-classic-amber-visual-spec.html");
    const patternsDoc = readProjectFile("docs/design/patterns.md");

    [
      'data-lh-page="heart"',
      'data-lh-page="hermit"',
    ].forEach((token) => {
      expect(`${heartPage}\n${hermitPage}\n${visualSpec}\n${patternsDoc}`).toContain(token);
    });

    [
      "Page style contract",
      "本心 / Heart",
      "路引 / Hermit",
      "首屏",
      "禁用",
      "Hidden context header",
      "Five independent value themes",
    ].forEach((token) => {
      expect(`${visualSpec}\n${patternsDoc}`).toContain(token);
    });
  });

  it("keeps the Heart homepage cohesive as an editorial prologue instead of colored card fragments", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");
    const homeBrandHero = readProjectFile("src/components/heart/HomeBrandHero.tsx");
    const motionHooks = readProjectFile("src/hooks/use-lighthouse-motion.ts");
    const globals = readProjectFile("src/app/globals.css");
    const visualSpec = readProjectFile("docs/design/lighthouse-classic-amber-visual-spec.html");
    const heartSurface = `${heartPage}\n${homeBrandHero}`;

    [
      "data-lh-heart-page",
      "data-lh-heart-prologue",
      "data-lh-heart-origin",
      "data-lh-heart-value-scroll",
      "data-lh-heart-guide-list",
      "data-lh-heart-closing",
      "data-lh-home-brand-hero",
      "data-lh-home-brand-bg",
      "data-lh-home-brand-veil",
      "data-lh-home-brand-title",
      "data-lh-home-brand-path",
    ].forEach((token) => {
      expect(heartSurface).toContain(token);
      expect(globals).toContain(`[${token}]`);
    });

    expect(homeBrandHero).toContain("useLhElementScrollProgress");
    expect(motionHooks).toContain("requestAnimationFrame");
    expect(motionHooks).toContain("prefers-reduced-motion: reduce");
    expect(heartPage).not.toContain("LhPageHero");
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
    expect(visualSpec).toContain("Home Brand Display");
    expect(visualSpec).toContain("data-lh-home-brand-title");
    expect(visualSpec).toContain("64-100px");
    expect(visualSpec).toContain("Immersive Home Shell");
    expect(visualSpec).toContain("Home / Heart Brand Prologue");
    expect(visualSpec).toContain("prefers-reduced-motion");
    expect(visualSpec).toContain("data-motion-preview");
    expect(visualSpec).toContain("data-motion-loading-toggle");
    expect(visualSpec).toContain("data-scroll-preview");
    expect(visualSpec).toContain("loading-glyph");
  });

  it("keeps the homepage sidebar subdued on the dark hero and restores the normal shell on scroll", () => {
    const globals = readProjectFile("src/app/globals.css");
    const appShell = readProjectFile("src/components/layout/AppShell.tsx");
    const navigation = readProjectFile("src/components/layout/Navigation.tsx");
    const motionHooks = readProjectFile("src/hooks/use-lighthouse-motion.ts");

    [
      "isHomeSurface={isHomeSurface}",
      'pathname === "/" || pathname === "/heart"',
    ].forEach((token) => {
      expect(appShell).toContain(token);
    });

    [
      "isHomeSurface?: boolean",
      "desktopSidebarRef",
      "--lh-home-nav-progress",
      "--lh-home-nav-progress-value",
      "useLhScrollProgress",
      'data-home-surface={isHomeSurface ? "true" : undefined}',
    ].forEach((token) => {
      expect(navigation).toContain(token);
    });

    expect(motionHooks).toContain("window.requestAnimationFrame");

    [
      '[data-lh-sidebar][data-home-surface="true"][data-expanded="false"]:not([data-mobile])',
      "--lh-home-nav-progress",
      "--lh-home-nav-progress-value",
      "color-mix(in srgb, rgba(250, 244, 229, 0.94) var(--lh-home-nav-progress, 0%), rgba(35, 35, 31, 0.34))",
      "[data-lh-sidebar-search-trigger]",
      "[data-lh-sidebar-notification-button]",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });

    expect(globals).not.toContain('[data-lh-sidebar][data-expanded="false"]:not([data-mobile]) [data-lh-nav-link] { color: color-mix');
  });

  it("keeps the visual system docs aligned with the homepage brand cover and shell variants", () => {
    const visualSpec = readProjectFile("docs/design/lighthouse-classic-amber-visual-spec.html");
    const tokens = readProjectFile("docs/design/tokens.md");
    const components = readProjectFile("docs/design/components.md");
    const patterns = readProjectFile("docs/design/patterns.md");
    const doDont = readProjectFile("docs/design/do-dont.md");
    const docs = `${visualSpec}\n${tokens}\n${components}\n${patterns}\n${doDont}`;

    [
      "Home Brand Display",
      "Home / Heart Brand Prologue",
      "Operational Shell",
      "Immersive Home Shell",
      "data-lh-home-brand-title",
      'data-home-surface="true"',
      "--lh-home-nav-progress",
      "Homepage / Heart may use scroll progress",
      "Home and Heart are one surface",
      "single approved background image",
    ].forEach((token) => {
      expect(docs).toContain(token);
    });

    expect(docs).not.toContain("Home currently routes to Heart");
    expect(docs).not.toContain("Home / Heart Cultural Prologue");
    expect(docs).not.toContain("36-57px");
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
      "LhFieldGroup",
      "LhChoiceGroup",
      "LhSearchBox",
      "LhPageHero",
      "LhDataTableShell",
      "LhCallout",
      "LhMetricTile",
      "LhBackLink",
      "LhContentProse",
      "LhStateNotice",
      "LhEmptyState",
      "LhLoadingGlyph",
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
