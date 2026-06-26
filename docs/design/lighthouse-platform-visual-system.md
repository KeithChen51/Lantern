# Lighthouse Platform Visual System Boundary

## Decision

The Lighthouse platform visual system is independent from the new service-brand VI.

The new VI belongs to the service-brand upgrade layer. It defines official marks, brand typography, brand assets, and brand-facing expression for `精诚服务`.

Lighthouse is a product platform. It needs its own visual system because it carries product tasks: reading brand principles, finding cases, asking Hermit, maintaining content, reviewing submissions, and navigating between modules. Its UI should support orientation, judgment, traceability, and operational confidence.

## Two-Layer Model

| Layer | Primary question | Source area | Should define |
| --- | --- | --- | --- |
| Service-brand VI | How does the service brand appear and speak? | `docs/brand/` | Official marks, brand lockups, VI colors, brand fonts, brand-value documents, brand-facing assets. |
| Lighthouse product UI | How does the platform behave, guide, and organize work? | `docs/design/`, `src/app/globals.css`, `src/components/ui/` | Product tokens, layout rules, navigation, cards, forms, status colors, Hermit chat UI, admin/workshop density, interaction states. |

## Relationship

The service-brand VI can inform Lighthouse, but it does not control Lighthouse by default.

Use service-brand VI directly when:

- Showing official `精诚服务` marks or brand lockups.
- Rendering brand documents, whitepaper content, value explanations, or official brand assets.
- Producing campaign, report, poster, or H5 artifacts where the output itself is brand-facing.

Use Lighthouse product UI when:

- Building platform navigation, header, sidebar, and search.
- Designing cards, panels, forms, tables, status badges, callouts, and buttons.
- Designing Hermit chat, admin tools, review queues, Workshop contribution flows, and content-maintenance surfaces.
- Defining state colors, focus states, loading/empty/error states, and product interaction behavior.

## Product Visual Positioning

Lighthouse should not simply inherit the new VI's modern/minimal campaign style. The platform has its own product meaning:

- It is a service-culture knowledge and execution platform, not only a brand showroom.
- It translates `精诚服务` from concept into reading paths, cases, guidance, questions, and review workflows.
- It should feel clear, trustworthy, thoughtful, and structured.
- It can carry warmth and editorial quality where users are reading values, but tools and admin areas need stronger state clarity and operational hierarchy.

## Current Repository Classification

| Existing file or folder | Current classification | Active status |
| --- | --- | --- |
| `docs/brand/精诚服务新版VI方案.md` | Service-brand VI | Brand source. |
| `docs/brand/精诚服务新版VI手册.html` | Service-brand VI | Brand source. |
| `docs/brand/vi-assets/` | Service-brand VI assets | Locked asset source. |
| `docs/brand/精诚服务品牌价值观纲领白皮书.md` | Brand-value content | Content source for Heart and Hermit knowledge. |
| `docs/brand/精诚服务 (The Genuine Way) 品牌价值观框架与落地指南.md` | Brand-value content | Content source for explanations and guidance. |
| `docs/design/lighthouse-ui-kit.html` | Lighthouse product UI exploration | Reference, not yet a full implementation spec. |
| `docs/design/lighthouse-color-system.html` | Lighthouse product color exploration | Reference, not yet a final token spec. |
| `docs/design/lighthouse-value-theme-panels.html` | Value-panel visual exploration | Exploratory. |
| `docs/design/lighthouse-warm-palette-options.html` | Palette exploration | Exploratory. |
| `docs/design/lighthouse-warm-happiness-kits.html` | Palette/component exploration | Exploratory. |
| `docs/design/dealer-service-h5-preheat-demo.html` | Campaign/output artifact | Not product UI source. |
| `src/app/globals.css` | Runtime product tokens and overrides | Active implementation. |
| `src/components/ui/lighthouse-primitives.tsx` | Runtime product component primitives | Active implementation. |
| `src/components/ui/lighthouse-icons.ts` | Runtime product icon map | Active implementation. |
| `src/components/ui/lighthouse-design-system.test.ts` | Runtime product UI contract tests | Active guardrail. |

## Source-Of-Truth Order

For service-brand decisions:

1. `docs/brand/精诚服务新版VI手册.html`
2. `docs/brand/精诚服务新版VI方案.md`
3. `docs/brand/vi-assets/`
4. Brand-value docs in `docs/brand/`

For Lighthouse product UI decisions:

1. This boundary document.
2. `docs/design/lighthouse-classic-amber-visual-spec.html`: active browser-readable Classic Amber visual specification.
3. `docs/design/tokens.md`: product colors, type, spacing, radius, shadow, motion, z-index, and semantic status tokens.
4. `docs/design/components.md`: product components, variants, states, and when to use them.
5. `docs/design/patterns.md`: page patterns for Heart, Hermit, admin, Workshop, cases, and content maintenance.
6. `docs/design/do-dont.md`: explicit rules for mixing brand VI assets with platform UI.
7. Active runtime implementation in `src/app/globals.css` and `src/components/ui/`.
8. Active tests in `src/components/ui/lighthouse-design-system.test.ts`.
9. Product UI references in `docs/design/lighthouse-ui-kit.html` and `docs/design/lighthouse-color-system.html`.
10. Exploratory files in `docs/design/`.

## Companion Specs

The first Lighthouse product design-system docs now exist:

- `docs/design/lighthouse-classic-amber-visual-spec.html`
- `docs/design/tokens.md`
- `docs/design/components.md`
- `docs/design/patterns.md`
- `docs/design/do-dont.md`

These documents define the target contract. Runtime implementation can lag during migration, but new UI decisions should reference the docs first and update runtime tokens/components deliberately.

## Guardrails

- Do not move brand VI assets into product UI folders unless there is a deliberate decision.
- Do not import the VI color palette wholesale into Lighthouse platform controls.
- Do not let campaign/H5 visual explorations become default app shell rules.
- Do not use platform UI tokens to redraw or reinterpret official brand marks.
- When a new design file is added, classify it as `service-brand-vi`, `lighthouse-product-ui`, or `campaign-or-output-artifact`.
