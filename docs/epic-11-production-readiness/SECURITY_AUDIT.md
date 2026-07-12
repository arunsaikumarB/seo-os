# Security Audit Report — v0.99

**Date:** 2026-07-12  
**Scope:** AuthN/Z, RLS, secrets, transport, abuse controls

## Findings

| Area | Status | Notes |
|------|--------|-------|
| RBAC (`requireRole`) | Pass | Hierarchy enforced on mutating routes |
| Project tenancy middleware | Pass | Workspace membership checked |
| Supabase RLS | Pass | Feature tables use `can_access_workspace` / `is_org_member` |
| JWT verification | Pass | JWKS via Jose |
| Helmet | Pass | CORP cross-origin for SPA |
| CORS | Pass | Allowlist via `CORS_ORIGIN` |
| Rate limiting | Improved | 180/min + `Retry-After` + `X-RateLimit-*` |
| Input validation | Pass | Zod on write endpoints |
| XSS (API) | Pass | JSON responses; SPA CSP added on Netlify |
| CSRF | Acceptable | Bearer tokens (not cookie session for API) |
| SQL injection | Pass | Supabase client parameterized; no raw SQL in API |
| Secret management | Improved | `ENCRYPTION_KEY` warned in prod; crypto refuses prod encrypt without key |
| Token rotation | Pass | Integration refresh + credential `key_version` |
| Audit logs | Pass | Platform event bus writes `audit_logs` |
| Service role usage | Residual risk | API uses admin client — RLS is defense-in-depth for direct DB access |

## Recommendations before 1.0
1. Set `ENCRYPTION_KEY` in Railway production secrets
2. Move rate limits to Redis for multi-instance
3. Add Sentry (or equivalent) for error monitoring
4. Periodic RLS integration tests against a staging project

## Score: **84 / 100**
