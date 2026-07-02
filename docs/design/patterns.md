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

## Runtime Page Archetypes

Runtime pages should declare their page type before adding local visual rules. The archetype is a layout and hierarchy contract, not a theme switch.

| Archetype | Runtime hook | Current pages | Contract |
| --- | --- | --- | --- |
| Cultural reading | `data-lh-page-archetype="cultural-reading"` | Heart/Home | Editorial title, readable prose, sparse guide links, no decorative card wall or value-color themes. |
| Tool workspace | `data-lh-page-archetype="tool-workspace"` | Hermit | Visible context header, stable work surface, persistent input, clear empty/loading/error states. |
| Case workflow | `data-lh-page-archetype="case-workflow"` | Action | Main reading column plus supporting rail; case question, key nodes, and metadata do not compete at equal weight. |
| Workflow | `data-lh-page-archetype="workflow"` | Workshop | Segments, filters, submission cards, and state notices inherit shared primitives and tokenized density. |

Rules:

- Do not create a new archetype for one page until the pattern appears in at least two places or has a clear product-level role.
- Archetypes may tune spacing, surface strength, and reading width; they must not introduce a new color palette.
- Page-local typography, shadows, radius, and transparent surface rules are migration debt unless promoted into primitives or archetype CSS.

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

## Home / Heart Pattern

Home is the upgraded Heart page. The top navigation label `本心` points to the homepage anchor and narrative body, not to a duplicate peer page. It can carry the warmest and most brand-like treatment in the platform, but it is still a Lighthouse product surface, not a service-brand VI showcase.

Page style contract:

| Item | Contract |
| --- | --- |
| Runtime hook | `data-lh-page="heart"` + `data-lh-page-archetype="cultural-reading"` |
| Page job | Establish why the platform exists and give the rest of the product a shared value baseline. |
| First screen | Full-viewport brand-spirit cover with a realistic lighthouse / sea background, warm veil, subdued immersive sidebar, small kicker `精诚服务品牌再出发`, and one large serif value line: `求真、尽善、致美、大爱、幸福`. |
| Reading rhythm | Brand cover -> prologue / restart context -> origin -> value path / ledger -> downstream guide -> closing line. Each block should feel like the next paragraph of one argument. |
| Visual weight | The main sentence and section claims carry weight. Cards, chips, icons, and guide links stay secondary. |
| Components | `HomeBrandHero`, `LhSectionHeader`, `LhChip`, `LhDataTableShell`; value content uses page-specific `data-lh-home-brand-*` and `data-lh-heart-*` hooks, not generic card grids. |
| Motion | One-time subtle entrance plus restrained scroll depth on the cover. Motion must never make content unreadable or depend on blur. |
| Forbidden | Five independent value themes, decorative glow, dense module cards, oversized buttons, service-brand VI controls, or new color palettes. |

Use:

- Strong editorial intro that reads as the platform prologue.
- One continuous cultural reading flow before downstream module navigation.
- Value sections as a restrained scroll or ledger, not five unrelated color systems.
- Customer and employee viewpoints.
- A quiet guide into downstream modules after the value reading is complete.
- Official brand assets only when the content itself is brand-facing.

Avoid:

- Extra naming layers around the value system unless explicitly approved.
- Turning value sections into decorative-only cards.
- Giving each value a separate decorative color treatment on the homepage; reserve value-color mapping for small tags or metadata only.
- Equal-weight card grids that make Heart feel like a module directory rather than a cultural starting point.
- Using service-brand VI colors to restyle platform buttons or navigation.
- Serif body text for ordinary UI or low-contrast prose.

Runtime home pattern:

- Home and Heart are one surface. `data-lh-heart-page` owns the full page rhythm, while `data-lh-home-brand-hero` owns only the first-screen brand cover.
- `data-lh-home-brand-bg` uses a single approved background image for the cover. Do not layer a CSS lighthouse, duplicate beam, extra glow, or separate illustrated mark on top of the image.
- `data-home-surface="true"` is allowed on the sidebar only for this cover context. It transitions back to the operational shell through `--lh-home-nav-progress` as the page returns to warm paper.
- `data-lh-heart-prologue` and `data-lh-heart-origin` use editorial separators and reading-width copy before any operational entry points.
- `data-lh-heart-value-scroll` keeps 求真、尽善、致美、大爱、幸福 in one visual system; it uses amber and warm paper tokens only.
- `data-lh-heart-guide-list` is a navigation list, not a card deck. It should feel like a continuation path after reading, not a competing feature grid.
- Heart motion uses `--lh-motion-*` and `--lh-ease-*` tokens. Motion should clarify reading order and interaction feedback, not decorate.
- Entrance animation is allowed once on page load for hero and major sections; repeated or looping motion is not allowed.
- Scroll-driven motion is allowed only for cover depth and the sidebar surface transition. Other product pages should not use scroll-driven chrome changes.
- Hover motion may use opacity and transform only. It must not change layout dimensions, spacing, or content order.
- `prefers-reduced-motion` must disable Heart page motion and keep all content immediately available.

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

Action case runtime template:

- `/action` list cards keep stable tracks: metadata chips, case title, summary, case question, learning-card action, and key-node preview.
- Empty or future-case placeholders use `LhEmptyState`, not one-off dashed cards.
- Detail pages use `LhBackLink` for returning to `/action`.
- Markdown or long-form case body uses `LhContentProse`; Markdown renderers output semantic tags and do not carry local title/paragraph classes.
- Status or recovery messages use `LhStateNotice` when the page is communicating a state, not when the collection is empty.

Rules:

- Do not hide constraints, risks, or source metadata in pale text.
- Use status badges only for workflow state, not for all metadata.
- Use comparison tables when tradeoffs matter.
- Do not copy Action page-local typography classes into new case pages; promote repeated patterns into primitives first.

## Hermit Pattern

Hermit is a domain-specific automotive after-sales service culture assistant. It is not a generic FAQ bot and not yet an autonomous agent.

Page style contract:

| Item | Contract |
| --- | --- |
| Runtime hook | `data-lh-page="hermit"` + `data-lh-page-archetype="tool-workspace"` |
| Page job | Help users ask about a concrete service situation and receive an answer grounded in principles, related cases, and next action. |
| First screen | Compact context title, stable chat work surface, visible input affordance, and a small set of high-quality suggested questions. |
| Work rhythm | Context -> input -> assistant response -> source/logic -> next step. The page should feel like a dependable workbench, not a campaign page. |
| Visual weight | The input and latest answer are primary. Suggestions, status, and helper copy stay secondary. |
| Components | `LhChatShell`, `LhChatHeader`, `LhChatMain`, `LhChatFooter`, `LhChatInputShell`, `LhMessageBubble`, `LhSuggestionList`, `LhStateNotice` when needed. |
| Motion | Local interaction feedback only: focus, hover, loading, and message arrival. No decorative ambient animation. |
| Forbidden | Hidden context header, empty landing-style hero, decorative prompt chips, anonymous chat bubbles without role/source structure, or broad-agent positioning. |

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

Runtime migration rule:

- Hermit chat uses `LhChat*`, `LhMessage*`, and `LhSuggestionList` primitives. Page files keep behavior, data flow, and role semantics; visual styling belongs to `globals.css` token rules and component primitives.
- Migrated Hermit files are covered by the design-system test migration list. They should not reintroduce local Tailwind text sizes, raw font weights, ad hoc rounded corners, `shadow-lh-*`, or arbitrary gradient backgrounds.

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

Runtime migration rule:

- Workshop public pages use `LhSegmentedControl` for section and role filters, `LhMetaList` for contribution/status/rule rows, and `LhSubmissionCard` for published guides and submission records.
- Page files keep workflow state, API calls, and user actions. Visual styling belongs to `globals.css` token rules and component primitives.
- Migrated Workshop files are covered by the design-system test migration list. They should not reintroduce local Tailwind text sizes, raw font weights, ad hoc rounded corners, `shadow-lh-*`, arbitrary gradients, or local icon sizing.
- Admin Workshop remains a later migration surface; do not treat its current density or local classes as the public Workshop visual contract.

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
- Do not use global grid texture, radial glow, or translucent floating sections as default product page backgrounds.
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

## Runtime Typography Pattern

The visual spec controls code through typography tokens, not page-by-page font choices.

- Product chrome, navigation, controls, forms, data tables, and admin flows use PingFang SC through `--font-sans-stack`.
- Page display titles and explicit editorial moments use Source Han Serif SC through `--font-serif-stack`; they do not turn the surrounding controls into serif UI.
- Reusable primitives and navigation consume `--type-*`, `--title-*`, `--leading-*`, and `--weight-*`; page-local exceptions are migration debt and should not be copied into new components.
- When the type scale changes, update `tokens.md`, the HTML visual spec, `globals.css`, shared primitives, navigation, and design-system tests together.

## Governance Pattern

Design changes should land in the system before they land as page-local styling.

| Change | Required update |
| --- | --- |
| New token | Update `tokens.md`, HTML spec, runtime CSS, and relevant tests. |
| New primitive | Update `components.md` with anatomy, states, accessibility, and misuse boundaries before adding code. |
| New page skeleton | Update this file with task, layout, state, and mobile collapse rules. |
| Deprecated style | Add the replacement rule to `do-dont.md` and remove page-local examples over time. |
