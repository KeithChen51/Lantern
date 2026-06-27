# Classic Amber Page Visual Migration Audit

Date: 2026-06-27

Scope: page-level visual migration audit only. No runtime page code is changed in this pass.

Active visual system: Lighthouse Classic Amber.

## Executive Summary

The runtime foundation is moving in the right direction: shared primitives, tokenized focus, contrast-oriented text tokens, and the Solar icon map are in place or underway. The remaining visual drift is mostly at the page layer.

The main issue is not that pages look broken. The issue is that many pages still encode typography, state notices, filters, empty states, prose rendering, and chat controls directly in page files. That makes later visual-spec changes expensive because the design system cannot fully constrain the app yet.

Third phase should not start by restyling every page. It should first add the missing page-level primitives, then migrate a small set of representative pages that cover the major product templates.

## Audit Method

- Static scan of `src/app` and `src/components` for hard-coded type scale, weights, tracking, shadows, gradients, arbitrary colors, local buttons, local empty/loading/error states, and focus risks.
- Representative source review of Action, Hermit, Workshop, Admin Workshop, Heart, Mirror, and shared cards.
- Calibration against the current Classic Amber visual spec and docs in `docs/design/`.
- Mobile implementation is treated as later migration work; this audit focuses on desktop-first code alignment and reusable contracts.

## Overall Verdict

Design score: B- as a product direction, C+ as an enforceable runtime system.

Classic Amber now has a recognizable product tone: warm, restrained, editorial enough for knowledge pages, and dense enough for admin/workflow pages. The weakness is enforcement. Too many page files still own visual decisions that should belong to primitives, tokens, or documented page patterns.

AI-slop risk is moderate, not severe. The app is not dominated by generic purple gradients or SaaS card grids. The visible risk is a different one: repeated decorative warmth, repeated all-caps labels, and repeated local cards/buttons can make the interface feel assembled page by page instead of governed by one system.

## Priority Findings

| Priority | Area | Finding | Impact | Recommended Fix |
| --- | --- | --- | --- | --- |
| P0 | Action pages | `/action` and detail pages define headings, prose styles, labels, back links, number chips, and callout-like blocks locally. | Case reading is a core Lighthouse experience; it should become the reference template for long-form service cases. | Add `LhBackLink`, `LhContentProse`, `LhMetaList`, and `LhNumberedList`; migrate Action first. |
| P0 | Hermit chat | Chat input, suggestions, empty state, and chat panel gradients are custom and partly outside the focus/type system. | Hermit is a primary interactive workflow; inconsistent focus and input styling weakens trust. | Add `LhChatInput`, `LhPromptChip`, and `LhConversationEmptyState`; migrate Hermit second. |
| P1 | Workshop workflows | Public Workshop and Admin Workshop duplicate state notices, segmented tabs, filter pills, stat tiles, empty states, and queue cards. | Workflow pages are where design-system drift compounds fastest. | Add `LhStateNotice`, `LhSegmentedControl`, `LhFilterPill`, `LhEmptyState`, and formal queue/card anatomy. |
| P1 | Typography governance | Page files frequently use raw `text-*`, `font-*`, `leading-*`, and `tracking-*` utilities for semantic roles. | Future type-scale changes require many manual edits and can break hierarchy. | Promote semantic type roles into primitives/classes and add tests for migrated pages. |
| P2 | Heart values | The five value colors are local CSS variables in the page. They are useful as tag mappings but should not become a second visual system. | The page can look more colorful than the platform system if reused carelessly. | Keep the mapping, document it as auxiliary tag color only, and expose restrained value-tag tokens later. |
| P2 | Mirror/editorial pages | Mirror case pages use mostly good primitives, but still hand-code table-of-contents links, stat cards, prose headings, and back links. | Lower operational risk, but useful as a second long-form template after Action. | Reuse `LhBackLink`, `LhContentProse`, and `LhMetaList` after Action migration proves the pattern. |
| P3 | Shared cards/header | `FeatureCard`, `Header`, and small admin list actions contain local typography and hover treatments. | These are not blockers, but they keep small inconsistencies visible across pages. | Sweep after core templates migrate. |

## File-Level Evidence

| File | Evidence | Migration Note |
| --- | --- | --- |
| `src/app/action/page.tsx:65` | Local section headline uses raw size, weight, leading, and desktop override. | Move page-card title to a semantic primitive or page-list item component. |
| `src/app/action/page.tsx:70` | Repeated label pattern uses `text-xs`, heavy weight, wide tracking, and `text-primary-deep`. | Replace with a label token/class such as `lh-label-overline`. |
| `src/app/action/page.tsx:77` | Local action span recreates button/chip surface without shared behavior. | Replace with a primitive action/meta pill. |
| `src/app/action/ActionCaseDetailView.tsx:33` | Back navigation is hand-styled. | Create `LhBackLink` so long-form pages share spacing, icon, focus, and wording. |
| `src/app/action/ActionCaseDetailView.tsx:122` | Markdown prose root uses raw type and line-height. | Create `LhContentProse` or a prose class tied to Classic Amber type roles. |
| `src/app/action/ActionCaseDetailView.tsx:125` | Markdown headings map to raw heading sizes and weights. | Move markdown renderer styles into one component contract. |
| `src/components/hermit/ChatInput.tsx:62` | Textarea uses `outline-none`; focus is expressed on the wrapper instead of the field contract. | Wrap as `LhChatInput` with explicit focus-visible inheritance and a stable send control. |
| `src/components/hermit/ChatInput.tsx:79` | Send button owns custom shadow and color treatment. | Use `LhIconButton` behavior and Classic Amber action tokens. |
| `src/components/hermit/ChatPanel.tsx:49` | Chat panel header uses page-local gradient. | Decide whether this is a named Hermit surface token or remove it. |
| `src/components/hermit/ChatPanel.tsx:166` | Suggested question buttons are locally styled. | Replace with `LhPromptChip` or a semantic suggestion button. |
| `src/app/workshop/WorkshopClient.tsx:206` | State notice is a local component with local tone mapping. | Promote to `LhStateNotice`. |
| `src/app/workshop/WorkshopClient.tsx:233` | Section tabs are custom buttons. | Promote to `LhSegmentedControl` with selected state semantics. |
| `src/app/admin/workshop/AdminWorkshopClient.tsx:105` | Admin state notice duplicates public Workshop. | Use the same `LhStateNotice`. |
| `src/app/admin/workshop/AdminWorkshopClient.tsx:194` | Admin filter buttons duplicate segmented/filter logic. | Use `LhSegmentedControl` or `LhFilterPill`. |
| `src/app/heart/page.tsx:35` | Five value color styles live in the page. | Keep as auxiliary value-tag mapping only; do not treat as global palette. |
| `src/app/mirror/pang-dong-lai/page.tsx:81` | Back link duplicates Action detail styling. | Covered by `LhBackLink`. |
| `src/app/mirror/pang-dong-lai/page.tsx:92` | Table-of-contents label uses local overline styling. | Covered by shared label and side-nav pattern. |
| `src/components/ui/FeatureCard.tsx:46` | Shared card still owns raw title scale/weight. | Align after page-list card anatomy is formalized. |

## Systemic Issues

### 1. Typography Is Defined Too Often At The Call Site

The design spec now describes title levels, body text, labels, and dense UI text, but page files still use raw Tailwind utilities for those roles. Changing the spec later will not reliably update the app until these roles move into primitives or semantic classes.

Required direction:

- Define reusable role classes or primitive slots for display title, page title, section title, card title, dense label, body copy, helper copy, metadata, and numeric values.
- Treat `tracking-[...]` and all-caps labels as opt-in roles, not local decoration.
- Use tabular numeric styling for metrics, counters, queue counts, and table-like data.

### 2. State, Empty, Loading, And Recovery Patterns Are Repeated

Workshop, Admin Workshop, Action, and Hermit all implement variations of state notices or empty panels. The copy quality is generally concrete, but structure and styling are not centralized.

Required direction:

- Create `LhStateNotice` for success, info, warning, danger, and neutral notices.
- Create `LhEmptyState` with title, description, optional icon, and primary/secondary action slots.
- Create a loading skeleton pattern that matches list/table/card geometry instead of relying only on text such as "loading".
- Require error copy to state what happened and what the user can do next.

### 3. Workflow Controls Need Shared Semantics

Workshop and Admin Workshop use custom tab/filter buttons. They are visually close to the desired system, but selected state, disabled state, count badges, and keyboard semantics should be governed once.

Required direction:

- Add `LhSegmentedControl` for mutually exclusive page sections.
- Add `LhFilterPill` or a segmented variant for count-bearing filters.
- Selected controls must expose `aria-pressed`, `aria-selected`, or `aria-current` based on role.
- Counts should use the same dense numeric token and should not create new badge styling per page.

### 4. Hermit Needs A Named Chat Pattern

Hermit is visually close but structurally isolated. Chat input, prompt suggestions, empty state, message list surface, and keyboard hint are currently one-off.

Required direction:

- Define `LhChatInput` with stable width, minimum height, submit button, disabled state, loading state, and focus-visible behavior.
- Define `LhPromptChip` for suggested questions.
- Keep chat surfaces quiet. Gradients and glow should either become named Hermit tokens or be removed.
- The textarea should not rely on `outline-none` without a documented wrapper focus contract.

### 5. Auxiliary Colors Should Be Absorbed As Tags, Not As A New System

The Heart page's five value colors are useful for later small labels, but they should remain subordinate to Classic Amber.

Required direction:

- Keep value color mapping as auxiliary value-tag tones.
- Do not use value colors for page backgrounds, main controls, navigation, or workflow state.
- If promoted later, define them in tokens as low-chroma tag foreground/background/border sets with contrast notes.

## Positive Findings

- Icon usage is mostly centralized through `lighthouseIcons`; this is already the right direction.
- Many pages already use `LhPageHero`, `LhSectionHeader`, `LhCard`, `LhPanel`, `LhDataTableShell`, `LhChip`, `LhStatusBadge`, and form primitives.
- The app's page types are clear enough to migrate by templates rather than by isolated screens.
- The Classic Amber tone is more distinctive than a generic SaaS theme and does not depend on trendy purple-blue gradients.

## Third Phase Recommended Scope

### Wave 0: Add Missing Page-Level Primitives

Do this before migrating pages.

| Primitive | Purpose | First Consumers |
| --- | --- | --- |
| `LhBackLink` | Consistent back navigation with icon, focus, density, and wording. | Action detail, Mirror detail. |
| `LhContentProse` | Long-form markdown/article typography bound to type tokens. | Action detail, Mirror detail. |
| `LhStateNotice` | Unified success/info/warning/danger/neutral status messaging. | Workshop, Admin Workshop, admin pages. |
| `LhEmptyState` | Empty/loading/recovery layout with action slots. | Action empty, Workshop queues, Hermit empty. |
| `LhSegmentedControl` | Section tabs and mutually exclusive filters. | Workshop, Admin Workshop. |
| `LhFilterPill` | Count-bearing filters or role filters. | Workshop, Admin Workshop. |
| `LhChatInput` | Hermit message input with focus, disabled, loading, send action. | Hermit. |
| `LhPromptChip` | Suggested question buttons. | Hermit. |
| `LhMetaList` | Compact label/value or numbered support facts. | Action, Mirror, admin side panels. |

### Wave 1: Action Case Reading Template

Target files:

- `src/app/action/page.tsx`
- `src/app/action/ActionCaseDetailView.tsx`
- Related markdown/prose renderer tests if present.

Why first:

- It is user-facing, content-heavy, and close to the platform's knowledge value.
- It will prove the typography, prose, back-link, metadata, and long-form card patterns.
- The current page already uses many primitives, so the migration is bounded.

Acceptance:

- No local raw heading scale for long-form markdown headings.
- Back link uses `LhBackLink`.
- Repeated labels use shared label role.
- Case prose uses `LhContentProse`.
- Empty state uses `LhEmptyState`.

### Wave 2: Hermit Chat Template

Target files:

- `src/app/hermit/page.tsx`
- `src/components/hermit/ChatPanel.tsx`
- `src/components/hermit/ChatInput.tsx`
- `src/components/hermit/MessageBubble.tsx`

Why second:

- It is the main conversational workflow and has the highest interaction-state risk.
- It currently owns custom focus, shadows, suggestions, empty state, and chat surface styling.

Acceptance:

- Chat input uses one named component.
- Suggested prompts use one named prompt primitive.
- Keyboard focus is visible on textarea and submit action.
- Loading/disabled state preserves layout width and target size.
- Decorative gradients are either tokenized as Hermit-specific surfaces or removed.

### Wave 3: Workshop And Admin Workshop Workflow Template

Target files:

- `src/app/workshop/WorkshopClient.tsx`
- `src/app/admin/workshop/AdminWorkshopClient.tsx`

Why third:

- These pages contain the most duplicated workflow UI.
- They should migrate after shared state, filter, empty-state, and segmented-control primitives exist.

Acceptance:

- Local `StateNotice` implementations are removed.
- Section tabs and filters use shared controls.
- Queue empty/loading/error states use shared patterns.
- Count badges use tokenized dense numeric styles.

### Wave 4: Heart And Mirror Editorial Sweep

Target files:

- `src/app/heart/page.tsx`
- `src/app/mirror/page.tsx`
- `src/app/mirror/pang-dong-lai/page.tsx`
- `src/components/ui/FeatureCard.tsx`

Why later:

- These pages are visually important, but they are less interaction-critical than Hermit and Workshop.
- Heart has value-color decisions that should be tokenized carefully, not rushed into global color.

Acceptance:

- Value colors are documented as auxiliary tag tones.
- Editorial headings, stat cards, side navigation, and feature cards use shared typography roles.
- No exploratory visual style becomes the default system accidentally.

## Suggested Tests For Third Phase

Add or extend `src/components/ui/lighthouse-design-system.test.ts` with static assertions after each wave:

- Migrated files do not use raw markdown heading classes where `LhContentProse` should own them.
- `ChatInput` no longer contains `outline-none` unless the wrapper focus contract is explicitly asserted.
- Workshop pages do not define local `StateNotice` components.
- Segmented controls expose selected state semantics.
- `LhBackLink`, `LhStateNotice`, `LhEmptyState`, `LhSegmentedControl`, and `LhChatInput` remain exported from the primitive layer.

## Migration Rules

- Do not migrate pages by changing colors locally. If a color is missing, add or document the token first.
- Do not add a one-off component if two pages already need the same shape.
- Do not let Heart value colors, campaign H5 styles, or exploratory HTML files become runtime defaults.
- Do not replace readable, product-specific copy with generic UI copy.
- Do not chase mobile page polish in the same wave unless a desktop component contract would block mobile later.
- Every migrated page should get a quick keyboard Tab pass in the browser before being called done.

## Recommended Next Action

Start third phase with Wave 0 plus Wave 1:

1. Add `LhBackLink`, `LhContentProse`, `LhStateNotice`, and `LhEmptyState`.
2. Migrate `src/app/action/page.tsx` and `src/app/action/ActionCaseDetailView.tsx`.
3. Add static tests for the new primitives and migrated Action files.
4. Check `/action` and at least one Action detail page in the browser.

This gives the design system its first real page-level enforcement without taking on Hermit chat complexity in the same change.
