# Local Development Guide

## Prerequisites

| Tool           | Version  | Purpose               |
| -------------- | -------- | --------------------- |
| Node.js        | ≥ 20     | Runtime               |
| npm            | ≥ 10     | Package manager       |
| Supabase CLI   | Latest   | Local database + auth |
| Docker Desktop | Optional | Postgres fallback     |

## First-Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Environment files
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Edit apps/api/.env and apps/web/.env with your Supabase credentials
#    For shell-only dev, valid URL-shaped placeholders work for /health

# 4. Database (recommended)
supabase start
npm run db:push

# 5. Verify Sprint 0 foundation
npm run verify:local
```

## Running Dev Servers

### All apps (Turborepo)

```bash
npm run dev
```

| Service | URL                   |
| ------- | --------------------- |
| Web     | http://localhost:5173 |
| API     | http://localhost:3001 |

### Individual apps

```bash
# API only
npm run dev --workspace=@seo-os/api

# Web only
npm run dev --workspace=@seo-os/web
```

## Docker Postgres (alternative to Supabase CLI)

```bash
docker compose up -d postgres
# DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

Uses **PostgreSQL 15** to align with `supabase/config.toml`.

## Quality Commands

| Command                               | Description                      |
| ------------------------------------- | -------------------------------- |
| `npm run lint`                        | ESLint (zero warnings)           |
| `npm run lint:fix`                    | Auto-fix lint issues             |
| `npm run format`                      | Prettier write                   |
| `npm run format:check`                | Prettier check (CI)              |
| `npm run typecheck`                   | TypeScript all packages          |
| `npm run build`                       | Production build all packages    |
| `npm run verify:local`                | Full local Sprint 0 verification |
| `node scripts/smoke-local-health.mjs` | API `/health` smoke only         |

## Demo Navigation (no auth)

1. Open http://localhost:5173/projects
2. Click **Demo Project Shell** → Mission Control
3. Explore sidebar routes (placeholders for future sprints)

## API Smoke Tests

```bash
# Local (after build)
node scripts/smoke-local-health.mjs

# Staging (requires deployed API)
STAGING_API_URL=https://your-staging-api.railway.app npm run smoke:staging
```

## Workspace Packages

| Package                     | Path                       | Purpose                           |
| --------------------------- | -------------------------- | --------------------------------- |
| `@seo-os/web`               | `apps/web`                 | React SPA                         |
| `@seo-os/api`               | `apps/api`                 | Express API                       |
| `@seo-os/shared`            | `packages/shared`          | Types, Zod, errors                |
| `@seo-os/providers`         | `packages/providers`       | Provider interfaces               |
| `@seo-os/agent-contracts`   | `packages/agent-contracts` | Agent types                       |
| `@seo-os/db`                | `packages/db`              | DB utilities (RLS tests Sprint 1) |
| `@seo-os/worker-general`    | `workers/general`          | Job worker scaffold               |
| `@seo-os/worker-playwright` | `workers/playwright`       | Playwright worker scaffold        |
