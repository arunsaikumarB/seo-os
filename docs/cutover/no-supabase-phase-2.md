# Supabase cutover — Phase 2 (API local auth behind flag)

**Branch:** `cutover/no-supabase`  
**Depends on:** [Phase 0](./no-supabase-phase-0.md), [Phase 1](./no-supabase-phase-1.md)  

## What shipped

| Piece | Detail |
| --- | --- |
| `AUTH_MODE` | `supabase` (default) \| `local` in API env |
| Table | `public.local_auth_users` (migration `110_local_auth.sql`) |
| Endpoints | `GET /v1/auth/mode`, `POST /v1/auth/signup`, `POST /v1/auth/login` |
| JWT | HS256 issuer `backlink-agent-local`, audience `authenticated` |
| Middleware | Dual verify when `AUTH_MODE=local` (local JWT, transitional Supabase JWKS) |

## Safety

- **Default unchanged:** if `AUTH_MODE` is unset → `supabase` → existing web login keeps working.  
- **Do not edit** your live `.env` unless you choose to test local mode.  
- Web UI still uses Supabase Auth until Phase 3 (`VITE_AUTH_MODE`).  
- Migration `110` is **additive only** (`CREATE TABLE IF NOT EXISTS local_auth_users`) — no drops, no Auth changes.  
- Note: `supabase db push` during Phase 2 also applied `110` to the **linked remote** Supabase project (same additive table). App behavior unchanged while `AUTH_MODE` defaults to `supabase`. Prefer `npx supabase db push --local` for local-only work going forward.

## Opt-in test (optional — your machine only)

1. Apply migration (local Supabase):

```powershell
npx supabase db push
```

2. Temporarily add to `apps/api/.env` (optional test):

```env
AUTH_MODE=local
```

3. Restart API, then:

```powershell
curl http://127.0.0.1:3001/v1/auth/mode
curl -X POST http://127.0.0.1:3001/v1/auth/signup -H "Content-Type: application/json" -d "{\"email\":\"local-demo@example.com\",\"password\":\"password123\",\"fullName\":\"Local Demo\"}"
```

4. Set `AUTH_MODE=supabase` (or remove the line) to return to normal demos.

When `AUTH_MODE=supabase`, `/v1/auth/signup` and `/login` return **503** by design.

## What Phase 2 does NOT do

- Web login/signup still Supabase (Phase 3)  
- API data access still `getSupabaseAdmin()` (Phase 4)  
- Company Postgres alone is not enough to run the full app yet  

## Next (Phase 3)

Web `VITE_AUTH_MODE=local|supabase` so login page can call `/v1/auth/*` when opted in.
