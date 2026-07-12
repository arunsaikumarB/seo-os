# Deployment Guide (v0.99 addendum)

See also `docs/deployment.md`.

## Pipeline
1. CI quality job (lint, format, typecheck, test, build, smokes)
2. Optional staging deploy (Railway API + Netlify) when secrets present
3. Manual prod: `railway up --service api` + `netlify deploy --prod --no-build --dir=apps/web/dist`

## Migration safety
- Never edit applied migrations; add a new numbered file
- `node scripts/check-migrations.mjs` enforces increasing prefixes
- Apply with `npx supabase db push`
- Rollback: restore DB backup (see DR runbook); reverse migrations are not automated

## Release process
Tag `vX.Y.Z` + GitHub Release notes after migrate → commit → push → deploy.
