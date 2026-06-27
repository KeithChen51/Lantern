# Lighthouse Platform Tokens v0.1

## Status

This is the first platform token contract for Lighthouse product UI. It defines the target roles that runtime CSS should converge to.

- Layer: `lighthouse-product-ui`
- Runtime counterpart: `src/app/globals.css`
- Active HTML spec: `docs/design/lighthouse-classic-amber-visual-spec.html`
- Not a source for: official service-brand marks, VI lockups, campaign posters, or H5 output assets

The active runtime and current visual direction use the Classic Amber implementation. Exploration palettes in `docs/design/lighthouse-color-system.html` and related warm-palette files are not active unless explicitly promoted later.

## Product Tone

Lighthouse is a service-culture knowledge and execution platform. The UI should feel clear, trustworthy, thoughtful, and structured.

- Use warmth for reading and value interpretation surfaces.
- Use stronger neutrality and density for tools, review queues, admin, and data work.
- Use the lighthouse metaphor as orientation, signal, and guidance; avoid decorative glow as a default styling language.
- Keep platform controls independent from the service-brand VI palette unless a specific content surface calls for official brand assets.

## Color Roles

The active platform palette is Classic Amber: a warm paper surface with amber action color and brass secondary signal color.

| Role | Target token | Target value | Meaning |
| --- | --- | --- | --- |
| Page | `--color-page` | `#f3efe0` | App background and large warm paper regions. |
| Page start | `--color-page-start` | `#f8f3e5` | Top gradient and hero background start. |
| Page end | `--color-page-end` | `#eee6d0` | Bottom gradient and page depth. |
| Surface | `--color-surface` | `rgba(255, 255, 255, 0.4)` | Cards, panels, readable blocks. |
| Surface quiet | `--color-surface-quiet` | `color-mix(in srgb, #d97706 8%, #f3efe0)` | Subtle section bands, inactive fills. |
| Ink | `--color-ink` | `#2c2c2c` | Primary text, important icons. |
| Ink soft | `--color-ink-soft` | `color-mix(in srgb, #2c2c2c 74%, white)` | Secondary headings and supporting text. |
| Muted | `--color-muted` | `color-mix(in srgb, #2c2c2c 58%, white)` | Metadata, helper text, low-priority labels. |
| Faint | `--color-faint` | `color-mix(in srgb, #2c2c2c 34%, white)` | Placeholder text and disabled labels. |
| Line | `--color-line` | `rgba(44, 44, 44, 0.08)` | Default borders and dividers. |
| Line strong | `--color-line-strong` | `rgba(217, 119, 6, 0.28)` | Active region boundaries and form borders. |
| Primary | `--color-primary` | `#d97706` | Primary actions, active navigation, selected highlights. |
| Primary deep / text | `--color-primary-deep`, `--color-primary-text` | `#9b5c14` | Hover/active state and small amber text that must pass contrast. |
| Primary soft | `--color-primary-soft` | `rgba(217, 119, 6, 0.1)` | Selected backgrounds and low-emphasis active states. |
| Signal / Brass | `--color-signal`, `--color-brass` | `#9b7a4c` | Secondary signal, quiet success/info/brass labels. |
| Signal text | `--color-signal-text`, `--color-brass-text` | `#806744` | Small success/info/brass text that must pass contrast. |
| Danger text | `--color-danger-text` | `#965040` | Small error, destructive, and danger text that must pass contrast. |

### Semantic Colors

Each status color has exactly one meaning. Do not reuse semantic colors for decoration.

| Meaning | Token | Target value | Rule |
| --- | --- | --- | --- |
| Success | `--color-success` / `--color-success-text` | `#9b7a4c` / `#806744` | Completed, healthy, approved in the current restrained brass treatment. |
| Warning | `--color-warning` | `#d97706` | Needs attention before proceeding; also the classic primary accent. |
| Danger | `--color-danger` / `--color-danger-text` | `#b85c46` / `#965040` | Error, destructive, failed, cannot be undone. |
| Info | `--color-info` / `--color-info-text` | `#9b7a4c` / `#806744` | Neutral information, pending, system message in the current brass treatment. |

Classic Amber keeps the semantic set intentionally warm and restrained. If future implementation needs stronger semantic separation, update this document and the HTML visual spec together before changing runtime CSS.

### Runtime Mapping

This table is the bridge between the HTML visual specification and the active CSS runtime. A design role is considered implemented only when the HTML demo token, runtime CSS token, and component usage agree.

| Design role | HTML demo token | Runtime CSS token | Usage |
| --- | --- | --- | --- |
| Warm paper page | `--lh-page` | `--color-page`, `--color-paper` | Body background, shell background, large reading surfaces. |
| Primary amber action | `--lh-amber` / `--lh-primary` | `--color-primary`, `--color-action` | Primary filled buttons, active icon fill, selected background accents. Not for small text. |
| Readable amber text | `--lh-primary-text` | `--color-primary-text`, `--color-primary-deep`, `--color-action-deep` | Small active nav text, text buttons, amber chip text, hover/active foregrounds. |
| Brass secondary signal | `--lh-brass` | `--color-brass`, `--color-signal` | Quiet secondary borders, soft fills, non-critical status icon color. |
| Readable brass text | `--lh-brass-text` | `--color-brass-text`, `--color-signal-text`, `--color-success-text`, `--color-info-text` | Small success/info/brass labels and status badges that must pass contrast. |
| Warning text | `--lh-primary-text` | `--color-warning-text` | Warning chip/status text; amber remains warning, but small text uses the deep token. |
| Danger text | `--lh-danger-text` | `--color-danger-text` | Error helper copy, danger chips, destructive text buttons. |
| Focus outline | `--lh-focus-outline` | `--lh-focus-outline` | `2px` visible outline for every keyboard-reachable control. |
| Focus halo | `--lh-focus-halo`, `--shadow-focus` | `--lh-focus-halo`, `--shadow-focus` | Secondary glow around focus outline; never the only indicator. |
| Focus offset | `3px` | `--lh-focus-offset` | Separation between component edge and focus outline. |
| UI font | `--font-sans-stack` | `--font-sans-stack`, `--font-hei-stack` | App chrome, navigation, controls, tables, admin, Hermit interaction UI. Must start with PingFang SC. |
| Serif accent font | `--font-serif-stack` | `--font-serif-stack`, `--font-noto-stack` | Page display titles and explicit editorial moments. Must start with Source Han Serif SC. |
| Type scale | `--type-*` | `--type-caption`, `--type-label`, `--type-control`, `--type-body`, `--type-reading`, `--type-lead`, `--type-h3`, `--type-h2`, `--type-display` | Runtime source for all reusable component font sizes. |
| Title scale | `--title-*` | `--title-display`, `--title-page`, `--title-section`, `--title-subsection`, `--title-card`, `--title-kicker` | Runtime source for page, section, card, and kicker hierarchy. |
| Weight scale | `--weight-*` | `--weight-regular`, `--weight-medium`, `--weight-semibold`, `--weight-bold`, `--weight-extrabold`, `--weight-black` | Runtime source for reusable component weights. |
| Line-height scale | `--leading-*` | `--leading-caption`, `--leading-label`, `--leading-control`, `--leading-body`, `--leading-reading`, `--leading-lead` | Runtime source for component vertical rhythm. |
| Kicker tracking | `--tracking-kicker` | `--tracking-kicker` | Structural small labels only; not body copy. |

## Typography

Use a sans-serif UI system by default. Serif is an editorial accent, not the body font for product controls.

| Role | Token | Rule |
| --- | --- | --- |
| UI and body | `--font-sans` / `--font-hei-stack` | Use PingFang SC first for app chrome, controls, forms, tables, cards, admin, Hermit input/output, and normal UI body. Fallback: PingFang TC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Source Han Sans SC, Noto Sans SC, sans-serif. |
| Chinese reading | `--font-reading` | Use PingFang SC for ordinary long-form product reading unless the page has an explicit editorial reason to use serif. |
| Serif accent | `--font-serif` / `--font-serif-stack` | Use Source Han Serif SC first for quotations, chapter-like moments, page display titles, and rare value-emphasis headings. Fallback: Noto Serif SC, Songti SC, SimSun, serif. |
| Mono | `--font-mono` | Code, file names, IDs, technical counters. |

Recommended size scale:

| Role | Token | Size / line height | Use |
| --- | --- | --- | --- |
| Caption | `--type-caption` | `12px / 16px` | Metadata, timestamp, secondary table hints. |
| Label | `--type-label` | `13px / 18px` | Helper text, dense labels, compact explanations. |
| Control | `--type-control` | `14px / 20px` | Buttons, nav, inputs, admin tables, chips. |
| Body | `--type-body` | `15px / 24px` | Cards, lists, default product reading. |
| Reading | `--type-reading` | `16px / 28px` | Hermit answers, long-form values, editorial content. |
| Lead | `--type-lead` | `20px / 32px` | Section lead, key explanation. |
| H3 | `--type-h3` | `25px / 30px` | Local subsection heading. |
| H2 | `--type-h2` | `31px / 35px` | Page section heading. |
| Display | `--type-display` | `40px` to `72px / 1.04` | Top-level page title only. |

Heading style roles:

| Role | Token | Font | Size / line height | Weight | Use |
| --- | --- | --- | --- | --- | --- |
| Display / Hero | `--title-display` | Source Han Serif SC | `40px` to `72px / 1.04` | `900` | First-screen title, value-reading cover, empty-state main sentence. |
| Page Title | `--title-page` | Source Han Serif SC | `32px` to `44px / 1.1` | `900` | Product page main title; one per page. |
| Section Title | `--title-section` | Source Han Serif SC | `31px / 1.14` | `700` | Main section title inside a page or spec document. |
| Subsection | `--title-subsection` | Source Han Serif SC | `25px / 1.2` | `700` | Secondary group title inside a section. |
| Card Title | `--title-card` | Source Han Serif SC or PingFang SC | `20px / 1.25` | `700` | Card, panel, form group, and compact module title. |
| Kicker / Label | `--title-kicker` | PingFang SC | `12px / 1.2`, `0.12em` letter spacing | `900` | Structural label above a heading. Do not use it as body content. |

Rules:

- A view should normally use no more than Display/Page, Section, and Card title levels at once.
- Use Kicker labels sparingly for structure, not for decorative numbering.
- Do not create one-off heading sizes between the defined title roles.
- Product controls and dense admin surfaces should prefer PingFang SC card titles when serif headings feel too editorial.

Weight scale:

| Token | Weight | Use |
| --- | --- | --- |
| `--weight-regular` | `400` | Body text, table body, long reading. |
| `--weight-medium` | `500` | Mild emphasis in summaries. |
| `--weight-semibold` | `600` | Lead text and important reading emphasis. |
| `--weight-bold` | `700` | Navigation labels, row titles, stable labels. |
| `--weight-extrabold` | `800` | Buttons, component titles, actionable labels. |
| `--weight-black` | `900` | Kicker labels, key states, rare display emphasis. |

Do not scale type directly with viewport width. Use fixed steps and responsive layout constraints instead. The body floor is `15px`, and normal reading should prefer `16px`.

Runtime contract:

- `src/app/globals.css` must expose every `--type-*`, `--title-*`, `--leading-*`, `--weight-*`, and `--tracking-*` token listed above.
- `src/components/ui/lighthouse-primitives.tsx` and `src/components/layout/Navigation.tsx` must consume typography tokens for reusable component font size, weight, and line height.
- Raw Tailwind typography utilities such as `text-sm`, `text-xs`, `font-bold`, and `leading-6` are allowed only as page-local migration debt, not inside shared primitives or the navigation shell.
- Changing a type role starts here, then updates the HTML visual spec, runtime CSS, primitives, and design-system tests in the same change set.

## Spacing And Density

Use a 4px base scale.

| Token | Value | Use |
| --- | --- | --- |
| `--space-1` | `4px` | Hairline gaps, compact icon spacing. |
| `--space-2` | `8px` | Inline gaps, chip padding. |
| `--space-3` | `12px` | Compact stack spacing, small controls. |
| `--space-4` | `16px` | Default card inner gap and column gap. |
| `--space-5` | `20px` | Compact panel padding and component clusters. |
| `--space-6` | `24px` | Section body padding and row gap. |
| `--space-7` | `28px` | Shell gap between fixed sidebar and main region. |
| `--space-8` | `32px` | Desktop page gutter and major group separation. |
| `--space-10` | `40px` | Hero and page-level breathing room. |
| `--space-12` | `48px` | Large cross-module separation. |

Spacing rules:

- Use `4px` and `8px` inside a small control or icon group.
- Use `12px` and `16px` between related controls and repeated cards.
- Use `24px` and `32px` between sections inside the same page.
- Use `40px` and `48px` only for page-level separation, not inside dense product controls.

Desktop is the current primary platform. Mobile rules are deferred, but desktop tokens must not make later mobile adaptation impossible.

| Density | Row height | Cell padding | Use |
| --- | --- | --- | --- |
| Compact | `32px` | `8px 12px` | Admin tables, review queues, dense data. |
| Default | `40px` | `10px 14px` | Standard tables and lists. |
| Spacious | `48px` | `12px 16px` | Reading lists, public content cards. |

## Grid System

Classic Amber uses a stable desktop-first grid rather than exploratory asymmetric layouts. The system has four layers.

### 1. Shell Grid

| Token | Value | Use |
| --- | --- | --- |
| `--grid-sidebar-expanded` | `240px` | Primary navigation in the product shell. |
| `--grid-sidebar-collapsed` | `80px` | Collapsed navigation shell. |
| `--grid-main-offset-expanded` | `260px` | Main content offset when sidebar is pinned. |
| `--grid-main-offset-collapsed` | `100px` | Main content offset in collapsed shell. |
| `--grid-page-gutter` | `32px` | Desktop page breathing room. |
| `--grid-content-max` | `1220px` | Primary page content width. |

The HTML visual spec uses a `248px` local sidebar only because the document navigation labels are longer than the app navigation labels.

### 2. Content Grid

| Token | Value | Use |
| --- | --- | --- |
| `--grid-columns` | `12` | Logical columns inside the main work area. |
| `--grid-column-gap` | `16px` | Default content-column and card-column gap. |
| `--grid-row-gap` | `24px` | Default vertical rhythm inside a content grid. |
| `--grid-section-gap` | `30px` target | Vertical rhythm between major page sections. |

Allowed spans:

- `12 / 12`: page title, primary work region, Hermit chat shell, admin tables.
- `8 / 4`: reading page with aside, detail page with evidence or metadata.
- `6 / 6`: comparison, two related panels, form split.
- `4 / 4 / 4`: three repeated cards or status groups.
- `3 / 3 / 3 / 3`: compact token cards, icon roles, palette samples.

### 3. Component Grid

| Pattern | Rule |
| --- | --- |
| Card groups | Use 2, 3, or 4 columns only. Do not invent one-off widths for decoration. |
| Forms | Two-column groups are allowed for related short fields. Long fields span all columns. |
| Toolbars | Group by proximity first. Use larger gaps between unrelated command groups. |
| Panels | A panel is a scoped work area, not a decorative card around a section. |

### 4. Data Grid

| Token | Value | Use |
| --- | --- | --- |
| `--grid-table-min` | `720px` | Preserve comparison before horizontal scroll. |
| Table cell padding | `13px 16px` | Default data table rhythm. |
| Compact row | `32px` | Dense admin queues. |
| Default row | `40px` | Standard records and lists. |
| Spacious row | `48px` | Reading lists and public content cards. |

Rules:

- Use tables when values must be compared field by field.
- Use cards when each item is read as an object, not when columns are needed.
- Use 8/4 layouts for content plus context, not for arbitrary visual variety.
- Mobile implementation is deferred, but every grid must have an obvious future one-column collapse path.

## Radius

Shape language should be structured and warm, not overly rounded.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-xs` | `4px` | Inline code, small status dot containers. |
| `--radius-sm` | `6px` | Small badges, compact controls. |
| `--lh-control-radius` | `8px` | Buttons, inputs, selects, icon buttons, badges. |
| `--radius-lg` | `12px` | Medium rounded surfaces and nested content. |
| `--lh-card-radius` | `16px` | Cards, panels, callouts, table shells, large textareas. |
| `--radius-modal` | `16px` or higher | Dialogs, drawers, popovers with substantial content. |
| `--radius-full` | `999px` | Pills, avatars, segmented controls, search field. |

Cards should not become decorative bubbles. Use the current `16px` card radius for product surfaces and the `8px` control radius for all interactive controls.

## Borders, Elevation, And Surfaces

Default UI surfaces are solid, readable, and lightly bounded.

- Cards and panels use `1px` borders plus subtle surface fills.
- Shadows are reserved for overlays, active popovers, dialogs, and intentional raised states.
- Avoid glass blur and low-opacity text as default product styling.
- Use a stronger line or selected background to communicate active scope.

| Token | Value | Use |
| --- | --- | --- |
| `--border-thin` | `1px` | Default borders. |
| `--border-strong` | `3px` | Selected row accent or active region marker. |
| `--shadow-sm` | `0 2px 10px rgba(0, 0, 0, 0.02)` | Default cards, panels, table shells. |
| `--shadow-md` | `0 8px 30px rgba(0, 0, 0, 0.04)` | Hovered clickable cards and elevated panels. |
| `--shadow-deck` | `0 18px 42px rgba(0, 0, 0, 0.05)` | Hero aside, deck panels, rare raised summary blocks. |
| `--focus-outline` | `2px solid #9b5c14` | Required visible focus outline. |
| `--focus-offset` | `3px` | Required gap between control and focus outline. |
| `--shadow-focus` | `0 0 0 3px rgba(217, 119, 6, 0.18)` | Secondary focus halo; never the only focus indicator. |
| Primary button shadow | `0 1px 0 rgba(255,255,255,.16) inset, 0 8px 16px rgba(217,119,6,.18)` | Primary buttons only. |
| Amber icon glow | `drop-shadow(0 0 8px rgba(217, 119, 6, 0.5))` | Active nav icon and logo icon only. |

Rules:

- Pair every elevated surface with a `1px` border. The border defines the edge; the shadow only adds depth.
- Do not add shadows to every card. Default cards use Level 1; hover/elevated states use Level 2.
- Do not use heavy black shadows. The Classic Amber system should feel like paper and light, not floating glass.
- The spec document may show subtle examples, but product pages should not use background grids, radial glow, translucent floating sections, or amber glow as default composition.

## Iconography

Default source: [Iconify Solar Bold Duotone](https://icon-sets.iconify.design/solar/?suffixes=Bold+Duotone), exposed in the app through `src/components/ui/lighthouse-icons.ts`.

| Role | Source | Size | Color |
| --- | --- | --- | --- |
| Logo mark | `solar:map-point-wave-bold-duotone` | `20px` glyph in `40px` mark | Amber, with low glow when active. |
| Navigation | `solar:heart-bold-duotone`, `solar:book-2-bold-duotone`, etc. | `20px` glyph in a `24px` track | Active amber; inactive deck icon color. |
| Search/input | `solar:magnifer-bold-duotone` | `20px` | Primary or muted. |
| Actions | `solar:plain-bold-duotone`, `solar:pen-2-bold-duotone`, etc. | `20px` | Inherit button or row-action color. |
| Status | `solar:check-circle-bold-duotone`, `solar:danger-triangle-bold-duotone`, `solar:info-circle-bold-duotone` | `16px` to `20px` | Semantic status color only. |

Rules:

- Import icons from `lighthouseIcons`; do not import random Iconify names directly in pages.
- Do not mix icon libraries in the product UI.
- Use Solar Bold Duotone as the default for module, status, search, and action icons.
- Documentation and product examples must render actual Solar icons. Do not use text glyphs such as checkmarks, arrows, crosshairs, or hand-drawn SVG placeholders in place of defined icons.
- Linear icons are exceptions, not defaults. Use them only when a specific dense input affordance needs a lighter visual weight and document the exception at the component.
- Icon-only buttons must use `LhIconButton` and require an accessible label.
- Do not redraw official service-brand VI marks with platform icon tokens.

## Motion

Motion should clarify state changes without making the product feel animated for its own sake.

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | `120ms` | Hover, press, chip state. |
| `--motion-base` | `180ms` | Panel state, row selection, button transitions. |
| `--motion-slow` | `240ms` | Dialogs, drawers, large region transitions. |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | Default easing. |

Respect `prefers-reduced-motion`.

## Z-Index

| Token | Value | Use |
| --- | --- | --- |
| `--z-header` | `40` | Global header. |
| `--z-sidebar` | `35` | Pinned sidebar. |
| `--z-sticky` | `30` | Sticky table headers and local sticky bars. |
| `--z-popover` | `50` | Menus, tooltips, combobox popovers. |
| `--z-modal` | `70` | Dialogs and drawers. |
| `--z-toast` | `80` | Temporary notifications. |

## Accessibility Tokens And Rules

Classic Amber must remain readable before it feels refined.

| Rule | Contract |
| --- | --- |
| Text contrast | Body, table, button, and form text target `4.5:1` contrast or better. Large display text and essential icons target `3:1` or better. |
| Amber text | `--color-primary` is not valid for small text on warm paper or white surfaces. Use `--color-primary-text` for small nav, chips, text buttons, and inline amber emphasis. |
| Signal text | `--color-brass` is not valid for small status text. Use `--color-brass-text` / semantic `*-text` aliases for success/info/brass labels. |
| Danger text | `--color-danger` is not valid for small text on warm paper. Use `--color-danger-text` for error copy and destructive labels. |
| Focus visible | Keyboard focus uses `2px` outline, `3px` offset, and `--shadow-focus` halo. The halo is supporting feedback, not the sole visible indicator. |
| Touch target | Touch and mobile controls target at least `44px` in both dimensions. Dense desktop controls may be smaller only when adjacent keyboard/mouse affordances are clear. |
| Color independence | Status, errors, selected state, and progress must not rely on color alone. Pair color with text, icon, dot, border, or placement. |
| Reduced motion | `prefers-reduced-motion` disables non-essential transitions and any repeated or decorative animation. |

Disabled content must remain readable. Use lower emphasis, explanatory text, and unavailable-state messaging rather than opacity alone.

## Interaction State Tokens

Every interactive component should define the states below before it is considered part of the platform system.

| State | Visual token or rule | Behavior rule |
| --- | --- | --- |
| Default | Component base token. | Clearly communicates whether the element is interactive. |
| Hover | Slight background, border, or shadow change. | Desktop pointer only; no critical behavior hidden behind hover. |
| Pressed / active | Stronger selected or pressed fill. | Must not change layout size. |
| Focus-visible | `2px` outline, `3px` offset, and `--shadow-focus` halo. | Keyboard reachable and ordered with the page reading flow; sticky headers, sidebars, and mobile bottom nav must not obscure focused elements. |
| Disabled | Muted but readable text and controls. | Explain why unavailable when the reason is not obvious. |
| Loading | Preserve width and label context. | Prevent duplicate submit and state what is processing for longer tasks. |
| Selected | `--color-primary-soft` plus optional left accent. | Scope of selection must be visible before bulk actions. |
| Error | `--color-danger-text`, nearby message, and recovery action. | State what happened and what the user can do next. |

## Implementation Rule

New UI code should reference semantic tokens (`--color-primary`, `--color-warning`, `--radius-control`, etc.) rather than one-off hex values or page-local utility strings. When a token does not exist, define it here before adding it to runtime CSS.

Design-system changes follow this order: update token contract, update HTML visual spec, map the component or pattern, then update runtime CSS/components and tests. HTML-only exploratory examples do not become active tokens until this file and runtime CSS agree.
