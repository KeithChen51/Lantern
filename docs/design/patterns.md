# Lighthouse Product Patterns v0.1

## Status

This document defines page and workflow patterns for the Lighthouse platform. It is desktop-first for now. Mobile adaptation is deferred, but patterns should not block future responsive work.

## Product Map

| Area | Primary user task | UI character |
| --- | --- | --- |
| Home | Understand where to go next | Oriented, concise, module-led. |
| Heart | Read and internalize service values | Editorial, warm, structured reading. |
| Mirror | Reflect through examples and principles | Guided comparison, readable evidence. |
| Action | Find and learn from cases | Searchable, scannable, case-led. |
| Hermit | Ask for service-culture guidance | Assistant-like, evidence-aware, calm. |
| Workshop | Co-create and submit practice guidance | Workflow-led, role-aware, status-visible. |
| Admin | Maintain content and review submissions | Dense, neutral, operational. |

## Global Shell

The shell should help users answer three questions: where am I, what is active, and what will my action affect?

Required regions:

- Stable primary navigation.
- Product logo linking home.
- Global search when content coverage is broad enough.
- Context header for deep pages.
- Page actions grouped by scope.

Rules:

- Keep navigation grouped by user goal, not implementation module.
- Use a back link for shallow detail pages and breadcrumbs for deeper structures.
- Use clear region boundaries for sidebars, review panels, and scoped edit forms.
- Avoid changing global navigation based on local page state.

## Heart Pattern

Heart is a value-introduction and light guide surface. It can carry the warmest visual treatment in the platform, but it is still a product page, not a VI showcase.

Use:

- Strong intro.
- Four value cards or sections when they clarify the value structure.
- Customer and employee viewpoints.
- A light guide into downstream modules.
- Official brand assets only when the content itself is brand-facing.

Avoid:

- Extra naming layers around the value system unless explicitly approved.
- Turning value sections into decorative-only cards.
- Using service-brand VI colors to restyle platform buttons or navigation.
- Serif body text for ordinary UI or low-contrast prose.

## Mirror And Action Patterns

Mirror and Action are case and reflection surfaces. They should prioritize search, comparison, and reading continuity.

List view:

- Search and filters at the top of the collection.
- Active filters shown as removable tags.
- Case cards with stable tracks: title, scenario, key principle, metadata, action.
- Use list or table views when comparison matters more than browsing.

Detail view:

- Back link to the list context.
- Clear case status and source metadata.
- Reading path: situation, action, principle, result, reflection.
- Related cases or similar patterns where useful.

Rules:

- Do not hide constraints, risks, or source metadata in pale text.
- Use status badges only for workflow state, not for all metadata.
- Use comparison tables when tradeoffs matter.

## Hermit Pattern

Hermit is a domain-specific automotive after-sales service culture assistant. It is not a generic FAQ bot and not yet an autonomous agent.

Answer shape should support:

- Direct answer.
- Principle basis.
- Related cases or norms.
- Suggested next action.
- Source or confidence indication where available.

When evidence is insufficient, the interface should not stop at "no evidence." It should surface related cases with similar underlying logic and provide framework-based guidance.

UI requirements:

- Prompt entry is prominent but not flashy.
- Suggested questions are guidance chips, not decorative pills.
- Responses distinguish assistant answer, source/evidence, and next-step recommendation.
- Loading and retry states are clear.
- User and assistant message bubbles use readable contrast and shared tokens.
- Domain scope should remain visible in empty states and helper copy.

Knowledge boundary for v1:

- Use already published content as the first scoped source.
- Keep future Workshop/SOP channels visually separate as planned or unavailable until confirmed.

## Workshop Pattern

Workshop is a frontline co-creation and practice-codification workflow, not a broad forum.

Initial structure:

- Public visible area.
- Submission area.
- Personal area.
- Admin review and publishing path.

Submission pattern:

- Role selection based on frontline role categories.
- Scenario and Do/Don't structure.
- Draft, submitted, approved, rejected statuses.
- Clear review scope before submit.
- Personal history so contributors can see status and feedback.

Admin pattern:

- Single highest brand-side admin model unless roles are reopened.
- Review queue with dense table/list controls.
- Status filters and bulk-safe actions.
- Publish/reject actions state their consequence before commit.

Avoid:

- Forum-style social mechanics as the default model.
- Multi-role permission complexity before it is needed.
- Decorative contribution cards that obscure review status.

## Admin And Content Maintenance

Admin surfaces are work tools. They should be denser, more neutral, and more explicit than public reading pages.

Required patterns:

- Table or list first, with filters visible.
- Status badges with semantic colors.
- Row actions on hover or in a compact action column.
- Bulk action toolbar when selection is active.
- Confirmation for publish, reject, delete, or wide-scope changes when they cannot be undone.
- Error messages with retry or recovery.

Rules:

- Do not use editorial hero styling for admin pages.
- Do not use decorative amber or glow to signal importance.
- Use compact density where users compare many rows.

## Forms

Use a consistent field anatomy:

1. Label.
2. Control.
3. Helper text.
4. Validation or error text.

Patterns:

- Short submission forms can disable submit until required fields are valid.
- Long content forms should allow submit and move users to the first error.
- Required/optional marker should mark the minority of fields.
- Related fields use fieldsets.
- Confirmation dialogs are required for irreversible or wide-scope actions.

## Empty, Loading, And Error States

| State | Pattern |
| --- | --- |
| First-use empty | Explain the next meaningful action. |
| Filtered empty | Name the filter constraint and offer clear filters. |
| Loading | Use skeleton or local progress where content shape is known. |
| Inline error | Place next to the affected field or row. |
| Section error | Use callout inside the affected panel. |
| Blocking error | Full-page or modal with recovery action. |

Recovery rules:

- Loading states should preserve the shape of the content when the target shape is known.
- Field errors stay next to the field and preserve entered content.
- Filtered empty states name the active filter and provide a clear-filters action.
- Blocking errors must offer retry, safe return, or administrator contact.
- Hermit evidence gaps should expose the boundary and suggest a better question or related source path.

## Mobile Boundary

Mobile implementation is still not the primary implementation gate, but the shell target is now defined.

- Do not treat mobile screenshots as the primary acceptance gate.
- Do not introduce desktop patterns that require fixed pixel widths or horizontal overflow.
- Keep controls and component tokens capable of later collapsing into mobile layouts.
- Primary mobile navigation uses a bottom five-tab bar: Heart, Mirror, Action, Workshop, Hermit.
- Bottom navigation does not carry second-level actions; complex filters and secondary actions move into page-local drawers, segmented controls, or inline sections.
- Main content collapses to one column. Desktop 8/4 and 6/6 layouts become ordered vertical sections rather than squeezed columns.
- Touch targets should be at least 44px, and page content needs bottom padding that clears the bottom navigation and safe area.

## Governance Pattern

Design changes should land in the system before they land as page-local styling.

| Change | Required update |
| --- | --- |
| New token | Update `tokens.md`, HTML spec, runtime CSS, and relevant tests. |
| New primitive | Update `components.md` with anatomy, states, accessibility, and misuse boundaries before adding code. |
| New page skeleton | Update this file with task, layout, state, and mobile collapse rules. |
| Deprecated style | Add the replacement rule to `do-dont.md` and remove page-local examples over time. |
