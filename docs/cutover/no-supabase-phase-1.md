# Supabase cutover — Phase 1 (company Postgres + pgAdmin)

**Branch:** `cutover/no-supabase`  
**Status:** Phase 1 tooling + runbook  
**Depends on:** [Phase 0](./no-supabase-phase-0.md)  

## What this phase does

- Read-only **dump** of local Supabase Postgres  
- Optional **company-style Postgres** on a **separate port** (54332)  
- **Restore** dump into that company DB for DevOps practice  
- **pgAdmin** connection notes  

## What this phase does NOT do

- Does **not** change `apps/api/.env` or `apps/web/.env`  
- Does **not** stop or modify Supabase local (`54321` / `54322`)  
- Does **not** touch cloud Supabase / Netlify / Railway  
- Does **not** rewrite Auth (that is Phase 2)  
- Does **not** make the app run on company Postgres yet (API still expects Supabase Auth + PostgREST)

Your current local demo path stays: `supabase start` + API + web.

---

## Port map (important)

| Port | Service | Role |
| --- | --- | --- |
| **54322** | Supabase local Postgres | **Current app DB — leave alone** |
| **54332** | `ba-company-postgres` | Cutover / company-server practice DB |
| **5050** | pgAdmin | UI for either DB |
| **54321** | Supabase Auth/API | Unchanged |

Never point restore scripts at `supabase_db_seo-os`.

---

## A. Dump local Supabase Postgres (read-only)

Requires Docker + `supabase start` (container `supabase_db_seo-os`).

```powershell
# from repo root
powershell -File scripts/cutover/dump-local-postgres.ps1
```

Output goes to `.cutover-dumps/backlink-agent-local-YYYYMMDD-HHMMSS.dump` (gitignored).

Share that file with DevOps over a secure channel. **Do not commit dumps.**

---

## B. Start company-style Postgres (parallel to Supabase)

Image is **`pgvector/pgvector:pg17`** (Postgres 17 + vector, matches Supabase local major).

```powershell
docker compose --profile company-postgres up -d company-postgres
```

- Host: `127.0.0.1`  
- Port: **54332**  
- Database: `backlink_agent`  
- User / password: `postgres` / `postgres`  

Supabase on 54322 keeps running.

If you previously started an older `postgres:15` company container, recreate once:

```powershell
docker compose --profile company-postgres down
docker volume rm backlinksagentai_ba_company_pg_data
docker compose --profile company-postgres up -d company-postgres
```

---

## C. Restore dump into company Postgres only

```powershell
powershell -File scripts/cutover/restore-company-postgres.ps1 -DumpPath .cutover-dumps\<your-file>.dump
```

This **drops/recreates only** `backlink_agent` inside `ba-company-postgres`.  
It never touches Supabase.

Verify:

```powershell
docker exec -e PGPASSWORD=postgres ba-company-postgres `
  psql -U postgres -d backlink_agent -c "\dt public.*"
```

Expect ~150 public tables (e.g. `organizations`, `profiles`, `campaigns`, …).

**Verified locally (2026-08-11):** dump 1.11 MB; restore into company DB on 54332; Supabase on 54322 stayed healthy (~150 public tables unchanged).

`pg_restore` may warn about Supabase-only extensions (`pg_net`, `supabase_vault`) — safe to ignore for Phase 1. Role stubs are applied automatically. Phase 4 will simplify grants for plain Postgres app users.

---

## D. pgAdmin 4

### Docker pgAdmin

```powershell
docker compose up -d pgadmin
```

Open http://localhost:5050 — login `admin@example.com` / `admin`.

Register servers:

| Name | Host (from pgAdmin container) | Port | DB | User | Password |
| --- | --- | --- | --- | --- | --- |
| BA Supabase local | `host.docker.internal` | 54322 | `postgres` | `postgres` | `postgres` |
| BA company cutover | `host.docker.internal` | 54332 | `backlink_agent` | `postgres` | `postgres` |

### Desktop pgAdmin 4

Same credentials with Host `127.0.0.1`.

---

## E. Company server handoff (for DevOps — DD3-style)

Same process as DD3 dump → internal Postgres:

1. Receive `.dump` from developer (or produce on a build machine with Supabase local).  
2. On company Postgres host, create empty database `backlink_agent` (or agreed name).  
3. `pg_restore --no-owner --no-acl -d backlink_agent <file>.dump`  
4. Connect pgAdmin to that server.  
5. **Do not** point the live app at this DB until Phase 2–4 (Auth + data access) are done.

Suggested company `DATABASE_URL` shape (for later phases — **do not set in app yet**):

```env
DATABASE_URL=postgresql://<user>:<password>@<company-host>:5432/backlink_agent
```

---

## F. Safety checklist

- [ ] Supabase still healthy: `supabase status`  
- [ ] App still on old `.env` (54321 / 54322)  
- [ ] Dump file under `.cutover-dumps/` only  
- [ ] Company DB only on **54332** locally  
- [ ] No restore against cloud Supabase  

---

## Next (Phase 2 — needs your OK)

API-issued Auth behind `AUTH_MODE=supabase|local` (default remains `supabase`).
