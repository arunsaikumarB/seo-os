# Stability Improvements — v0.99.5

- pg-boss enqueue: `retryLimit: 3`, `retryDelay: 30`, `retryBackoff: true`
- Offline detection for user-facing sync messaging
- `/ops/health` + `/metrics` remain for crash-rate proxy on Beta Dashboard
- Integration/technical sync already had attempt-based retries (prior releases)

Realtime: existing platform realtime subscriptions unchanged; beta announcements poll via React Query.
