# Azure QA deploy handoff (for DevOps)

**PDF for email/share:** [Backlink-Agent-Azure-QA-DevOps-Handoff.pdf](./Backlink-Agent-Azure-QA-DevOps-Handoff.pdf)  
Regenerate: `python scripts/generate-azure-devops-pdf.py`

Repo: `arunsaikumarB/seo-os` · branch: `master`  
App name in product: **Backlink Agent** (Back Links Agent AI)

Railway API is **down** (trial expired). QA should run on **Azure**. Netlify production still points at the dead Railway URL — do not rely on it for QA demos.

## Architecture (QA)

| Piece | Recommendation on Azure |
| --- | --- |
| **API** | Azure Container Apps or App Service (Linux container) from `apps/api/Dockerfile` |
| **Web** | Azure Static Web Apps **or** App Service static site from `apps/web` Vite build (`dist/`) |
| **Auth + DB + Storage** | Prefer existing **Supabase** project (cloud) for QA speed; *or* Azure Database for PostgreSQL + self-hosted Auth (much more work) |
| **Workers / Playwright** | Same API container (`ENABLE_WORKERS=true`). Image is based on `mcr.microsoft.com/playwright:v1.49.1-jammy` — needs enough CPU/RAM (suggest 2 vCPU / 4 GB+) |

```
Browser → Azure Web (HTTPS)
         → Azure API (HTTPS)  → Supabase (Auth/DB/Storage)
                              → optional LLM / provider keys
```

## 1. Build & push API container

Dockerfile path (repo root context):

```bash
# from repo root
docker build -f apps/api/Dockerfile -t backlink-agent-api:qa .
# tag + push to Azure Container Registry
az acr login --name <yourAcr>
docker tag backlink-agent-api:qa <yourAcr>.azurecr.io/backlink-agent-api:qa
docker push <yourAcr>.azurecr.io/backlink-agent-api:qa
```

Health check: `GET /health` → `{"status":"ok",...}`  
Version: `GET /v1/version`

Container listens on **port 3001**.

## 2. API environment variables (App Service / Container Apps)

Set these in Azure (do **not** commit secrets):

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `SUPABASE_URL` | QA Supabase project URL |
| `SUPABASE_ANON_KEY` | QA anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | QA service role (server only) |
| `SUPABASE_JWT_SECRET` | Must match Supabase JWT secret |
| `DATABASE_URL` | Postgres connection string (Supabase pooler or direct) |
| `CORS_ORIGIN` | Exact QA web origin(s), comma-separated, e.g. `https://backlink-agent-qa.azurestaticapps.net` |
| `PROVIDER_MODE` | `mvp` unless QA needs live providers |
| `ENABLE_WORKERS` | `true` for submission / browser jobs |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` (already in image) |
| `PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL` | `0` |

Add any provider keys your QA org already uses (OpenAI, etc.) the same way as production.

## 3. Database migrations

Migrations live in `supabase/migrations/` (through `109_schema_grants.sql` and earlier).

Against the **QA Supabase** project (or linked remote):

```bash
npx supabase link --project-ref <qa-project-ref>
npx supabase db push
```

`109_schema_grants.sql` is required — without it, org create / profile writes fail with `permission denied for table profiles`.

## 4. Web (static) build

```bash
cd apps/web
# create .env.production (or CI env) before build:
# VITE_SUPABASE_URL=https://<qa>.supabase.co
# VITE_SUPABASE_ANON_KEY=<qa-anon>
# VITE_API_URL=https://<qa-api-host>
npm run build
# output: apps/web/dist
```

Deploy `apps/web/dist` to Azure Static Web Apps or Blob + CDN / App Service.

**Important:** Vite bakes `VITE_*` at **build time**. Changing API URL later requires a rebuild.

## 5. Supabase Auth redirect URLs (QA)

In Supabase Dashboard → Authentication → URL configuration, add:

- Site URL: QA web origin  
- Redirect URLs: `https://<qa-web>/**` (and local `http://localhost:5173/**` if still used)

## 6. Smoke checklist after deploy

1. `GET https://<qa-api>/health` → 200  
2. `GET https://<qa-api>/v1/version` → JSON version  
3. Open QA web → sign up / sign in  
4. Create org (must not hit profiles permission error)  
5. Run Create → Import → AI Review → Generate Content → Submit path on a sample site  

## 7. Local reference (developer machines)

See [local-setup.md](./local-setup.md). Local stack already matches this architecture:

| Local | QA (Azure) |
| --- | --- |
| `localhost:5173` | Azure Static Web / App Service |
| `localhost:3001` | Container Apps / App Service |
| Local Supabase `:54321` / `:54322` | Cloud Supabase (recommended for QA) |

## 8. What not to use for QA

- **Railway** — trial expired; do not point QA web at `api-production-48c9e.up.railway.app`  
- **Netlify prod** — still wired to Railway; rebuild only after Azure API URL is ready  
- Committing `.env`, `.env.cloud.bak`, or ACR credentials  

## Contact / repo state

- Latest application code is on `master` (includes content keyword bank, Generate Content step, local grants migration `109`).  
- Companion extension: build `apps/companion` → load unpacked from `apps/companion/dist` (not Chrome Web Store).
