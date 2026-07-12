# Disaster Recovery Runbook

## Backups
- **Primary:** Supabase managed daily backups (enable PITR on Pro if available)
- **RPO target:** ≤ 24h (daily) / ≤ 1h with PITR
- **RTO target:** ≤ 4h for core API + DB restore

## Restore strategy
1. Pause writers (scale Railway workers to 0 / maintenance mode)
2. Restore Supabase to point-in-time or latest backup
3. Verify `/ready` database = ok
4. Redeploy last known good API/Web tags if schema mismatch
5. Smoke: login, Mission Control, one audit, one report

## Failover notes
- API is stateless aside from pg-boss; queue jobs may need re-drive after restore
- Integration credentials decrypt only with the same `ENCRYPTION_KEY` — **never lose this secret**
- Netlify can roll back to previous deploy instantly

## Drill
Document quarterly restore drills and store results with date/owner.
