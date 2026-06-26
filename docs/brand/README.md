# Service Brand VI Assets

This folder is the source area for the service-brand upgrade visual identity and brand-value materials. It is not the Lighthouse platform product UI system.

## Scope

Files here answer questions about the service brand itself:

- What the new `精诚服务` visual identity looks like.
- Which official brand marks, lockups, and fonts can be used.
- What the service-brand value language says.
- How brand-facing materials should preserve the approved VI.

## Current Files

| File or folder | Role | Use in Lighthouse |
| --- | --- | --- |
| `精诚服务新版VI方案.md` | New service-brand VI proposal and rationale | Brand reference only. Do not copy its palette or layout into platform UI by default. |
| `精诚服务新版VI手册.html` | Rendered VI manual | Brand reference only. Use for official marks, type, and brand application checks. |
| `vi-assets/` | Approved marks, lockups, and font files | Asset source. Treat logos and marks as locked assets: do not redraw, recolor, crop, or reinterpret. |
| `精诚服务品牌价值观纲领白皮书.md` | Canonical brand-value whitepaper | Content and language source for Heart / Hermit knowledge. Not a UI token source. |
| `精诚服务 (The Genuine Way) 品牌价值观框架与落地指南.md` | Brand-value framework and application guide | Content and language source for explanations, cases, and guidance. Not a component spec. |

## Boundary Rules

- Service-brand VI assets may appear inside Lighthouse when the platform is displaying brand content, whitepaper material, official marks, or brand-specific deliverables.
- Lighthouse platform navigation, cards, forms, chat UI, admin surfaces, states, and product tokens should be defined in `docs/design/` and `src/components/ui/`, not copied wholesale from the VI.
- If a screen needs both layers, separate them explicitly: brand content area uses approved brand assets; platform chrome and controls use Lighthouse product UI tokens.
- Any future brand asset update should stay in this folder unless it is intentionally promoted into the platform UI system through a design decision record.
