# Lighthouse Platform Visual System Boundary

## Decision

The active implementation baseline is Classic Amber V3. The complete reference is the approved Figma system at `node-id=121-983`; this folder translates that reference into runtime tokens, components, and page patterns.

The Lighthouse platform visual system is independent from the service-brand VI.

Lighthouse is a product platform for reading brand principles, finding cases,
asking Hermit, maintaining content, reviewing submissions, and navigating
between modules. Its UI should support orientation, judgment, traceability, and
operational confidence.

The service-brand VI belongs outside this app repository. It defines official
marks, brand typography, brand assets, and brand-facing expression. In this
workspace, those materials live in the adjacent Lantern brand workspace:

`../brand-vi-and-training/brand-vi/`

## Layer Model

| Layer | Primary question | Source area | Should define |
| --- | --- | --- | --- |
| Service-brand VI | How does the service brand appear and speak? | Adjacent Lantern brand workspace, outside this app repo | Official marks, lockups, VI colors, brand fonts, and brand-facing assets. |
| Brand-value knowledge | Which brand-value language should Hermit and Heart use? | `docs/brand/` | Brand-value source text intentionally included in Lighthouse knowledge building. |
| Lighthouse product UI | How does the platform behave, guide, and organize work? | `docs/design/`, `src/app/globals.css`, `src/components/ui/` | Product tokens, layout rules, navigation, cards, forms, status colors, Hermit chat UI, admin/workshop density, interaction states. |
| V3 page scope | How do the non-home pages share a precise frame? | `src/app/visual-v3.css`, `src/components/ui/PageHeading.tsx` | Shared page header, 1280px desktop frame, 44/56 and 32/44 titles, 24px grid gaps, mobile one-column collapse. |

## Repository Classification

| File or folder | Classification | Active status |
| --- | --- | --- |
| `../brand-vi-and-training/brand-vi/` | Service-brand VI | External brand source, outside the app repo. |
| `docs/brand/` | Brand-value knowledge | Content source for Heart and Hermit knowledge. |
| `docs/design/lighthouse-classic-amber-visual-spec.html` | Lighthouse product UI | Active browser-readable Classic Amber visual specification. |
| `docs/design/tokens.md` | Lighthouse product UI | Product token contract. |
| `docs/design/components.md` | Lighthouse product UI | Product component contract. |
| `docs/design/patterns.md` | Lighthouse product UI | Product page-pattern contract. |
| `docs/design/do-dont.md` | Lighthouse product UI | Governance and misuse boundaries. |
| `src/app/globals.css` | Runtime product UI | Active implementation. |
| `src/components/ui/lighthouse-primitives.tsx` | Runtime product UI | Active component primitives. |
| `src/components/ui/lighthouse-icons.ts` | Runtime product UI | Active local icon map. |
| `src/components/ui/lighthouse-design-system.test.ts` | Runtime product UI | Active guardrail tests. |

## Source Of Truth

For the approved V3 visual direction, read the complete Figma reference first:

- [Classic Amber V3 complete design system](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=121-983)
- The runtime implementation under `main[data-lh-v3]` and `src/app/visual-v3.css`.

For service-brand VI decisions:

1. `../brand-vi-and-training/brand-vi/`
2. Brand-value docs in `docs/brand/`, only for language and knowledge context.

For Lighthouse product UI decisions:

1. This boundary document.
2. `docs/design/lighthouse-classic-amber-visual-spec.html`
3. `docs/design/tokens.md`
4. `docs/design/components.md`
5. `docs/design/patterns.md`
6. `docs/design/do-dont.md`
7. Active runtime implementation in `src/app/globals.css` and `src/components/ui/`.
8. Active tests in `src/components/ui/lighthouse-design-system.test.ts`.

## Guardrails

- Do not move service-brand VI assets into product UI folders unless there is a deliberate decision.
- Do not import the VI color palette wholesale into Lighthouse platform controls.
- Do not let campaign, H5, poster, or video explorations become default app shell rules.
- Do not use platform UI tokens to redraw or reinterpret official brand marks.
- Keep local plans, demos, generated output, and media artifacts outside Git tracking unless they become active product contracts.
