# SEO OS — Enterprise Production Polish (v1.2.4)

**Status:** Production-ready release candidate  
**Scope:** Performance, security, reliability, observability, diagnostics, tests, operations — **no new SEO features**

## What shipped

| Area | Delivery |
|------|----------|
| Reliability | Graceful SIGTERM/SIGINT shutdown → `stopBoss()` + HTTP drain |
| Observability | Enhanced `/ops/health`, `/metrics` (memory + circuits), correlation headers |
| Security | Helmet HSTS/referrer/frame/noSniff, Permissions-Policy, Netlify HSTS |
| Error tracking | Optional Sentry via `SENTRY_DSN` (loads `@sentry/node` when installed) |
| Resilience | Circuit breaker utility for external calls |
| UX | App-wide `ErrorBoundary`, QueryClient stale/retry defaults |
| Admin | Diagnostics page (`/org/diagnostics`, `/projects/:id/diagnostics`) |
| Mission Control | Enterprise Health widget |
| Tests | Circuit breaker, health/trace, enterprise env/flag coverage |
| Docs | This guide + ops checklists below |

## Health endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `GET /ready` | Readiness (DB, queue, encryption) |
| `GET /metrics` | Request latency + memory + circuits |
| `GET /ops/health` | Enterprise aggregate for Diagnostics / Mission Control |
| `GET /v1/version` | `1.2.4-enterprise` |

Correlation on every response: `X-Trace-Id`, `X-Request-Id`, `X-Correlation-Id`.

## Environment (new/notable)

```
ENCRYPTION_KEY=           # required in production/staging for credential crypto
SENTRY_DSN=               # optional — enables Sentry when @sentry/node is installed
SENTRY_ENVIRONMENT=       # optional
ENABLE_WORKERS=true|false
CORS_ORIGIN=https://your-app.netlify.app
```

Install Sentry in the API workspace when ready:

```bash
npm install @sentry/node --workspace=@seo-os/api
```

## Operations checklists

### Deployment

1. `npm run db:push` (if new migrations — none required for this polish)
2. Push `master` / tag `v1.2.4-enterprise`
3. Railway: `railway up --service api`
4. Netlify: build web + `netlify deploy --prod`
5. Verify `GET /health`, `/ready`, `/v1/version`, `/ops/health`
6. Open Diagnostics + Mission Control Enterprise Health

### Rollback

1. Redeploy previous Railway deployment / Netlify deploy
2. Re-point tag only if intentionally moving a release marker
3. Do **not** reverse applied Supabase migrations without a restore plan

### Incident response (summary)

1. Check `/ops/health` + Diagnostics page
2. Grab `X-Trace-Id` from failing requests
3. Inspect API logs (Pino) and queue depths
4. Provider failover via Provider Dashboard if vendor down
5. See `docs/ops/DR_RUNBOOK.md` for disaster recovery

## Security posture

- Org/workspace isolation via JWT + `X-Org-Id` + `requireProjectAccess` + RLS
- Provider credentials AES-256-GCM (`ENCRYPTION_KEY`)
- Rate limit 180 req/min on `/v1`
- SPA CSP + HSTS on Netlify; API helmet hardened
- No demo APIs; feature flags gate unfinished providers

## Accessibility / UX

- Lazy routes + Suspense skeletons retained
- ErrorBoundary with reload/dismiss
- Diagnostics and Mission Control use consistent Card/Badge patterns
- WCAG AA: prefer existing contrast tokens; keyboard reachability via native controls

## Non-goals (intentionally not rewritten)

- No new SEO product features
- No architecture redesign
- No breaking API contract changes (additive fields only)
