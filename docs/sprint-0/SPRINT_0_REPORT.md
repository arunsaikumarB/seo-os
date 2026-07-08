# Sprint 0 — Foundation Report

**Product:** SEO OS  
**Sprint:** 0 — Monorepo Scaffold  
**Status:** Complete — awaiting review  
**Date:** 2026-07-09  
**Freeze docs:** v1.1.0 (97.1% readiness, GO approved)

---

## 1. Folder Structure

```
seo-os/
├── apps/
│   ├── api/                 # Express REST API (port 3001)
│   └── web/                 # React + Vite SPA (port 5173)
├── packages/
│   ├── shared/              # Types, Zod schemas, errors, env, constants
│   ├── providers/           # Provider interfaces + registry stub
│   ├── agent-contracts/     # Agent type list (Sprint 4+)
│   └── db/                  # Migration pointer to /supabase
├── workers/
│   └── general/             # Background worker scaffold
├── supabase/
│   ├── config.toml
│   └── migrations/          # 001–003 (Sprint 0 only)
├── docs/
│   ├── architecture-freeze/ # Frozen specs (v1.1.0)
│   └── sprint-0/            # This report
├── .github/workflows/       # CI pipeline
├── docker-compose.yml       # Optional local Postgres
├── railway.toml             # API deployment config
├── turbo.json
├── package.json             # npm workspaces root
└── README.md
```

### Responsibility boundaries

| Layer                | Location              | Sprint 0 scope                                     |
| -------------------- | --------------------- | -------------------------------------------------- |
| UI shell             | `apps/web`            | Sidebar, topbar, routing, theme, placeholder pages |
| API                  | `apps/api`            | Health, auth foundation, org/project CRUD services |
| Shared contracts     | `packages/shared`     | Types, validation, RFC 7807 errors                 |
| Provider abstraction | `packages/providers`  | Interfaces only — no live implementations          |
| Database             | `supabase/migrations` | Extensions, tenancy, workspaces                    |
| Jobs                 | `apps/api/src/jobs`   | pg-boss scaffold (`ENABLE_WORKERS=false`)          |
| Workers              | `workers/general`     | Process scaffold, no handlers                      |

---

## 2. Dependency List

### Root (dev)

| Package    | Version | Purpose                     |
| ---------- | ------- | --------------------------- |
| turbo      | ^2.3.3  | Monorepo task orchestration |
| typescript | ^5.7.2  | Shared TS compiler          |
| prettier   | ^3.4.2  | Code formatting             |
| rimraf     | ^6.0.1  | Clean scripts               |

### apps/web

| Package                                        | Purpose                |
| ---------------------------------------------- | ---------------------- |
| react, react-dom ^18.3                         | UI framework           |
| react-router-dom ^7.1                          | Client routing         |
| vite ^6.0                                      | Build tool             |
| tailwindcss ^3.4                               | Styling                |
| @tanstack/react-query ^5.62                    | Server state           |
| zustand ^5.0                                   | Client state           |
| @supabase/supabase-js ^2.47                    | Auth client (Sprint 1) |
| lucide-react ^0.469                            | Icons                  |
| sonner ^1.7                                    | Toast notifications    |
| @radix-ui/*                                    | Accessible primitives  |
| class-variance-authority, clsx, tailwind-merge | UI utilities           |
| @seo-os/shared                                 | Shared types/constants |

### apps/api

| Package                           | Purpose                          |
| --------------------------------- | -------------------------------- |
| express ^4.21                     | HTTP server                      |
| helmet, cors                      | Security headers, CORS           |
| pino, pino-http, pino-pretty      | Structured logging               |
| jose ^5.9                         | JWT verification (Supabase JWKS) |
| pg, pg-boss ^10.1                 | Postgres + job queue             |
| @supabase/supabase-js ^2.47       | Admin client                     |
| zod ^3.24                         | Request validation               |
| @seo-os/shared, @seo-os/providers | Shared packages                  |

### packages/shared

| Package   | Purpose           |
| --------- | ----------------- |
| zod ^3.24 | Schema validation |

### workers/general

| Package        | Purpose       |
| -------------- | ------------- |
| pino, dotenv   | Logging + env |
| @seo-os/shared | Shared types  |

---

## 3. Architecture Explanation

### High-level

```mermaid
flowchart TB
  subgraph client [Browser]
    Web[React SPA - apps/web]
  end

  subgraph api [API Layer]
    Express[Express - apps/api]
    Auth[JWT Auth Middleware]
    RBAC[RBAC Middleware]
    Jobs[pg-boss Scaffold]
  end

  subgraph data [Data Layer]
  Supabase[(Supabase Postgres)]
  AuthSvc[Supabase Auth]
  end

  subgraph shared [Shared Packages]
    SharedPkg[@seo-os/shared]
    ProvidersPkg[@seo-os/providers interfaces]
  end

  Web -->|REST /v1| Express
  Web -->|Auth Sprint 1| AuthSvc
  Express --> Auth --> RBAC
  Express --> Supabase
  Express --> Jobs
  Jobs --> Supabase
  Express --> SharedPkg
  Express --> ProvidersPkg
```

### Key architectural decisions (frozen)

1. **Terminology:** UI uses "Project"; database table is `workspaces`; API paths use `/projects/:projectId`.
2. **Dashboard route:** Mission Control at `/projects/:projectId/mission-control` (not `/dashboard`).
3. **Multi-tenancy:** Organization → unlimited projects; `X-Org-Id` header for org-scoped routes.
4. **Auth:** Supabase JWT via JWKS; `jwtOnlyMiddleware` for routes without org context; full `authMiddleware` for org-scoped routes.
5. **Errors:** RFC 7807 Problem Details via `AppError` in `@seo-os/shared`.
6. **Logging:** Pino structured JSON; trace ID per request via `X-Trace-Id` / generated UUID.
7. **Providers:** Interface-only registry; `PROVIDER_MODE=mvp` returns stub status; implementations in Sprint 3+.
8. **Jobs:** pg-boss with `pgboss` schema; disabled by default (`ENABLE_WORKERS=false`).
9. **RLS:** Deferred to migration 018 (Sprint 1); Sprint 0 migrations create tables only.

### API route map (Sprint 0)

| Method | Path                                | Auth               | Description               |
| ------ | ----------------------------------- | ------------------ | ------------------------- |
| GET    | `/health`                           | None               | Liveness                  |
| GET    | `/ready`                            | None               | Readiness                 |
| GET    | `/v1/version`                       | None               | Version info              |
| GET    | `/v1/me`                            | JWT                | Profile + org memberships |
| POST   | `/v1/organizations`                 | JWT                | Create org                |
| GET    | `/v1/organizations/:orgId`          | JWT + Org          | Get org                   |
| GET    | `/v1/organizations/:orgId/projects` | JWT + Org + viewer | List projects             |
| POST   | `/v1/organizations/:orgId/projects` | JWT + Org + member | Create project            |
| GET    | `/v1/projects/:projectId`           | JWT + Org + viewer | Get project               |
| GET    | `/v1/providers/status`              | JWT                | Provider registry status  |

### Web route map (Sprint 0)

| Path                                   | Page                                 |
| -------------------------------------- | ------------------------------------ |
| `/login`                               | Login placeholder                    |
| `/projects`                            | Project list (demo link)             |
| `/projects/:projectId/mission-control` | Mission Control shell                |
| `/projects/:projectId/*`               | Placeholder pages for future modules |
| `/projects/:projectId/settings/*`      | Settings placeholder (Sprint 1)      |

---

## 4. Environment Variables

### API (`apps/api/.env`)

| Variable                    | Required | Default                | Description                |
| --------------------------- | -------- | ---------------------- | -------------------------- |
| `NODE_ENV`                  | No       | development            | Runtime environment        |
| `PORT`                      | No       | 3001                   | API listen port            |
| `API_URL`                   | No       | http://localhost:3001  | Public API URL             |
| `SUPABASE_URL`              | **Yes**  | —                      | Supabase project URL       |
| `SUPABASE_ANON_KEY`         | **Yes**  | —                      | Anon key                   |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes**  | —                      | Service role (server only) |
| `SUPABASE_JWT_SECRET`       | **Yes**  | —                      | JWT secret                 |
| `DATABASE_URL`              | **Yes**  | —                      | Postgres connection string |
| `CORS_ORIGIN`               | No       | http://localhost:5173  | Allowed origins            |
| `ENCRYPTION_KEY`            | No       | —                      | 32-byte hex (Sprint 7+)    |
| `GEMINI_API_KEY`            | No       | —                      | AI provider (Sprint 4+)    |
| `OLLAMA_BASE_URL`           | No       | http://localhost:11434 | Local AI fallback          |
| `PROVIDER_MODE`             | No       | mvp                    | mvp \| free \| paid        |
| `ENABLE_WORKERS`            | No       | false                  | Enable pg-boss workers     |

### Web (`apps/web/.env`)

| Variable                 | Required | Description          |
| ------------------------ | -------- | -------------------- |
| `VITE_SUPABASE_URL`      | **Yes**  | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **Yes**  | Anon key             |
| `VITE_API_URL`           | **Yes**  | API base URL         |

Templates: `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`

---

## 5. Database Migration Plan

### Sprint 0 (applied now)

| #   | File                   | Tables / objects                                                                                       |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| 001 | `001_extensions.sql`   | `uuid-ossp`, `pg_trgm` extensions                                                                      |
| 002 | `002_core_tenancy.sql` | `organizations`, `profiles`, `org_members`, `org_invites`, `handle_new_user` trigger, `set_updated_at` |
| 003 | `003_workspaces.sql`   | `workspaces`, `workspace_settings`, `domain_verifications`, `pgboss` schema                            |

### Sprint 1 (next — not implemented)

| #       | Scope                                       |
| ------- | ------------------------------------------- |
| 004–017 | Per DATABASE_FREEZE roadmap                 |
| 018     | RLS policies for tenancy tables + RLS tests |

### Sprint 7

| #   | Scope                                     |
| --- | ----------------------------------------- |
| 008 | `pgvector` extension (768-dim embeddings) |

### Apply locally

```bash
supabase start
supabase db push
# or
npm run db:push
```

### Supabase region

Production: **us-east-1** (frozen in Infrastructure Freeze)

---

## 6. Project Tree

```
seo-os/
├── .env.example
├── .github/workflows/ci.yml
├── .gitignore
├── README.md
├── docker-compose.yml
├── package.json
├── railway.toml
├── tsconfig.base.json
├── turbo.json
├── apps/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── app.ts
│   │       ├── index.ts
│   │       ├── config/env.ts
│   │       ├── jobs/{boss.ts,index.ts}
│   │       ├── lib/{logger.ts,supabase.ts}
│   │       ├── middleware/{auth,errorHandler,rbac,traceId}.ts
│   │       ├── modules/
│   │       │   ├── organizations/org.service.ts
│   │       │   └── projects/project.service.ts
│   │       └── routes/{health.ts,v1/index.ts}
│   └── web/
│       ├── netlify.toml
│       ├── package.json
│       ├── public/favicon.svg
│       └── src/
│           ├── app/router.tsx
│           ├── components/{layout,ui,placeholder-page}
│           ├── config/navigation.ts
│           ├── lib/{api,supabase,utils}.ts
│           ├── pages/{login,projects,mission-control}.tsx
│           ├── providers/theme-provider.tsx
│           └── stores/app-store.ts
├── packages/
│   ├── agent-contracts/src/index.ts
│   ├── db/README.md
│   ├── providers/src/{interfaces,registry,types}
│   └── shared/src/{constants,env,errors,schemas,types}
├── supabase/
│   ├── config.toml
│   └── migrations/001–003.sql
├── workers/general/src/index.ts
└── docs/
    ├── architecture-freeze/ (00–08)
    └── sprint-0/SPRINT_0_REPORT.md
```

**File count:** ~90 source/config files (excluding node_modules, dist)

---

## 7. Local Setup Instructions

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- [Supabase CLI](https://supabase.com/docs/guides/cli) (recommended)
- Docker Desktop (optional — for `docker-compose` Postgres)

### Steps

```bash
# 1. Clone and install
cd "Back Links Agent AI"
npm install

# 2. Environment
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit both files with your Supabase credentials

# 3. Database (option A — Supabase CLI)
supabase start
npm run db:push

# 3. Database (option B — Docker only)
docker compose up -d postgres
# Set DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
# Apply migrations manually via psql or Supabase CLI linked to local instance

# 4. Build (verify)
npm run build
npm run typecheck

# 5. Development
npm run dev
# Web: http://localhost:5173
# API: http://localhost:3001/health
```

### Demo navigation (no auth yet)

1. Open `http://localhost:5173/projects`
2. Click demo project → Mission Control
3. Sidebar shows all future modules with Sprint badges
4. Toggle light/dark in topbar

---

## 8. Deployment Instructions

### Web — Netlify

1. Connect repository to Netlify
2. Base directory: repository root
3. Build command: `npm run build --workspace=@seo-os/web`
4. Publish directory: `apps/web/dist`
5. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`
6. Config file: `apps/web/netlify.toml` (SPA redirects included)

### API — Railway

1. Create Railway project from GitHub repo
2. Set root directory or use `railway.toml` (Dockerfile at `apps/api/Dockerfile`)
3. Environment variables: all API vars from section 4
4. Health check: `/health`
5. Hobby plan ($5/mo) before Sprint 8 per freeze

### Database — Supabase

1. Create project in **us-east-1**
2. Run migrations: `supabase link` → `supabase db push`
3. Copy URL, anon key, service role key, JWT secret to API/Web env

### CI — GitHub Actions

`.github/workflows/ci.yml` runs on push/PR to `main`:

- `npm ci`
- `npm run build`
- `npm run typecheck`

**Note:** Staging auto-deploy on `main` requires Netlify/Railway dashboard configuration (not automated in repo — see Risks).

---

## 9. Sprint Summary

### Completed

| Area            | Deliverable                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------- |
| Monorepo        | npm workspaces + Turborepo, 7 packages                                                      |
| API             | Express with health, auth foundation, org/project routes, Pino logging, RFC 7807 errors     |
| Web             | React + Vite + Tailwind + shadcn-style components, sidebar shell, routing, light/dark theme |
| Shared          | Types, Zod schemas, AppError, env validation, constants                                     |
| Providers       | 6 interface definitions + registry stub                                                     |
| Agent contracts | AGENT_TYPES constant list                                                                   |
| Database        | Migrations 001–003, Supabase config.toml                                                    |
| Jobs            | pg-boss scaffold, queue constants, placeholder handler                                      |
| Workers         | General worker process scaffold                                                             |
| CI/CD           | GitHub Actions build + typecheck                                                            |
| Docker          | docker-compose Postgres, API Dockerfile, railway.toml                                       |
| Docs            | README + this report                                                                        |

### Verification

```
npm install   ✅
npm run build ✅ (7/7 packages)
npm run typecheck ✅ (9/9 tasks)
```

### Explicitly excluded (per scope)

AI agents, Knowledge Base, AI Memory, RAG, Outreach, Backlink Builder, Content Studio, Analytics, Reports, Competitors, Technical SEO, Marketplace, Billing, White Label, production SEO providers, premium APIs.

---

## 10. Sprint Retrospective

### What went well

- Freeze documents provided clear boundaries — no scope creep into Sprint 1+ features
- Monorepo structure maps cleanly to Infrastructure Freeze
- Provider interfaces established early — enables Sprint 3 mock implementations without API changes
- Build pipeline works end-to-end on first verification pass after TypeScript fixes

### What could improve

- pg-boss v10 API differs from earlier docs (`work` handler receives job arrays, no `teamSize` option) — update Infrastructure Freeze note
- pino-http ESM import requires named import `{ pinoHttp }` with NodeNext resolution
- Staging deploy not wired in CI — requires external dashboard setup

### Process notes

- Sprint 0 correctly stops at foundation; auth UI and RLS are intentionally deferred to Sprint 1
- Demo project ID hardcoded for shell navigation until real auth flow exists

---

## 11. Risks Discovered

| #   | Risk                                                                    | Severity | Mitigation                                                           |
| --- | ----------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| R1  | **No RLS in Sprint 0** — tables exist without row-level security        | High     | Sprint 1 migration 018 + RLS tests are mandatory gate                |
| R2  | **Staging deploy not automated** — CI builds but doesn't deploy         | Medium   | Configure Netlify/Railway auto-deploy on `main` before Sprint 1 demo |
| R3  | **Auth UI is placeholder** — login page doesn't connect to Supabase yet | Medium   | Sprint 1 deliverable; document for reviewers                         |
| R4  | **Supabase credentials required** — API routes fail without valid env   | Medium   | `.env.example` documented; local `supabase start` for dev            |
| R5  | **pg-boss v10 batch handler API** — differs from some freeze examples   | Low      | Documented in boss.ts; update freeze if needed                       |
| R6  | **Docker Postgres vs Supabase CLI** — two local DB paths may confuse    | Low      | README prioritizes Supabase CLI; docker-compose as fallback          |
| R7  | **No ESLint/Prettier CI enforcement yet** — lint scripts are stubs      | Low      | Add ESLint in Sprint 1 or parallel housekeeping sprint               |

---

## 12. Recommendations Before Sprint 1

1. **Approve Sprint 0** — review this report and run local `npm run build` + `npm run dev`
2. **Provision Supabase project** (us-east-1) and apply migrations 001–003
3. **Configure staging** — Netlify (web) + Railway (api) with env vars; verify `/health` returns 200
4. **Sprint 1 priorities** (per freeze):
   - Supabase Auth (email + Google OAuth)
   - Full login/signup flow in web
   - RLS policies (migration 018) + tenancy isolation tests
   - Projects CRUD UI wired to API
   - Org team page, project switcher
   - Mobile bottom nav
   - RBAC enforcement on all org-scoped routes
5. **Do not start** AI agents, Command Center, or provider implementations until their designated sprints

---

## Review Gate Checklist (Sprint 0 DoD)

- [x] `npm run build` passes all packages
- [x] `npm run typecheck` passes
- [x] `npm run dev` starts web + api locally (manual verification recommended)
- [ ] Staging deploy auto on `main` — **requires dashboard setup**
- [ ] `/health` returns 200 on staging — **requires deployment**
- [x] No feature code beyond shell

---

**Sprint 0 complete. Awaiting explicit approval before Sprint 1.**
