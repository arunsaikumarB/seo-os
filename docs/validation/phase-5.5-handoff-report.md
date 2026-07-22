# Phase 5.5 — Generation → Submission Handoff Report

**Date:** 2026-07-22  
**Mode:** Production Stabilization (no new lifecycle statuses)

## Root causes

### Bug 1 — Fragile transition (not fully missing)
`finalizeQuality` / `approvePackages` used **two** CSM writes:

1. `generation_status=Completed` + `Package Generated`
2. `currentStatus=Ready`

A crash between those writes left items stranded at `Package Generated`. The happy path existed; the gap was atomicity.

### Bug 2 — Wrong read on Submit Backlinks
`/browser/statistics` exposed `ready: c.Ready` from **execution job** public statuses. Jobs are almost never in a `Ready` status (they are queued/running/waiting), so the UI showed **Ready 0** even when CSM had many `campaign_lifecycle = Ready` items.

## Fixes

1. **Atomic handoff** — `completePackageHandoff()` single CSM write → `Ready` + `generation_status=Completed` + `blocker_reason=null`, or stores `blocker_reason` when blocked.
2. **`blocker_reason` column** — migration `093_generation_handoff_blocker.sql`.
3. **Boot + Campaign Health reconcile** — `reconcileGenerationHandoff()` promotes stranded `Package Generated` / `Approved+Completed`.
4. **Statistics** — `ready` / `submissionReady` from `getCampaignCounts().ready` (CSM selector).
5. **Submit Backlinks** — Campaign Ready card + reasoned empty states; label **Submission Ready**.
6. **Campaign Health** — Handoff audit + conservation check.

## Conservation law

```
generatedPackages = submissionReady + inFlight + completed + blocked
```

Asserted on Campaign Health every load (after reconcile).

## Deploy checklist

- [x] Code + tests (`generation-handoff.test.ts`)
- [ ] `npx supabase db push` (migration 093)
- [ ] Railway API + Netlify web
- [ ] Campaign Health: CONSERVATION CHECK ✅
- [ ] Submit Backlinks: Campaign Ready card when Ready > 0
