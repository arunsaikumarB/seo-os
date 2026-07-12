# Production Checklist — v0.99

## Pre-release
- [x] Migrations sequential (`021`)
- [x] CI on `main` + `master`
- [x] Unit tests in CI
- [x] Health / ready / metrics / ops health
- [x] Rate limit Retry-After
- [x] Netlify security + cache headers
- [x] Bundle manualChunks
- [x] DR runbook documented
- [ ] Confirm `ENCRYPTION_KEY` set on Railway
- [ ] Confirm CORS_ORIGIN includes production web origin
- [ ] Confirm Supabase backups enabled (dashboard)

## Deploy
- [x] Apply migrations
- [x] Commit + push
- [x] Deploy API
- [x] Deploy Web
- [x] Tag `v0.99.0`

## Post-deploy
- [ ] `GET /health` = 200
- [ ] `GET /ready` not down
- [ ] `GET /ops/health` healthy|degraded
- [ ] `GET /v1/version` = `11.0.0-production-ready`
- [ ] Login → Mission Control loads
- [ ] Demo mode works
