# QA Report — v0.99

## Test layers
| Layer | Status |
|-------|--------|
| Unit (Vitest) | Feature flags, crypto round-trip, API metrics |
| Migration sequence | `scripts/check-migrations.mjs` in CI |
| Local health smoke | `scripts/smoke-local-health.mjs` |
| Journey contract smoke | `scripts/smoke-journey.mjs` |
| Staging health | `scripts/smoke-staging.mjs` (when URL set) |
| E2E browser (Playwright) | Not yet — listed as Known Issue |
| Performance / a11y automated | Not yet |

## End-to-end journey (module contract)
Register → Org → Project → Scan → Discover → Campaign → Outreach → Workflow → Verify → Analytics → Report  
Verified as **wired modules present** in CI; live multi-tenant browser E2E deferred to 1.0 with Playwright.

## Score: **78 / 100**
