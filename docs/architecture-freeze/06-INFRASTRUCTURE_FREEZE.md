# 06 — INFRASTRUCTURE FREEZE

**Product:** SEO OS  
**Document Type:** Architecture Freeze — DevOps, Security, Operations  
**Version:** 1.1.0-FROZEN  
**Status:** Approved — Pending Formal Sign-Off

---

## Purpose

Lock deployment topology, environments, CI/CD, secrets, monitoring, logging, backup/DR, security controls, testing gates, and scalability constraints for MVP.

---

## Final Decisions

### D1 — Environment Matrix (FROZEN)

| Environment  | Frontend                  | API + Workers         | Database                    | Purpose           |
| ------------ | ------------------------- | --------------------- | --------------------------- | ----------------- |
| `local`      | localhost:5173            | localhost:3001        | Supabase local OR cloud dev | Development       |
| `staging`    | staging.seoos.netlify.app | staging-api (Railway) | Supabase staging project    | QA, E2E           |
| `demo`       | demo.seoos.io             | demo-api (Railway)    | Supabase demo project       | CEO presentations |
| `production` | app.seoos.io              | api (Railway)         | Supabase production         | Post-GA           |

**MVP build target:** `demo` environment first; `staging` parallel; `production` after Alpha.

### D2 — Deployment Topology (FROZEN — MVP Single-Region)

```
                    ┌─────────────────┐
                    │  Netlify CDN    │
                    │  React SPA      │
                    └────────┬────────┘
                             │ HTTPS
                    ┌────────▼────────┐
                    │  Railway        │
                    │  ┌───────────┐  │
                    │  │ API x1    │  │  ← SINGLE INSTANCE MVP
                    │  └───────────┘  │
                    │  ┌───────────┐  │
                    │  │ Worker x1 │  │  general + pg-boss consumer
                    │  └───────────┘  │
                    │  ┌───────────┐  │
                    │  │ PW Worker │  │  Playwright x1 (optional same service)
                    │  └───────────┘  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼────────┐    │    ┌─────────▼─────────┐
     │ Supabase Cloud  │    │    │ Ollama (optional) │
     │ PG + Auth +     │    │    │ Dev laptop /      │
     │ Storage + RLS   │    │    │ sidecar container │
     └─────────────────┘    │    └───────────────────┘
                            │
                   ┌────────▼────────┐
                   │ Gemini API      │
                   │ (FREE TIER)     │
                   └─────────────────┘
```

**MVP constraint (FROZEN):** API runs **single instance** — in-memory cache and rate limits valid. Scale-out deferred to Alpha.

### D3 — Monorepo Structure (FROZEN)

```
seo-os/
├── apps/web/                 # React + Vite
├── apps/api/                 # Express
├── workers/general/          # pg-boss consumers (may merge with api process MVP)
├── workers/playwright/       # Isolated Playwright verify
├── packages/shared/          # Zod schemas, types, constants
├── packages/providers/       # Provider interfaces + implementations
├── packages/agent-contracts/ # Agent I/O JSON schemas
├── packages/db/              # Migration references, RLS tests
├── supabase/migrations/      # 001–021
├── docs/
└── .github/workflows/
```

**Package manager:** npm workspaces + Turborepo

### D4 — Service Labels (FROZEN)

| Service                                        | Label                    |
| ---------------------------------------------- | ------------------------ |
| React, Express, pg-boss, Playwright, Turborepo | FREE                     |
| Supabase                                       | FREE TIER                |
| Gemini API                                     | FREE TIER                |
| Ollama                                         | SELF HOSTED              |
| Netlify                                        | FREE TIER                |
| Railway                                        | FREE TIER (MVP)          |
| GitHub Actions                                 | FREE TIER                |
| UptimeRobot                                    | FREE TIER                |
| OpenAI, Ahrefs, Redis, Sentry                  | FUTURE PAID — not in MVP |

### D5 — Secrets Management (FROZEN)

| Secret                    | Storage          | Rotation                        |
| ------------------------- | ---------------- | ------------------------------- |
| SUPABASE_URL, ANON_KEY    | Netlify env      | On project rotate               |
| SUPABASE_SERVICE_ROLE_KEY | Railway only     | Quarterly                       |
| GEMINI_API_KEY            | Railway only     | On compromise                   |
| GMAIL_CLIENT_ID/SECRET    | Railway only     | Annual                          |
| TOKEN_ENCRYPTION_KEY      | Railway only     | Annual (requires re-auth email) |
| DATABASE_URL              | Railway (pooler) | Supabase managed                |

**Never:** Secrets in repo, client bundle, or logs.

### D6 — CI/CD Pipeline (FROZEN)

**On Pull Request:**

1. `npm ci`
2. ESLint
3. `tsc --noEmit` (all packages)
4. Vitest unit tests
5. Build web + api
6. RLS integration tests (Supabase local via GitHub Actions service)
7. Agent contract validation tests

**On merge to `main`:**

1. Run migrations `supabase db push` (staging)
2. Deploy API to Railway staging
3. Deploy web to Netlify staging
4. Smoke: `GET /health`, `GET /ready`
5. E2E: CEO demo script (Playwright) against staging

**On tag `v*`:** Promote to demo/production per approval.

**Branch protection:** `main` requires PR + passing CI.

### D7 — Testing Strategy (FROZEN)

| Layer                | Tool                    | Scope                              | Gate            |
| -------------------- | ----------------------- | ---------------------------------- | --------------- |
| Unit                 | Vitest                  | Utils, validators, providers       | PR              |
| Contract             | Vitest                  | Provider interfaces, agent schemas | PR              |
| Integration          | Vitest + Supabase local | API routes, RLS                    | PR              |
| RLS matrix           | Custom test suite       | Every workspace table — User A ≠ B | PR **blocker**  |
| E2E                  | Playwright              | CEO demo script 15 min path        | merge to main   |
| Golden agent outputs | Vitest snapshots        | 14 agents mock mode                | PR              |
| Load                 | k6 (optional)           | 50 concurrent users                | Pre-demo manual |

**Coverage target MVP:** 70% lines on `packages/` and `apps/api/src/modules/`

### D8 — Security Controls (FROZEN)

| Control                   | MVP                                  |
| ------------------------- | ------------------------------------ |
| HTTPS everywhere          | Required                             |
| JWT verification          | JWKS Supabase                        |
| RLS all workspace tables  | Required                             |
| OAuth token encryption    | AES-256-GCM                          |
| Crawl domain verification | Required before crawl                |
| SSRF protection           | URL ingest + crawl IP blocklist      |
| CORS                      | Allow Netlify origin only            |
| CSP                       | Strict on frontend                   |
| Rate limiting             | In-memory per D4 API Freeze          |
| Audit log                 | Sensitive actions only               |
| 2FA                       | Supabase optional — not enforced MVP |
| Pen test                  | Internal checklist pre-demo          |
| Dependency scan           | `npm audit` in CI — warn not block   |

### D9 — Threat Model Summary (FROZEN)

| Threat                 | Mitigation                           | Owner   |
| ---------------------- | ------------------------------------ | ------- |
| Tenant escape IDOR     | RLS + API middleware double check    | Eng     |
| SSRF via KB URL        | DNS resolve + block private IPs      | Eng     |
| Email spam relay       | Approval + daily cap                 | Product |
| Prompt injection       | Context boundaries + QA              | AI      |
| Playwright proxy abuse | URL allowlist, read-only             | Eng     |
| API key leak (Gemini)  | Server-side only                     | DevOps  |
| Crawl DDoS target site | 500 page cap, politeness delay 200ms | Eng     |

### D10 — Logging (FROZEN)

| Setting   | Value                                  |
| --------- | -------------------------------------- |
| Library   | Pino JSON                              |
| Level     | `info` production; `debug` staging     |
| Fields    | traceId, orgId, projectId, userId, msg |
| PII       | Redact emails (hash), no bodies        |
| Prompts   | Log SHA-256 hash only                  |
| Retention | 14 days Railway logs                   |
| Audit     | Separate `audit_logs` table — 2 years  |

### D11 — Monitoring (FROZEN)

| Signal          | Method                  | Alert                  |
| --------------- | ----------------------- | ---------------------- |
| API liveness    | `GET /health`           | UptimeRobot 5min       |
| DB readiness    | `GET /ready`            | UptimeRobot            |
| Error rate      | Pino error count        | Manual daily review    |
| Queue depth     | `GET /v1/system/queues` | Mission Control widget |
| Gemini failures | agent_runs failed count | Dashboard              |
| Disk/DB size    | Supabase dashboard      | Weekly                 |

**FUTURE PAID:** Sentry, Datadog, PagerDuty

### D12 — Backup & Disaster Recovery (FROZEN)

| Metric                         | MVP Target                                                  |
| ------------------------------ | ----------------------------------------------------------- |
| RPO (Recovery Point Objective) | 24 hours (Supabase daily backup)                            |
| RTO (Recovery Time Objective)  | 4 hours manual restore                                      |
| Backup                         | Supabase automated daily                                    |
| Manual export                  | Weekly staging export to encrypted storage (optional)       |
| Restore drill                  | Once before CEO demo                                        |
| Demo environment               | Can rebuild from `seed_demo` + `demo_scenarios` in < 30 min |

**DR procedure document:** `docs/ops/DR_RUNBOOK.md` — created Week 1 implementation.

### D13 — Queue (pg-boss — FROZEN)

| Queue      | Concurrency |
| ---------- | ----------- |
| critical   | 3           |
| agents     | 2           |
| ingest     | 2           |
| crawl      | 1           |
| playwright | 1           |
| low        | 2           |

Schema: `pgboss` — same Supabase Postgres instance.  
Connection pool: API max 10, workers max 5.

### D14 — Caching (FROZEN)

| Layer | MVP                                        |
| ----- | ------------------------------------------ |
| API   | `node-cache` LRU in-process                |
| CDN   | Netlify static assets                      |
| DB    | Materialized view `mv_project_kpis` hourly |
| Redis | **Not in MVP**                             |

### D15 — Domain & DNS (FROZEN)

| Domain            | Use               |
| ----------------- | ----------------- |
| demo.seoos.io     | CEO demo frontend |
| demo-api.seoos.io | Demo API          |
| staging.*         | QA                |
| app.seoos.io      | Future production |

**Pre-demo checklist:** Warm Railway 10 min before; verify `/ready` green.

### D16 — GDPR (MVP Minimum)

- `POST /projects/:id/export` — JSON export
- `DELETE /projects/:id/purge` — Owner only, async job
- Privacy policy link in footer (static page)

---

## Assumptions

1. Railway free/starter tier available and allows Playwright
2. Supabase free tier not paused during demo window
3. GitHub Actions free minutes sufficient (< 2000 min/month)
4. CEO demo uses `demo` environment — not local
5. One DevOps owner can run restore drill

---

## Risks

| Risk                       | Likelihood | Impact | Mitigation                                             |
| -------------------------- | ---------- | ------ | ------------------------------------------------------ |
| Railway sleep on free tier | High       | High   | Upgrade to hobby $5 before demo OR keep-alive cron     |
| Supabase 500MB limit       | Medium     | Medium | Monitor size; purge crawl_pages                        |
| Playwright on Railway      | Medium     | Medium | Fallback: verify job returns mock success in demo mode |
| Single instance outage     | Medium     | High   | Demo replay mode; UptimeRobot alert                    |
| CI flakiness E2E           | Medium     | Medium | Retry 2x; seed fixed UUIDs                             |

---

## Resolved Open Questions

| ID   | Decision                                                                   |
| ---- | -------------------------------------------------------------------------- |
| IQ-1 | Railway hobby ($5/mo) for demo/staging: **Yes — approved before Sprint 8** |
| IQ-2 | Playwright worker: **Same Railway service MVP**; split if OOM              |
| IQ-3 | Supabase region: **us-east-1**                                             |

## Open Questions

**None.**

---

## Review Checklist

- [ ] Single-instance MVP constraint documented and accepted
- [ ] CI pipeline gates match Testing Strategy
- [ ] RLS tests are PR blockers
- [ ] Secrets map complete — none in frontend
- [ ] DR RPO/RTO accepted by CTO
- [ ] Threat model mitigations assigned
- [ ] Railway sleep mitigation decided (IQ-1)
- [ ] E2E CEO demo test in CI on merge to main
- [ ] Backup restore drill scheduled pre-demo

---

## Sign-Off Criteria

| Role               | Criteria                                    | Sign-Off |
| ------------------ | ------------------------------------------- | -------- |
| DevOps Lead        | Environments + CI/CD frozen                 | ☐        |
| Security           | Threat model mitigations accepted           | ☐        |
| Principal Engineer | Monorepo structure frozen                   | ☐        |
| CTO                | Single-instance constraint accepted for MVP | ☐        |
| QA Lead            | Testing gates enforceable in CI             | ☐        |

---

_Label: FREE / FREE TIER / SELF HOSTED per service table in D4._
