# Lighthouse Design Do And Don't v0.1

## Layer Separation

| Do | Don't |
| --- | --- |
| Keep official service-brand VI assets outside this app repo in the adjacent Lantern brand workspace. | Move VI assets into platform UI folders just because the app mentions the service brand. |
| Use `docs/design/` and `src/components/ui/` for platform controls, layout, state, and interaction rules. | Let a campaign H5 or poster define app shell, buttons, tables, or admin UI. |
| Classify new design artifacts as `service-brand-vi`, `lighthouse-product-ui`, or `campaign-or-output-artifact`. | Add ambiguous visual files without a layer or source-of-truth note. |

## Color

| Do | Don't |
| --- | --- |
| Use Classic Amber roles for platform UI tokens. | Copy the service-brand VI palette wholesale into product controls. |
| Reserve amber for primary action, selected emphasis, and warning-like attention. | Use amber for every pending, neutral, success, info, and decorative label at once. |
| Use `primary-text`, `brass-text`, and `danger-text` for small colored text. | Use raw amber, brass, or danger as 12-14px text on warm paper or white surfaces. |
| Keep semantic meanings stable even when Classic Amber maps success/info to restrained brass. | Reuse semantic colors for decoration or value-theme surfaces. |
| Use primary-soft for selected rows and active low-emphasis states. | Use saturated backgrounds for selection in dense tables. |

## Typography

| Do | Don't |
| --- | --- |
| Use sans-serif for product UI, forms, nav, tables, cards, and Hermit chat. | Use serif as ordinary UI body text. |
| Use serif sparingly for quotations, chapter-like moments, or explicit editorial emphasis. | Apply literary heading/body styling to admin, review queues, filters, or controls. |
| Use `--type-*`, `--title-*`, `--leading-*`, and `--weight-*` in reusable primitives and navigation. | Hard-code `text-xs`, `text-sm`, `font-bold`, or `leading-6` as the source of truth in shared UI. |
| Keep PingFang SC first in the sans stack and Source Han Serif SC first in the serif stack. | Reintroduce Aptos, Playfair Display, or runtime typeface switching into platform UI. |
| Keep normal text readable with strong enough contrast. | Hide important constraints or metadata in low-opacity text. |
| Use the large Source Han Serif display line only for the homepage / Heart brand cover. | Reuse the homepage display scale for ordinary page titles, cards, admin panels, or empty states. |

## Components

| Do | Don't |
| --- | --- |
| Import shared primitives before writing page-local component styles. | Rebuild buttons, cards, badges, and inputs with repeated one-off class strings. |
| Split tags, statuses, roles, metrics, code, and keyboard hints by meaning. | Use one generic badge/chip component for every inline label. |
| Give every interactive component visible hover, focus-visible, disabled, and loading states where relevant. | Ship controls that only look correct in the default state. |
| Use icon buttons for compact tool actions with accessible labels. | Use text labels inside rounded rectangles when a standard icon button is clearer. |

## Accessibility And Interaction

| Do | Don't |
| --- | --- |
| Keep body, table, button, and form text at readable contrast. | Use low-opacity text for constraints, warnings, or required instructions. |
| Use 2px outline, 3px offset, and focus halo on every keyboard-focusable element. | Use only soft glow, color change, or shadow as the focus indicator. |
| Pair state colors with labels, icons, dots, or placement. | Communicate success, danger, selection, or progress by color alone. |
| Preserve control width during loading and prevent duplicate submit. | Let loading labels resize buttons or leave users unsure what is processing. |
| Explain disabled actions when the reason is not obvious. | Disable controls with opacity only and no recovery path. |

## Motion

| Do | Don't |
| --- | --- |
| Use `--lh-motion-*` and `--lh-ease-*` tokens for hover, press, popover, card, and shell transitions. | Add naked `duration-150`, `duration-300`, `transition-all`, or `transition: all` in migrated surfaces. |
| Use `useLhScrollProgress` or `useLhElementScrollProgress` for approved scroll-driven effects. | Add page-local scroll listeners or unbounded `requestAnimationFrame` loops. |
| Use `[data-lh-popover]` for search, notification, and anchored disclosure entrances. | Let popovers blink in, scale from center, or animate layout properties. |
| Use `LhLoadingGlyph` for inline loading icons and respect reduced motion. | Add local `animate-spin`, custom spinners, or looping decorative motion in buttons and notices. |
| Keep frequent actions snappy and mostly color/opacity based; press feedback must not shift layout. | Add cinematic or scroll effects to workbench pages, admin flows, tables, or repeated controls. |

## Content And Recovery

| Do | Don't |
| --- | --- |
| Use specific action labels such as publish guide, save draft, retry import, clear filters. | Use generic OK, Yes, Confirm, or Submit when the scope is unclear. |
| Tell users what happened, what is affected, and what they can do next. | Show vague failure messages without retry, return, or contact paths. |
| Distinguish first-use empty, filtered empty, no permission, and no data. | Reuse one empty-state sentence everywhere. |
| Keep Hermit boundaries visible when evidence is insufficient. | Present unsupported assistant output as if it were confirmed source material. |

## Layout And Surfaces

| Do | Don't |
| --- | --- |
| Use panels for bounded work areas and cards for repeated items. | Put cards inside cards or style whole page sections as floating cards. |
| Use solid surfaces, borders, and stable spacing. | Use glass blur, decorative gradients, or glow as default product styling. |
| Keep page backgrounds quiet: warm paper, solid surfaces, and a restrained border system. | Add global grid texture, radial amber glow, or repeated translucent floating sections by default. |
| Let the homepage cover use a single approved lighthouse / sea background image with a veil for readability. | Add a second CSS lighthouse, duplicate beam, extra glow, or decorative image layer over the cover. |
| Keep admin and data tools denser and quieter than public reading pages. | Use landing-page hero composition for admin, review, or maintenance workflows. |
| Use stable card tracks and fixed control heights. | Let dynamic labels, hover states, or badges resize the layout. |

## Status And Feedback

| Do | Don't |
| --- | --- |
| State what happened and what the user can do next. | Show "Something went wrong" without recovery. |
| Put field errors beside the affected field. | Show form errors only in a disconnected toast. |
| Confirm irreversible or wide-scope destructive actions. | Use generic "OK" or "Yes" labels for destructive confirmations. |
| Show selected count before bulk actions. | Let users run bulk actions without clear scope. |

## Product Areas

| Do | Don't |
| --- | --- |
| Let Heart feel warmer and more editorial while staying inside platform UI rules. | Treat Heart as a full VI showroom or add unapproved value-system naming layers. |
| Treat Home and Heart as one brand-spirit prologue: cover first, then Classic Amber reading flow. | Build a duplicate Heart page or turn the homepage into a feature-card directory. |
| Use the immersive dark sidebar only on the homepage cover, then transition back to the operational cream shell. | Apply the dark/glass shell to Hermit, Workshop, admin, detail pages, or general product chrome. |
| Let Hermit show direct answer, principle basis, related cases/norms, and next action. | Frame Hermit as a generic FAQ bot or a fully autonomous agent. |
| Keep Workshop centered on frontline co-creation, Do/Don't guidance, submission, personal area, and admin curation. | Expand Workshop into a broad forum or complex multi-role system by default. |
| Keep Admin dense, neutral, status-first, and review-oriented. | Use decorative cards and amber glow to create hierarchy in admin work. |

## File Hygiene

| Do | Don't |
| --- | --- |
| Update `docs/design/README.md` when adding design-system files. | Leave new design files unclassified. |
| Update `docs/design/tokens.md` before adding new global UI tokens. | Add new one-off hex values directly in pages. |
| Update `src/app/globals.css`, shared primitives, and design-system tests when typography roles change. | Let the HTML visual spec and runtime typography drift apart. |
| Update `docs/design/components.md` before adding a new primitive family. | Add near-duplicate primitives with overlapping meanings. |
| Update runtime tests when changing design-system contracts. | Treat design-system tests as incidental snapshots. |

## Governance

| Do | Don't |
| --- | --- |
| Update the HTML visual spec and Markdown contract together when a rule becomes active. | Let the HTML spec, Markdown docs, and runtime CSS describe different systems. |
| Document anatomy, states, accessibility, and misuse boundaries before adding a primitive. | Add a component because one page needs a visual variant. |
| Mark deprecated styles with their replacement token or component. | Leave old page-local class strings as acceptable examples. |
| Treat Classic Amber as the active platform system until explicitly promoted otherwise. | Reintroduce exploration palettes or service-brand VI colors into product controls. |
