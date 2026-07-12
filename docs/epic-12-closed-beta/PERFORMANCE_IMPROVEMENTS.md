# Performance Improvements — v0.99.5

Builds on v0.99:
- Retained Vite `manualChunks` (react/query/motion/charts)
- Hot-path DB indexes from migration 021 still in effect
- Beta usage events are append-only / indexed for dashboard queries
- Dashboard refetch interval 60s (not chatty)

Further gains for 1.0: Redis rate limits, CDN API caching, Playwright-based perf budgets.
