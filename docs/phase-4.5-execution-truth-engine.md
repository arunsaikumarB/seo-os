# Phase 4.5 — Execution Truth Engine: Before/After Report

## Baseline (pre–Phase 4.5, from Phase 4 stress notes)

| Metric | Baseline (approx.) |
|---|---|
| False-intervention rate (nav “Sign in” / CAPTCHA text FPs) | High — classifications by inference |
| Stuck-Starting incidents | Possible — `launching_browser` set before allocate |
| Progress accuracy | Inflated — preparing/launch counted as Running |

## After Truth Engine (fixture suite + wiring)

| Metric | After |
|---|---|
| False-intervention rate (fixture FP cases) | **0** on nav Sign-in + CAPTCHA text-only fixtures |
| Stuck-Starting | Structurally impossible — Starting only after Browser Allocated |
| Progress accuracy | Bar = verified-terminal ÷ total; Running only after Website Opened |
| Queue purity | Intervention list requires `evidence_id` |
| Missing-evidence count (Campaign Health) | Must stay **0** |

## Fixture results (vitest)

See `packages/backlink-builder/src/detector-registry.test.ts`:

1. TP Login — pass  
2. FP Login (nav link) — pass (not classified)  
3. TP CAPTCHA — pass  
4. FP CAPTCHA (text only) — pass  
5. TP Manual Approval — pass  
6. FP thank-you — pass  
7. Unknown → Needs AI Review — pass  

## 500-item run note

Re-run `apps/api/scripts/bee-stress-harness.mjs` with truth layer active and record:

- `falseInterventionRate` from Campaign Health truth audit  
- phantom Starting count (must be 0)  
- `displayed_running ≤ workers_in_Running`

Store artifacts under `docs/bee-stress-reports/` with suffix `-truth-engine`.
