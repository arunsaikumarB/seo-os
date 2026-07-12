# Admin Guide

- Manage org members under `/org/team`
- Feature flags via `GET /v1/feature-flags` (defaults in `@seo-os/shared`)
- Review audit activity via platform/audit APIs (admin role)
- Integrations: require admin to connect/disconnect providers
- Ops: monitor `GET /ops/health`, `/ready`, `/metrics`
- Set Railway secrets: `ENCRYPTION_KEY`, `CORS_ORIGIN`, Supabase keys, `DATABASE_URL`
