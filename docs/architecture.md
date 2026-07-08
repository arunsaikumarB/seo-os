# Architecture Overview

**Product:** SEO OS — _The AI Workforce for SEO Teams_  
**Sprint:** 0 (Foundation)  
**Freeze version:** 1.1.0

## System Diagram

```mermaid
flowchart TB
  subgraph client [Browser]
    Web[React SPA - apps/web]
  end

  subgraph api_layer [API Layer]
    Express[Express - apps/api]
    Auth[JWT Auth Middleware]
    RBAC[RBAC Middleware]
    Jobs[pg-boss Scaffold]
  end

  subgraph data [Data Layer]
    Supabase[(Supabase Postgres)]
    AuthSvc[Supabase Auth]
  end

  subgraph packages [Shared Packages]
    Shared[@seo-os/shared]
    Providers[@seo-os/providers]
    Contracts[@seo-os/agent-contracts]
    DB[@seo-os/db]
  end

  subgraph workers [Workers]
    General[worker-general]
    Playwright[worker-playwright]
  end

  Web -->|REST /v1| Express
  Web --> AuthSvc
  Express --> Auth --> RBAC
  Express --> Supabase
  Express --> Jobs
  Jobs --> Supabase
  Express --> Shared
  Express --> Providers
  General --> Jobs
  Playwright --> Supabase
```

## Monorepo Structure

```
seo-os/
├── apps/
│   ├── api/                 # Express REST API
│   └── web/                 # React + Vite SPA
├── packages/
│   ├── shared/              # Types, Zod, errors, env, constants
│   ├── providers/           # Provider interfaces + registry
│   ├── agent-contracts/     # Agent type contracts
│   └── db/                  # DB utilities + RLS tests (Sprint 1)
├── workers/
│   ├── general/             # pg-boss consumer scaffold
│   └── playwright/          # Playwright verify scaffold
├── supabase/
│   ├── config.toml
│   └── migrations/          # 001–003 (Sprint 0)
├── scripts/                 # verify-local, smoke tests
├── docs/                    # Guides + freeze docs
└── .github/workflows/       # CI/CD
```

## Key Conventions (Frozen)

| Topic          | Convention                               |
| -------------- | ---------------------------------------- |
| UI term        | **Project**                              |
| DB table       | `workspaces`                             |
| API path       | `/projects/:projectId`                   |
| Dashboard      | **Mission Control** (`/mission-control`) |
| Errors         | RFC 7807 Problem Details                 |
| Logging        | Pino structured JSON                     |
| Auth           | Supabase JWT via JWKS                    |
| Tenancy header | `X-Org-Id` for org-scoped routes         |
| Jobs           | pg-boss, `ENABLE_WORKERS=false` default  |
| DB region      | us-east-1 (production)                   |

## Sprint 0 Boundaries

**Included:** Monorepo, shell UI, API foundation, migrations 001–003, CI, deploy pipeline config.

**Excluded:** AI agents, KB, RAG, outreach, billing, production SEO providers, RLS policies.

## Related Documents

- [Architecture Freeze Index](./architecture-freeze/00-FREEZE_INDEX_AND_READINESS.md)
- [Infrastructure Freeze](./architecture-freeze/06-INFRASTRUCTURE_FREEZE.md)
- [Database Freeze](./architecture-freeze/03-DATABASE_FREEZE.md)
- [Sprint Plan](./architecture-freeze/08-SPRINT_PLAN.md)
- [Sprint 0 Report](./sprint-0/SPRINT_0_REPORT.md)
