# Lighthouse Production Architecture V0.1

**Goal:** Define a production-oriented technical architecture for Lighthouse as a service culture digital platform.

**Architecture:** Use a Next.js-based modular monolith in the first production phase, deployed inside a private cloud environment. Keep frontend, BFF, domain APIs, admin workflows, and Hermit orchestration in one deployable application, while moving durable data, files, and vectors into production-grade storage. Split workers or AI services only when scale or security requirements justify it.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, MySQL, vector retrieval service to be confirmed, object storage / file storage, Redis optional, OA SSO, WeCom login, OpenAI-compatible LLM / embedding provider, Docker.

---

## 1. Current Context

The current repo is a Next.js application with five product modules:

- `Heart / 本心`: service philosophy and learning entry.
- `Mirror / 镜鉴`: external benchmark cases.
- `Action / 笃行`: internal service practice cases.
- `Workshop / 共创`: role-specific Do & Don't co-creation.
- `Hermit / 路引`: domain-specific intelligent assistant.

The existing demo is frontend-heavy. `Hermit` currently has a working route at `POST /api/chat`, a local RAG module, static Markdown knowledge files, and generated local vector JSON. This is enough for demo validation, but production needs persistent data, admin workflows, traceable AI review, and maintainable knowledge ingestion.

## 2. Product Boundaries Driving Architecture

Production architecture should stay aligned with the confirmed product scope:

- The product is an enterprise culture digital platform, not a generic community forum.
- The main user groups are brand after-sales employees, managers, and dealer service staff.
- `Workshop` v1 focuses on role-specific Do & Don't lists, not broad case co-creation.
- Submissions remain long-term open.
- Front-stage Workshop has public area, submission area, and personal area.
- Backend role design stays simple: one brand-side highest administrator.
- Hermit is a domain-specific service culture assistant, not a narrow FAQ bot and not yet an autonomous Agent.

## 3. Confirmed Production Constraints

The following constraints are now confirmed:

- Deployment environment: private cloud server deployment. Operations are expected to go through a bastion host or equivalent controlled access path.
- Server baseline: Ubuntu 20.04.6 LTS, Docker supported, code can be uploaded under `/opt`, and Git pull is also available.
- Process manager: PM2 is installed and can be considered for running the Next.js Node process.
- Node runtime: the currently installed server Node is `v10.19.0`, which is not compatible with the current application stack. For planning purposes, operations will provide an application-compatible Node runtime, with `node >=20.9.0` as the minimum requirement for current `next@16.1.1`.
- Reverse proxy: Nginx has an available image source, currently observed as `nginx:1.29.3`.
- Database baseline: the available database is MySQL, currently observed as `mysql:8.0`.
- Base image: Alpine is available in the image source, currently observed as `alpine:3.22.2`.
- Login model: dealer-side users should default to WeCom login. Internal employees can use OA one-click login.
- Data boundary: business data should not leave the approved enterprise boundary.
- AI providers: use company-approved Bailian API and / or an internal private model endpoint. The model interface should be treated as OpenAI-compatible where possible.
- Launch surface: Web / H5 first. Mini program is not required for v1.
- Content maintenance: Heart, cases, normative files, and Do & Don't content should support both admin manual maintenance and batch import.
- Admin review boundary: the highest administrator can approve, reject, or edit submitted content before publishing.
- User scale: first batch is expected to reach thousands of users, covering internal enterprise users and nationwide dealer users.
- Organization model: the system needs multi-brand, multi-region, and multi-store isolation.
- Reporting: the system needs report export for contribution leaderboard, submission volume, learning data, and related operational metrics.
- Learning tracking: the system needs to record learning progress, reading history, and training completion state.
- Import source: existing normative files, case libraries, and service philosophy documents are available for import.
- Back-office audit export: exportable admin operation audit logs are not required in v1.
- Social and integration scope: comments, likes, favorites, sharing, LMS, DMS, CRM, WeCom app integration, Feishu integration, image upload Q&A, and PDF upload Q&A are out of v1 scope.
- Environment split: separate development, staging, and production environments are not required for v1.

These decisions move the target architecture closer to a private-cloud enterprise deployment than a public SaaS deployment.

## 4. Recommended System Shape

Recommended v1 shape:

```text
Web / H5 Frontend
        |
Private Cloud Gateway / Nginx
        |
Next.js App Router
Pages + BFF + Server Actions / API Routes
        |
Domain Services
Tenant / Content / Learning / Workshop / Admin / Reporting / Hermit
        |
MySQL
Structured business data
        |
Vector Retrieval Service
Hermit semantic retrieval
        |
Object Storage
Images / PDFs / normative documents / attachments
        |
Bailian API / Internal OpenAI-compatible Model
AI review / chat / recommendation
```

The important decision is to avoid over-splitting early. A modular monolith is enough for the first production release because the product is still defining core workflows. The code should still be organized as modules so future splitting is possible.

## 5. Frontend Architecture

Use the current Next.js frontend as the primary web application.

Frontend areas:

- Public / learning pages: Heart, Mirror, Action, published Workshop guides.
- User work area: Workshop submission, personal drafts, review feedback, history.
- Hermit chat area: question answering, source-backed recommendations.
- Admin area: content management, submission review, publish / reject, knowledge maintenance.
- Reporting area: contribution, submission, learning progress, reading record, and training completion export.

Responsive Web / H5 is the first launch surface. If a WeChat mini program is required later, it should be a separate frontend that consumes shared backend APIs. Do not force the Next.js app itself to become the mini program.

## 6. BFF Responsibility

BFF means Backend for Frontend. In this project, Next.js API Routes / Server Actions can initially act as the BFF.

The BFF should:

- Return page-ready data to frontend screens.
- Aggregate data from content, Workshop, admin, and Hermit services.
- Hide database and AI provider details from the browser.
- Enforce session, permission, and input validation.
- Normalize OA and WeCom identity into one application user model.
- Provide different response shapes later for Web and mini program if needed.

Example:

```text
GET /api/workshop/home
-> published guide summary
-> role filters
-> contribution leaderboard
-> user submit permission
```

## 7. Backend Domain Modules

Recommended backend modules:

```text
auth/
tenant/
content/
learning/
workshop/
admin/
reporting/
hermit/
knowledge/
files/
logging/
```

`tenant/` manages brand, region, dealer, store, and user visibility boundaries.

`content/` manages Heart, Mirror, Action, published guides, and normative files.

`learning/` manages reading records, learning progress, and training completion status.

`workshop/` manages submissions, drafts, AI initial review, revision, admin review, publishing, and contribution records.

`admin/` manages highest-admin workflows, approve / reject / edit-before-publish actions, content maintenance, and batch import.

`reporting/` manages export jobs for contribution leaderboard, submission volume, learning progress, and training completion data.

`hermit/` manages chat orchestration, prompt assembly, retrieval, related-case recommendation, related-norm recommendation, and answer traceability.

`knowledge/` manages ingestion, chunking, embedding, versioning, and vector indexing.

`auth/` maps OA and WeCom identities to internal users, stores, and roles.

`logging/` keeps basic system and operation logs for troubleshooting. Exportable admin audit logs are not a v1 product requirement.

## 8. Tenant And Organization Isolation

The system should be designed as a multi-tenant enterprise platform even if the first launch starts with one main brand.

Core isolation dimensions:

```text
brand
-> region
-> dealer group / dealer
-> store
-> user
```

Every content item, Workshop submission, published guide, learning record, contribution stat, and report query should carry enough organization scope to support brand, region, and store-level visibility.

Recommended rule:

- Global content can be visible across all brands or regions.
- Brand-scoped content is visible only within one brand.
- Region-scoped content is visible only within selected regions.
- Store-scoped records, such as submissions and learning progress, stay tied to the user's store.

This is more important than complex permission roles. The role model can stay simple, but organization scope must be explicit in the data model.

## 9. Data Storage

Use MySQL as the primary business database because this is the available database in the target environment.

Important implication: MySQL should handle structured business data, but it should not be assumed to replace `pgvector`. Hermit semantic retrieval needs one of the following:

- company-approved knowledge base / vector capability from Bailian or the internal model platform;
- a separate vector service such as Qdrant, if Docker deployment is allowed;
- a separate PostgreSQL + pgvector service only if IT explicitly approves it;
- a temporary keyword-search fallback for early pilot use.

Core MySQL tables:

```text
users
identity_accounts
brands
regions
dealers
stores
user_roles
user_org_memberships
content_items
content_versions
import_jobs
learning_records
reading_records
training_completion_records
workshop_submissions
workshop_review_events
published_guides
contribution_stats
report_exports
files
knowledge_documents
knowledge_chunks
chat_sessions
chat_messages
operation_logs
```

Object storage should hold files and large assets:

- PDF normative documents.
- Image assets.
- Uploaded case materials.
- Admin-imported reference files.

Do not store large binary files directly in MySQL.

## 10. Learning And Reporting

Learning tracking is now a first-class production requirement.

Minimum learning data:

```text
user_id
brand_id / region_id / store_id
content_id
content_type
started_at
last_read_at
completed_at
progress_percent
training_status
```

Report exports should cover:

- Contribution leaderboard by brand, region, store, and individual.
- Submission volume by role, store, status, and time range.
- Learning progress by content, organization, and user group.
- Reading records and training completion status.

Report export should be implemented as an asynchronous job if the data volume grows, but v1 can start with server-generated Excel / CSV export if performance is acceptable.

## 11. Workshop Production Flow

```text
User creates draft
-> User submits Do & Don't
-> BFF validates required fields
-> AI / workflow initial review
-> If failed: return structured revision feedback
-> If passed: enter admin review queue
-> Highest admin approves / rejects / edits before publishing
-> Approved item becomes published guide
-> Published guide enters searchable public area
-> Published guide is indexed into Hermit knowledge source
```

AI initial review should not be a black-box boolean. It should produce structured output:

```json
{
  "formatPassed": true,
  "duplicateRisk": "low",
  "completeness": "medium",
  "issues": ["How 部分不够具体"],
  "suggestedRevision": "补充执行步骤、时间点和责任人",
  "nextStep": "revise"
}
```

The final publishing decision remains with the brand-side highest administrator. If the administrator edits submitted content before publishing, the system must keep both the submitted version and the published version in review history.

## 12. Hermit Production Flow

```text
User question
-> BFF validates session and domain scope
-> Query rewrite / intent classification
-> Retrieve related principles, cases, norms, Do & Don't guides
-> Generate answer with source references
-> Recommend related cases or normative files
-> Save chat log and retrieval trace
```

Hermit answers should support:

- Direct answer.
- Principle basis.
- Related cases.
- Related normative files or Do & Don't guides.
- Next-step action suggestion.

For production, each answer should preserve retrieval trace internally, even if the UI only shows simplified source cards.

AI and embedding calls should go through approved provider configuration only:

- Bailian API if enterprise data policy permits that path.
- Internal private OpenAI-compatible model endpoint when data must remain fully inside the private environment.

The application should treat provider selection as configuration, not hard-coded product logic.

Hermit v1 should stay text-based. Image upload Q&A and PDF upload Q&A are out of scope for the first production version.

## 13. Deployment Options

The confirmed target is private cloud deployment through controlled operational access, likely via bastion host. This means public SaaS deployment should not be the default assumption.

### Option A: Simple Internal Pilot

```text
Dockerized Next.js app
Managed MySQL
Managed object storage
External LLM / embedding provider
Basic log collection
```

This is fastest and appropriate for controlled internal pilot usage.

### Option B: Brand Production Deployment

```text
Gateway / Nginx
Next.js Web + BFF container
Worker container
MySQL
Vector retrieval service
Redis
Object storage
LLM / embedding provider
Monitoring + log retention
```

This remains useful as a reference shape, but the confirmed environment points to a more private-cloud-oriented deployment.

### Option C: Full Private Deployment

```text
Private network
Container platform
Private MySQL
Private object storage
Approved Bailian API or private LLM / embedding endpoint
Vector retrieval service to be confirmed
Centralized logging and security review
```

This is now the closest match to the confirmed deployment environment. The first implementation can still be kept simple with Dockerized services if the private cloud environment allows it.

### Option D: PM2-Based Node Deployment

```text
Private Nginx
PM2-managed Next.js process
MySQL
File storage
Bailian API / internal OpenAI-compatible model endpoint
Vector retrieval service to be confirmed
```

This is viable if PM2 can be pointed at the application-compatible Node.js runtime provided by operations. The currently installed server Node is `v10.19.0`, while `next@16.1.1` requires `node >=20.9.0`. The architecture assumes operations will resolve this runtime gap through an application-local Node runtime or an equivalent deployment mechanism.

## 14. Security And Governance

Minimum production requirements:

- Login and session management.
- Role-based authorization with at least normal user and highest admin.
- Server-side validation for all submissions and admin actions.
- Review history for Workshop approve / reject / edit-before-publish actions.
- Rate limiting for Hermit and AI review endpoints.
- Environment variable management for LLM and embedding keys.
- Data backup and migration strategy.
- Clear retention policy for chat logs and user submissions.

Identity should support two entry paths:

- WeCom login for dealer-side personnel.
- OA one-click login for internal employees.

Both should resolve into one internal user table so Workshop submissions, contribution stats, admin permissions, review history, and operation logs use a consistent user identity.

Back-office operation logs do not need to be designed as exportable audit reports in v1.

## 15. Recommended Implementation Phases

### Phase 1: Production Skeleton

- Add MySQL.
- Add ORM / query layer.
- Define core data schema.
- Add WeCom / OA identity mapping and two-role permission model.
- Add brand / region / dealer / store organization model.
- Move Workshop mock data into database-backed APIs.
- Keep Hermit current flow, but wrap it in cleaner service boundaries.

### Phase 2: Workshop Workflow

- Add draft / submit / AI review / admin review / publish flow.
- Add review event history.
- Add personal area backed by real data.
- Add contribution leaderboard.
- Add admin review page.
- Add edit-before-publish support with version history.

### Phase 3: Knowledge And Hermit

- Move Markdown / JSON knowledge into database-managed knowledge documents.
- Store chunks and embeddings in the selected vector retrieval service.
- Index published Do & Don't guides automatically.
- Add source cards and recommendation cards to Hermit.
- Add answer trace and confidence tier.
- Add provider configuration for Bailian API and internal OpenAI-compatible model endpoints.

### Phase 4: Learning And Reporting

- Add reading records and learning progress.
- Add training completion status.
- Add contribution, submission, and learning report exports.
- Add organization-scoped filters for brand, region, and store.

### Phase 5: Hardening

- Add automated migrations.
- Add observability and basic operation logs.
- Add load and security checks.
- Validate private cloud deployment path through the bastion-based operation process.

## 16. Explicitly Out Of V1 Scope

The following are intentionally excluded from v1:

- Comments, likes, favorites, and sharing.
- LMS, DMS, CRM, WeCom app-level integration, and Feishu integration.
- Hermit image upload Q&A.
- Hermit PDF upload Q&A.
- Gray release process.
- Separate development, staging, and production environment split.
- Exportable back-office operation audit logs.

## 17. Remaining Open Questions

These should still be confirmed before final production implementation:

1. MySQL version and permission boundary: can the application create schemas, run migrations, and create indexes?
2. Vector retrieval path: Bailian knowledge base, internal vector service, Qdrant container, separate PostgreSQL + pgvector, or keyword fallback?
3. Deployment mode detail: PM2 with application-local Node runtime, Docker Compose, Kubernetes, existing PaaS, or another internal deployment standard?
4. Network path: can the private cloud server call Bailian API directly, or must it use an enterprise API gateway?
5. Model policy: which use cases can use Bailian, and which must use the internal private model?
6. Identity integration details: OA and WeCom OAuth / SSO protocol, callback domains, and user identifier fields.
7. User-store mapping: where dealer personnel, store names, and job roles come from.
8. Batch import formats: Excel, Word, PDF, Markdown, or exported files from an existing system.
9. File storage: private object storage service, NAS, or database-managed attachment service.
10. Learning definition: what counts as completed learning for articles, cases, normative files, and training materials?
11. Report format: Excel, CSV, dashboard-only, or all of the above?

## 18. Current Recommendation

Use Option C as the target architecture, but keep the application shape close to a modular monolith. This keeps the first production version realistic for private cloud deployment while avoiding unnecessary microservice complexity.

The code-level architecture and phase-1 refactor route are tracked in [Lighthouse Production Code Architecture Implementation Plan](./2026-05-14-lighthouse-code-architecture-phase1-roadmap.md).

The first MySQL data model draft is tracked in [Lighthouse Data Model V0.1](./2026-05-15-lighthouse-data-model-v0.1.md).

The next concrete step should be a database-backed Workshop slice:

```text
tenant schema
-> user and organization model
-> learning and report schema
-> API
-> admin review queue
-> user submission flow
-> published guide list
-> Hermit indexing hook
```

This slice exercises the full architecture without trying to productionize every module at once.
