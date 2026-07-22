# BEE Execution Reliability — Config Reference (Phase 4)

All tunables live in `apps/api/src/modules/browser-execution/bee-config.ts` (`BEE_RELIABILITY`) unless noted. Override with environment variables.

| Knob | Env | Default | Location |
|---|---|---|---|
| Heartbeat interval | `BEE_HEARTBEAT_MS` | 5000 | bee-config |
| Lease grace multiplier | `BEE_LEASE_GRACE` | 6 (→ 30s TTL) | bee-config |
| Max browser sessions / workers | `BEE_MAX_SESSIONS` | 4 | bee-config + PLAYWRIGHT concurrency |
| Policy max parallel (DB) | `execution_policies.max_parallel_sessions` | 4 | bee.service getOrCreatePolicy |
| Browser recycle after N jobs | `BEE_BROWSER_RECYCLE_JOBS` | 25 | bee-config |
| Browser recycle after M ms | `BEE_BROWSER_RECYCLE_MS` | 1800000 (30m) | bee-config |
| Site retry limit | `BEE_SITE_RETRY_LIMIT` | 3 | bee-config |
| Whole-job ceiling | `BEE_JOB_CEILING_MS` | 300000 (5m) | bee-config |
| Lease sweep interval | `BEE_LEASE_SWEEP_MS` | 8000 | bee-config |
| Stage: open/navigate | `BEE_TIMEOUT_OPEN_MS` | 30000 | bee-config / bee-timeouts |
| Stage: form detect | `BEE_TIMEOUT_FORM_MS` | 30000 | bee-config |
| Stage: upload | `BEE_TIMEOUT_UPLOAD_MS` | 60000 | bee-config |
| Stage: submit | `BEE_TIMEOUT_SUBMIT_MS` | 60000 | bee-config |
| Stage: verify | `BEE_TIMEOUT_VERIFY_MS` | 60000 | bee-config |
| Retry backoff base (sec) | `BEE_RETRY_BACKOFF_BASE_SEC` | 10 (→ 10/40/160) | execution-failures retryBackoffSeconds |
| Workers enabled | `ENABLE_WORKERS` | production default true | shared env |

## Failure classification (never auto-solve)

| Code | Retry? |
|---|---|
| Timeout / Network / Rate Limited / Browser Crash / Unexpected Nav / DOM Changed / Site Offline | Yes (site or infra retry) |
| Form Missing / Submission Rejected / 404 / Unsupported | No → Failed / Ignored |
| Login / Registration / CAPTCHA / Cloudflare / OTP / Email / Phone / Manual Approval | No → **Waiting Human only** |

## Crash recovery

On API boot: `reconcileExecutionAfterRestart()` closes orphan sessions, clears leases, requeues in-flight jobs (not Waiting Human / terminals), then `startLeaseSweepLoop()`.

## Stress harness

```bash
node apps/api/scripts/bee-stress-harness.mjs
node apps/api/scripts/bee-stress-harness.mjs --size=100 --chaos
```

Reports: `docs/bee-stress-reports/stress-{20,100,500,1000}.{md,json}`
