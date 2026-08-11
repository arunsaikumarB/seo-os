# Supabase cutover — Phase 0 (inventory + safety)

**Branch:** `cutover/no-supabase`  
**Status:** Phase 0 complete — documentation only  
**Date:** 2026-08-11  

## Safety freeze (do not violate)

| Asset | Rule during cutover |
| --- | --- |
| Local `apps/api/.env` / `apps/web/.env` | **Do not edit** unless explicitly opted in |
| Local Supabase (`supabase start`) | **Keep running** as current demo path |
| Cloud Supabase project | **Do not modify / reset / delete** |
| Netlify / old Railway | **Leave as-is** |
| `master` | **No merge** until Phase 5 validated + user OK |
| GitLab `ba-frontend` | Sync only after FE auth cutover is green |

Default runtime remains **Supabase mode**. Company Postgres mode is introduced later behind `AUTH_MODE` / `DATA_MODE` flags.

---

## Current architecture (what we have today)

```
Web (Vite) --Supabase Auth--> Supabase Auth
         --Bearer JWT------> API (Express)
API ------service role------> Supabase PostgREST / Postgres
Web ------realtime----------> Supabase Realtime (limited)
```

Local ports today:

| Service | Port |
| --- | --- |
| Web | 5173 |
| API | 3001 |
| Supabase API/Auth | 54321 |
| Postgres | 54322 |
| pgAdmin (optional) | 5050 |

pgAdmin already connects to Postgres at `127.0.0.1:54322` — that stays valid after cutover.

---

## Inventory summary

### A. Auth (must replace first — DD3 pattern)

| Location | Role |
| --- | --- |
| `apps/web/src/providers/auth-provider.tsx` | signIn / signUp / Google OAuth / session |
| `apps/web/src/lib/supabase.ts` | browser Supabase client |
| `apps/api/src/middleware/auth.ts` | JWT verify via Supabase JWKS + `org_members` lookup |
| `packages/shared/src/env/index.ts` | requires `SUPABASE_*` / `VITE_SUPABASE_*` |

### B. Data access (largest surface)

- **85 API source files** call `getSupabaseAdmin()` (`apps/api/src/lib/supabase.ts`).
- Pattern: PostgREST `.from(...)`, some `.rpc(...)` (e.g. `kb_hybrid_search`).
- Web app mostly talks to **our API**; direct Supabase usage on web is mainly Auth + a few realtime/notification hooks.

### C. Realtime (smaller)

| Location | Role |
| --- | --- |
| `apps/web/src/hooks/use-platform-realtime.ts` | platform live updates |
| `apps/web/src/hooks/use-stage-notifications.ts` | stage notifications |

Replacement options later: API polling or WebSocket on our API.

### D. Schema

- **88 SQL files** under `supabase/migrations/` (through `109_schema_grants.sql`).
- Includes RLS / grants designed for Supabase roles — company Postgres will need a **roles + grants** pass (same lesson as DD3 dump/restore).

### E. Env vars that currently force Supabase

**API:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`  
**Web:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`

---

## Target architecture (DD3-like, after full cutover)

```
Web --login/signup--> API auth (JWT we issue)
Web --Bearer JWT----> API
API --pg / Prisma--> Company PostgreSQL
DBA --pgAdmin------> same PostgreSQL
```

No Supabase Cloud. No Supabase CLI required for company server.  
Local demo can keep old path until you switch.

---

## Phased plan (approved direction)

| Phase | Deliverable | Breaks local/cloud? |
| --- | --- | --- |
| **0** | This inventory + freeze rules | No |
| **1** | Company Postgres runbook (dump/restore + pgAdmin) | No |
| **2** | API auth (`AUTH_MODE=supabase\|local`) + user password table | No if default=`supabase` |
| **3** | Web login uses API when `VITE_AUTH_MODE=local` | No if default=`supabase` |
| **4** | DB access via `pg` pool; deprecate PostgREST client behind flag | No if default=`supabase` |
| **5** | Default local/company mode; remove Supabase deps | Only after sign-off |
| **6** | GitLab `ba-frontend` / `ba-backend` sync for DevOps | After 5 |

---

## Phase 1 preview (next, when you say go)

1. Script to `pg_dump` local Supabase Postgres → file (read-only).  
2. Doc: restore into plain Postgres on company server / local test DB.  
3. pgAdmin connection notes.  
4. **Still no Auth rewrite.**

---

## Explicit non-goals for Phase 0–2

- Do not delete Supabase projects  
- Do not change production Netlify `VITE_*`  
- Do not force-push `master`  
- Do not run `supabase db reset`  
- Do not remove `@supabase/*` packages yet  

---

## Sign-off

- Phase 0 authored on branch `cutover/no-supabase`.  
- Await user OK before Phase 1.
