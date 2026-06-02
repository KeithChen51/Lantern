# Classic Amber Interface Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a switchable Classic Amber interface mode that carries the old `codex/main-backup-20260531` visual language while keeping the current `main` content, routes, data model, and behavior intact.

**Architecture:** Treat the old branch as a visual reference only. Keep current pages and data as the single source of truth, add a separate `data-lighthouse-interface` appearance attribute, and let layout, shell, primitives, and page surfaces respond to that mode through shared tokens and small component variants.

**Tech Stack:** Next.js App Router, React client components, Tailwind CSS v4 tokens, Vitest static/unit tests, local browser screenshot verification.

---

## Non-Negotiables

- Do not copy old page files from `codex/main-backup-20260531` into `src/app/*`.
- Do not reintroduce old content such as the old Heart four-value structure or the old Action case.
- Keep `src/components/layout/header-search.ts` as the search source; do not restore inline `SEARCH_TARGETS`.
- Keep Hermit persistence and current Workshop/Admin behavior.
- Use the old branch only for visual cues: amber paper palette, serif tone, paper texture, soft glass cards, rounded cards, old shell rhythm, lighthouse identity.

## Visual Target

- Interface name: `Classic Amber`
- Tone: warm editorial service-culture workbook, not a dark dashboard or generic SaaS panel.
- Memory from old branch:
  - `codex/main-backup-20260531:src/app/globals.css` for `#F3EFE0`, `#2C2C2C`, `#D97706`, paper texture, serif headings.
  - `codex/main-backup-20260531:src/components/layout/Navigation.tsx` for soft left rail, lighthouse mark, amber active states.
  - `codex/main-backup-20260531:src/components/ui/FeatureCard.tsx` for golden-ratio image cards.
  - `codex/main-backup-20260531:src/app/heart/page.tsx` for glass card density and rounded surface feel only.

---

### Task 1: Add Appearance Mode Model

**Files:**
- Create: `src/components/layout/appearance-mode.ts`
- Create: `src/components/layout/appearance-mode.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/layout/ThemeSwitcher.tsx`

**Step 1: Write the failing test**

Create `src/components/layout/appearance-mode.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import {
  INTERFACE_DATA_ATTRIBUTE,
  INTERFACE_STORAGE_KEY,
  INTERFACE_MODES,
  isLighthouseInterface,
} from "./appearance-mode";

describe("appearance mode", () => {
  it("defines a separate interface mode contract", () => {
    expect(INTERFACE_DATA_ATTRIBUTE).toBe("data-lighthouse-interface");
    expect(INTERFACE_STORAGE_KEY).toBe("lighthouse-app-interface");
    expect(INTERFACE_MODES.map((mode) => mode.id)).toEqual(["modern", "classic"]);
  });

  it("validates interface ids", () => {
    expect(isLighthouseInterface("modern")).toBe(true);
    expect(isLighthouseInterface("classic")).toBe(true);
    expect(isLighthouseInterface("truth")).toBe(false);
    expect(isLighthouseInterface(null)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/layout/appearance-mode.test.ts
```

Expected: FAIL because `appearance-mode.ts` does not exist.

**Step 3: Implement the appearance model**

Create `src/components/layout/appearance-mode.ts` with:

```ts
export const THEME_STORAGE_KEY = "lighthouse-app-theme-v2";
export const TYPEFACE_STORAGE_KEY = "lighthouse-app-typeface";
export const INTERFACE_STORAGE_KEY = "lighthouse-app-interface";

export const THEME_DATA_ATTRIBUTE = "data-lighthouse-theme";
export const TYPEFACE_DATA_ATTRIBUTE = "data-lighthouse-typeface";
export const INTERFACE_DATA_ATTRIBUTE = "data-lighthouse-interface";

export const INTERFACE_MODES = [
  { id: "modern", label: "现代", shortLabel: "今", title: "现代界面" },
  { id: "classic", label: "经典", shortLabel: "旧", title: "Classic Amber 旧版界面" },
] as const;

export type LighthouseInterface = (typeof INTERFACE_MODES)[number]["id"];

export function isLighthouseInterface(value: string | null): value is LighthouseInterface {
  return INTERFACE_MODES.some((option) => option.id === value);
}
```

Move the existing theme/typeface storage and data-attribute constants from `ThemeSwitcher.tsx` into this file, then import them from `ThemeSwitcher.tsx`.

Modify `src/app/layout.tsx`:

```tsx
<html
  lang="zh-CN"
  data-lighthouse-theme="truth"
  data-lighthouse-typeface="hei"
  data-lighthouse-interface="modern"
  suppressHydrationWarning
>
```

Update `ThemeSwitcher.tsx` to:
- Keep the existing value theme controls.
- Keep the existing typeface controls.
- Add a third segmented control for `INTERFACE_MODES`.
- Read current interface mode from localStorage or DOM.
- Apply it with `document.documentElement.setAttribute(INTERFACE_DATA_ATTRIBUTE, mode)`.
- Persist it with `localStorage.setItem(INTERFACE_STORAGE_KEY, mode)`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/components/layout/appearance-mode.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/layout/appearance-mode.ts src/components/layout/appearance-mode.test.ts src/app/layout.tsx src/components/layout/ThemeSwitcher.tsx
git commit -m "feat(ui): add lighthouse interface mode switch"
```

---

### Task 2: Add Classic Amber CSS Tokens

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/ui/lighthouse-design-system.test.ts`

**Step 1: Write the failing test**

Extend `src/components/ui/lighthouse-design-system.test.ts` with assertions that `globals.css` contains:

```ts
expect(css).toContain('html[data-lighthouse-interface="classic"]');
expect(css).toContain("--lh-classic-amber");
expect(css).toContain("html[data-lighthouse-interface=\"classic\"] body::before");
expect(css).toContain("--lh-card-radius");
expect(css).toContain("--lh-card-shadow");
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/ui/lighthouse-design-system.test.ts
```

Expected: FAIL because the interface selector and classic tokens do not exist.

**Step 3: Add token layer**

Modify `src/app/globals.css`:

- Add default modern interface variables under `:root`:

```css
--lh-interface-card-radius: 8px;
--lh-interface-control-radius: 6px;
--lh-card-radius: var(--lh-interface-card-radius);
--lh-control-radius: var(--lh-interface-control-radius);
--lh-card-shadow: var(--shadow-sm);
--lh-card-hover-shadow: var(--shadow-md);
--lh-shell-blur: none;
--lh-paper-texture-opacity: 0;
--lh-classic-amber: #d97706;
```

- Add a classic interface selector:

```css
html[data-lighthouse-interface="classic"] {
  --lh-ink: #2c2c2c;
  --lh-ink-soft: color-mix(in srgb, #2c2c2c 72%, white);
  --lh-muted: color-mix(in srgb, #2c2c2c 58%, white);
  --lh-page: #f3efe0;
  --lh-panel: color-mix(in srgb, white 42%, #f3efe0);
  --lh-surface: color-mix(in srgb, white 38%, #f3efe0);
  --lh-surface-quiet: color-mix(in srgb, #d97706 8%, #f3efe0);
  --lh-line: rgba(44, 44, 44, 0.08);
  --lh-line-strong: rgba(217, 119, 6, 0.28);
  --lh-primary: #d97706;
  --lh-primary-deep: color-mix(in srgb, #d97706 72%, #2c2c2c);
  --lh-primary-soft: rgba(217, 119, 6, 0.1);
  --lh-action: #d97706;
  --lh-interface-card-radius: 16px;
  --lh-interface-control-radius: 999px;
  --lh-card-shadow: 0 10px 30px rgba(44, 44, 44, 0.06);
  --lh-card-hover-shadow: 0 8px 30px rgba(44, 44, 44, 0.08);
  --lh-shell-blur: blur(2px);
  --lh-paper-texture-opacity: 0.6;
}
```

- Add the paper texture only in classic mode:

```css
html[data-lighthouse-interface="classic"] body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  opacity: var(--lh-paper-texture-opacity);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E");
}
```

Keep the existing value theme selectors. Classic mode should be an interface layer, not a replacement for the value theme system.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/components/ui/lighthouse-design-system.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/globals.css src/components/ui/lighthouse-design-system.test.ts
git commit -m "feat(ui): add classic amber interface tokens"
```

---

### Task 3: Make Shared Primitives Respond To Interface Mode

**Files:**
- Modify: `src/components/ui/lighthouse-primitives.tsx`
- Modify: `src/components/ui/FeatureCard.tsx`
- Modify: `src/components/ui/lighthouse-design-system.test.ts`

**Step 1: Write the failing test**

Extend the static primitive test in `src/components/ui/lighthouse-design-system.test.ts` to assert primitives use shared interface variables:

```ts
expect(primitives).toContain("rounded-[var(--lh-card-radius)]");
expect(primitives).toContain("shadow-[var(--lh-card-shadow)]");
expect(primitives).toContain("rounded-[var(--lh-control-radius)]");

const featureCard = readProjectFile("src/components/ui/FeatureCard.tsx");
expect(featureCard).toContain("aspect-[1.618/1]");
expect(featureCard).toContain("rounded-[var(--lh-card-radius)]");
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/ui/lighthouse-design-system.test.ts
```

Expected: FAIL because current primitives use fixed `rounded-md`, `rounded-sm`, and current `FeatureCard` no longer uses the old golden-ratio layout.

**Step 3: Update primitives**

In `src/components/ui/lighthouse-primitives.tsx`:

- Change cards and panels from fixed radii to shared variables:

```tsx
"rounded-[var(--lh-card-radius)] border border-line bg-surface text-ink shadow-[var(--lh-card-shadow)]"
```

- Change controls from fixed radii to shared variables:

```tsx
"rounded-[var(--lh-control-radius)] border font-bold ..."
```

- Keep component names and props unchanged.
- Do not add page-specific content to primitives.

In `src/components/ui/FeatureCard.tsx`:

- Restore the old branch's golden-ratio card composition as a responsive variant, but keep current props and current text source.
- Use `LhCard` and `LhChip` only if the resulting layout stays stable.
- Preserve current `title`, `description`, `date`, and `imageUrl` props.

**Step 4: Run tests**

Run:

```bash
npm test -- src/components/ui/lighthouse-design-system.test.ts
npm test -- src/components/ui/lighthouse-icons.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/ui/lighthouse-primitives.tsx src/components/ui/FeatureCard.tsx src/components/ui/lighthouse-design-system.test.ts
git commit -m "feat(ui): adapt primitives for classic interface mode"
```

---

### Task 4: Adapt Shell, Header, And Navigation

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Navigation.tsx`
- Modify: `src/components/layout/navigation-model.test.ts`
- Modify: `src/components/layout/header-search.test.ts`

**Step 1: Write regression tests**

Keep existing tests passing and add assertions where useful:

- `navigation-model.test.ts` still expects current labels and current route list.
- `header-search.test.ts` still expects `resolveHeaderSearch` to route to current pages.

Add static assertions that `Header.tsx` still imports `getHeaderSearchMatches` and `resolveHeaderSearch`, not inline backup data:

```ts
const header = readProjectFile("src/components/layout/Header.tsx");
expect(header).toContain("getHeaderSearchMatches");
expect(header).toContain("resolveHeaderSearch");
expect(header).not.toContain("const SEARCH_TARGETS");
```

**Step 2: Run tests to verify current baseline**

Run:

```bash
npm test -- src/components/layout/navigation-model.test.ts src/components/layout/header-search.test.ts
```

Expected: PASS before implementation, or FAIL only on newly added static assertions if helper imports are missing.

**Step 3: Implement shell styling**

In `AppShell.tsx`:

- Keep sidebar pinning behavior unchanged.
- Keep current max-width behavior unless classic mode requires only token-level styling.
- Use CSS variables for selection and page surface only where needed.

In `Header.tsx`:

- Keep search behavior and notification behavior.
- Preserve `ThemeSwitcher` and `PreviewIdentitySwitcher`.
- Update class names so classic mode can look like the old floating soft header:
  - softer paper/glass background
  - rounded controls through `--lh-control-radius`
  - amber focus/hover through existing tokens

In `Navigation.tsx`:

- Keep `getVisibleNavItems()` and current current-route behavior.
- Use the current icon system; do not reintroduce old `isDev` behavior.
- Adapt surfaces and logo mark to classic variables:
  - paper rail
  - amber active marker
  - softer shadow
  - rounded nav links in classic mode through shared variables

**Step 4: Run layout tests**

Run:

```bash
npm test -- src/components/layout/navigation-model.test.ts src/components/layout/header-search.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/Header.tsx src/components/layout/Navigation.tsx src/components/layout/navigation-model.test.ts src/components/layout/header-search.test.ts
git commit -m "feat(ui): adapt shell for classic amber mode"
```

---

### Task 5: Add Content Regression Guardrails

**Files:**
- Create: `src/app/classic-interface-content.test.ts`

**Step 1: Write content guard tests**

Create a static test that prevents accidental rollback to backup content:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("classic interface content guardrails", () => {
  it("keeps the current Heart value structure", () => {
    const heartPage = readProjectFile("src/app/heart/page.tsx");
    expect(heartPage).toContain("求真、尽善、致美、大爱、幸福");
    expect(heartPage).toContain("幸福是最终检验");
  });

  it("keeps the current Action case instead of restoring backup branch content", () => {
    const cases = readProjectFile("src/app/action/action-cases.ts");
    expect(cases).toContain("driver-partner-rest-area");
    expect(cases).toContain("是否为代驾司机设置合作伙伴休息区");
    expect(cases).not.toContain("substitute-vehicle-policy");
  });

  it("keeps current Hermit persistence modules", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/modules/hermit/service.ts"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/modules/hermit/repository.ts"))).toBe(true);
  });
});
```

**Step 2: Run test**

Run:

```bash
npm test -- src/app/classic-interface-content.test.ts
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/app/classic-interface-content.test.ts
git commit -m "test(ui): guard classic mode against content rollback"
```

---

### Task 6: Visual QA Across Modern And Classic Modes

**Files:**
- Modify if needed: `output/playwright/*`
- Modify if needed: `docs/design/*`

**Step 1: Run full automated checks**

Run:

```bash
npm test
npm run build
```

Expected:
- `npm test`: all tests pass.
- `npm run build`: exits 0.

If `npm run build` fails only because Prisma requires `DATABASE_URL`, rerun with a dummy MySQL URL:

```bash
$env:DATABASE_URL="mysql://user:pass@localhost:3306/lantern"
npm run build
```

**Step 2: Run local app**

Run:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Use another port if 3000 is already occupied.

**Step 3: Browser verification**

Open:

```text
http://127.0.0.1:3000/
```

Verify:
- Default `modern` mode still renders correctly.
- Switch to `Classic Amber`.
- Refresh page and confirm `Classic Amber` persists.
- Switch theme and typeface while in classic mode; confirm no layout break.
- Navigate through `/`, `/mirror`, `/action`, `/workshop`, `/hermit`.
- Verify mobile width and desktop width.

Capture screenshots:

```text
output/playwright/classic-amber-heart-desktop.png
output/playwright/classic-amber-heart-mobile.png
output/playwright/classic-amber-workshop-desktop.png
output/playwright/classic-amber-hermit-desktop.png
```

**Step 4: Fix visual defects only within scope**

Allowed:
- spacing
- radius
- contrast
- responsive overflow
- switcher sizing
- shell alignment

Not allowed without new approval:
- changing content wording
- replacing current page sections
- changing routes
- changing API behavior
- broad redesign beyond Classic Amber mode

**Step 5: Final verification**

Run:

```bash
npm test
npm run build
git status --short --branch
```

Expected:
- tests pass
- build exits 0
- only intended files are modified

**Step 6: Commit**

```bash
git add src app docs output
git commit -m "feat(ui): add classic amber interface mode"
```

Use exact paths instead of broad `git add` if there are unrelated files.

---

## Final Acceptance Criteria

- A user can switch between modern and Classic Amber interface modes from the app UI.
- Interface mode persists across reloads.
- Existing value theme and typeface switching still work.
- Current content structure remains unchanged:
  - Heart uses `求真、尽善、致美、大爱、幸福`.
  - Action keeps `driver-partner-rest-area`.
  - Workshop role sections remain `public`, `submit`, `personal`, `review`.
  - Hermit persistence modules remain present.
- Old visual language is recognizably carried over:
  - warm paper background
  - amber accent
  - serif/editorial feeling
  - soft rounded translucent cards
  - old-style left rail rhythm
- `npm test` passes.
- `npm run build` passes or passes with documented dummy `DATABASE_URL`.
- Desktop and mobile screenshots are captured for at least Heart, Workshop, and Hermit.

## Execution Options

1. Subagent-driven in this session: execute each task, review the diff between tasks, and keep commits small.
2. Direct execution in this session: implement task-by-task with local verification after each task.
3. Parallel session: open a separate session on `codex/classic-ui-mode` and run this plan with `executing-plans`.
