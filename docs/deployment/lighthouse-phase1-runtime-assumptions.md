# Lighthouse Phase 1 Runtime Assumptions

Phase 1 assumes a private-cloud or internal server deployment. The application remains a single Next.js modular monolith.

## Server Baseline

- OS: Ubuntu 20.04.6 LTS
- Node.js: `>=20.9.0`, provided by operations for this application
- Process manager: PM2
- Database: MySQL 8.0
- Reverse proxy: Nginx 1.29.3
- Application path: under `/opt`

## Required Environment

```text
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/lighthouse"
HOSTNAME="0.0.0.0"
OPENAI_API_KEY=""
OPENAI_BASE_URL=""
OPENAI_MODEL="qwen3.6-plus"
OPENAI_API_MODE="chat"
OPENAI_EXTRA_HEADERS=""
EMBEDDING_API_KEY=""
EMBEDDING_BASE_URL=""
EMBEDDING_MODEL=""
HERMIT_RAG_MIN_SCORE="0.55"
HERMIT_RAG_STRONG_SCORE="0.75"
HERMIT_RAG_OUT_OF_DOMAIN_SCORE="0.80"
HERMIT_KNOWLEDGE_REQUIRE_DATABASE="false"
```

Prisma reads `DATABASE_URL` when running migration, seed, and runtime queries. Local development can keep model-provider keys in `.env.local`, but database commands must run with `DATABASE_URL` available to Prisma.

## Hermit Model Provider

Hermit uses OpenAI-compatible HTTP APIs so the company-procured internal model gateway can be used without hard-coding a vendor in the application. The configuration follows the same connection shape as the Friday project's group-procured model mode, but Lighthouse does not expose a model selector: Hermit uses one preset chat model.

Configure the chat model with:

- `OPENAI_BASE_URL`: the internal model gateway URL. It can be the gateway root, a `/v1` base URL, or a full `/chat/completions` or `/responses` endpoint. Hermit normalizes full endpoints back to the provider base URL expected by the AI SDK.
- `OPENAI_API_KEY`: the gateway credential or placeholder token required by the internal gateway.
- `OPENAI_MODEL`: the single preset chat model name as exposed by the gateway. The default is `qwen3.6-plus`, matching the Friday group model catalog's default chat model. Override it only if the company deployment standard names a different single Hermit model.
- `OPENAI_API_MODE`: `chat` by default. Use this for OpenAI-compatible Chat Completions gateways. Set it to `responses` only when the gateway explicitly supports the OpenAI Responses API.
- `OPENAI_EXTRA_HEADERS`: optional JSON object for non-standard gateway headers, for example `{"X-Api-Key":"TOKEN"}` or an overriding `{"Authorization":"Bearer TOKEN"}`. Leave it empty when the gateway accepts standard bearer-token auth.

The default is `chat` because internal and domestic OpenAI-compatible gateways most commonly expose `/chat/completions`, not the newer Responses API.

Before production rollout, run a real internal-model connection test with the final company gateway URL, model name, and auth policy. The code is compatible with the OpenAI-compatible shape, but the final gateway still needs to prove: streaming `/chat/completions` works with AI SDK parsing, non-streaming fallback responses are not returned during chat, error status codes are readable, timeout behavior is acceptable, and rate/concurrency limits are documented.

## Hermit Embedding And RAG

Yes, the embedding model is needed for deployment if Hermit RAG is enabled.

The current RAG flow uses embeddings twice:

1. During `npm run build`, `npm run build:knowledge` reads static Hermit knowledge, brand/normative markdown, static Action cases, and, when `DATABASE_URL` is available, published Workshop guides plus published managed content versions. It then calls the configured embedding API and writes `knowledge-vectors.json` into the build output.
2. During runtime chat, every user query calls the same embedding API to produce a query vector and compare it with the built knowledge vectors.

Therefore production, preview, and any private-cloud build host must configure:

- `EMBEDDING_BASE_URL`: the internal embedding endpoint root, normally ending in `/v1`.
- `EMBEDDING_API_KEY`: the embedding endpoint credential. If omitted, the app falls back to `OPENAI_API_KEY`.
- `EMBEDDING_MODEL`: the embedding model name used by the company gateway.
- `HERMIT_RAG_MIN_SCORE`: minimum cosine score for a chunk to enter the prompt.
- `HERMIT_RAG_STRONG_SCORE`: score at which published practice, Action, or norm sources can be treated as exact evidence.
- `HERMIT_RAG_OUT_OF_DOMAIN_SCORE`: stricter score required when the user query has no service-domain signal.
- `HERMIT_KNOWLEDGE_REQUIRE_DATABASE`: keep `false` for preview builds that may not have migrated database content yet. Set `true` only when production builds must fail if database-backed Workshop/Content sources cannot be loaded.

The embedding model used at build time and runtime must be the same model with the same vector dimension. Hermit stores the build-time model name and dimension in `knowledge-vectors.json`; runtime RAG will reject mismatched embedding configuration and continue the chat without retrieved context rather than using distorted similarity scores.

Runtime retrieval is no longer raw top-K. It now applies service-domain detection, a minimum relevance threshold, a stronger out-of-domain threshold, and evidence tiering. If a question is unrelated or no chunk crosses the minimum score, Hermit does not inject the nearest weak snippets into the model prompt.

If the company procurement only includes a chat model and no embedding endpoint, choose one of these before production:

- procure or enable an embedding model on the same internal model gateway;
- prebuild and serve an internal embedding-compatible query endpoint for Hermit;
- temporarily disable RAG and accept prompt-only answers, which reduces source grounding and answer accuracy.

## Phase 1 Startup Order

```bash
npm ci
npm run db:setup
npm run build
pm2 start npm --name lighthouse -- run start
```

`npm ci` runs `prisma generate` through `postinstall`. Production and preview
environments should use `db:setup`, which runs `prisma migrate deploy` and the
idempotent seed script. Use `db:migrate` only for local schema development.

## Railway Preview

Railway is used as a preview target before moving the same application shape to
the company private server.

1. Add a MySQL service to the Railway project.
2. On the web service, set `DATABASE_URL` to the MySQL service URL, for example
   `${{MySQL.MYSQL_URL}}`.
3. Set `HOSTNAME=0.0.0.0` on the web service. Railway injects its own
   container hostname; Next.js standalone must bind to all interfaces for the
   healthcheck and public proxy to reach it.
4. Set the model-provider variables from the required environment list above.
   For Hermit RAG, the Railway build and runtime service must both have the
   same `EMBEDDING_*` values.
5. Deploy the GitHub branch. `railway.json` sets:
   - build command: `npm run build`
   - pre-deploy command: `npm run db:setup`
   - start command: `npm run start`
   - healthcheck path: `/`

The build produces a Next.js standalone server. The post-build step copies
`public` and `.next/static` into `.next/standalone` so the standalone server can
serve static assets directly.

## Scope Notes

- Workshop structured data is stored in MySQL through Prisma.
- The current auth layer uses seeded demo users, request headers, and a
  `lighthouse_preview_user_id` cookie as placeholders.
- The preview identity switcher is only for Railway/private preview walkthroughs;
  it is not a production login module and should be replaced by IAM / WeCom SSO.
- Administrator review is part of Workshop, not a sixth primary navigation
  module.
- Highest-admin review is intentionally a single brand-side role in Phase 1.
- Hermit vector retrieval remains isolated from the Workshop persistence slice.
- Real OA / WeCom login, real AI initial review, learning reports, batch import, and full content management are outside Phase 1.
