# Supabase cutover — Phase 6 (GitLab DevOps handoff)

**Branch:** `cutover/no-supabase`  
**Depends on:** Phases 1–5

## What shipped

| Piece | Detail |
| --- | --- |
| GitLab `ba-backend` | API + `packages/*` + `workers/*` + cutover scripts + compose + this docs set |
| Sync script | `scripts/sync-backend-to-gitlab.ps1` |
| Cursor rule | `.cursor/rules/gitlab-backend-sync.mdc` |
| Frontend (already) | GitLab `ba-frontend` via `scripts/sync-frontend-to-gitlab.ps1` |

## GitLab layout

| Branch | Contents | Deploy as |
| --- | --- | --- |
| `ba-frontend` | `apps/web` + `packages/shared` | Static site / Node Vite build → `apps/web/dist` |
| `ba-backend` | `apps/api` + packages + workers + cutover tooling | Node API (Docker optional via `apps/api/Dockerfile`) |

Repo: `http://gitlab.lstech-hq.lstechinc.com/websites/backlink-agent.git`

Re-sync from monorepo root:

```powershell
powershell -File scripts/sync-frontend-to-gitlab.ps1 -Message "chore: sync frontend"
powershell -File scripts/sync-backend-to-gitlab.ps1 -Message "chore: sync backend"
```

---

## DevOps — company stack (DD3-style)

No Supabase Cloud. No Supabase CLI required on the company host.

### 1. Postgres + pgAdmin

**Option A — company host Postgres**  
Provision Postgres 17 with `pgvector` (same major as dump source). Create DB `backlink_agent`, user/password as you prefer.

**Option B — local practice (Docker)** from `ba-backend` checkout:

```powershell
docker compose --profile company-postgres up -d company-postgres
docker compose up -d pgadmin
```

| Port | Service |
| --- | --- |
| **54332** | Company Postgres (`ba-company-postgres`) |
| **5050** | pgAdmin (`admin@example.com` / `admin`) |

pgAdmin server: Host `host.docker.internal`, Port `54332`, DB `backlink_agent`, User `postgres`, Pass `postgres`.

### 2. Schema dump / restore

From a machine that still has a healthy local Supabase DB (read-only dump):

```powershell
powershell -File scripts/cutover/dump-local-postgres.ps1
powershell -File scripts/cutover/restore-company-postgres.ps1 -DumpPath .cutover-dumps\<file>.dump
```

Details: [Phase 1](./no-supabase-phase-1.md).  
**Do not commit** `.cutover-dumps/*`. Transfer dumps over a secure channel.

On a bare company Postgres (not the Docker helper), restore with `pg_restore` into the target DB after creating roles (see `scripts/cutover/prepare-company-roles.sql`).

### 3. API env

```powershell
cp apps/api/.env.company.example apps/api/.env
```

Required:

```env
COMPANY_STACK=true
LOCAL_JWT_SECRET=<32+ random chars>
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/backlink_agent
CORS_ORIGIN=https://your-frontend-origin
```

`COMPANY_STACK=true` forces local JWT auth + direct Postgres (`AUTH_MODE=local`, `DATA_MODE=pg`). Supabase keys are **not** required.

### 4. Web env (from `ba-frontend`)

```powershell
cp apps/web/.env.company.example apps/web/.env
```

```env
VITE_AUTH_MODE=local
VITE_API_URL=https://your-api-origin
```

### 5. Build & run

**API (`ba-backend`):**

```bash
npm install
npm run build
npm run start
```

Docker (Playwright image): build from `apps/api/Dockerfile` at the `ba-backend` root (context must include `packages/`).

**Web (`ba-frontend`):**

```bash
npm install
npm run build   # -> apps/web/dist
```

Serve `apps/web/dist` behind your company reverse proxy / static host.

### 6. Smoke checklist

1. `GET /ready` → healthy (DB reachable)  
2. `GET /v1/auth/mode` → `authMode: local`, `dataMode: pg`, `companyStack: true`  
3. Signup → login (local password)  
4. Create org → create project/workspace  
5. Open campaign / Mission Control pages (no Supabase browser client required)  
6. pgAdmin shows the same DB the API uses  

---

## Keeping the local Supabase demo (developers)

Unchanged. Leave `COMPANY_STACK` unset; keep `supabase start` + existing `.env` files. Cutover branch defaults remain supabase-safe until you opt in.

---

## Explicit non-goals (Phase 6)

- Does **not** merge `cutover/no-supabase` → `master`  
- Does **not** remove `@supabase/*` packages  
- Does **not** delete cloud Supabase projects  
- Does **not** change Netlify / Railway production env (Railway trial expired; company host is the target)  
- Does **not** force company mode as the code default  

---

## Handoff package for DevOps

Give them:

1. Access to GitLab `ba-frontend` + `ba-backend`  
2. This doc + [Phase 1 dump/restore](./no-supabase-phase-1.md) + [Phase 5 company stack](./no-supabase-phase-5.md)  
3. `apps/api/.env.company.example` and `apps/web/.env.company.example`  
4. A fresh `.dump` from dump script (secure transfer)  
5. Desired `CORS_ORIGIN` / public API + web URLs  

Azure-specific PDF (`docs/Backlink-Agent-Azure-QA-DevOps-Handoff.pdf`) is optional legacy; **company internal servers + pgAdmin** is the primary path.
