# Lighthouse Data Model V0.1

**Goal:** Define the first production data model for Lighthouse on MySQL 8.0.

**Architecture:** MySQL stores structured business data. Hermit semantic retrieval stays behind a separate knowledge / vector retrieval adapter. Every user-facing business table carries organization scope so the platform can support multi-brand, multi-region, multi-dealer, and multi-store isolation from v1.

**Tech Stack:** MySQL 8.0, Prisma or equivalent ORM, Next.js BFF, selected vector retrieval service, object / file storage adapter.

---

## 1. Design Principles

1. Organization scope is explicit. Content, submissions, learning records, reports, and knowledge entries must be filterable by brand, region, dealer, and store.
2. Role design stays simple. v1 uses normal user and brand-side highest admin, but data scope must be ready for multi-brand / region / store.
3. Published content is versioned. Admins can edit before publishing, so the submitted version and published version should both be traceable.
4. Learning records are first-class data. Reading history, progress, and training completion are not analytics afterthoughts.
5. Hermit retrieval is decoupled. MySQL stores knowledge metadata and source records; semantic vectors can live in Bailian, an internal vector service, Qdrant, or another approved system.
6. v1 excludes social behavior. There are no comments, likes, favorites, or shares in the first data model.

## 2. Entity Map

```text
Tenant
  brands
  regions
  dealers
  stores

Identity
  users
  identity_accounts
  user_org_memberships
  user_roles

Content
  content_items
  content_versions
  files
  import_jobs

Learning
  learning_records
  reading_records
  training_completion_records

Workshop
  workshop_submissions
  workshop_review_events
  published_guides
  contribution_stats

Knowledge / Hermit
  knowledge_documents
  knowledge_chunks
  chat_sessions
  chat_messages
  retrieval_traces

Reporting / Ops
  report_exports
  operation_logs
```

## 3. Tenant And Organization

### `brands`

Represents a vehicle brand or business brand scope.

Key fields:

```text
id
code
name
status
created_at
updated_at
```

### `regions`

Represents a regional management scope under one brand.

Key fields:

```text
id
brand_id
code
name
status
created_at
updated_at
```

### `dealers`

Represents dealer groups or dealer companies.

Key fields:

```text
id
brand_id
region_id
code
name
status
created_at
updated_at
```

### `stores`

Represents service stores / outlets.

Key fields:

```text
id
brand_id
region_id
dealer_id
code
name
city
status
created_at
updated_at
```

Isolation rule:

- Brand admin can see records inside their brand scope.
- Region-level queries filter by `region_id`.
- Store-level records keep `store_id`.
- If a content item is global, organization fields may be null but visibility rules must make that explicit.

## 4. Identity And Permission

### `users`

Internal normalized user record.

Key fields:

```text
id
display_name
mobile
email
employee_no
user_type          -- internal_employee | dealer_user
primary_brand_id
primary_region_id
primary_dealer_id
primary_store_id
primary_role_name  -- service_advisor, claim_advisor, lounge_specialist, parts_staff, technician, car_wash_staff, backend_support, admin, etc.
status
last_login_at
created_at
updated_at
```

### `identity_accounts`

Maps OA and WeCom identities to one internal user.

Key fields:

```text
id
user_id
provider           -- oa | wecom
provider_user_id
provider_union_id
raw_profile_json
created_at
updated_at
```

### `user_org_memberships`

Allows one user to belong to multiple organization scopes if needed.

Key fields:

```text
id
user_id
brand_id
region_id
dealer_id
store_id
role_name
is_primary
status
created_at
updated_at
```

### `user_roles`

Simple application-level roles.

Key fields:

```text
id
user_id
role               -- normal_user | highest_admin
scope_type         -- global | brand | region | dealer | store
scope_id
created_at
updated_at
```

v1 rule: keep role types simple, but keep scope flexible.

## 5. Content And Files

### `content_items`

Represents Heart content, Mirror cases, Action practices, normative files, published Do & Don't guides, and training material.

Key fields:

```text
id
content_type       -- heart | mirror_case | action_case | norm_file | workshop_guide | training
title
summary
status             -- draft | published | archived
visibility_scope   -- global | brand | region | dealer | store
brand_id
region_id
dealer_id
store_id
source_type        -- manual | import | workshop_publish
current_version_id
published_at
created_by
updated_by
created_at
updated_at
```

### `content_versions`

Stores versioned content bodies.

Key fields:

```text
id
content_item_id
version_no
title
body_markdown
body_json
change_note
created_by
created_at
```

### `files`

Stores metadata for uploaded / imported files. Binary data should live in file storage, NAS, or object storage.

Key fields:

```text
id
file_name
mime_type
file_size
storage_type       -- local | nas | object_storage
storage_path
checksum
uploaded_by
created_at
```

### `import_jobs`

Tracks batch import tasks for cases, norms, Heart documents, training files, and Do & Don't source files.

Key fields:

```text
id
import_type        -- content | norm_file | case_library | training | workshop_seed
file_id
status             -- pending | processing | completed | failed
total_count
success_count
failed_count
error_message
created_by
created_at
updated_at
```

## 6. Learning Data

### `learning_records`

One row per user and learning content item.

Key fields:

```text
id
user_id
content_item_id
brand_id
region_id
dealer_id
store_id
started_at
last_read_at
completed_at
progress_percent
status             -- not_started | in_progress | completed
created_at
updated_at
```

### `reading_records`

Lower-level reading behavior records.

Key fields:

```text
id
user_id
content_item_id
brand_id
region_id
dealer_id
store_id
read_at
duration_seconds
progress_percent
source_page
created_at
```

### `training_completion_records`

Tracks training completion as a reportable business state.

Key fields:

```text
id
user_id
content_item_id
brand_id
region_id
dealer_id
store_id
completed_at
completion_source  -- auto_progress | admin_import | manual_mark
created_at
updated_at
```

## 7. Workshop Data

### `workshop_submissions`

Represents user-submitted Do & Don't drafts and submissions.

Key fields:

```text
id
submitter_id
brand_id
region_id
dealer_id
store_id
role_name
service_scenario
principle_ref
title
do_text
how_text
dont_text
status             -- draft | submitted | ai_rejected | pending_admin_review | admin_rejected | published | withdrawn
ai_review_result_json
submitted_at
last_reviewed_at
published_guide_id
created_at
updated_at
```

### `workshop_review_events`

Append-only review history.

Key fields:

```text
id
submission_id
actor_id
event_type         -- submit | ai_pass | ai_reject | admin_reject | admin_edit | admin_publish | withdraw
from_status
to_status
comment
snapshot_json
created_at
```

Rule: `snapshot_json` preserves important before / after content for edit-before-publish.

### `published_guides`

Published Do & Don't execution guides.

Key fields:

```text
id
source_submission_id
content_item_id
brand_id
region_id
dealer_id
store_id
role_name
service_scenario
principle_ref
title
do_text
how_text
dont_text
published_by
published_at
created_at
updated_at
```

### `contribution_stats`

Denormalized stats for leaderboard and exports.

Key fields:

```text
id
brand_id
region_id
dealer_id
store_id
user_id
published_count
submitted_count
latest_published_at
updated_at
```

## 8. Knowledge And Hermit

### `knowledge_documents`

Source document metadata for Hermit.

Key fields:

```text
id
source_type        -- content_item | file | published_guide | manual
source_id
title
visibility_scope
brand_id
region_id
dealer_id
store_id
status             -- active | archived
created_at
updated_at
```

### `knowledge_chunks`

Chunk metadata stored in MySQL. Vector payload can live in a separate vector service.

Key fields:

```text
id
knowledge_document_id
chunk_no
heading
content_text
vector_provider    -- bailian | internal_vector | qdrant | pgvector | keyword
external_vector_id
created_at
updated_at
```

### `chat_sessions`

Hermit chat session.

Key fields:

```text
id
user_id
brand_id
region_id
dealer_id
store_id
title
created_at
updated_at
```

### `chat_messages`

Hermit chat messages.

Key fields:

```text
id
session_id
role               -- user | assistant | system
content
model_name
created_at
```

### `retrieval_traces`

Stores retrieval evidence for answer traceability.

Key fields:

```text
id
chat_message_id
query_text
retrieval_provider
matched_chunk_ids_json
source_cards_json
created_at
```

## 9. Reporting And Operations

### `report_exports`

Tracks export jobs and files.

Key fields:

```text
id
report_type        -- contribution | submission | learning | reading | training_completion
requested_by
filter_json
status             -- pending | processing | completed | failed
file_id
created_at
updated_at
```

### `operation_logs`

Basic troubleshooting and operation logs. Exportable admin audit logs are out of v1 scope.

Key fields:

```text
id
actor_id
action
target_type
target_id
metadata_json
created_at
```

## 10. Critical Relationships

```text
brands 1 -> n regions
regions 1 -> n dealers
dealers 1 -> n stores
users n -> n org scopes through user_org_memberships
users 1 -> n identity_accounts
content_items 1 -> n content_versions
content_items 1 -> n learning_records
users 1 -> n workshop_submissions
workshop_submissions 1 -> n workshop_review_events
workshop_submissions 1 -> 0/1 published_guides
published_guides 1 -> 1 content_items
content_items / files / published_guides -> knowledge_documents -> knowledge_chunks
chat_sessions 1 -> n chat_messages
assistant chat_messages 1 -> n retrieval_traces
report_exports 1 -> 0/1 files
```

## 11. Status Values

Workshop submission status:

```text
draft
submitted
ai_rejected
pending_admin_review
admin_rejected
published
withdrawn
```

Content status:

```text
draft
published
archived
```

Learning status:

```text
not_started
in_progress
completed
```

Import / export job status:

```text
pending
processing
completed
failed
```

## 12. Indexing Recommendations

Minimum indexes:

```text
users(primary_store_id)
identity_accounts(provider, provider_user_id)
stores(brand_id, region_id, dealer_id)
content_items(content_type, status, visibility_scope)
content_items(brand_id, region_id, dealer_id, store_id)
learning_records(user_id, content_item_id)
learning_records(brand_id, region_id, dealer_id, store_id)
workshop_submissions(status, submitted_at)
workshop_submissions(brand_id, region_id, dealer_id, store_id)
published_guides(role_name, service_scenario)
contribution_stats(brand_id, region_id, dealer_id, store_id, published_count)
knowledge_chunks(knowledge_document_id, chunk_no)
chat_sessions(user_id, created_at)
```

## 13. Phase 1 Tables

Do not implement every table at once. Phase 1 should create only the tables needed for the first vertical slice:

```text
brands
regions
dealers
stores
users
identity_accounts
user_org_memberships
user_roles
workshop_submissions
workshop_review_events
published_guides
contribution_stats
content_items
content_versions
knowledge_documents
knowledge_chunks
```

Learning and reporting can be added immediately after the Workshop slice because their table design depends on the same tenant model.

## 14. Open Decisions

1. Exact organization source: where brand, region, dealer, store, and job role data comes from.
2. Whether a dealer group layer is required separately from dealers.
3. Whether training completion is based on reading progress, manual import, or explicit assessment.
4. Which batch import formats are required first.
5. Which vector retrieval path is approved for Hermit.
6. Whether chat logs need retention limits or anonymization.
7. Whether admins can publish content globally or only within assigned brand scope.

## 15. Current Recommendation

Implement the MySQL tenant and Workshop tables first. Keep learning, reporting, and Hermit knowledge tables designed but implement them in the next slice. This keeps the first database migration useful without making the first build too broad.

The concrete Phase 1 execution plan is tracked in [Lighthouse Phase 1 Implementation Plan](./2026-05-16-lighthouse-phase1-implementation-plan.md).
