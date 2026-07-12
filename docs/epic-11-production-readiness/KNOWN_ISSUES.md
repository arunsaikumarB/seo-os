# Known Issues — v0.99

1. **Live E2E (Playwright)** not yet in CI — journey is contract-smoked only.
2. **Rate limiter** is in-process; multi-replica deployments need Redis.
3. **ENCRYPTION_KEY** optional at boot — `/ready` marks `encryption: degraded` if missing in prod.
4. **Integration OAuth** connect is stub-capable; full Google OAuth redirect is technical debt.
5. **Billing / Marketplace** intentionally out of scope (placeholders remain).
6. **Accessibility tooling** (axe / jsx-a11y) not wired into ESLint CI.
7. **External APM** (Sentry) not installed — use `/ops/health` + logs until then.
8. Some Sprint placeholder routes remain in org settings.
