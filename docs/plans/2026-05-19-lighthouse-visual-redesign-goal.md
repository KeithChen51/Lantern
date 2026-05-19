# Lighthouse Visual Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the Lantern/Lighthouse frontend around the new A / Harbor Signal visual system while improving information hierarchy, readability, and component consistency.

**Architecture:** Treat `docs/design/lighthouse-ui-kit.html` and `docs/design/lighthouse-color-system.html` as the visual source of truth, but do not copy old pages one-to-one. First establish global tokens and reusable UI primitives, then redesign the app shell and each product page around content responsibility, reading path, and action priority. Keep business APIs and data contracts stable unless a UI flow cannot work without a small adapter.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4 tokens in `src/app/globals.css`, `@iconify/react` with Solar icons, Vitest, Playwright/browser screenshot checks.

---

## Goal Brief For Codex

Use this objective when creating the Codex goal:

```text
On branch codex/lighthouse-visual-redesign-goal, refactor the existing Lantern/Lighthouse frontend according to docs/design/lighthouse-ui-kit.html and docs/design/lighthouse-color-system.html. The work is not a one-to-one reskin: preserve business content and user tasks, but rebuild information hierarchy, reading paths, component density, and state visibility. Establish the A / Harbor Signal token system, reusable primitive UI components, a new AppShell/Nav/Header treatment, and redesigned Heart/Mirror, Action, Workshop/Admin, and Hermit surfaces. Keep Solar icons, avoid dark mode, avoid large amber reliance, serif body text, low-opacity text, glassy cards, and decorative-only gradients. Verify each stage with npm test and browser desktop/mobile screenshots; no page-level horizontal overflow.
```

## Source Of Truth

- Visual system: `docs/design/lighthouse-ui-kit.html`
- Color exploration and selected direction: `docs/design/lighthouse-color-system.html`
- Product boundaries: Hermit is a domain-specific automotive after-sales service-culture assistant, Workshop v1 is role-specific Do and Don't contribution plus review, not a broad forum.
- Current app entry points:
  - Shell: `src/components/layout/AppShell.tsx`, `src/components/layout/Navigation.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/navigation-model.ts`
  - Global styling: `src/app/globals.css`
  - Content pages: `src/app/page.tsx`, `src/app/heart/page.tsx`, `src/app/mirror/page.tsx`, `src/app/action/page.tsx`, `src/app/action/substitute-vehicle-policy/page.tsx`
  - Workshop: `src/app/workshop/WorkshopClient.tsx`, `src/app/admin/workshop/AdminWorkshopClient.tsx`
  - Hermit: `src/app/hermit/page.tsx`, `src/components/hermit/ChatPanel.tsx`, `src/components/hermit/ChatInput.tsx`, `src/components/hermit/MessageBubble.tsx`
  - Existing card primitive to replace or adapt: `src/components/ui/FeatureCard.tsx`

## Non-Goals

- Do not change Prisma schema, API behavior, auth/tenant/workshop service contracts, or Hermit RAG logic unless a visual state needs a small read-only adapter.
- Do not introduce a dark theme.
- Do not add a second icon family. Replace remaining Lucide action icons with Solar only when touching those components.
- Do not preserve old layout just because a class already exists. Preserve content responsibility, not old DOM shape.

## Global Acceptance Criteria

- `npm test` passes after every committed phase.
- `npm run lint` is attempted before final handoff; any failure is documented with exact cause.
- Browser checks cover at least desktop 1365px and mobile 390px for changed page families.
- No page-level horizontal overflow on checked routes.
- Main body copy is readable: avoid `text-ink/30`, `text-ink/40`, `text-ink/50` for normal prose.
- Default UI font is non-serif. Serif can remain only for content quotation or rare editorial emphasis.
- Cards, panels, tables, forms, and chat states use shared primitives or shared class helpers, not repeated one-off class strings.

---

### Task 1: Establish Design Tokens And Compatibility Aliases

**Files:**
- Modify: `src/app/globals.css`
- Reference: `docs/design/lighthouse-color-system.html`
- Reference: `docs/design/lighthouse-ui-kit.html`

**Step 1: Read the visual token source**

Run:

```bash
Select-String -Path docs/design/lighthouse-ui-kit.html -Pattern '--ui-|font|radius|shadow|Harbor Signal' | Select-Object -First 120
Select-String -Path docs/design/lighthouse-color-system.html -Pattern 'data-theme="harbor-signal"|--lh-|Harbor Signal' | Select-Object -First 160
```

Expected: the selected A / Harbor Signal colors, border, shadow, font, radius, and surface tokens are visible.

**Step 2: Replace the old global theme base**

In `src/app/globals.css`, define Lighthouse tokens:

- `--color-page`
- `--color-panel`
- `--color-surface`
- `--color-surface-quiet`
- `--color-ink`
- `--color-ink-soft`
- `--color-muted`
- `--color-faint`
- `--color-primary`
- `--color-primary-deep`
- `--color-primary-soft`
- `--color-signal`
- `--color-signal-deep`
- `--color-signal-soft`
- `--color-line`
- `--color-line-strong`
- `--color-danger`, `--color-warning`, `--color-success`, `--color-info`
- `--radius-xs`, `--radius-sm`, `--radius-md`
- `--shadow-sm`, `--shadow-md`

Keep compatibility aliases during the first pass:

```css
--background: var(--color-page);
--foreground: var(--color-ink);
--color-paper: var(--color-page);
--color-amber: var(--color-primary);
```

Change `--font-sans` to the Kit non-serif stack and stop assigning serif globally to headings. Keep `--font-serif` available for rare quotation/editorial usage.

**Step 3: Normalize body and selection styles**

Use the Kit page background direction:

- subtle grid background
- no paper grain noise as the dominant texture
- `color: var(--color-ink)`
- `font-family: var(--font-sans)`
- `letter-spacing: 0`

**Step 4: Verify**

Run:

```bash
npm test
npm run lint
```

Expected: tests pass. If lint fails because of pre-existing issues, record the exact failure before continuing.

**Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): establish lighthouse visual tokens"
```

---

### Task 2: Create Shared UI Primitives

**Files:**
- Create: `src/components/ui/lighthouse-primitives.tsx`
- Create: `src/components/ui/lighthouse-icons.ts`
- Modify: `src/components/ui/FeatureCard.tsx`
- Test: add focused tests only if behavior is introduced; otherwise verify through pages.

**Step 1: Define primitive component scope**

Create primitives for:

- `LhButton`
- `LhIconButton`
- `LhPanel`
- `LhCard`
- `LhChip`
- `LhStatusBadge`
- `LhTextField`
- `LhTextArea`
- `LhSearchBox`
- `LhSectionHeader`
- `LhDataTableShell`

Use `cn` from `src/lib/utils.ts`. Keep class strings token-based and variant-driven.

**Step 2: Define icon map**

In `src/components/ui/lighthouse-icons.ts`, map common actions to Solar icons:

```ts
export const lighthouseIcons = {
  heart: "solar:heart-bold",
  mirror: "solar:book-2-bold",
  action: "solar:bolt-bold",
  workshop: "solar:clipboard-check-bold",
  hermit: "solar:magic-stick-3-bold",
  search: "solar:magnifer-linear",
  send: "solar:plain-bold",
  edit: "solar:pen-2-bold",
  delete: "solar:trash-bin-trash-bold",
  publish: "solar:upload-square-bold",
  reject: "solar:undo-left-round-bold",
  save: "solar:diskette-bold",
  close: "solar:close-circle-bold",
  pin: "solar:pin-bold",
  unpin: "solar:pin-circle-bold",
};
```

If an icon name does not render, choose the nearest Solar icon from <https://icon-sets.iconify.design/solar/> and document the substitution in the file comment.

**Step 3: Replace `FeatureCard` styling**

Update `src/components/ui/FeatureCard.tsx` to use the new panel/card language:

- 8px or lower radius unless the component needs a pill
- no glass blur
- no serif fallback text for ordinary UI
- consistent card action/footer track
- no hidden low-contrast meta text

**Step 4: Verify**

Run:

```bash
npm test
npm run lint
```

Expected: tests pass. Lint should not report new issues in changed files.

**Step 5: Commit**

```bash
git add src/components/ui/lighthouse-primitives.tsx src/components/ui/lighthouse-icons.ts src/components/ui/FeatureCard.tsx
git commit -m "feat(ui): add lighthouse primitive components"
```

---

### Task 3: Redesign AppShell, Navigation, And Header

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/Navigation.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/navigation-model.ts`
- Modify: `src/components/layout/navigation-model.test.ts`

**Step 1: Rebuild shell layout around the Kit**

Use the UI Kit shell model:

- stable side navigation
- top search/actions with restrained density
- content container with predictable max-width and padding
- mobile nav that adapts rather than simply shrinking

**Step 2: Replace remaining non-Solar action icons**

Replace Lucide `Pin`, `PinOff`, `X`, `Menu`, `Search`, `Bell`, or other touched icons with `@iconify/react` Solar icons through `lighthouseIcons` where reasonable.

**Step 3: Strengthen navigation active state**

Active state should use:

- clear left/inline indicator or filled surface
- high contrast text
- no glow-heavy amber styling
- title labels that remain readable when pinned/collapsed

**Step 4: Update tests**

Update `src/components/layout/navigation-model.test.ts` only if route labels or visibility rules change. Do not test visual classes in unit tests unless they encode behavior.

**Step 5: Browser check**

Start the app:

```bash
npm run dev
```

Open and inspect:

- `/`
- `/heart`
- `/workshop`
- `/hermit`

Desktop: 1365px wide. Mobile: 390px wide.

Expected:

- no horizontal overflow
- navigation is legible
- header search and identity controls fit
- mobile nav can open/close

**Step 6: Verify and commit**

```bash
npm test
npm run lint
git add src/components/layout/AppShell.tsx src/components/layout/Navigation.tsx src/components/layout/Header.tsx src/components/layout/navigation-model.ts src/components/layout/navigation-model.test.ts
git commit -m "feat(ui): redesign lighthouse app shell"
```

---

### Task 4: Redesign Heart And Mirror Reading Surfaces

**Files:**
- Modify: `src/app/heart/page.tsx`
- Modify: `src/app/mirror/page.tsx`
- Modify: `src/app/mirror/pang-dong-lai/page.tsx`
- May modify: `src/components/ui/FeatureCard.tsx`

**Step 1: Convert Heart into a guided reading surface**

Restructure around:

- page title and restrained intro
- four values as readable sections, not decorative cards
- customer and employee perspectives
- light guide to downstream sections
- citations/source-like areas where content needs grounding

Do not restore a complex index. Keep the guide lightweight.

**Step 2: Convert Mirror into a reference/case surface**

Use card and table primitives to make Mirror feel like benchmark knowledge rather than literary prose.

**Step 3: Typography constraints**

Remove ordinary `font-serif` body usage and low opacity text for prose. Use serif only if quoting or marking a source passage.

**Step 4: Browser check**

Inspect:

- `/heart`
- `/mirror`
- `/mirror/pang-dong-lai`

Expected:

- first viewport shows page identity and next content hint
- body prose has strong contrast
- mobile content does not overflow

**Step 5: Verify and commit**

```bash
npm test
npm run lint
git add src/app/heart/page.tsx src/app/mirror/page.tsx src/app/mirror/pang-dong-lai/page.tsx src/components/ui/FeatureCard.tsx
git commit -m "feat(ui): redesign heart and mirror surfaces"
```

---

### Task 5: Redesign Action Case Surfaces

**Files:**
- Modify: `src/app/action/page.tsx`
- Modify: `src/app/action/substitute-vehicle-policy/page.tsx`
- Modify only if needed: `src/app/action/action-cases.ts`
- Test: `src/app/action/action-cases.test.ts`

**Step 1: Preserve content, change the training structure**

Action should read as judgment training:

- case question
- trigger context
- decision nodes
- final practice
- reusable principle
- source material

Reduce literary headline styling and amber emphasis.

**Step 2: Redesign case list cards**

Use fixed card tracks:

- meta
- title
- scenario summary
- decision preview
- action footer

**Step 3: Redesign the case detail page**

Use stable grids and table-like comparisons for tradeoffs. Avoid nested cards. Do not hide important constraints in pale text.

**Step 4: Verify**

Run:

```bash
npm test src/app/action/action-cases.test.ts
npm test
```

Browser check:

- `/action`
- `/action/substitute-vehicle-policy`

**Step 5: Commit**

```bash
git add src/app/action/page.tsx src/app/action/substitute-vehicle-policy/page.tsx src/app/action/action-cases.ts src/app/action/action-cases.test.ts
git commit -m "feat(ui): redesign action case learning surfaces"
```

---

### Task 6: Redesign Workshop And Admin Review Surfaces

**Files:**
- Modify: `src/app/workshop/WorkshopClient.tsx`
- Modify: `src/app/admin/workshop/AdminWorkshopClient.tsx`
- Modify only if labels/routes need alignment: `src/app/workshop/workshop-sections.ts`
- Test: `src/app/workshop/workshop-sections.test.ts`, `src/modules/workshop/service.test.ts`

**Step 1: Keep Workshop v1 narrow**

Preserve the product boundary:

- public area
- submission area
- personal area
- role-specific Do and Don't contributions
- long-term open submission

Do not turn it into a broad forum.

**Step 2: Redesign public/submission/personal areas**

Use clear section bands, tabs/segmented controls, form primitives, state badges, and review cards.

**Step 3: Redesign admin review queue**

Admin should feel operational:

- queue summary
- status filters
- submission detail
- evidence/source area
- approve/reject actions
- error/success states

**Step 4: Verify state coverage**

Manually check loading, empty, error, draft, pending, published, rejected, and success messages in code paths.

**Step 5: Run tests and commit**

```bash
npm test src/app/workshop/workshop-sections.test.ts src/modules/workshop/service.test.ts
npm test
npm run lint
git add src/app/workshop/WorkshopClient.tsx src/app/admin/workshop/AdminWorkshopClient.tsx src/app/workshop/workshop-sections.ts src/app/workshop/workshop-sections.test.ts src/modules/workshop/service.test.ts
git commit -m "feat(ui): redesign workshop contribution and review surfaces"
```

---

### Task 7: Redesign Hermit Assistant Surfaces

**Files:**
- Modify: `src/app/hermit/page.tsx`
- Modify: `src/components/hermit/ChatPanel.tsx`
- Modify: `src/components/hermit/ChatInput.tsx`
- Modify: `src/components/hermit/MessageBubble.tsx`
- Do not modify unless necessary: `src/lib/hermit/system-prompt.ts`, `src/lib/hermit/knowledge/heart-values.md`

**Step 1: Keep Hermit domain-specific**

Hermit should look and read like a service-culture interpretation panel, not a generic chat app.

Preserve:

- direct answer
- principle basis
- related cases/norms
- next step
- evidence-insufficiency state

**Step 2: Redesign empty/welcome state**

Use clear starting questions, but avoid decorative amber cards and serif body text.

**Step 3: Redesign message bubbles**

Use:

- user prompt as compact input context
- assistant response as readable answer panel
- citation/evidence block styling
- loading state without bounce animation

**Step 4: Redesign input**

Use the Kit prompt bar:

- clear textarea
- Solar paper-plane send icon
- disabled/loading state
- visible focus state

**Step 5: Browser check**

Inspect `/hermit` at desktop and mobile. Ask one local/dev question only if API credentials are available; otherwise verify static UI states.

**Step 6: Verify and commit**

```bash
npm test
npm run lint
git add src/app/hermit/page.tsx src/components/hermit/ChatPanel.tsx src/components/hermit/ChatInput.tsx src/components/hermit/MessageBubble.tsx
git commit -m "feat(ui): redesign hermit assistant surface"
```

---

### Task 8: Cross-Page Polish And Visual QA

**Files:**
- Modify only files touched by earlier tasks.
- May update: `docs/design/lighthouse-ui-kit.html` only if the implementation reveals a needed spec clarification.

**Step 1: Run full checks**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected:

- tests pass
- lint passes or documented pre-existing failure
- build passes
- no whitespace errors

**Step 2: Browser QA route matrix**

Check desktop 1365px and mobile 390px:

- `/`
- `/heart`
- `/mirror`
- `/action`
- `/action/substitute-vehicle-policy`
- `/workshop`
- `/admin/workshop`
- `/hermit`

Capture screenshots to `output/playwright/` during QA, then remove temporary screenshots before final commit unless the user asks to keep them.

**Step 3: Visual review checklist**

For each route:

- no page-level horizontal overflow
- first viewport clearly shows identity, core task, and next content hint
- typography uses non-serif for UI and body
- no low-contrast normal text
- action buttons and filters have clear hierarchy
- form states are visible
- status colors are semantic
- cards use stable internal tracks
- mobile layout reflows without amputating key actions

**Step 4: Final commit**

```bash
git status --short
git add <changed-files>
git commit -m "chore(ui): polish lighthouse visual redesign"
```

---

## Suggested Goal Execution Protocol

1. Create the Codex goal using the Goal Brief above.
2. Implement one task at a time.
3. After each task:
   - run the listed tests
   - inspect the changed route in browser
   - commit the phase
4. Do not mark the goal complete until Task 8 passes or remaining failures are explicitly accepted by the user.

