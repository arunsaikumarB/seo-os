# Supabase cutover — Phase 4b (PostgREST-lite for `DATA_MODE=pg`)

**Branch:** `cutover/no-supabase`  
**Depends on:** [Phase 4](./no-supabase-phase-4.md)

## What shipped

| Piece | Detail |
| --- | --- |
| `apps/api/src/lib/pg-supabase-compat.ts` | Chainable client: `from` / `select` / filters / `insert` / `update` / `delete` / `upsert` / `rpc` over `node-pg` |
| `getSupabaseAdmin()` | When `DATA_MODE=pg`, returns a cached compat singleton instead of `@supabase/supabase-js` |
| Default path | `DATA_MODE=supabase` (or unset) — **unchanged** service-role PostgREST client |
| Tests | `apps/api/tests/pg-supabase-compat.test.ts` (skips if DB unreachable) |

## Why

~80 API modules still call `getSupabaseAdmin().from(...).select()...`. Rewriting each file to raw SQL is slow and risky. Phase 4b lets those call sites keep working under `DATA_MODE=pg` without per-file rewrites, while Phase 4’s dual-mode services (`org.service`, etc.) continue to use explicit `pgQuery` paths.

## Supported surface (best-effort)

- `from(table)` → `public."table"`
- `select('*')` / comma lists
- Nested `organizations(*)` / `organizations(id, name)` via `LEFT JOIN` when parent has `org_id` (e.g. `org_members`)
- Filters: `eq`, `neq`, `in`, `is`, `gte`/`lte`/`gt`/`lt`, plus common `not(..., 'is'|'in', ...)`
- `or('col.eq.x,col.is.null')` — PostgREST-style OR strings used by campaigns / approved-opportunities / leases
- `order`, `limit`, `single`, `maybeSingle`, thenable await
- `insert` / `update` / `delete` / `upsert({ onConflict })`
- `rpc(name, args)` → `SELECT * FROM public.name(arg := $n, ...)`

## Limitations (not PostgREST parity)

| Area | Behavior under pg compat |
| --- | --- |
| `auth.admin` / Auth Admin API | Stub error — use local auth + `profiles` / `local_auth_users` |
| Storage | Throws — not implemented |
| Realtime | N/A |
| Complex nested selects | `!inner`, `alias:fk_column(...)`, multi-level embeds → clear error asking to flatten |
| Count/head | Partial (`select('*', { count: 'exact', head: true })` supported for flat selects) |
| RLS | Bypassed (same as service-role admin) — app must enforce tenancy in queries |
| RPC | Only `public` functions; named args; failures return `{ data: null, error }` |

## Safety

- **Default unchanged:** unset `DATA_MODE` → `supabase` → real Supabase client.
- Do **not** commit or edit live `.env` for demos unless intentionally opting into pg.
- Prefer company Postgres (`54332`) or local Supabase Postgres (`54322`) for tests.

## Opt-in smoke

```env
AUTH_MODE=local
DATA_MODE=pg
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Most modules that only use table CRUD via `getSupabaseAdmin()` should work. Paths that need Auth Admin, Storage, or exotic embeds still need dual-mode SQL or further compat work.

## Next

- Soften Zod so `SUPABASE_*` optional when `AUTH_MODE=local` + `DATA_MODE=pg`
- Expand nested-select / RPC coverage where production paths fail
- Phase 5: validate end-to-end and consider defaulting company mode
