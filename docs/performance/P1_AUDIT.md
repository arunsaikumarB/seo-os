# P1 Production Performance Sprint — Audit Report

**Date:** 2026-07-28  
**Commit:** (see release)  
**Scope:** Speed / caching / concurrency / rendering only — no CSM lifecycle or BEE fill-submit changes.

## Baseline bottlenecks (code audit)

| Bottleneck | Before | Impact |
|------------|--------|--------|
| Campaign Health GET | Double `listCampaignItems`, sequential audits, **orphan sweep + handoff reconcile + ensureExecutionJobs on every 5s poll** | Critical UI lag |
| SIE crawl | 15 pages × 1.5s delay ≈ 21s+ sleep; 90s budget; no early-stop | Critical SI latency |
| Directory `skipRediscovery` | Written, never wired | Missed cache hits |
| `bee_profile` on PLAYWRIGHT | Competed with fill/submit for `BEE_MAX_SESSIONS` (default 1) | Queue starvation |
| Browser cold start | Pool existed but no warm on boot | >1s first launch |
| Frontend polling | 1–5s always-on (health, BEE, AI) | Network + CPU waste |
| AI review heal | Sequential `await` per row + always re-list | Board latency |
| Import concurrency | Fixed 5 | Slow imports |

## Optimizations applied

1. **Instrumentation** — `apps/api/src/lib/perf-trace.ts`, `GET /ops/performance`, Diagnostics Performance strip.
2. **Campaign Health slim** — single list + `computeCampaignCounts`; parallel read audits; writes via `campaign_health_reconcile` LOW job; 2.5s response cache.
3. **SIE crawl** — max **6** pages / **30s**; fetch concurrency 2; delay 800ms; early-stop on Write For Us / Submit / Contact / Dashboard / Directory / Comment / forms.
4. **Cache / learning** — wire `directoryLearningAllowsSkipRediscovery` + proven-path counters; profile reuse records cache hits.
5. **Queue** — `bee_profile` → **CRAWL** queue (concurrency 2); PLAYWRIGHT reserved for execute.
6. **Browser warm** — `warmBrowserPool('headless')` on worker boot; startup spans.
7. **Import** — `IMPORT_VALIDATE_CONCURRENCY` (default 8).
8. **AI review** — parallel heal (8-wide); skip re-list when no heals; board timing span.
9. **Frontend** — adaptive polling (idle/hidden backoff); campaign-health table DOM cap 150; SSE progress stream with polling fallback.
10. **Content gen** — per-job performance spans.

## Before / after (estimated)

| Surface | Before (code-derived) | After (target / expected) | Est. improvement |
|---------|----------------------|---------------------------|------------------|
| Campaign Health poll | 2–8s+ (writes + multi-list) | &lt;500ms cached / &lt;1.5s miss | **3–10×** |
| Site Intelligence cold | up to 90s / 15 pages | ≤30s / ≤6 pages + early-stop | **2–5×** |
| Site Intelligence warm | full crawl | reuse / skip rediscovery | **10×+** |
| Browser startup (warm) | cold Chromium launch | pool warm &lt;300ms acquire | **3–10×** |
| Import (batch) | concurrency 5 | concurrency 8 | **~1.5×** |
| AI Review board | sequential heals | parallel + skip re-list | **2–4×** |
| BEE ops polling | 1s always | 1–3s adaptive / 8–15s hidden | Less load |

Live p50/p95: check Diagnostics → Performance or `GET /ops/performance` after production traffic.

## Targets vs status

| Target | Status |
|--------|--------|
| Dashboard / Campaign Health &lt;500ms | Expected on cache hit; measure in prod |
| SI &lt;2s/domain (cache) | Reuse + skip rediscovery path |
| Browser startup &lt;300ms (warm) | Warm on boot |
| Directory detection &lt;1s (cached) | Skip rediscovery wired |
| Page navigation &lt;150ms | Client-only (polling reduced) |

## Out of scope (unchanged)

- CSM transitions, BEE fill/submit/CAPTCHA
- Redis data cache (still `site_profiles` + pg-boss)
- Raising `BEE_MAX_SESSIONS` without Railway RAM confirmation
- Full WebSocket stack (SSE + polling only)

## How to verify in production

1. Open **Diagnostics** → Performance strip after running import / SI / submit.
2. Campaign Health should feel snappier; network tab shows shorter `/campaign-health` times.
3. Re-profile a known directory — expect skip rediscovery / cache hit counters to rise.
4. Confirm browsers still fill/submit identically (product behavior unchanged).
