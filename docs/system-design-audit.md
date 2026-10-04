# System design audit

Audit of this repo against `.cursor/rules/system-design.mdc`. No application code was changed.

This is not a static marketing site. It is a React SPA (`apps/web`, Netlify), an Express API (`apps/api`, Railway), Supabase Postgres, and in-process pg-boss plus Playwright. All nine areas apply. Depth is scaled to a single API container: a second replica is not safe until browser work and in-process state move out.

## Cursor rules kept

`.cursor/rules/epic-release-ops.mdc` and `.cursor/rules/gitlab-frontend-sync.mdc` were already present and were left unchanged. They do not contradict this standard line-for-line. One process tension: release ops ships `master` straight to Railway and Netlify production, while this standard expects a nine-area check and CI on the change before you depend on it. Both rules stay.

---

## 1. System architecture

**Applies.** Backend service with a separate SPA.

**In place**

- Routes under `apps/api/src/routes/v1/`, business logic under `apps/api/src/modules/`, data access through `apps/api/src/lib/supabase.ts`.
- Public API is versioned at `/v1` (`apps/api/src/app.ts`). Request bodies are validated with Zod on most routes (for example `apps/api/src/routes/v1/backlink-builder.routes.ts`).
- Config is parsed from the environment (`packages/shared/src/env/index.ts`). Templates: `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`.

**Gaps**

- A few routes call `getSupabaseAdmin()` directly (`apps/api/src/routes/v1/index.ts`, `browser-execution.routes.ts`, `image-intelligence.routes.ts`, `outreach.routes.ts`).
- Process memory holds rate-limit buckets, campaign-health cache, circuit breakers, metrics, and the Playwright browser pool. That state does not survive a second instance.
- `workers/general` and `workers/playwright` only log a scaffold line. Real job handlers run inside the API process (`apps/api/src/jobs/`).

**Fixes**

| Priority | Fix |
| --- | --- |
| High | Keep a single API replica until Playwright runs in its own worker. Do not scale the API horizontally first. |
| Medium | Move the remaining route-level Supabase calls into services. |
| Low | Note in new-feature reviews which state is process-local. |

## 2. Load balancing

**Applies.** Railway terminates traffic in front of one API container (`railway.toml`). Netlify fronts the SPA. There is no multi-instance API load balancer, and adding one would be unsafe today.

**In place**

- Liveness: `GET /health`. Readiness: `GET /ready` checks database, queue, and encryption (`apps/api/src/routes/health.ts`).
- Railway health check uses `/health` (`railway.toml`).
- `SIGTERM` / `SIGINT` stop the HTTP server and stop pg-boss (`apps/api/src/index.ts`, `apps/api/src/jobs/boss.ts`).

**Gaps**

- `trust proxy` is never set, so `req.ip` is the proxy address. The rate limiter in `apps/api/src/middleware/rateLimit.ts` then shares one bucket for every client.
- Shutdown does not close Playwright browsers.
- Browser jobs are sticky to the container that owns Chromium, whether or not you configure sticky sessions.

**Fixes**

| Priority | Fix |
| --- | --- |
| High | Set Express `trust proxy` to Railway’s hop count so rate limits key on the client IP. |
| Medium | On SIGTERM, drain and close the browser pool before `process.exit`. |
| Low | Point external uptime checks at `/ready` as well as `/health`. |

## 3. Caching

**Applies.** There is no Redis. That is acceptable at one instance. Shared-cache rules still apply to the in-process maps that exist.

**In place**

- Hashed SPA assets: `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` (`apps/web/netlify.toml`). Vite emits fingerprinted filenames.
- Workspace campaign-health responses cached ~2.5s in a process `Map` (`apps/api/src/routes/v1/backlink-builder.routes.ts`), keyed by workspace, not by user.
- Scan reuse via `browser_scan_cache` (24h) in `apps/api/src/modules/intelligence/browser-intelligence.service.ts`.
- Chat/SSE sets `Cache-Control: no-cache`.

**Gaps**

- Rate-limit buckets are never evicted, so the map grows for the life of the process.
- Authenticated JSON has no default `Cache-Control: no-store`.
- `index.html` has no explicit short/no-store header (only `/assets/*` is long-cached).
- No ETags. Not worth adding on JSON until a measured conditional-GET need exists.

**Fixes**

| Priority | Fix |
| --- | --- |
| Medium | Evict stale rate-limit keys. Send `no-store` on authenticated API responses. |
| Medium | Netlify header: `Cache-Control: no-cache` on `/index.html`. |
| Low | Add Redis only when a second instance or a measured hot read needs it. |

## 4. Database design

**Applies.** Supabase Postgres is the system of record.

**In place**

- Schema changes are SQL migrations (`supabase/migrations/`, 001–109). CI runs `scripts/check-migrations.mjs`.
- Indexes exist for common filters (for example `supabase/migrations/087_campaign_state_manager.sql`, `098_assisted_manual_phase7.sql`).
- RLS helpers in `supabase/migrations/004_rls_tenancy.sql`.
- `deleted_at` soft delete on execution and image tables (for example `supabase/migrations/055_execution_assets.sql`).
- Some lists accept a `cursor` (`backlink-builder.routes.ts`, `platform.routes.ts`). Project reset/delete runs inside Postgres functions (`apps/api/src/modules/projects/project-lifecycle.service.ts`).

**Gaps**

- The API uses the service-role client, which bypasses RLS. Isolation depends entirely on middleware.
- Many reads use a hard `.limit()` from 20 up to 2000 (`apps/api/src/modules/reports/reports.service.ts`) instead of cursor pagination.
- Multi-step writes outside those RPCs are not wrapped in transactions.
- pg-boss and the app share one Postgres (`DATABASE_URL` in `apps/api/src/jobs/boss.ts`). Pool size is not set explicitly.

**Fixes**

| Priority | Fix |
| --- | --- |
| High | Keep new queries out of route files, and reject any new admin-client use that is not behind `authMiddleware`. |
| Medium | Cursor-paginate growing tables (opportunities, execution jobs, logs). Cap report loads under 2000 rows. |
| Low | Document a `pg` pool ceiling so pg-boss cannot exhaust Supabase connections. |

## 5. Message queues

**Applies.** Slow work (browser, crawl, agents, outreach, reports) is supposed to leave the request path.

**In place**

- pg-boss queues: `critical`, `agents`, `ingest`, `crawl`, `playwright`, `low` (`apps/api/src/jobs/boss.ts`).
- Default `retryLimit: 3` and `retryBackoff: true`. `singletonKey` is supported on send.
- Handlers live under `apps/api/src/jobs/handlers/`. `/ops/queues` reports pending, active, and failed counts.
- `docs/ops/DR_RUNBOOK.md` notes jobs may need a re-drive after restore.

**Gaps**

- `enqueueJob` returns `null` when `ENABLE_WORKERS` is false, and callers can continue as if work was accepted.
- Failed jobs are counted. There is no dead-letter queue and no alert when that count grows.
- The architecture freeze describes an `idempotency_keys` table (`docs/architecture-freeze/03-DATABASE_FREEZE.md`). API code does not use it.
- Separate `workers/*` packages are still scaffolds.

**Fixes**

| Priority | Fix |
| --- | --- |
| High | If workers are off, return 503 (or persist the job) instead of a silent `null` enqueue. |
| Medium | Alert when pg-boss failed-job counts rise. Document replay. |
| Medium | Run the Playwright consumer in a worker process, not inside the API. |
| Low | Persist idempotency keys for outreach and other external side effects. |

## 6. CDN

**Applies to the SPA.** The API should not sit behind a long-lived CDN cache. User uploads already avoid the app disk.

**In place**

- Netlify serves `apps/web` with fingerprinted `/assets/*`, long cache, gzip/brotli, and HTTP/2 (`apps/web/netlify.toml`).
- Uploads go to Supabase Storage (`image-intelligence`, `browser-execution`), not the API container.

**Gaps**

- Express does not compress JSON. Railway may gzip at the edge; it is not set in app code.
- SPA CSP allows `'unsafe-inline'` and `connect-src https:` (`apps/web/netlify.toml`).
- No WebP/AVIF or responsive image pipeline. The UI is an app, not a media site, so this stays low until large images ship in pages.

**Fixes**

| Priority | Fix |
| --- | --- |
| Medium | `no-cache` on `index.html` so deploys are not stuck behind a cached shell. |
| Low | Tighten the SPA CSP when script hashes replace `'unsafe-inline'`. |
| Low | Skip a CDN in front of authenticated API responses. |

## 7. Scalability

**Applies.** The current ceiling is one API container. The first bottleneck is Chromium in that container, then shared Postgres (app + pg-boss).

**In place**

- Most CRUD state is in Supabase, not local disk.
- `/v1` rate limit is 180 requests/minute (`apps/api/src/app.ts`). JSON body limit is 10mb.
- Outbound HTTP often uses `AbortSignal.timeout` (AI review, scans, assisted-manual, content generation).
- `docs/architecture-freeze/04-API_FREEZE.md` already records single-instance as an MVP assumption.

**Gaps**

- In-memory rate limit, metrics, circuits, and the browser pool break horizontal scale (`docs/architecture-freeze/04-API_FREEZE.md` calls this out).
- Rate-limit IP is wrong until `trust proxy` is set (see §2).
- Large `.limit()` reads pull whole slices into memory (§4).

**Fixes**

| Priority | Fix |
| --- | --- |
| High | Do not add a second API replica until the browser pool and rate limiter are shared or split out. |
| Medium | Batch or stream report and opportunity reads. |
| Low | Write the expected load and first bottleneck on each new feature (the standard’s own checklist). |

## 8. Reliability and security

**Applies.**

**In place**

- Central error handler hides unexpected errors behind a generic 500 and attaches a trace id (`apps/api/src/middleware/errorHandler.ts`).
- Provider circuit breaker (`apps/api/src/lib/circuit-breaker.ts`) and LLM failover (`apps/api/src/modules/providers/llm-failover.service.ts`).
- CI runs lint, typecheck, unit tests, migration order, and a local health smoke (`.github/workflows/ci.yml`).
- Supabase JWKS auth, org RBAC, and project access (`apps/api/src/middleware/auth.ts`, `project-access.ts`). Passwords stay in Supabase Auth.
- Helmet (HSTS in production), CORS allowlist from `CORS_ORIGIN`, Permissions-Policy (`apps/api/src/app.ts`). SPA security headers in `apps/web/netlify.toml`.
- Pino redacts `authorization` and `cookie` (`apps/api/src/lib/logger.ts`).
- Backup/restore notes in `docs/ops/DR_RUNBOOK.md`. Parameterized access is via the Supabase client, not string-built SQL.

**Gaps**

- `GET /metrics`, `/ops/health`, `/ops/queues`, and `/ops/performance` are mounted with no auth (`apps/api/src/app.ts`). They expose memory, latency, queue depth, and provider health.
- `SENTRY_DSN` is optional, and `@sentry/node` is not an API dependency (`apps/api/src/lib/sentry.ts`). A set DSN currently no-ops.
- API Content-Security-Policy is turned off in Helmet.
- No Dependabot config. `npm audit` is described in `docs/architecture-freeze/06-INFRASTRUCTURE_FREEZE.md` and is not a CI step.
- Service-role access bypasses RLS (§4). Restore drills are documented, not recorded as run.

**Fixes**

| Priority | Fix |
| --- | --- |
| High | Require an internal token (or private network) on `/metrics` and `/ops/*`. Leave `/health` public. |
| High | Add `@sentry/node` for real, or stop treating `SENTRY_DSN` as enabled. |
| Medium | Add Dependabot and a non-blocking `npm audit` in CI. |
| Medium | Turn on Supabase PITR if the plan allows it, and record one restore drill. |
| Low | Document why API CSP is disabled, or enable a minimal policy. |

## 9. Monitoring

**Applies.**

**In place**

- JSON logs via Pino. `traceIdMiddleware` accepts `x-request-id` / `x-trace-id` / `x-correlation-id` and echoes them (`apps/api/src/middleware/traceId.ts`).
- In-process counters: request count, error rate, average and max latency, memory (`apps/api/src/lib/metrics.ts`, `GET /metrics`).
- `/ops/health` rolls up database, queue, and AI provider status.
- Railway restarts on `/health` failure. CI smoke hits `/health`.

**Gaps**

- Metrics die with the process. There is no p95/p99, no scraper, and no alert on error rate or failed jobs.
- Uptime uses liveness (`/health`), so a down database can still look healthy.
- Trace ids are not written onto pg-boss payloads.
- No frontend error tracker. No Core Web Vitals (LCP, CLS, INP) in `apps/web`.

**Fixes**

| Priority | Fix |
| --- | --- |
| High | External check on `/ready`, plus an alert when queue failed-job counts climb. |
| Medium | Copy `traceId` onto enqueued jobs and outbound provider calls. |
| Medium | Frontend error reporting and a small Core Web Vitals beacon on the SPA. |
| Low | Ship metrics to a hosted dashboard once request volume makes p95 meaningful. |

---

## Top gaps

1. **`/metrics` and `/ops/*` are public** and leak operational detail.
2. **One container owns Chromium, rate limits, and caches.** `trust proxy` is unset, so the rate limiter does not see client IPs. A second API replica is not safe.
3. **Error tracking and alerts are incomplete.** Sentry is not installed, the SPA reports nothing, and nothing pages on `/ready` or failed jobs.
4. **Queues can drop work.** `ENABLE_WORKERS=false` skips enqueue with `null`, and failed jobs have counts but no dead-letter alert.
5. **Large list reads and a few route-level queries** (`limit` up to 2000, service role bypassing RLS) will hurt before horizontal scale does.
