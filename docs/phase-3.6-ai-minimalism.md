# Phase 3.6 — AI Minimalism (Progressive Disclosure)

Frontend-only visibility changes. No API, DB, CSM, queue, or Browser Execution changes.

## Layer assignment (moved elements)

| Element | Old location | New layer |
|---|---|---|
| Workflow step counts / % / Current·Next footer | Workflow header | Removed from header (steps only) |
| GlobalStatusBar (always-on AI jargon) | App shell top | Removed from default chrome (AI Status replaces when active) |
| Token / image / cost estimates | Generate default card | Layer 2 — `details ▼` |
| Generate Everything button | Generate main card | Renamed **Start AI Generation**; State A only |
| Live queue breakdown / dashboard card | Generate above fold | State B compact progress only |
| Review Queue empty panel | Generate always | Collapsed (renders nothing when 0) |
| Review Queue full table | Generate default | Layer 2 via **Needs Review** chip → Review → |
| Bulk retry / export / delete / approve | Generate main | Layer 3 **Advanced Tools** |
| Opportunity selector / Image·Video Studio | Generate Advanced | Layer 3 **Advanced Tools** |
| Campaign Debug / Diagnostics links | — | Layer 3 on Generate |
| Generated Assets list | Generate default | Layer 2 summary + Open Assets → |
| NextActionPanel on Generate page | Shell + page dual primary | Hidden on Generate (page owns States A/B/C) |
| NextActionPanel when on active step | Shell always | Hidden — page owns primary CTA |
| NextActionPanel during AI run | Shell | Hidden — CampaignAiStatus owns fold |
| Sidebar “Advanced” | Nav | Relabeled **Advanced Tools** |
| Execution “Show Advanced” | Submit page | Relabeled **Advanced Tools** |
| “No items in this view” | AI Review | Collapsed (empty-state rule) |
| Content Studio title | Generate h1 | **Generate Content** |
| Campaign Health | Audit page | **EXEMPT** — left verbose |

## Generate Content states

| State | Condition (CSM `generation_status` counts) | Above fold |
|---|---|---|
| A idle | Approved > 0, nothing in run yet | Count + Start AI Generation + time; estimates behind details ▼ |
| B running | Queued/Generating > 0 | Progress bar + current + remaining/ETA only |
| C complete | Completed/Needs Review/Failed after run | Summary + Continue; exception chip if any |
| empty | No approved | Continue → Approve |

## Shared components added

- `hooks/use-campaign-ai-status.ts` — CSM board + BEE for shared numbers
- `components/workflow/campaign-ai-status.tsx` — universal AI Status (collapses when idle)
- `components/workflow/exception-chip.tsx` — Needs Review / Failed chip (nothing when 0)
- `components/workflow/advanced-tools.tsx` — Layer 3 wrapper

## Renames applied

| Old | New |
|---|---|
| Content Studio | Generate Content |
| Generate Everything | Start AI Generation |
| Review Queue | Needs Review (chip) |
| Advanced | Advanced Tools |

Routes unchanged.

## Fold budget (1366×768)

Default chrome: Workflow header → AI Status (if active) → Exception chip (if any) → one primary card (Continue / Start AI Generation / progress). Galleries and Advanced Tools below.
