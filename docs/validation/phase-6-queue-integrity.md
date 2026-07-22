# Phase 6 — Execution Queue Integrity (root cause)

## What multiplied 15 sites → 50+ jobs

`createExecution` always INSERTed a new `execution_jobs` row. There was **no DB uniqueness** on `(workspace_id, opportunity_id)` for active jobs.

`ensureExecutionJobsForReady` (and Campaign Health GET, which called it with `startImmediately: true` on every poll) treated only a short status list as “in flight”. Statuses like `launching_browser`, `needs_approval`, and `watching_*` were **not** treated as existing jobs — so each health poll / ensure pass created **another** Queued job for the same opportunity while the real job was already Waiting Human.

Generation’s enqueue shipped idempotent (Phase 3 §4). Execution’s did not — this phase closes that gap.

## Fixes

1. Migration `095` — soft-delete duplicate actives; partial unique index on active jobs.
2. `createExecution` — return existing active job (idempotent); race → unique violation → reuse.
3. `isInFlightJob` — all live / Waiting Human statuses block create; queued / failed_to_start still retry.
4. Campaign Health ensure — `startImmediately: false` (no start-on-poll).
5. Counters / Track Results / Waiting Human / BEE reports — one row per `opportunity_id`.
6. Campaign Health — `queueIntegrity` assert `duplicateActiveJobs === 0`.
