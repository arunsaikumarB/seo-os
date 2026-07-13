# Browser Execution Engine — Implementation Notes

**Version:** SEO OS v1.2.1+ BEE  
**Status:** Production implementation (extends Backlink Builder; does not rebuild V1.1)

## What shipped

- Migrations `051`–`060` (sessions, jobs, steps, logs, assets, policies, history, selector memory, profiles, statistics)
- Domain planner/form/mapper in `@seo-os/backlink-builder` (`browser-execution.ts`)
- `BrowserExecutionService` (Playwright when installed; pauses on all security gates)
- API under `/v1/projects/:projectId/browser/*`
- Workers: `bee_execute` on `PLAYWRIGHT`; learning/cleanup on `LOW`
- V1.1 `browser_assist_fill` remains a **compatibility layer**; `execution_*` is SoT
- Execution Center UI + Mission Control Browser Execution widget
- Flags: `bee_enabled`, `bee_headed_debug`, `bee_automatic_submit`, `bee_learning`

## Non-negotiables enforced

- CAPTCHA / MFA / email / phone / login → job status `blocked_*` or `needs_approval`; never solved by automation
- Default policy `always_ask`; automatic requires flag + policy + no gates
- Credentials/logs redacted via `redactFormValues`

## Runtime

```bash
# Optional for live browser steps
npm i playwright --workspace=@seo-os/api
npx playwright install chromium
```

Without Playwright browsers, jobs still create plans, detect forms from fetched HTML, and pause at gates / submit for user-controlled completion.

## Docs

Architecture: `docs/architecture/BROWSER_EXECUTION_ENGINE.md`
