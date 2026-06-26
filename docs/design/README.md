# Lighthouse Platform Design

This folder is for the Lighthouse platform product visual system and design explorations. It is separate from the service-brand upgrade VI in `docs/brand/`.

## System Boundary

Lighthouse is a product platform for service culture knowledge, cases, guidance, and assistant workflows. Its UI must express platform qualities: orientation, judgment support, trust, reading clarity, and operational control.

The service-brand VI is an upstream brand asset layer. It should inform brand content and official asset usage, but it should not automatically decide platform tokens, component styling, admin density, state colors, or interaction patterns.

See `lighthouse-platform-visual-system.md` for the layer boundary. Use `tokens.md`, `components.md`, `patterns.md`, and `do-dont.md` as the first platform design-system contract.

## Recommended Read Order

1. `lighthouse-platform-visual-system.md`: confirm the boundary between service-brand VI and Lighthouse product UI.
2. `lighthouse-classic-amber-visual-spec.html`: review the active Classic Amber visual specification in a browser.
3. `tokens.md`: use the product color, type, spacing, radius, elevation, motion, and density roles.
4. `components.md`: use the shared component semantics and state rules.
5. `patterns.md`: use the page and workflow patterns for Heart, Mirror, Action, Hermit, Workshop, and Admin.
6. `do-dont.md`: check guardrails before adding visual files, tokens, or new UI primitives.

## Current Files

| File or folder | Classification | Notes |
| --- | --- | --- |
| `lighthouse-platform-visual-system.md` | Boundary contract | Defines how Lighthouse product UI differs from the service-brand VI. |
| `lighthouse-classic-amber-visual-spec.html` | Active platform visual spec | Browser-readable Classic Amber visual specification based on current runtime tokens, grid, shadows, icons, and primitives. |
| `tokens.md` | Platform design-system spec | Product colors, type, grid, spacing, radius, borders, elevation, icons, motion, z-index, and density. |
| `components.md` | Platform design-system spec | Shared component semantics, iconography, variants, states, and acceptance checklist. |
| `patterns.md` | Platform design-system spec | Product page and workflow patterns for Heart, Mirror, Action, Hermit, Workshop, and Admin. |
| `do-dont.md` | Platform design-system guardrails | Explicit rules for mixing brand VI, platform UI, components, color, and product areas. |
| `lighthouse-ui-kit.html` | Platform UI exploration / kit reference | Product UI reference. Useful for layout, token, and component direction, but still needs conversion into code-level docs. |
| `lighthouse-color-system.html` | Platform color exploration | Product color exploration. Do not treat every explored palette as active runtime truth. |
| `lighthouse-value-theme-panels.html` | Value-theme visual exploration | Exploration for value panels. Not a global platform source of truth. |
| `lighthouse-warm-palette-options.html` | Palette exploration | Historical or exploratory palette reference. Not active unless promoted. |
| `lighthouse-warm-happiness-kits.html` | Palette/component exploration | Historical or exploratory reference. Not active unless promoted. |
| `dealer-service-h5-preheat-demo.html` | Brand / campaign H5 demo | Campaign-style artifact. Do not use as product UI source of truth. |
| `print-assets/` | Print or poster assets | Output assets, not platform UI tokens. |

## Runtime Counterparts

The current running product UI lives mainly in:

- `src/app/globals.css`: runtime color, type, radius, shadow, shell, and classic-interface overrides.
- `src/components/ui/lighthouse-primitives.tsx`: reusable Lighthouse UI primitives.
- `src/components/ui/lighthouse-icons.ts`: platform icon map.
- `src/components/ui/lighthouse-design-system.test.ts`: current implementation contract tests.
- `src/app/layout.tsx`: app metadata and active interface mode.

## Working Rule

Until a complete design-system spec exists, changes should state which layer they touch:

- `service-brand-vi`: official service-brand assets, marks, fonts, and brand-value materials.
- `lighthouse-product-ui`: platform chrome, controls, layout, state colors, component behavior, and product-specific visual language.
- `campaign-or-output-artifact`: H5 demos, print assets, posters, generated covers, and other deliverables.
