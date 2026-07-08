# Environment Variables

## Overview

| App           | Env file        | Validated by                            |
| ------------- | --------------- | --------------------------------------- |
| API           | `apps/api/.env` | Zod (`parseApiEnv` in `@seo-os/shared`) |
| Web           | `apps/web/.env` | Vite (`import.meta.env`)                |
| Root template | `.env.example`  | Reference only                          |

Copy templates:

```bash
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

---

## API Variables (`apps/api/.env`)

| Variable                    | Required | Default                 | Description                                          |
| --------------------------- | -------- | ----------------------- | ---------------------------------------------------- |
| `NODE_ENV`                  | No       | `development`           | `development` \| `test` \| `staging` \| `production` |
| `PORT`                      | No       | `3001`                  | HTTP listen port                                     |
| `API_URL`                   | No       | —                       | Public API URL (deploy)                              |
| `SUPABASE_URL`              | **Yes**  | —                       | `https://<ref>.supabase.co`                          |
| `SUPABASE_ANON_KEY`         | **Yes**  | —                       | Supabase anon key                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes**  | —                       | Server only — never expose to web                    |
| `SUPABASE_JWT_SECRET`       | **Yes**  | —                       | JWT verification secret                              |
| `DATABASE_URL`              | **Yes**  | —                       | Postgres connection string                           |
| `CORS_ORIGIN`               | No       | `http://localhost:5173` | Comma-separated allowed origins                      |
| `ENCRYPTION_KEY`            | No       | —                       | 32-byte hex (Sprint 7+)                              |
| `GEMINI_API_KEY`            | No       | —                       | AI provider (Sprint 4+)                              |
| `OLLAMA_BASE_URL`           | No       | —                       | Local AI fallback URL                                |
| `PROVIDER_MODE`             | No       | `mvp`                   | `mvp` \| `free` \| `paid`                            |
| `ENABLE_WORKERS`            | No       | `false`                 | Enable pg-boss workers                               |

### Local Supabase CLI

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
SUPABASE_URL=http://localhost:54321
```

### Docker Postgres fallback

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

---

## Web Variables (`apps/web/.env`)

All web variables must be prefixed with `VITE_`.

| Variable                 | Required | Description          |
| ------------------------ | -------- | -------------------- |
| `VITE_SUPABASE_URL`      | **Yes**  | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **Yes**  | Supabase anon key    |
| `VITE_API_URL`           | **Yes**  | API base URL         |

### Staging example

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_API_URL=https://staging-api-xxx.railway.app
```

---

## GitHub Actions Secrets (Staging)

| Secret               | Used by              |
| -------------------- | -------------------- |
| `RAILWAY_TOKEN`      | Deploy API           |
| `NETLIFY_AUTH_TOKEN` | Deploy web           |
| `NETLIFY_SITE_ID`    | Deploy web           |
| `STAGING_API_URL`    | Smoke test `/health` |

---

## Security Rules (Frozen)

- Never commit `.env` files
- Never put `SUPABASE_SERVICE_ROLE_KEY` in web bundle
- Never log secrets (API redacts `Authorization` headers)
- Rotate service role key quarterly (production)

---

## Validation

API env is validated at startup — invalid config throws immediately:

```bash
npm run dev --workspace=@seo-os/api
# Zod error if required vars missing or malformed
```

Web env types are in `apps/web/src/vite-env.d.ts`.
