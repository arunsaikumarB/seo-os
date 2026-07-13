# Security Guide — SEO OS Enterprise

## Controls in place

- JWT auth (Supabase JWKS) + org membership RBAC
- Workspace isolation via `requireProjectAccess`
- Postgres RLS (`is_org_member`, `can_access_workspace`)
- AES-256-GCM credential encryption (`ENCRYPTION_KEY`)
- Rate limiting on `/v1` (180/min)
- Helmet + HSTS (prod/staging) + Permissions-Policy
- Netlify CSP + HSTS + frame deny
- Correlation IDs on all responses
- Optional Sentry for 5xx capture

## OWASP mapping (summary)

| Risk | Mitigation |
|------|------------|
| Injection | Supabase client parameterized; Zod validation |
| XSS | React escaping; SPA CSP |
| Broken auth | JWT verification + role hierarchy |
| Sensitive data | Encrypted provider credentials; log redaction |
| CSRF | Cookie auth not used for API; bearer tokens |
| Misconfig | `/ready` flags missing encryption in prod |

## Rotation

1. Generate new `ENCRYPTION_KEY`
2. Re-encrypt credentials with rotate workflow (store new ciphertext)
3. Rotate Supabase service role / JWT secrets via dashboard
4. Redeploy API with new secrets

See also: `docs/epic-11-production-readiness/SECURITY_AUDIT.md`
