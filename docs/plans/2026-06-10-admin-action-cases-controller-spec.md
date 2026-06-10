# Admin Action Cases Controller Spec

Status: Active
Date: 2026-06-10
Controller: Codex main agent
Repo / workspace: C:\Own Docm\Coding\服务品牌升级\Lantern\lantern-app
Branch / target: codex/admin-action-cases

## 1. User Goal

Implement a lightweight `/admin` management area for Lantern. The public internal site remains open without user accounts. `/admin` requires a shared administrator password, then provides Action case maintenance and the existing Workshop review queue. Action cases can be imported from Markdown, previewed, saved as drafts, manually published, versioned, and shown on `/action` from published database content with static fallback.

## 2. Current Evidence

| Area | Evidence | Source | Confidence | Notes |
|------|----------|--------|------------|-------|
| Existing Action content | Action list reads `ACTION_CASES`; current detail route is hard-coded for `driver-partner-rest-area`. | `src/app/action/page.tsx`, `src/app/action/driver-partner-rest-area/page.tsx` | High | Dynamic route must supersede or share rendering. |
| Existing content schema | `ContentItem` and `ContentVersion` exist with `ACTION_CASE`, `DRAFT/PUBLISHED/ARCHIVED`, `bodyMarkdown`, and `bodyJson`. | `prisma/schema.prisma` | High | Needs slug, metadata, and stable published version pointer. |
| Existing Workshop admin | `/admin/workshop` and `/api/admin/workshop/*` require highest-admin auth through preview/user headers or cookie. | `src/app/admin/workshop/page.tsx`, `src/app/api/_workshop.ts`, `src/modules/auth/service.ts` | High | Admin portal cookie must resolve a highest-admin context. |
| Existing UI primitives | Lighthouse card, button, field, chip, callout, panel, table, and icon primitives exist. | `src/components/ui/lighthouse-primitives.tsx`, `src/components/ui/lighthouse-icons.ts` | High | New admin UI should reuse these primitives. |
| Existing dirty tree | User has unrelated changes in H5 docs, Heart page, and `output/`. | `git status --short --branch` | High | Do not revert or stage unrelated files. |

## 3. Scope

Included:
- Create `/admin` password gate and authenticated admin shell.
- Bring existing `/admin/workshop` into the same password-protected admin surface.
- Implement Action case Markdown parsing, draft saving, publishing, version listing, and single cover image upload.
- Persist Action case content in `ContentItem` / `ContentVersion`.
- Serve uploaded cover images from a local upload directory through a safe route.
- Make `/action` and `/action/[slug]` read published database content first and fall back to static cases.

Excluded:
- Full account system or role UI.
- Multi-image asset library.
- Content maintenance for Heart, Mirror, Workshop public guides, or Hermit knowledge.
- Cleanup of unrelated dirty files.
- Deploy or push unless the user explicitly asks after implementation.

Scope control rule:
- Changes outside admin/auth, content/action cases, Action front-end, Prisma schema/migration, upload storage, and related tests require controller approval and user-facing explanation.

## 4. Assumptions and Open Questions

| ID | Item | Type | Owner | Resolution |
|----|------|------|-------|------------|
| A1 | `ADMIN_PORTAL_PASSWORD` is the only administrator credential for v1. | Assumption | Controller | Accepted from user scope. |
| A2 | The administrator session lasts 24 hours. | Assumption | Controller | Accepted from user scope. |
| A3 | Only one cover image per Action case in v1. | Assumption | Controller | Accepted from user scope. |
| A4 | Runtime uploads use local configurable storage, not source-controlled `public`. | Assumption | Controller | Accepted and supported by explorer review. |
| A5 | If database is missing or unavailable, public Action pages fall back to static cases. | Assumption | Controller | Required by plan. |

## 5. Work Breakdown

| Task ID | Role | Owner | Responsibility | Write Set | Inputs | Required Output | Acceptance Gate |
|---------|------|-------|----------------|-----------|--------|-----------------|-----------------|
| T0 | Controller | Main | Branch, spec, dirty tree, dependency decision | `docs/plans/*` | User plan, repo status | Spec file and status ledger | Spec exists and branch is active. |
| T1 | Implementer | Main/worker | Admin portal session helper, session API, admin shell | `src/modules/admin`, `src/app/api/admin/session`, `src/app/admin` | Spec sections 1-4 | Auth tests, login/logout routes, admin layout | Auth tests pass. |
| T2 | Implementer | Main/worker | Prisma schema/migration and Action content repository/service | `prisma`, `src/modules/content` | Spec schema decisions | Content tests and service/repository | Content tests pass. |
| T3 | Implementer | Main/worker | Markdown parser, file storage, Action case admin API/UI | `src/modules/content`, `src/infrastructure/storage`, `src/app/api/admin/action-cases`, `src/app/admin/action-cases` | T1/T2 outputs | Parser/storage/API/UI tests | Targeted tests pass. |
| T4 | Implementer | Main/worker | Public Action pages database-first with static fallback | `src/app/action`, shared render components | T2/T3 outputs | Dynamic route and fallback behavior | Action tests pass. |
| T5 | Spec Reviewer | Subagent | Check implementation against this spec | Read-only | Diff, spec | Findings ordered by missing/extra behavior | No open spec gaps. |
| T6 | Code Quality Reviewer | Subagent | Review bugs, security, tests, maintainability | Read-only | Diff, test output | Findings by severity | No blocking findings. |
| T7 | Verifier | Main/subagent | Final checks | Read-only except build/test artifacts | Completed diff | Command outcomes and blockers | Required gates run or blockers documented. |

## 6. Subagent Task Packets

### T5: Spec Compliance Review

Role: Spec Reviewer

Context:
- The implementation must match the user-approved `/admin` Action case maintenance plan without broadening into full accounts or other content modules.

Ownership:
- Read-only review of final diff and this spec.

Non-goals:
- Do not suggest optional redesigns.
- Do not review code style before confirming spec compliance.

Inputs:
- This spec.
- `git diff --stat`, `git diff`, relevant test output.

Required output:
- Pass/fail.
- Missing required behavior.
- Extra behavior outside scope.
- Concrete file or behavior references.

Acceptance gate:
- No missing required behavior and no extra scope.

### T6: Code Quality Review

Role: Code Quality Reviewer

Context:
- Run only after spec compliance passes.

Ownership:
- Read-only review for defects, security, regressions, data handling, and missing tests.

Non-goals:
- Do not relitigate product scope after spec review passes.

Inputs:
- Final diff.
- Test/lint/build results.

Required output:
- Findings ordered by severity.
- Concrete references.
- Residual risks.

Acceptance gate:
- No P0/P1 blocking issues, or controller documents accepted residual risk.

### T7: Verification

Role: Verifier

Context:
- Verify the integrated implementation.

Ownership:
- Run required commands and classify failures.

Non-goals:
- Do not change source files.

Inputs:
- Working tree after implementation.

Required output:
- Commands run, exit codes, exact blockers.
- Product failure vs environment gate distinction.

Acceptance gate:
- `npm run lint`, `npm test`, `npx next build`, and `git diff --check` pass, or blockers are explicitly documented.

## 7. Review Plan

Per completed implementation slice:
1. Implementer self-review.
2. Controller inspects scoped diff.
3. Run targeted tests for that slice.
4. After all slices, run T5 spec review.
5. After T5 passes, run T6 code quality review.
6. Confirmed issues go to minimal fixes only.
7. Re-run relevant tests and reviews after fixes.

Do not claim completion with open spec gaps or blocking quality findings.

## 8. Verification Plan

| Gate | Command / Method | Owner | Required For Done | Notes |
|------|------------------|-------|-------------------|-------|
| Dirty tree review | `git status --short --branch` | Controller | Yes | Separate user changes from task changes. |
| Diff review | `git diff --check` and scoped diff | Controller | Yes | Stage only intended files if committing later. |
| Dependency install | `npm install` | Controller | Yes | Needed for `gray-matter` and lockfile. |
| Prisma generate | `npm run db:generate` | Controller | Yes | After schema change. |
| Lint | `npm run lint` | Controller | Yes | Full lint gate. |
| Tests | `npm test` | Controller | Yes | Full Vitest gate. |
| Build | `npx next build` | Controller | Yes | May require environment; classify blockers. |
| Browser/manual | Optional local dev smoke | Controller | If server practical | Useful for admin/login UI, not required if time constrained. |

## 9. Final Acceptance Checklist

- [ ] User goal satisfied.
- [ ] Scope and non-goals respected.
- [ ] Controller spec written.
- [ ] Branch created.
- [ ] Subagent outputs reviewed by controller.
- [ ] Spec review passed.
- [ ] Code quality review passed or residual risks documented.
- [ ] Required tests/build/lint/checks run or blockers documented.
- [ ] Diff reviewed for unrelated changes.
- [ ] Working tree status understood.
- [ ] If committing: commit hash recorded.
- [ ] If pushing: push result and remote sync confirmed.

## 10. Decision Log

| Time | Decision | Reason | Evidence |
|------|----------|--------|----------|
| 2026-06-10 | Use `/admin` for the management entry. | User chose English path. | Conversation. |
| 2026-06-10 | Use password gate, not full accounts. | No account system available yet. | Conversation. |
| 2026-06-10 | Save drafts before manual publish. | Avoid accidental public updates. | Conversation. |
| 2026-06-10 | Markdown titles are flexible. | User rejected fixed template; use case document structure. | Conversation. |
| 2026-06-10 | Store image files outside source-controlled public. | Standalone runtime safety. | Explorer review and architecture docs. |

## 11. Change Log

| Time | Change | Owner | Evidence |
|------|--------|-------|----------|
| 2026-06-10 | Controller spec created. | Main | `docs/plans/2026-06-10-admin-action-cases-controller-spec.md` |
