# Supabase cutover — Phase 5 (company stack first-class)

**Branch:** `cutover/no-supabase`  
**Depends on:** Phases 1–4b

## What shipped

| Piece | Detail |
| --- | --- |
| `COMPANY_STACK=true` | Forces `AUTH_MODE=local` + `DATA_MODE=pg`; Supabase credentials optional |
| Env soften | Non-company mode still **requires** Supabase vars (safe default) |
| Web | `VITE_AUTH_MODE=local` does not require `VITE_SUPABASE_*`; realtime no-ops |
| Examples | `apps/api/.env.company.example`, `apps/web/.env.company.example` |
| Probe | `GET /v1/auth/mode` → `companyStack`, `supabaseRequired` |

## What Phase 5 does NOT do

- Does **not** change code defaults to company mode (still `AUTH_MODE=supabase` / `DATA_MODE=supabase` unless you set `COMPANY_STACK` or the local+pg pair).  
- Does **not** remove `@supabase/*` npm packages (still needed for the Supabase demo path).  
- Does **not** merge to `master` or overwrite your live `.env`.  
- Does **not** delete cloud Supabase projects.

## Company stack (DevOps / internal server)

1. Postgres on company host (or local `54332` via Phase 1).  
2. Restore dump (Phase 1 scripts).  
3. API env from `.env.company.example` → set strong `LOCAL_JWT_SECRET` + `DATABASE_URL` + `CORS_ORIGIN`.  
4. Web env from `.env.company.example` → `VITE_AUTH_MODE=local` + `VITE_API_URL`.  
5. `npm run build` / run API + serve `apps/web/dist`.  
6. pgAdmin → same Postgres.  
7. Smoke: signup → create org → create project → open campaign pages.

## Keeping the old local Supabase demo

Leave `COMPANY_STACK` unset. Keep existing `apps/api/.env` / `apps/web/.env` pointing at `supabase start` (`54321` / `54322`). No change required.

## Packages

`@supabase/supabase-js` remains installed so `AUTH_MODE=supabase` demos still work. Runtime company stack does not call Supabase Cloud.

## Next

See [Phase 6](./no-supabase-phase-6.md) — GitLab `ba-backend` sync + DevOps company-stack handoff.
