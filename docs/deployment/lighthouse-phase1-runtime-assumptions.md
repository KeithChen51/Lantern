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
OPENAI_MODEL=""
EMBEDDING_API_KEY=""
EMBEDDING_BASE_URL=""
EMBEDDING_MODEL=""
```

Prisma reads `DATABASE_URL` when running migration, seed, and runtime queries. Local development can keep model-provider keys in `.env.local`, but database commands must run with `DATABASE_URL` available to Prisma.

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
