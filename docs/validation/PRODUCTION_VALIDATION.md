# Production Validation Mode — Chefgaa Campaign

**Workspace:** `db9f83a2-f1db-4a9a-9afb-348402fd4d84`  
**API:** https://api-production-48c9e.up.railway.app (`1.2.7-queue-init`)  
**Harness:** `apps/api/scripts/production-validation.mjs`  
**Latest report:** `docs/validation/failure-report-2026-07-22-15-39-30.md`

## Verdict

**0 / 19 websites completed the full workflow** (SIE + execution job).  
Site Intelligence profiling now works after an observed crash fix. Browser execution was never started for any site.

## Observed failures (real, not hypothetical)

| Code | Count | Nature |
|---|---|---|
| `NO_EXECUTION_JOB` | 19 | Ready + package approved, but Submit never created `execution_jobs` |
| `HOMEPAGE_UNREACHABLE` | 7 | Live fetch failed / HTTP 429 — site-side |
| `UNSUPPORTED_STRATEGY` | varies | No evidence-backed path on shallow crawl (prod crawl often better) |
| ~~`successfulPaths[0]` crash~~ | 12 → 0 | **Fixed** in `31b3f23` — empty `learning {}` crashed `bee_profile` |
| ~~stale `quality needs review (79)`~~ | 19 → 0 | **Fixed** — cleared in DB; `approvePackages` now nulls `lastError` |

## SIE outcomes after fix (prod profiles)

| Domain | Prod profile | Strategy | Entry URL |
|---|---|---|---|
| abc-directory.com | complete | Contact Form | `/contactus` |
| alistdirectory.com | complete | Direct Submission | `/` (Directorist) |
| bookmark4you.com | complete | Contact Form | `/contact` |
| usalistingdirectory.com | complete | Direct Submission | `/submit.php` |
| viesearch.com | complete | Direct Submission | `/submit` |
| bizsugar.com | complete | Guest Post | `/write-for-us` |
| boingboing.net | complete | Guest Post | `/signup` |
| 01webdirectory.com | complete | Contact Form | `/health_info.htm` |
| tsection.com | complete | Contact Form | listings browse URL |
| 1abc.org | unsupported | — | — |
| activesearchresults.com | unsupported | — | register.php |
| alivedirectory.com | unsupported | — | contact.php |
| a1webdirectory.org, aboutus.com, addurl.nu, hotvsnot.com, topsiteswebdirectory.com, tubecities.com, yemle.com | unreachable | — | — |

## Fixes applied (observed only)

1. **`runSiteProfileJob`** — normalize `learning` so `{}` cannot skip `emptyLearning()` (crash on `successfulPaths[0]`).
2. **`approvePackages`** — clear stale quality `lastError` when package is approved / already Ready.
3. Cleared 19 stale `last_error` rows in production.

## Not fixed yet (needs operator or next observed run)

- **No execution jobs** — Submit Backlinks was never started for this campaign. Creating jobs and starting Playwright against live directories is the next validation step (will open real sites).
- **Unreachable hosts** — not a product bug; campaign items should be ignored or retried later.
- **Unsupported profiles** — honest SIE outcomes; do not force a strategy without evidence.

## How to re-run

```powershell
railway variables --service api --kv | Out-File $env:TEMP\seo-os-api.env -Encoding utf8
$env:ENV_FILE="$env:TEMP\seo-os-api.env"
node apps/api/scripts/production-validation.mjs
```
