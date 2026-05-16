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
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
pm2 start npm --name lighthouse -- run start
```

## Scope Notes

- Workshop structured data is stored in MySQL through Prisma.
- The current auth layer uses seeded demo users and request headers as placeholders.
- Highest-admin review is intentionally a single brand-side role in Phase 1.
- Hermit vector retrieval remains isolated from the Workshop persistence slice.
- Real OA / WeCom login, real AI initial review, learning reports, batch import, and full content management are outside Phase 1.
