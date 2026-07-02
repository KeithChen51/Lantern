# Lighthouse Component Library v0.1

## Status

This document defines the first Lighthouse product component contract. Runtime implementation currently lives in `src/components/ui/lighthouse-primitives.tsx` and `src/app/globals.css`.

The component library belongs to the platform UI layer. It should not inherit service-brand VI styling by default.

## Current Runtime Base

Existing primitives:

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
- `LhCallout`
- `LhMetricTile`
- `LhPageHero`
- `LhDataTableShell`
- `LhBackLink`
- `LhContentProse`
- `LhStateNotice`
- `LhEmptyState`
- `LhChatShell`
- `LhChatHeader`
- `LhChatMain`
- `LhChatFooter`
- `LhChatInputShell`
- `LhChatTextarea`
- `LhChatSubmitButton`
- `LhMessageRow`
- `LhMessageAvatar`
- `LhMessageBubble`
- `LhSuggestionList`
- `LhMetaList`
- `LhSegmentedControl`
- `LhSubmissionCard`

These are the runtime base. The design system should strengthen their semantics before adding many new primitives.

## Component Principles

- One component should encode one meaning. Do not make one generic badge carry status, role, filter, code, and metric semantics.
- Component visuals come from tokens, not one-off page classes.
- Buttons and inputs at the same size share height, radius, border logic, and focus behavior.
- Cards are for repeated items. Panels are for bounded regions. Do not put cards inside cards.
- Every interactive component needs rest, hover, focus-visible, active, disabled, loading, and error states where applicable.
- New components should expose behavior and meaning, not color props.

## Shared Anatomy And Accessibility

Every component contract should define anatomy, variants, states, accessibility, and misuse boundaries.

| Component family | Required anatomy | Accessibility rule | Do not use for |
| --- | --- | --- | --- |
| Button | Container, label, optional Solar icon, loading affordance. | Keyboard focus uses 2px outline + 3px offset + halo; disabled reason where unclear; loading width preserved. | Passive labels or broad navigation descriptions. |
| Icon button | 36px or 44px target, 20px icon, accessible label. | `aria-label` is required; tooltip for unfamiliar icons. | Ambiguous destructive actions without confirmation. |
| Field | Label, control, helper text, validation/error message. | `aria-describedby` for helper/error, `aria-invalid` for invalid fields. | Placeholder-only labels. |
| Chip / Badge | Text label, optional dot/icon, semantic wrapper. | Do not rely on color alone for state meaning. | Merging status, category, role, metric, and code into one generic style. |
| Card / Panel | Title, metadata, body, action region. | Whole-card click target must be keyboard reachable. | Page-section wrappers or card-in-card hierarchy. |
| Data table | Header, rows, sortable columns, selection, bulk toolbar where needed. | Sort and selection state must be textual or programmatic, not only visual. | Visual browsing where comparison is not needed. |
| Back link | Link container, Solar icon, text label. | Native link target with Classic Amber focus-visible outline. | Breadcrumb trails, primary actions, or row-level actions. |
| Content prose | Semantic headings, paragraphs, lists, quote, divider. | Preserve heading order and readable line length; do not encode action state. | Forms, data tables, dense control groups, or decorative card copy. |
| State notice | Tone, optional icon, title, message, action. | Warning and danger announce as alerts; color is paired with text and icon. | Empty states or persistent page instructions. |
| Empty state | Optional icon, title, description, action region. | Name the current scope and provide the next useful action when available. | Error alerts, loading skeletons, or normal content cards. |
| Chat | Shell, header, scroll body, footer input, message rows, suggestions. | Input remains keyboard submit-able; suggested questions are buttons; message role is explicit. | Generic cards, decorative quote layouts, or non-conversational lists. |
| Workflow collection | Segments, metadata rows, submission cards, actions. | Segments expose `aria-pressed`; cards keep status/action regions explicit. | Chat, prose, or purely decorative homepage blocks. |

## Typography Contract

Reusable components consume runtime typography tokens instead of raw Tailwind type utilities.

| Component | Font role | Size / line-height | Weight | Rule |
| --- | --- | --- | --- | --- |
| `LhButton` | UI sans | `--type-control / --leading-control` by default | `--weight-extrabold` | Button labels are action text, not body copy. Small and large sizes step through `--type-caption` and `--type-body`. |
| `LhIconButton` | UI sans | `--type-control` or `--type-reading` glyph context | `--weight-extrabold` | Icon-only controls still inherit button typography and focus rules. |
| `LhChip` / `LhStatusBadge` | UI sans | `--type-caption / --leading-caption` | `--weight-bold` | Small colored text must use readable semantic text tokens. |
| `LhTextField` / `LhTextArea` | UI sans | labels use `--type-control`, helper uses `--type-label`, input uses `--type-reading` | label `--weight-extrabold`, helper `--weight-bold` only for errors | Placeholder is not a label; error text uses danger text token. |
| `LhSectionHeader` | serif title plus sans kicker | title uses `--title-section`, kicker uses `--title-kicker` | title `--weight-bold`, kicker `--weight-black` | Section hierarchy comes from title tokens, not one-off page sizes. |
| `LhPageHero` | serif page title, sans controls | title uses `--title-page`, body uses `--type-reading` | title `--weight-black` | Page title is one per view; admin pages may use quieter page-level treatment. |
| `LhDataTableShell` | UI sans | headers use `--type-caption`, cells use `--type-body` | header `--weight-black` | Tables are dense but still tokenized and readable. |
| `LhBackLink` | UI sans | `--type-control / --leading-control` | `--weight-extrabold` | Detail pages use one consistent back affordance rather than page-local link styling. |
| `LhContentProse` | editorial reading | `--type-reading / --leading-reading`, compact uses `--type-body` | headings `--weight-extrabold` | Markdown and long-form case text use semantic tags; visual classes live in the prose wrapper. |
| `LhStateNotice` | UI sans | body uses `--type-body`, title uses `--type-control` | title `--weight-extrabold` | Status/recovery messages use semantic tone text tokens and role defaults. |
| `LhEmptyState` | UI sans plus optional icon | title uses `--title-card`, description uses `--type-body` | title `--weight-extrabold` | Empty states are composed regions, not dashed cards built per page. |
| `LhChat*` / `LhMessage*` | editorial chat plus UI controls | input and assistant prose use `--type-reading`; labels use `--type-caption` | tokenized weights only | Conversational surfaces should not define local text sizes or bubble styling in page files. |
| `LhMetaList` / `LhSegmentedControl` / `LhSubmissionCard` | UI workflow | labels use `--type-control`, meta uses `--type-caption`, titles use `--title-card` | tokenized weights only | Workflow pages should not define local title, badge, tab, or card typography. |
| Navigation shell | UI sans | sub-label `--type-control`, label `--type-caption` | sub-label `--weight-extrabold`, label `--weight-bold` | Navigation is product chrome, not editorial serif copy. |
| Home brand cover | Source Han Serif SC display plus UI sans kicker/path | brand title follows `data-lh-home-brand-title`; kicker/path use UI tokens | title `--weight-bold`, kicker `--weight-black` | Homepage / Heart first screen only. It is a brand-spirit cover, not a reusable page hero primitive. |

Shared primitives and the navigation shell should not contain `text-xs`, `text-sm`, `text-base`, `font-bold`, `font-extrabold`, or `leading-6` as their source of truth. Use CSS variables or data-attribute defaults so a visual-spec change can be applied centrally.

## Interaction State Matrix

| State | Required treatment |
| --- | --- |
| Default | Communicates whether the element can be used. |
| Hover | Changes color, border, or elevation without layout shift. |
| Pressed | Confirms activation without resizing. |
| Focus-visible | Uses 2px Classic Amber outline, 3px offset, and halo. It must remain visible on warm paper, white surfaces, selected rows, and tinted cards. |
| Disabled | Keeps text readable and explains unavailable actions when needed. |
| Loading | Keeps width stable, prevents duplicate submit, and keeps enough label context. |
| Selected | Shows selected scope before any bulk action. |
| Error | Pairs danger color with message and recovery path. |

## Button

Use for explicit commands.

| Variant | Meaning | Use |
| --- | --- | --- |
| `primary` | Main page action | Publish, submit, create, save. |
| `secondary` | Standard action | Open, edit, preview, export. |
| `quiet` | Low-emphasis action | Toolbar action, panel-level secondary action. |
| `ghost` | Navigation-like action | Back, clear, cancel, dismiss. |
| `signal` | Product guidance action | Hermit prompt, guided recommendation, signal-specific CTA. |
| `danger` | Destructive action | Delete, reject, revoke, irreversible operation. |

Size contract:

| Size | Height | Padding | Use |
| --- | --- | --- |
| `sm` | `32px` | `8px 12px` | Dense toolbars, table rows. |
| `md` | `40px` | `10px 14px` | Default. |
| `lg` | `48px` | `12px 18px` | Page-level primary action. |

Rules:

- A page should normally have one visually dominant primary action.
- Destructive actions require `danger`; irreversible destructive actions also require confirmation.
- Loading state disables the button and preserves width where possible.
- Icon-only actions use `LhIconButton`, not a text button with hidden text.
- Amber button/link text smaller than `18px` uses `--color-primary-text`, not raw `--color-primary`.
- Danger button/link text smaller than `18px` uses `--color-danger-text`, not raw `--color-danger`.

## Icon Button

Use for compact tool actions with a familiar icon.

Rules:

- Accessible label is required.
- Use tooltips for unfamiliar icons.
- Do not use icon buttons for destructive actions unless the surrounding context and confirmation make the consequence clear.
- Match button size to adjacent form controls or toolbar density.
- Default icon-button sizes are `36px` small and `44px` medium, with a `20px` glyph.
- Icon-only buttons inherit the same radius, border, shadow, focus, disabled, and loading logic as text buttons.
- Focus-visible on icon buttons must show an external outline, not only an inner glow or icon color change.

## Iconography

Default source: [Iconify Solar Bold Duotone](https://icon-sets.iconify.design/solar/?suffixes=Bold+Duotone), exposed through `src/components/ui/lighthouse-icons.ts`.

Use the `lighthouseIcons` map as the only product UI icon entrypoint. It should map product icon names to `solar:*‑bold-duotone` icons by default and keep module, status, and action icons consistent.

| Role | Runtime mapping | Component surface | Rule |
| --- | --- | --- | --- |
| Product mark | `logo` -> `solar:map-point-wave-bold-duotone` | Sidebar logo mark | `20px` glyph inside a `40px` mark. Amber active color with low glow. |
| Primary nav | `heart`, `mirror`, `action`, `workshop`, `hermit` | Navigation rows | `20px` Solar Bold Duotone glyph. Active state uses amber; inactive state uses deck icon color. |
| Search/input | `search` -> `solar:magnifer-bold-duotone` | `LhSearchBox`, filters | Use muted or primary color. Linear search is only an explicit exception. |
| Actions | `send`, `edit`, `delete`, `publish`, `reject`, `save`, `refresh`, `more` | Buttons, icon buttons, row actions | Solar Bold Duotone; glyph color follows the button variant or row-action state. |
| Status | `status`, `warning`, `info` | Callouts, badges, review states | Solar Bold Duotone with semantic status color; do not create one-off icon colors. |

Rules:

- Do not import ad hoc icons directly in pages when a `lighthouseIcons` key exists.
- Do not mix Solar icons with Lucide, Material, or hand-drawn SVGs inside platform UI.
- Solar Bold Duotone is the default for module, status, search, and action icons.
- Product and documentation examples must use the defined Solar icon source. Do not replace icons with text glyphs such as checkmarks, arrows, crosshairs, or ad hoc SVG drawings.
- Linear icons are allowed only as documented exceptions for dense input affordances.
- Official service-brand VI marks are assets, not platform icons. Do not redraw them with the platform icon system.

## Panel And Card

`LhPanel` is a bounded region. `LhCard` is a repeated item.

| Component | Meaning | Use |
| --- | --- | --- |
| `LhPanel` | A scoped work area | Forms, chat shell, admin queue, review region, large callout. |
| `LhCard` | One repeated unit | Case card, guide card, metric card, search result. |

Rules:

- Panels can contain cards, but avoid card-in-card nesting.
- Cards should have stable internal tracks: title, metadata, body, actions.
- Panel and card titles use `--title-card` by default. Use `--title-subsection` only when the panel is a major page subsection, not for every repeated card.
- No default glass blur. Use solid surface, border, and tokenized background.
- Hover elevation is allowed only when the whole card is clickable.

## Page-Level Primitives

These primitives sit above buttons/cards and below page templates. They exist so page migrations do not recreate the same typography and state rules in every route.

| Primitive | Use | Do not use for | Accessibility |
| --- | --- | --- | --- |
| `LhBackLink` | Shallow detail pages that return to a collection or module context. | Breadcrumbs, primary submit actions, or inline table actions. | Native link semantics; focus ring must stay external and visible on panel and page backgrounds. |
| `LhContentProse` | Markdown, case body text, source notes, and long-form reading blocks. | Data tables, form layouts, button groups, or arbitrary card decoration. | Keep semantic headings/lists in the content; do not fake headings with styled paragraphs. |
| `LhStateNotice` | Section-level success, info, warning, danger, and neutral messages with optional recovery action. | Empty data states or first-use guidance. | `warning` and `danger` default to `role="alert"`; other tones default to `role="status"`. |
| `LhEmptyState` | No data, no published cases, filtered empty, or future-content placeholders. | Errors, loading, or normal repeated content. | Title names the scope; description explains next step; actions are real buttons/links when available. |

Rules:

- Page-level primitives consume Classic Amber typography and tone tokens; do not pass raw color classes to make new variants.
- `LhContentProse` owns visual styling for Markdown descendants. Renderers should output semantic tags only.
- `LhEmptyState` and `LhStateNotice` are separate meanings. Do not use an empty state to report an error or a state notice to fill an empty collection.
- Back links use the Solar icon map through `lighthouseIcons`; do not draw custom arrows.

## Tags, Chips, And Status

Split label semantics into separate components or explicit wrappers.

| Meaning | Component | Color rule |
| --- | --- | --- |
| Category/filter | `LhTag` or `LhChip` | Neutral or primary-soft. |
| Status | `LhStatusBadge` | Semantic status color only. |
| Role | `LhRoleBadge` | Neutral with role icon or text. |
| Metric delta | `LhMetricChip` | Success/warning/danger only when the metric meaning requires it. |
| Code/path/key | `LhCode` / `LhKbd` | Mono, neutral, compact radius. |

`LhChip` can remain for compatibility, but new usage should name the meaning. `brass` is an editorial accent, not a status tone.

Status mapping:

| Status | Tone | Color |
| --- | --- | --- |
| Approved, completed, healthy | `success` | Current Classic Amber uses restrained brass; small text uses `--color-brass-text`. |
| Needs attention | `warning` | Amber/orange fill or border; small text uses `--color-primary-text`. |
| Failed, rejected, destructive | `danger` | Brick red fill/border, `--color-danger-text` for small text. |
| Draft, pending, processing, neutral info | `info` or `neutral` | Current Classic Amber uses brass or neutral; small text uses `--color-brass-text` and copy stays explicit. |

Do not use warning for pending. Do not use success for neutral "available" labels unless the state is explicitly healthy or completed.

## Forms

Runtime base: `LhTextField`, `LhTextArea`, `LhSearchBox`. Missing primitives to add later: select, checkbox, radio, switch, fieldset, error summary, combobox.

Field anatomy:

1. Visible label.
2. Input/control.
3. Helper text that explains what to enter.
4. Validation message adjacent to the field.

Rules:

- Placeholder shows example format only; it is never the label.
- Use `aria-describedby` for helper and error text.
- Use `aria-invalid` for invalid fields.
- Validate on blur by default; use debounced real-time validation for complex formats.
- Short forms may disable submit until valid. Long forms should allow submit and scroll to the first error.
- Related fields use `fieldset` and `legend`.

## Search And Filters

Search is navigation support, not just text input.

Rules:

- Global search appears in the product shell when the content structure is broad.
- Collection search appears next to filters and sort controls.
- Active filters appear as removable tags.
- A clear-all action appears when two or more filters are active.
- Preserve filter and view state when users move between list and detail pages where practical.

## Workflow Collections

Runtime base: `LhMetaList`, `LhSegmentedControl`, and `LhSubmissionCard`.

Use for Workshop-style flows where users switch scope, compare status, submit structured content, and review reusable guidance.

Rules:

- `LhSegmentedControl` owns tabs, role filters, and compact view scopes. Active state uses `aria-pressed` plus Classic Amber selected color.
- `LhMetaList` owns small status summaries, contribution rows, rule lists, and sidebar metadata. Do not rebuild these rows with page-local grid, border, type, and color classes.
- `LhSubmissionCard` owns guide cards and submission records: badges first, title, metadata, body, action, footer.
- Workflow pages can use layout hooks such as `data-lh-workshop-two-column`, but type size, weight, radius, shadow, and tone live in `globals.css`.
- Migrated Workshop files are covered by the design-system test migration list. They should not reintroduce local Tailwind text sizes, raw font weights, ad hoc rounded corners, `shadow-lh-*`, arbitrary gradients, or local icon sizing.

## Chat And Assistant Surfaces

Runtime base: `LhChatShell`, `LhChatHeader`, `LhChatMain`, `LhChatFooter`, `LhChatInputShell`, `LhChatTextarea`, `LhChatSubmitButton`, `LhMessageRow`, `LhMessageAvatar`, `LhMessageBubble`, and `LhSuggestionList`.

Use for Hermit-like assistant interfaces where the user submits a scenario and receives structured guidance.

Rules:

- The chat shell owns layout regions: header, scroll body, footer, and input.
- Message role is explicit through `data-role`, not only bubble color or alignment.
- User and assistant bubbles share radius, border, surface, typography, and shadow logic from tokens.
- Suggested questions are real buttons and keep focus-visible behavior.
- Markdown renderers output semantic tags only; message prose styling lives in the message wrapper.
- Chat components are migrated files: do not add local `text-sm`, `text-xl`, `font-extrabold`, `rounded-sm`, `shadow-lh-*`, or arbitrary gradient backgrounds in Hermit chat components.

## Data Table And Collections

Runtime base: `LhDataTableShell`.

Required patterns:

- Sticky header for scrolling tables.
- Sort state shown in the column header.
- Whole-row or whole-card selection target when selection is enabled.
- Selected state uses `--color-primary-soft` plus optional left accent.
- Bulk action toolbar appears when items are selected and starts with the selected count.
- Empty state distinguishes no data from no results under filters.

View modes:

| Mode | Use |
| --- | --- |
| Grid | Visual browsing or card-like content. |
| List | Text-led browsing, case lists, search results. |
| Table | Admin, review, comparison, high-density data. |

## Callout And Feedback

Use `LhCallout` for persistent contextual messages. Use toast/snackbar only for transient feedback.

| Feedback | Pattern |
| --- | --- |
| Inline form issue | Field error. |
| Section issue | `LhCallout` in the affected panel. |
| Blocking failure | Full-page or modal error with recovery action. |
| Transient success/failure | Toast with concise copy and retry where needed. |

Every error state should say what happened and what the user can do next.

## Content Rules

- Button labels use specific verbs: publish guide, save draft, retry import, clear filters.
- Avoid generic confirmation labels such as "OK" or "Yes" for destructive actions.
- Empty states name the current scope and the next meaningful action.
- Loading copy names the object or region being loaded when the wait is noticeable.
- Hermit answers should separate direct answer, principle basis, related evidence, and next action when those parts are available.

## Page Hero And Section Header

`LhPageHero` introduces the page task. It is not a marketing hero by default.

Rules:

- Page hero should answer: where am I, what is this for, what can I do next?
- Keep page title to one clear idea.
- Use section headers to structure work areas; avoid decorative cards used only for headings.
- Serif or editorial emphasis is allowed on Heart-like content pages, but not on admin, forms, tables, or ordinary UI copy.

## Navigation And Shell

The shell is part of the component library even if it lives outside `src/components/ui`.

Required components:

- App shell
- Sidebar or primary nav
- Header
- Global search
- Context header
- Breadcrumb/back-link pattern

Rules:

- Product logo links to the primary landing page.
- Primary nav remains stable across modules.
- Deep pages show a back link or breadcrumb.
- Actions state their scope before the user commits.

Shell surface variants:

| Variant | Required behavior | Misuse boundary |
| --- | --- | --- |
| Operational shell | Default cream floating sidebar, stable Solar icons, search, notification, active module state, focus ring, and keyboard behavior. | Do not restyle per page to express local mood. |
| Immersive home shell | Homepage cover may darken and reduce the same sidebar surface with `data-home-surface="true"`, then transition back to the operational shell with `--lh-home-nav-progress`. | Do not use it as a dark-mode shell, a campaign navigation, or a style for Hermit / Workshop / admin pages. |

Rules:

- The immersive shell is a surface treatment of the existing navigation component. It does not change nav labels, icon mappings, hit targets, or ordering.
- Search and notifications remain shell utilities and must stay visually aligned with the nav items in both shell variants.
- The transition from immersive to operational is allowed only on Homepage / Heart, where the first screen has a dark image cover and the following content returns to warm paper.
- Any future shell variant must be documented here before runtime CSS is added.

## Acceptance Checklist

- [ ] Components use tokens from `docs/design/tokens.md` and `src/app/globals.css`.
- [ ] Buttons and inputs align in height, radius, border, and focus state.
- [ ] Status colors have one meaning each.
- [ ] Tags, statuses, roles, metrics, and code labels are not all implemented as one generic badge.
- [ ] New interactive states include hover, focus-visible, active, disabled, and loading where relevant.
- [ ] Destructive actions use `danger` and require confirmation when irreversible.
- [ ] Disabled, loading, empty, and error states include enough copy for recovery.
- [ ] Component anatomy and misuse boundaries are documented before adding a new primitive.
- [ ] Significant component changes update `src/components/ui/lighthouse-design-system.test.ts`.
