# Campaign State Manager — Phase 1 summary

## Independent counters removed / redirected

| Former source | Now |
|---|---|
| `getAutomationSummary` live `opportunities.automation_status` + analytics snapshot for imported/pending/verified | `getCampaignCounts()` via CSM |
| `getBacklinkDashboard` `pipeline_stage` group-by + dual-count verified from `backlinks` | `projectDashboardFromCounts(getCampaignCounts())` |
| `getClassificationAnalytics` `rows.length` as imported | `counts.imported` / `counts.classified` from CSM |
| Import session stored `opportunities_created` (still written for session UI) | Campaign Items = opportunities with `campaign_lifecycle` |

## Status remaps (legacy → CSM lifecycle)

| Legacy | Campaign lifecycle |
|---|---|
| `automation_status=imported` / has import | Imported |
| `analyzed` / domain analysis | Analyzed |
| `qualified` + classification metadata / pending_review | Classified |
| `queue_status=approved` / `campaign_ready` | Approved |
| content pack exists | Package Generated |
| pack `ready` | Ready |
| execution Running/Queued/Starting | Submitting |
| Waiting Human (ESM) | Waiting Human |
| Submitted/Completed jobs | Submitted |
| Verified | Verified |
| Delete Forever / `automation_status=deleted` | Deleted |
| Not qualified import | Ignored (still one Campaign Item) |
| Rejected queue | Rejected |

## Write path

`updateCampaignItem()` is the sole lifecycle writer (with dual-write to legacy columns for API compat). Execution write-back via `syncCampaignItemFromExecution` after `setJobStatus` only — BEE/Playwright unchanged.

## Migration

- SQL: `supabase/migrations/087_campaign_state_manager.sql`
- Script: `apps/api/scripts/backfill-campaign-state.mjs`
- API: `POST /v1/projects/:id/backlink-builder/campaign-state/backfill`
- Audit UI: `/projects/:id/backlink-builder/campaign-health` (not in nav)

## Orphans / duplicates

Backfill creates Campaign Items for valid import rows missing `opportunity_id`, and reports conflicts in the migration JSON (`conflict_resolved_to_furthest`, `orphan_created`).
