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

## Hermit knowledge access

Hermit uses the knowledge hub's ordinary file index and progressive disclosure
flow. A request first receives the available folders and compact resource
metadata, then reads the selected document or section when the question needs
it. The index keeps the resource ID, version, source path, visibility and
location information so the response can cite the exact managed document.

`npm run build:knowledge` only verifies that static Markdown and Action source
documents are readable. It performs no network calls, does not generate a
vector cache, and does not require an embedding model. Managed resources are
imported with `npm run hub:bootstrap` (MySQL) or the packaged knowledge CLI
(SQLite) and remain in the configured knowledge store.

Production and preview deployments therefore only need the chat model
configuration described above, the database/storage configuration, and the
normal knowledge-hub initialization. No embedding endpoint, prebuilt index, or
similarity-threshold variables are required.

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
   Knowledge resources are read from the initialized hub; Railway does not
   need a separate embedding endpoint or vector index during build or runtime.
5. Deploy the GitHub branch. `railway.json` sets:
   - build command: `npm run build`
   - pre-deploy command: `npm run db:setup`
   - start command: `npm run start`
   - healthcheck path: `/`

The build produces a Next.js standalone server. The post-build step copies
`public` and `.next/static` into `.next/standalone` so the standalone server can
serve static assets directly.

## Scope Notes

- Historical Workshop structured data remains stored in MySQL through Prisma for migration and audit compatibility; the Workshop pages and APIs are disabled.
- The current auth layer uses seeded demo users, request headers, and a
  `lighthouse_preview_user_id` cookie as placeholders.
- The preview identity switcher is only for Railway/private preview walkthroughs;
  it is not a production login module and should be replaced by IAM / WeCom SSO.
- The former Workshop administrator review flow is no longer part of the active product surface.
- Hermit knowledge access remains isolated from the historical Workshop persistence slice and uses the knowledge hub index.
- Real OA / WeCom login, real AI initial review, learning reports, batch import, and full content management are outside Phase 1.
