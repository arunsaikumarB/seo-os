# Developer Guide

## Monorepo
- Apps: `apps/api`, `apps/web`
- Packages: `packages/*` (engines + shared)
- Migrations: `supabase/migrations`

## Local
```
npm ci
npm run dev
```
Verify: `npm run verify:local`

## Adding an API module
1. Service under `apps/api/src/modules/...`
2. Router under `routes/v1/`
3. Mount on `projectScopeRouter`
4. Optional job handler on `QUEUES.*`
5. Feature flag if gated

## Tests
```
npm test
node scripts/smoke-journey.mjs
```
