# Supabase cutover — Phase 3 (web auth mode flag)

**Branch:** `cutover/no-supabase`  
**Depends on:** [Phase 2](./no-supabase-phase-2.md)

## What shipped

| Piece | Detail |
| --- | --- |
| `VITE_AUTH_MODE` | `supabase` (default) \| `local` |
| Auth provider | Dual path: Supabase Auth **or** `POST /v1/auth/login\|signup` |
| Local session | `localStorage` key `ba.local_auth.session` |
| UI | Google OAuth hidden in local mode |

## Safety

- **Default unchanged:** unset / `supabase` → current login/signup behavior.  
- **Do not edit** live `apps/web/.env` unless opting into a local-auth test.  
- Netlify production should keep `VITE_AUTH_MODE=supabase` (or omit).  
- API must use `AUTH_MODE=local` when web uses `VITE_AUTH_MODE=local` (both sides).

## Opt-in test (local only)

1. API `.env`: `AUTH_MODE=local` (restart API)  
2. Web `.env`: `VITE_AUTH_MODE=local` (restart Vite)  
3. Open signup → create account → should land signed in (no email confirm)  
4. Switch both flags back to `supabase` for normal demos  

## Still not done (Phase 4+)

- API data access still uses Supabase PostgREST client  
- Realtime hooks still use Supabase client when those features run  
- Full company-Postgres-only runtime comes after Phase 4–5  
