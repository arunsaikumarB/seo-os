# Browser Execution Engine — Implementation Notes

**Version:** SEO OS v1.2.5-bee-resume  
**Status:** Production implementation (extends Backlink Builder; does not rebuild V1.1)

## What shipped

- Migrations `051`–`060` (sessions, jobs, steps, logs, assets, policies, history, selector memory, profiles, statistics)
- Migration `081` — watching states, auto-resume policy knobs, pause/resume reporting columns, session reuse helpers
- Domain planner/form/mapper in `@seo-os/backlink-builder` (`browser-execution.ts`)
- `PageWatcher` signal evaluation (`page-watcher.ts`) — detects user-completed gates only
- `BrowserExecutionService` (Playwright when installed; pauses on all security gates; revalidate-before-submit)
- API under `/v1/projects/:projectId/browser/*`
- Workers:
  - `bee_execute` (PLAYWRIGHT)
  - `bee_watch` (CAPTCHA / login / MFA / email / phone watchers)
  - `bee_resume` (auto-resume after clearance)
  - `bee_queue` (queue continuation)
  - `bee_session_health` + learning/cleanup on `LOW`
- V1.1 `browser_assist_fill` remains a **compatibility layer**; `execution_*` is SoT
- Execution Center UI + Mission Control Browser Execution widget (watching / auto-resumed)
- Flags: `bee_enabled`, `bee_headed_debug`, `bee_automatic_submit`, `bee_learning`, `bee_auto_resume`

## Auto-resume lifecycle

1. Gate detected → `blocked_*` / `needs_approval` → session + context saved → screenshot
2. Status → `watching_*` → `bee_watch` polls DOM/URL/cookies (never solves gates)
3. Clearance detected → `ready_to_continue` → gate step marked done → auto-resume (no Resume click)
4. Revalidate form → submit if authorized → queue next website

## Workspace policy defaults

| Setting | Default |
|---------|---------|
| `auto_resume` | `true` |
| `watch_interval_ms` | `2000` |
| `max_watch_ms` | `1800000` (30 min) |
| `session_reuse` | `true` |
| `queue_auto_continue` | `true` |

## Non-negotiables enforced

- CAPTCHA / MFA / email / phone / login → pause + watch; **never solved or bypassed**
- Default policy `always_ask`; automatic requires flag + policy + no gates
- Credentials/logs redacted via `redactFormValues`
- Everything logged (pause reason, resume reason, watch duration)

## Runtime

```bash
# Optional for live browser steps
npm i playwright --workspace=@seo-os/api
npx playwright install chromium
```

Without Playwright browsers, jobs still create plans, detect forms from fetched HTML, and pause at gates / submit for user-controlled completion. Watchers require a live headed session on the same worker for DOM probes.

## Docs

Architecture: `docs/architecture/BROWSER_EXECUTION_ENGINE.md`
