# Supabase cutover — Phase 4 (DATA_MODE=pg for core tenancy)

**Branch:** `cutover/no-supabase`  
**Depends on:** [Phase 2](./no-supabase-phase-2.md), [Phase 3](./no-supabase-phase-3.md)

## What shipped

| Piece | Detail |
| --- | --- |
| `DATA_MODE` | `supabase` (default) \| `pg` |
| pg helpers | `pgQuery` / `pgOne` / `pgMany` / `withPgTransaction` |
| Migrated services | Auth membership, health DB check, profiles, orgs, org members, workspaces (list/get/create/update + brand profile write) |
| Mode probe | `GET /v1/auth/mode` → `{ authMode, dataMode, ... }` |

## Safety

- **Default unchanged:** unset `DATA_MODE` → `supabase` → all existing PostgREST paths keep working.  
- **Do not edit** live `.env` unless opting into a pg test.  
- **~80 API files** still call `getSupabaseAdmin()` — those paths **require** `DATA_MODE=supabase` until Phase 4b+ migrates them.  
- Campaign / BEE / outreach / knowledge / etc. are **not** migrated in this phase.

## Recommended opt-in combo (company Postgres practice)

```env
# apps/api/.env — temporary test only
AUTH_MODE=local
DATA_MODE=pg
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54332/backlink_agent
# Keep SUPABASE_* vars present (Zod still requires them) — unused for migrated paths in pg mode
```

```env
# apps/web/.env — temporary test only
VITE_AUTH_MODE=local
VITE_API_URL=http://localhost:3001
```

Then: signup → create org → create project should work against company Postgres on **54332**.

Switch all flags back to `supabase` + `DATABASE_URL=...54322...` for normal demos.

## What still uses Supabase client

Anything not listed above — run:

```powershell
rg "getSupabaseAdmin" apps/api/src -g "*.ts" -l
```

## Next (Phase 4b / 5)

- Migrate remaining modules to `pg` (or introduce repositories per domain)
- Soften Zod so `SUPABASE_*` optional when `DATA_MODE=pg` + `AUTH_MODE=local`
- Default company mode after validation (Phase 5)
