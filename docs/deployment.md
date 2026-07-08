# Deployment Guide

## Environments (Frozen)

| Environment  | Frontend       | API                | Database                     |
| ------------ | -------------- | ------------------ | ---------------------------- |
| `local`      | localhost:5173 | localhost:3001     | Supabase local / Docker      |
| `staging`    | Netlify        | Railway            | Supabase staging (us-east-1) |
| `demo`       | demo.seoos.io  | demo-api (Railway) | Supabase demo                |
| `production` | app.seoos.io   | api (Railway)      | Supabase production          |

**MVP target:** `staging` first, then `demo`.

---

## 1. Supabase (Database)

1. Create project in **us-east-1**
2. Link locally: `supabase link --project-ref <ref>`
3. Apply migrations: `npm run db:push`
4. Copy credentials to API and Web env:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (API only)
   - `SUPABASE_JWT_SECRET` (API only)

> **Security:** Migrations 001–003 do not include RLS. Use an isolated staging project until migration 018 (Sprint 1).

---

## 2. Railway (API)

### Manual setup

1. Create Railway project from GitHub repo
2. Add service using `apps/api/Dockerfile` (see `railway.toml`)
3. Set environment variables (see [environment.md](./environment.md))
4. Health check path: `/health`

### GitHub Actions auto-deploy

Configure repository secrets:

| Secret            | Description                                |
| ----------------- | ------------------------------------------ |
| `RAILWAY_TOKEN`   | Railway project token                      |
| `STAGING_API_URL` | e.g. `https://staging-api-xxx.railway.app` |

On push to `main`, CI deploys API after quality checks pass.

```bash
# Verify staging health
STAGING_API_URL=https://your-api.railway.app npm run smoke:staging
```

---

## 3. Netlify (Web)

### Manual setup

1. Connect GitHub repository
2. Build command: `npm run build --workspace=@seo-os/web`
3. Publish directory: `apps/web/dist`
4. Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` (Railway staging URL)

Config file: `apps/web/netlify.toml`

### GitHub Actions auto-deploy

| Secret               | Description                   |
| -------------------- | ----------------------------- |
| `NETLIFY_AUTH_TOKEN` | Netlify personal access token |
| `NETLIFY_SITE_ID`    | Netlify site ID               |

---

## 4. CI/CD Pipeline

`.github/workflows/ci.yml`:

| Job              | Trigger             | Steps                                                  |
| ---------------- | ------------------- | ------------------------------------------------------ |
| `quality`        | PR + push to `main` | lint → format → typecheck → build → local health smoke |
| `deploy-staging` | push to `main`      | Build → Railway + Netlify (if secrets set)             |
| `smoke-staging`  | after deploy        | `GET /health` on `STAGING_API_URL`                     |

### Branch protection (recommended)

- Require `quality` job to pass before merge to `main`

---

## 5. Staging Verification Checklist

- [ ] `GET {STAGING_API_URL}/health` → 200
- [ ] `GET {STAGING_API_URL}/ready` → 200 or 503 (DB-dependent)
- [ ] Web loads at Netlify URL
- [ ] Web can reach API (`VITE_API_URL` correct)
- [ ] CORS: `CORS_ORIGIN` includes Netlify URL

---

## 6. Staging Status (Sprint 0)

Staging deployment is **pipeline-ready** but requires you to configure:

1. Railway project + `RAILWAY_TOKEN` secret
2. Netlify site + `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` secrets
3. Supabase staging project + env vars on Railway/Netlify
4. `STAGING_API_URL` secret for smoke tests

Until secrets are configured, CI emits warnings and skips deploy/smoke steps. This is expected for first-time setup.

See [troubleshooting.md](./troubleshooting.md) for common deploy issues.
