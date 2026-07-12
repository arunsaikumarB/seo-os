# Epic 6 Report — Workflow Automation Engine v1.0

**Epic goal:** Transform SEO OS from a collection of intelligent modules into an autonomous workflow platform that orchestrates existing capabilities with human approval gates.  
**API version:** `6.0.0-epic6`  
**Date:** 2026-07-12  
**Status:** Complete — awaiting approval before Epic 7

---

## Executive Summary

Epic 6 delivers the **Workflow Automation Engine** — a visual, template-driven orchestration layer that coordinates Browser Intelligence, Knowledge, Memory, Campaigns, Backlink Builder, Relationship Intelligence, and Outreach without adding new SEO point features.

| Deliverable | Status |
| ----------- | ------ |
| `@seo-os/workflow-engine` package | ✅ |
| Migration `015_epic6_workflow_automation.sql` | ✅ |
| Workflow CRUD + run + approval APIs | ✅ |
| 9 built-in campaign templates | ✅ |
| Visual builder (drag-and-drop reorder) | ✅ |
| Templates + Runs & Approvals UI | ✅ |
| Mission Control workflow widget | ✅ |
| Workflow Orchestrator Agent | ✅ |
| Feature flag `workflows` | ✅ |
| Demo mode fixtures | ✅ |
| Build / Typecheck (API + Web) | ✅ |

**Epic completion score: 86/100**  
**Recommendation: Go — await explicit approval before Epic 7**

---

## 1. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ apps/web                                                                     │
│  Workflows list │ Templates │ Builder (dnd-kit) │ Runs & Approvals │ MC Widget│
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ /v1/projects/:id/workflows/*
┌────────────────────────────────▼────────────────────────────────────────────┐
│ apps/api — workflow.service + workflows.routes + workflow job handler        │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│ @seo-os/workflow-engine                                                      │
│  types │ templates │ engine (conditions/nodes) │ orchestrator agent          │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│ Postgres: workflows │ workflow_runs │ workflow_run_steps │ workflow_approvals│
└─────────────────────────────────────────────────────────────────────────────┘
```

**Design stance:** Orchestration only. Nodes emit *planned intents* and pause for approval on external actions. Deep module side-effects (send email, crawl site) remain owned by Epic 1–5 services and can be wired as follow-on jobs.

---

## 2. Workflow Engine Architecture

### Node types
`trigger` · `condition` · `delay` · `ai_task` · `approval` · `campaign` · `outreach` · `verification` · `notification` · `update_status` · `end`

### Triggers
`manual` · `scheduled` · `website_scan_completed` · `opportunity_discovered` · `campaign_created` · `approval_granted` · `reply_received` · `backlink_verified`

### Actions (intents)
`generate_ai_content` · `create_campaign` · `assign_relationship` · `prepare_outreach_draft` · `request_approval` · `update_pipeline` · `create_timeline_event` · `notify_user` · `verify_backlink`

### Execution model
1. Run starts at the single `trigger` node  
2. `executeNode` evaluates conditions, delays, and approval gates  
3. External nodes (`outreach` / configured approval) create `workflow_approvals` and pause  
4. On approve → advance; on reject → cancel run  
5. Delay nodes enqueue `workflow.advance` with `startAfter`  
6. Workers disabled → synchronous advance (local/demo)

### Compliance
`require_approval_for_external` defaults to **true**. Outreach nodes require approval unless explicitly overridden.

---

## 3. Database Changes

Migration: `supabase/migrations/015_epic6_workflow_automation.sql`

| Table | Purpose |
| ----- | ------- |
| `workflows` | Definition graph (JSONB), trigger, status, template key |
| `workflow_runs` | Execution instances + context |
| `workflow_run_steps` | Per-node attempt history |
| `workflow_approvals` | Human gates for external steps |

RLS enabled on all four tables (API uses service role).

**Apply:** `npm run db:push` (or Supabase dashboard SQL) before production use.

---

## 4. API Endpoints

Base: `/v1/projects/:projectId/workflows`

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/summary` | viewer | Mission Control metrics |
| GET | `/templates` | viewer | Built-in templates |
| GET | `/` | viewer | List workflows |
| POST | `/` | member | Create (blank or template) |
| GET | `/:id` | viewer | Get workflow + definition |
| PATCH | `/:id` | member | Update graph / status |
| POST | `/:id/run` | member | Start run |
| GET | `/runs` | viewer | List runs |
| GET | `/runs/:runId` | viewer | Run detail + steps |
| GET | `/approvals` | viewer | Pending approvals |
| POST | `/approvals/:id/decide` | member | Approve / reject |

Version endpoint: `6.0.0-epic6`

---

## 5. Workflow Templates

| Key | Name | Category |
| --- | ---- | -------- |
| `guest_post_campaign` | Guest Post Campaign | Backlink Acquisition |
| `broken_link_campaign` | Broken Link Campaign | Backlink Acquisition |
| `directory_submission_campaign` | Directory Submission | Citations |
| `resource_page_campaign` | Resource Page Campaign | Backlink Acquisition |
| `brand_mention_campaign` | Brand Mention Campaign | Brand |
| `digital_pr_campaign` | Digital PR Campaign | PR |
| `podcast_outreach_campaign` | Podcast Outreach | PR |
| `qa_campaign` | Q&A Campaign | Community |
| `forum_campaign` | Forum Campaign | Community |

Each template: trigger → condition (score) → AI → campaign → outreach → approval → verification → notify → update status → end.

---

## 6. New UI Screens

| Route | Screen |
| ----- | ------ |
| `/projects/:id/workflows` | Workflow list + activate/run |
| `/projects/:id/workflows/templates` | Template gallery |
| `/projects/:id/workflows/:workflowId` | Visual builder (dnd-kit reorder + canvas strip) |
| `/projects/:id/workflows/runs` | Runs history + approval decisions |

Nav: **Automation** sidebar section + Expert Mode `Workflows` item (flag `workflows`).

---

## 7. Mission Control Updates

Widget: `WorkflowWidget` metrics:

- Running Workflows  
- Queued Jobs  
- Completed Today  
- Failed Jobs  
- Pending Approvals  
- Workflow Health  
- Automation Success Rate  

Wired into `getMissionControlSummary` → `workflows` key.

---

## 8. AI Agent Design

```ts
WORKFLOW_ORCHESTRATOR_AGENT = {
  id: 'workflow_orchestrator_agent',
  displayName: 'Workflow Orchestrator Agent',
  role: 'Coordinate SEO OS modules through automated workflows with human approval gates',
  responsibilities: [
    'Coordinate existing module suite',
    'Execute workflow graphs node-by-node',
    'Retry / attempt tracking via run steps',
    'Pause for human approval on external communications',
    'Maintain execution history and Mission Control health',
  ],
}
```

Domain agent constant (Epic 5 pattern) — not registered in Sprint-2 workforce runtime.

---

## 9. Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Migration not applied in cloud Supabase | High | Run `015` before enabling workflows in prod |
| Node actions are intents, not full side-effects | Medium | Documented; wire Epic 1–5 services in Epic 6.1 |
| Builder is linear reorder, not freeform canvas | Medium | Graph model supports edges/branches; UI can deepen later |
| Scheduled trigger not cron-backed yet | Medium | Type supported; scheduling job deferred |
| Double-advance if workers + sync | Low | Enqueue returns null when workers off → sync only |

---

## 10. Technical Debt

1. Freeform 2D canvas (React Flow) instead of vertical sortable list  
2. Event bus hooks from scan/opportunity/reply into `triggerMatchingWorkflows`  
3. Concrete adapters: outreach draft create, campaign create, verify backlink  
4. Cron for `scheduled` triggers  
5. Retry policy UI and max-attempt configuration  
6. Richer condition builder UI  

---

## 11. Epic Completion Score

| Area | Score | Notes |
| ---- | ----- | ----- |
| Architecture & package | 18/20 | Clean Epic 5 mirror |
| Database | 15/15 | Tables + indexes + RLS |
| API & jobs | 16/20 | Full CRUD/run/approval; adapters thin |
| Templates | 12/12 | All 9 required |
| UI | 12/15 | Builder functional; not full freeform DnD canvas |
| Mission Control | 8/8 | Widget + summary |
| Compliance | 5/5 | External approval default on |
| Docs / demo | 5/5 | Report + demo fixtures |

**Total: 86/100**

---

## Go / No-Go for Epic 7

Epic 6 establishes the orchestration layer SEO OS needed after Outreach.  

**Do not start Epic 7 automatically.** Await explicit stakeholder approval.

**Before production:**
1. Apply migration `015_epic6_workflow_automation.sql`  
2. Redeploy API + Web  
3. Confirm feature flag `workflows` enabled  

---

_Epic 6 complete. Awaiting approval before Epic 7._
