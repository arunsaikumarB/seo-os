# Operations Manual — SEO OS Enterprise

Companion to [ENTERPRISE_PRODUCTION.md](./ENTERPRISE_PRODUCTION.md) and [ops/DR_RUNBOOK.md](./ops/DR_RUNBOOK.md).

## Daily

- Glance Mission Control → Enterprise Health
- Confirm Diagnostics subsystems are `ok`
- Review Provider Health for `offline` / `quota_exceeded`

## Weekly

- Export provider usage report
- Review `/metrics` top routes for latency regressions
- Confirm `ENCRYPTION_KEY` and backups still valid

## Release

1. `npm run typecheck && npm test && npm run build`
2. Tag release
3. Deploy API then Web
4. Smoke: `/health`, `/ready`, login, Mission Control, Diagnostics

## Monitoring guide

| Signal | Source |
|--------|--------|
| API errors | Pino + optional Sentry |
| Latency | `/metrics`, `/ops/health` |
| Queues | `/ops/health`.queues |
| Providers | Provider Dashboard + Mission Control widget |
| Browser / Image | BEE + IIE Mission Control widgets |

## Troubleshooting quick map

| Symptom | Check |
|---------|-------|
| 503 ready | Database / queue `down` |
| Degraded ready | Missing `ENCRYPTION_KEY` in prod |
| Provider failures | Failover to estimated / configure env keys |
| UI blank crash | ErrorBoundary reload; check browser console in local only |
| Jobs stuck | `ENABLE_WORKERS`, queue depths, Railway memory |
