# Lighthouse Production Code Architecture Implementation Plan

> **For Codex:** Use this plan as the reference when turning the current Lighthouse demo into a production-ready system skeleton. Do not start broad UI work until module boundaries, database foundation, and the first vertical slice are in place.

**Goal:** Convert the current page-first demo into a production-oriented modular monolith that supports private-cloud deployment, multi-brand / region / store isolation, Workshop workflow, learning records, reporting, and Hermit knowledge retrieval.

**Architecture:** Keep Next.js as the single deployable application in phase 1. Use `src/app` only for routing, pages, and BFF entrypoints; move business logic into `src/modules`; move database, AI, storage, auth-provider, and import adapters into `src/infrastructure`. Avoid microservices until real scale or security constraints require a split.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Node.js >=20.9.0 provided by operations, PM2 or Docker deployment, MySQL 8.0, Nginx 1.29.3, Alpine 3.22.2, selected vector retrieval service, recommended ORM layer, object storage / file storage adapter, OA / WeCom login adapters, OpenAI-compatible model provider adapter.

---

Related architecture documents:

- [Lighthouse Production Architecture V0.1](./2026-05-14-lighthouse-production-architecture-v0.1.md)
- [Lighthouse Data Model V0.1](./2026-05-15-lighthouse-data-model-v0.1.md)
- [Lighthouse Phase 1 Implementation Plan](./2026-05-16-lighthouse-phase1-implementation-plan.md)

## 1. Why Architecture Comes First

The current project is a good demo, but it is still page-led:

```text
src/app/*/page.tsx
src/components/*
src/lib/hermit/*
src/app/api/chat/route.ts
```

This is fine for visual validation. It is not enough for production because the confirmed v1 requirements now include:

- Private-cloud deployment.
- OA and WeCom login.
- Multi-brand, multi-region, multi-store data isolation.
- Thousands of first-batch users.
- Learning progress, reading records, and training completion.
- Workshop submission, AI initial review, admin edit-before-publish, and published guides.
- Report export for contribution, submissions, and learning data.
- Manual content maintenance and batch import.
- Hermit using approved OpenAI-compatible model providers.

The first architecture change should therefore create stable module boundaries before adding more product pages.

## 2. Target Source Layout

Recommended phase-1 layout:

```text
src/
  app/
    (frontstage)/
      heart/
      mirror/
      action/
      workshop/
      hermit/
    admin/
      content/
      workshop/
      learning/
      reports/
    api/
      auth/
      content/
      workshop/
      learning/
      reports/
      hermit/
  components/
    layout/
    ui/
    feature-specific-ui/
  modules/
    tenant/
    auth/
    content/
    learning/
    workshop/
    reporting/
    hermit/
    knowledge/
  infrastructure/
    db/
    auth/
    ai/
    storage/
    import/
    export/
  shared/
    config/
    errors/
    validation/
    types/
```

The key rule: `src/app` should orchestrate requests and render UI. It should not contain domain rules. Domain rules live in `src/modules`.

## 3. Layering Rules

Every production feature should follow this path:

```text
Page / Form / UI
-> BFF route or Server Action
-> module service
-> module repository
-> infrastructure adapter
-> database / storage / model provider
```

Rules:

- React components should not call the database directly.
- API routes should not contain business workflow logic.
- Module services should not import UI components.
- AI provider calls should go through `infrastructure/ai`.
- File upload and import parsing should go through `infrastructure/storage` and `infrastructure/import`.
- Organization scope must be checked before returning content, learning data, submissions, reports, or Hermit source material.

## 4. Module Responsibilities

### `modules/tenant`

Owns brand, region, dealer, store, and organization-scope rules.

Planned responsibilities:

- Resolve the current user's visible organization scope.
- Filter content, submissions, learning records, and reports by brand / region / store.
- Provide shared guard functions such as `assertCanAccessStore`.

### `modules/auth`

Owns application users and login identity mapping.

Planned responsibilities:

- Map OA identity and WeCom identity into one internal `User`.
- Track user type: internal employee or dealer-side user.
- Assign simple roles: normal user and highest admin.
- Attach users to brand, region, dealer, and store.

### `modules/content`

Owns Heart, Mirror, Action, normative files, published guides, and maintained content.

Planned responsibilities:

- Manual content create / edit / publish.
- Batch import job creation.
- Content versioning.
- Content visibility scope.
- Feed content into learning records and Hermit knowledge indexing.

### `modules/learning`

Owns reading and training progress.

Planned responsibilities:

- Record content view / read progress.
- Mark training completion.
- Query learning records by user, store, region, brand, content, and time range.

### `modules/workshop`

Owns Do & Don't co-creation.

Planned responsibilities:

- Draft, submit, revise, and withdraw.
- AI / workflow initial review.
- Highest-admin approve / reject / edit-before-publish.
- Publish guide into public area.
- Update contribution stats.
- Emit content into knowledge indexing queue.

### `modules/reporting`

Owns exportable reports.

Planned responsibilities:

- Contribution leaderboard export.
- Submission volume export.
- Learning progress export.
- Reading and training completion export.
- Organization-scoped filters.

### `modules/hermit`

Owns chat orchestration and answer policy.

Planned responsibilities:

- Domain-scope validation.
- Query rewriting / retrieval orchestration.
- Source-backed answer generation.
- Related case / norm / Do & Don't recommendation.
- Chat session and retrieval trace persistence.

### `modules/knowledge`

Owns knowledge ingestion and vector indexing.

Planned responsibilities:

- Convert imported documents and published guides into chunks.
- Generate embeddings through configured model provider.
- Store vectors in the selected vector retrieval service.
- Provide retrieval APIs to Hermit.

## 5. Database Foundation

The data model should be created in this dependency order:

```text
tenant
-> auth
-> content
-> learning
-> workshop
-> reporting
-> knowledge
-> hermit chat records
```

Recommended core tables:

```text
brands
regions
dealers
stores
users
identity_accounts
user_org_memberships
user_roles
content_items
content_versions
import_jobs
files
learning_records
reading_records
training_completion_records
workshop_submissions
workshop_review_events
published_guides
contribution_stats
report_exports
knowledge_documents
knowledge_chunks
chat_sessions
chat_messages
operation_logs
```

Use MySQL as the source of truth for structured business data. Do not assume MySQL can handle Hermit semantic vector retrieval by itself.

The currently observed private image sources include `mysql:8.0`, `nginx:1.29.3`, and `alpine:3.22.2`, so phase 1 should align deployment examples and Dockerfiles with these available base images.

PM2 is installed on the server and can run the Next.js process if it points at an application-compatible Node runtime. The current server is Ubuntu 20.04.6 LTS, and `node -v` currently returns `v10.19.0`. For planning purposes, operations will provide `node >=20.9.0` for this application, either through an application-local Node runtime or an equivalent deployment mechanism.

Hermit vector retrieval should be abstracted behind `modules/knowledge` so the implementation can choose one approved path later:

- Bailian knowledge base / vector capability.
- Internal model platform vector service.
- Qdrant deployed as a Docker service.
- Separate PostgreSQL + pgvector service if approved.
- Keyword fallback for early pilot.

ORM recommendation:

- Use Prisma if the team wants faster CRUD development, migrations, and generated types.
- Keep vector-specific implementation outside the main ORM if the selected vector service is not MySQL.
- Do not introduce both Prisma and Drizzle in phase 1.

## 6. Phase 1 Vertical Slice

The first implementation slice should prove the architecture with one real workflow:

```text
tenant model
-> user identity placeholder
-> Workshop submission
-> AI initial review placeholder
-> highest-admin review queue
-> edit-before-publish
-> published guide list
-> contribution stat update
-> knowledge indexing hook placeholder
```

This slice is better than building all modules shallowly because it exercises data isolation, BFF, service layer, repository layer, admin workflow, and frontstage display together.

## 7. Phase 1 Task Plan

### Task 1: Establish Module Folders

**Files:**

- Create: `src/modules/tenant/index.ts`
- Create: `src/modules/auth/index.ts`
- Create: `src/modules/content/index.ts`
- Create: `src/modules/learning/index.ts`
- Create: `src/modules/workshop/index.ts`
- Create: `src/modules/reporting/index.ts`
- Create: `src/modules/hermit/index.ts`
- Create: `src/modules/knowledge/index.ts`
- Create: `src/infrastructure/db/index.ts`
- Create: `src/infrastructure/ai/index.ts`
- Create: `src/infrastructure/storage/index.ts`
- Create: `src/infrastructure/import/index.ts`
- Create: `src/infrastructure/export/index.ts`
- Create: `src/shared/types/index.ts`
- Create: `src/shared/errors/index.ts`
- Create: `src/shared/validation/index.ts`

**Expected result:** Imports have stable future locations, even before each module is fully implemented.

### Task 2: Add Database And Migration Foundation

**Files:**

- Modify: `package.json`
- Create: `prisma/schema.prisma` or equivalent chosen ORM schema.
- Create: `.env.example`
- Create: `src/infrastructure/db/client.ts`

**Decision needed before implementation:** confirm ORM choice. Default recommendation is Prisma.

**Expected result:** Local development can create and migrate a MySQL database.

### Task 3: Model Tenant And Auth Skeleton

**Files:**

- Create: `src/modules/tenant/types.ts`
- Create: `src/modules/tenant/service.ts`
- Create: `src/modules/tenant/repository.ts`
- Create: `src/modules/auth/types.ts`
- Create: `src/modules/auth/service.ts`
- Create: `src/modules/auth/repository.ts`

**Expected result:** Code can resolve a user into brand / region / dealer / store scope. OA and WeCom are represented as identity providers, even if real login is still stubbed.

### Task 4: Database-Backed Workshop Submission

**Files:**

- Create: `src/modules/workshop/types.ts`
- Create: `src/modules/workshop/service.ts`
- Create: `src/modules/workshop/repository.ts`
- Create: `src/app/api/workshop/submissions/route.ts`
- Modify: `src/app/workshop/page.tsx`

**Expected result:** Workshop submission form reads and writes through APIs instead of only using mock state.

### Task 5: Admin Review Queue

**Files:**

- Create: `src/app/admin/workshop/page.tsx`
- Create: `src/app/api/admin/workshop/submissions/route.ts`
- Create: `src/app/api/admin/workshop/submissions/[id]/review/route.ts`
- Modify: `src/modules/workshop/service.ts`

**Expected result:** Highest admin can see pending submissions, approve, reject, or edit before publishing.

### Task 6: Published Guide List And Contribution Stats

**Files:**

- Create: `src/app/api/workshop/guides/route.ts`
- Create: `src/app/api/workshop/leaderboard/route.ts`
- Modify: `src/modules/workshop/service.ts`
- Modify: `src/modules/workshop/repository.ts`
- Modify: `src/app/workshop/page.tsx`

**Expected result:** Public Workshop area reads published guides and contribution leaderboard from persisted data.

### Task 7: Learning Record Skeleton

**Files:**

- Create: `src/modules/learning/types.ts`
- Create: `src/modules/learning/service.ts`
- Create: `src/modules/learning/repository.ts`
- Create: `src/app/api/learning/records/route.ts`

**Expected result:** Content view and completion records can be persisted for later reporting.

### Task 8: Reporting Export Skeleton

**Files:**

- Create: `src/modules/reporting/types.ts`
- Create: `src/modules/reporting/service.ts`
- Create: `src/app/api/admin/reports/contributions/route.ts`
- Create: `src/app/api/admin/reports/submissions/route.ts`
- Create: `src/app/api/admin/reports/learning/route.ts`

**Expected result:** Admin can export CSV / Excel-compatible report data for contribution, submission, and learning records.

### Task 9: Hermit Provider Abstraction

**Files:**

- Create: `src/infrastructure/ai/provider.ts`
- Create: `src/modules/hermit/service.ts`
- Move / adapt: `src/lib/hermit/rag.ts`
- Move / adapt: `src/lib/hermit/system-prompt.ts`
- Modify: `src/app/api/chat/route.ts`

**Expected result:** Hermit no longer directly owns provider configuration in the API route. Bailian and internal OpenAI-compatible endpoints can be selected by configuration.

## 8. What Not To Do In Phase 1

Do not implement these yet:

- Comments, likes, favorites, sharing.
- Mini program frontend.
- LMS / DMS / CRM / Feishu integration.
- WeCom app-level integration beyond login.
- Hermit image upload Q&A.
- Hermit PDF upload Q&A.
- Full audit export system.
- Microservice split.
- Gray release pipeline.
- Separate staging environment.

## 9. Testing Strategy

Phase 1 should add tests around service logic, not only UI rendering.

Recommended test levels:

- Unit tests for tenant scope checks.
- Unit tests for Workshop state transitions.
- Unit tests for admin edit-before-publish version behavior.
- Integration tests for key API routes once database test setup exists.
- Manual UI smoke test for Workshop submit -> admin review -> publish -> public list.

Minimum state-transition tests:

```text
draft -> submitted
submitted -> ai_rejected
submitted -> pending_admin_review
pending_admin_review -> admin_rejected
pending_admin_review -> published
pending_admin_review -> edited_then_published
```

## 10. Definition Of Done For Architecture Phase

This architecture phase is done when:

- Target source layout is documented.
- Phase 1 module boundaries are agreed.
- Database and ORM choice is confirmed.
- Tenant / auth / Workshop tables are designed.
- First vertical slice is selected.
- Implementation can proceed without debating folder structure on every task.

## 11. Immediate Next Decision

Before writing production code, confirm the database tool choice:

```text
Option A: Prisma
- Faster CRUD and migration setup.
- Strong generated TypeScript types.
- Good fit for MySQL-backed business tables.

Option B: Drizzle
- Closer to SQL and more explicit queries.
- Good for SQL-first MySQL usage.
- Slightly more engineering discipline needed.
```

Recommendation: choose Prisma + MySQL for phase 1 unless the deployment team strongly prefers SQL-first tooling. Treat Hermit vector retrieval as a separate adapter decision.
