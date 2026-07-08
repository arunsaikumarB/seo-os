# Troubleshooting

## Installation

### `npm install` fails

- Ensure Node.js ≥ 20: `node -v`
- Delete `node_modules` and retry: `npm run clean && npm install`
- On Windows, run terminal as Administrator if native module errors occur

### Workspace dependency not found

```bash
npm install
npm run build --workspace=@seo-os/shared
```

Turbo builds dependencies in order; always run `npm install` from repo root.

---

## Build & TypeScript

### `composite` project reference errors

Packages use TypeScript project references. Build order:

```bash
npm run build
```

### Web `import.meta.env` type errors

Ensure `apps/web/src/vite-env.d.ts` exists and includes `VITE_*` variables.

---

## Lint & Format

### ESLint fails

```bash
npm run lint:fix
npm run lint
```

### Prettier check fails in CI

```bash
npm run format
npm run format:check
```

Prettier enforces LF line endings (`.prettierrc` → `endOfLine: lf`).

---

## Local Development

### API fails to start — Zod env validation

All required API env vars must be set. See [environment.md](./environment.md).

Minimum for `/health`:

```env
SUPABASE_URL=https://example.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service
SUPABASE_JWT_SECRET=local-dev-jwt-secret-at-least-32-chars
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

### `npm run dev` — port in use

```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <pid> /F
```

### Supabase CLI not found

Install: https://supabase.com/docs/guides/cli

Or use Docker: `docker compose up -d postgres`

### `/ready` returns 503

Expected without a running database. `/health` should still return 200.

---

## CI/CD

### CI lint/format/build fails

Reproduce locally:

```bash
npm run verify:local
```

### Staging deploy skipped in CI

Warning: `Staging secrets not configured`

**Fix:** Add GitHub secrets per [deployment.md](./deployment.md):

- `RAILWAY_TOKEN`
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `STAGING_API_URL`

### Railway deploy fails

- Verify `apps/api/Dockerfile` builds locally: `docker build -f apps/api/Dockerfile .`
- Ensure all API env vars are set in Railway dashboard
- Health check path: `/health`

### Netlify build fails

```bash
npm run build --workspace=@seo-os/web
```

Check `VITE_*` env vars are set in Netlify dashboard.

### CORS errors in browser

Set `CORS_ORIGIN` on API to include your Netlify URL:

```env
CORS_ORIGIN=http://localhost:5173,https://your-site.netlify.app
```

---

## Database

### Migrations fail

```bash
supabase status
supabase db reset
npm run db:push
```

### `gen_random_uuid()` errors

Requires PostgreSQL 13+. Supabase local uses PG 15.

---

## Smoke Tests

### Local health smoke hangs (Windows)

```bash
node scripts/smoke-local-health.mjs
```

If port 3099 is stuck:

```bash
netstat -ano | findstr :3099
taskkill /PID <pid> /F
```

### Staging smoke fails

```bash
STAGING_API_URL=https://your-api.railway.app npm run smoke:staging
```

Verify API is deployed and URL has no trailing slash issues.

---

## Getting Help

1. Run `npm run verify:local` and capture output
2. Check [local-setup.md](./local-setup.md) and [environment.md](./environment.md)
3. Review [Sprint 0 Report](./sprint-0/SPRINT_0_REPORT.md)
