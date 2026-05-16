# Lighthouse Phase 1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build the first production skeleton for Lighthouse: module boundaries, MySQL persistence, tenant / auth foundation, and a database-backed Workshop workflow.

**Architecture:** Keep the app as a Next.js modular monolith. `src/app` owns routes, pages, and BFF entrypoints; `src/modules` owns domain services; `src/infrastructure` owns MySQL, AI, storage, import, and export adapters. MySQL 8.0 stores structured data. Hermit vector retrieval remains an adapter decision and is not required to block the Workshop vertical slice.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node >=20.9.0 provided by operations, PM2 or Docker deployment, MySQL 8.0, Prisma 6.x, Vitest, Nginx 1.29.3.

**Runtime note:** Prisma 7 currently requires Node `^20.19 || ^22.12 || >=24.0`, which is higher than the Node `>=20.9.0` baseline already agreed for this server. Phase 1 therefore pins Prisma / `@prisma/client` to the latest compatible 6.x line unless operations explicitly upgrades the Node requirement.

---

## Phase 1 Scope

Phase 1 builds one complete vertical slice:

```text
module skeleton
-> MySQL / Prisma foundation
-> tenant and auth placeholder
-> Workshop submission API
-> AI initial review placeholder
-> highest-admin review API
-> edit-before-publish
-> published guide API
-> contribution leaderboard API
-> current Workshop page reads real APIs
```

Out of Phase 1:

- OA / WeCom real login.
- Real AI initial review.
- Hermit vector migration.
- Learning records.
- Report export.
- Batch import.
- Full admin content management.

## Task 1: Add Tooling Baseline

**Files:**

- Modify: `package.json`
- Create: `.env.example`
- Create: `vitest.config.ts`

**Step 1: Add dependencies**

Run:

```bash
npm install @prisma/client
npm install -D prisma vitest
```

**Step 2: Add scripts**

Add:

```json
{
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:studio": "prisma studio",
  "test": "vitest run"
}
```

**Step 3: Add env example**

Create `.env.example`:

```text
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/lighthouse"
OPENAI_API_KEY=""
OPENAI_BASE_URL=""
OPENAI_MODEL=""
EMBEDDING_API_KEY=""
EMBEDDING_BASE_URL=""
EMBEDDING_MODEL=""
```

**Step 4: Verify**

Run:

```bash
npm run lint
npm run test
```

Expected:

- `lint` passes.
- `test` passes with no tests or initial smoke tests.

## Task 2: Create Module And Infrastructure Skeleton

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

**Step 1: Create empty public exports**

Each file should export a named placeholder type:

```ts
export type ModuleReady = true;
```

**Step 2: Verify**

Run:

```bash
npm run lint
npx tsc --noEmit --pretty false
```

Expected: no errors.

## Task 3: Add Prisma MySQL Schema

**Files:**

- Create: `prisma/schema.prisma`
- Create: `src/infrastructure/db/client.ts`
- Modify: `src/infrastructure/db/index.ts`

**Step 1: Define Prisma datasource**

Use MySQL:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

**Step 2: Add Phase 1 models**

Create models for:

```text
Brand
Region
Dealer
Store
User
IdentityAccount
UserOrgMembership
UserRole
ContentItem
ContentVersion
WorkshopSubmission
WorkshopReviewEvent
PublishedGuide
ContributionStat
KnowledgeDocument
KnowledgeChunk
```

Keep model names singular and table names snake_case via `@@map`.

**Step 3: Add Prisma client**

Create `src/infrastructure/db/client.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**Step 4: Verify**

Run:

```bash
npm run db:generate
npx tsc --noEmit --pretty false
```

Expected: Prisma client generates and TypeScript passes.

## Task 4: Seed Tenant And Demo User Data

**Files:**

- Create: `prisma/seed.ts`
- Modify: `package.json`

**Step 1: Add seed script**

Add Prisma seed config:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

**Step 2: Seed minimal data**

Seed:

```text
Brand: Demo Brand
Region: East Region
Dealer: Demo Dealer
Store: 星河店
User: 李明
Role: normal_user
Admin: 品牌方管理员
Role: highest_admin
```

**Step 3: Verify**

Run:

```bash
npm run db:migrate
npx prisma db seed
```

Expected: MySQL contains baseline tenant and demo users.

## Task 5: Implement Tenant Scope Service

**Files:**

- Create: `src/modules/tenant/types.ts`
- Create: `src/modules/tenant/repository.ts`
- Create: `src/modules/tenant/service.ts`
- Create: `src/modules/tenant/service.test.ts`
- Modify: `src/modules/tenant/index.ts`

**Step 1: Write tests**

Test:

```text
normal user resolves to primary store scope
highest admin resolves to brand scope
scope filter includes brand, region, dealer, store fields
```

**Step 2: Implement service**

Expose:

```ts
getUserOrgScope(userId: string)
buildOrgWhere(scope)
assertCanAccessStore(scope, storeId)
```

**Step 3: Verify**

Run:

```bash
npm run test -- src/modules/tenant/service.test.ts
npm run lint
```

Expected: tests and lint pass.

## Task 6: Implement Auth Placeholder Service

**Files:**

- Create: `src/modules/auth/types.ts`
- Create: `src/modules/auth/repository.ts`
- Create: `src/modules/auth/service.ts`
- Create: `src/modules/auth/service.test.ts`
- Modify: `src/modules/auth/index.ts`

**Step 1: Write tests**

Test:

```text
resolve demo normal user
resolve demo highest admin
map provider identity to internal user
```

**Step 2: Implement placeholder**

Expose:

```ts
getCurrentUser()
getCurrentAdmin()
resolveIdentityAccount(provider, providerUserId)
```

Phase 1 can use demo headers or fixed IDs until OA / WeCom is integrated.

**Step 3: Verify**

Run:

```bash
npm run test -- src/modules/auth/service.test.ts
```

Expected: tests pass.

## Task 7: Implement Workshop Domain Service

**Files:**

- Create: `src/modules/workshop/types.ts`
- Create: `src/modules/workshop/repository.ts`
- Create: `src/modules/workshop/service.ts`
- Create: `src/modules/workshop/service.test.ts`
- Modify: `src/modules/workshop/index.ts`

**Step 1: Write state-transition tests**

Test:

```text
draft -> submitted
submitted -> ai_rejected
submitted -> pending_admin_review
pending_admin_review -> admin_rejected
pending_admin_review -> published
pending_admin_review -> edited_then_published
published guide updates contribution stats
```

**Step 2: Implement service**

Expose:

```ts
createDraft(input, user)
submitForReview(id, user)
runInitialReview(id)
listPersonalSubmissions(user)
listPendingAdminReviews(admin)
rejectSubmission(id, admin, comment)
publishSubmission(id, admin, editedContent?)
listPublishedGuides(scope, filters)
getContributionLeaderboard(scope)
```

**Step 3: Verify**

Run:

```bash
npm run test -- src/modules/workshop/service.test.ts
```

Expected: all workflow tests pass.

## Task 8: Add Workshop BFF APIs

**Files:**

- Create: `src/app/api/workshop/submissions/route.ts`
- Create: `src/app/api/workshop/submissions/[id]/submit/route.ts`
- Create: `src/app/api/workshop/guides/route.ts`
- Create: `src/app/api/workshop/leaderboard/route.ts`
- Create: `src/app/api/admin/workshop/submissions/route.ts`
- Create: `src/app/api/admin/workshop/submissions/[id]/reject/route.ts`
- Create: `src/app/api/admin/workshop/submissions/[id]/publish/route.ts`

**Step 1: Keep routes thin**

Each route should:

```text
parse request
resolve current user / admin
call module service
return JSON
```

**Step 2: Verify**

Run:

```bash
npx tsc --noEmit --pretty false
npm run lint
```

Expected: no type or lint errors.

## Task 9: Replace Workshop Mock Data With API Data

**Files:**

- Modify: `src/app/workshop/page.tsx`

**Step 1: Split the page**

Recommended split:

```text
src/app/workshop/page.tsx
src/app/workshop/WorkshopClient.tsx
```

`page.tsx` fetches initial data. `WorkshopClient.tsx` owns client-side interactions.

**Step 2: Wire APIs**

Use:

```text
GET /api/workshop/guides
GET /api/workshop/leaderboard
POST /api/workshop/submissions
POST /api/workshop/submissions/:id/submit
```

**Step 3: Verify**

Run:

```bash
npm run lint
npx tsc --noEmit --pretty false
npm run build
```

Expected: production build passes.

## Task 10: Add Admin Review Page

**Files:**

- Create: `src/app/admin/workshop/page.tsx`

**Step 1: Build minimal admin UI**

Capabilities:

```text
list pending submissions
view submission detail
reject with comment
edit content before publish
publish
```

**Step 2: Verify manually**

Flow:

```text
create Workshop submission
submit for review
open admin review page
publish edited content
confirm public guide appears
confirm leaderboard updates
```

**Step 3: Verify commands**

Run:

```bash
npm run lint
npx tsc --noEmit --pretty false
npm run build
```

Expected: all pass.

## Task 11: Document Deployment Assumptions

**Files:**

- Create: `docs/deployment/lighthouse-phase1-runtime-assumptions.md`
- Modify: `README.md`

**Content:**

```text
Ubuntu 20.04.6 LTS
Node >=20.9.0 provided by operations
PM2 installed
MySQL 8.0
Nginx 1.29.3
Application path under /opt
Hermit vector retrieval not part of phase 1 runtime
```

**Verify:** documentation links are correct.

## Final Verification

Before calling Phase 1 complete, run:

```bash
npm run lint
npm run test
npx tsc --noEmit --pretty false
npm run build
```

Manual smoke test:

```text
open Workshop
create submission
submit for review
open admin review
publish guide
return to public guide list
confirm contribution leaderboard updates
```

## Phase 1 Definition Of Done

Phase 1 is done when:

- MySQL-backed Prisma schema exists.
- Tenant / auth skeleton exists.
- Workshop no longer relies only on mock data.
- Admin can review and publish Workshop submissions.
- Published guides and contribution leaderboard come from persisted data.
- The route from current demo to production skeleton is clear.
- Hermit vector retrieval remains isolated and can be implemented later without changing Workshop tables.
