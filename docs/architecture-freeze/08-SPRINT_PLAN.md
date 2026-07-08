# 08 — SPRINT PLAN (Sprint 0–8)

**Product:** SEO OS  
**Version:** 1.0.0-FROZEN  
**Sprint Duration:** 1 week each (adjustable)  
**Rule:** Each sprint is independently reviewable — no big-bang merge

---

## Sprint Overview

| Sprint | Name                      | Goal                                     | Demoable?       |
| ------ | ------------------------- | ---------------------------------------- | --------------- |
| 0      | Monorepo Scaffold         | Runnable shell, CI, deploy               | Login only      |
| 1      | Auth + Projects + Shell   | Org, projects, nav, onboarding           | Create project  |
| 2      | Mission Control + Palette | Dashboard, ⌘K, animated onboarding       | Mission Control |
| 3      | Search + Providers        | Universal search, provider status        | Search works    |
| 4      | AI Core + Workforce       | Agents, SSE, timeline, collaboration     | Run agent       |
| 5      | Command Center + Notify   | AI chat, AI notifications                | Chat with AI    |
| 6      | Demo Mode + Executive     | Full demo seed, tour, exec dash, health  | Demo reset      |
| 7      | SEO Loop                  | KB, memory, prospects, outreach, content | End-to-end      |
| 8      | CEO Demo Hardening        | Reports, scan, E2E, rehearsal            | CEO script 100% |

---

## Sprint 0 — Monorepo Scaffold

**Goal:** Empty runnable platform with CI/CD and environments.

### Deliverables

- Turborepo: `apps/web`, `apps/api`, `packages/shared`, `packages/providers`, `packages/agent-contracts`
- Supabase project (us-east-1), extensions migration stub
- Express `/health`, `/ready`
- React shell: login placeholder, layout shell
- Netlify + Railway staging deploy
- GitHub Actions: lint, typecheck, build
- `.env.example` documented

### Definition of Done

- [ ] `npm run build` passes all packages
- [ ] `npm run dev` starts web + api locally
- [ ] Staging deploy auto on `main`
- [ ] `/health` returns 200 on staging
- [ ] No feature code beyond shell

### Review Gate

CTO reviews folder structure matches Infrastructure Freeze.

---

## Sprint 1 — Auth + Projects + Shell

**Goal:** Real auth, org, unlimited projects, sidebar navigation.

### Deliverables

- Supabase Auth (email + Google OAuth)
- Migrations 001–003: orgs, profiles, members, workspaces, settings
- RLS tests for tenancy tables
- Projects list + create + switcher
- Org team page (list members)
- Sidebar + topbar per UI Freeze
- RBAC middleware skeleton

### Definition of Done

- [ ] User signs up → creates org → creates project
- [ ] RLS test: User A cannot read User B project
- [ ] Project switcher changes URL context
- [ ] 5 org roles enforced on one test route
- [ ] Mobile bottom nav renders

### Review Gate

PM demos create org + 3 projects flow.

---

## Sprint 2 — Mission Control + Command Palette + Onboarding

**Goal:** Premium dashboard UX and first-run experience.

### Deliverables

- Mission Control page (KPI cards, widgets — static/mock data OK)
- Global ⌘K command palette (nav + 10 actions)
- Animated onboarding wizard (org → project → optional KB skip)
- `onboarding_progress` persistence
- Design tokens: Linear/Vercel-inspired spacing, subtle transitions
- Light + dark mode toggle
- Breadcrumbs, empty states, skeleton loaders

### Definition of Done

- [ ] Mission Control loads < 2s with skeleton → data
- [ ] ⌘K navigates to all primary routes
- [ ] Onboarding completes with animation (< 3 min path)
- [ ] Dark mode persists
- [ ] Lighthouse accessibility ≥ 90 on Mission Control
- [ ] `prefers-reduced-motion` respected

### Review Gate

UX Lead compares to Linear/Vercel quality bar.

---

## Sprint 3 — Universal Search + Provider Status

**Goal:** Find anything; show transparent data sourcing.

### Deliverables

- `search_index` table + sync triggers
- `GET /v1/search` with fuzzy + entity type filters
- Search UI in ⌘K + dedicated results page
- Provider Status Dashboard (`/projects/:id/system/providers`)
- `GET /v1/providers/status`
- Data source badges component (Live / Estimated / Demo)
- Provider registry: mock implementations default

### Definition of Done

- [ ] Search finds prospects, content, KB docs by title
- [ ] Provider dashboard shows all adapter statuses
- [ ] Every mock metric displays Demo badge
- [ ] Provider switch via env only — no code change

### Review Gate

Principal Engineer verifies provider interfaces compile.

---

## Sprint 4 — AI Core + Workforce + Thinking Panel

**Goal:** AI runs, streams, collaborates visibly.

### Deliverables

- Migrations 006–007: agent tables, ai_settings, usage ledger
- Gemini + Ollama + AI router (Vercel AI SDK)
- 14 agent definitions seeded
- Agent catalog, run detail, SSE thinking panel
- AI Activity Timeline on Mission Control
- Live AI Workforce panel (agent status nodes)
- Agent run steps (parent/child — collaboration visibility)
- QA agent gate on external outputs
- Output JSON schema validation

### Definition of Done

- [ ] Run Prospect Discovery → SSE stream → artifact saved
- [ ] Thinking panel shows steps + tokens
- [ ] Workforce panel shows running agent pulse
- [ ] Child run linked to parent in UI
- [ ] Failed run shows error + retry
- [ ] Token usage in ai_usage_ledger
- [ ] Ollama fallback works when Gemini key removed

### Review Gate

CEO preview: agent run live or replay.

---

## Sprint 5 — AI Command Center + AI Notifications

**Goal:** Conversational AI control layer.

### Deliverables

- Migrations: `ai_conversations`, `ai_messages`
- `POST /v1/projects/:id/ai/chat` (stream)
- Command Center UI: chat sidebar or full page
- Intent routing: @agent mentions + keyword detection → agent runs
- RAG + memory injected into chat context
- AI-specific notifications (agent done, failed, approval needed)
- Notification bell + preferences

### Definition of Done

- [ ] User asks "find guest post opportunities" → routes to prospect_discovery
- [ ] Chat streams response with citations from KB
- [ ] @ceo, @seo_strategist mentions work
- [ ] Demo replay provides canned chat if Gemini down
- [ ] Notification fires on agent complete
- [ ] Prompt injection boundaries enforced

### Review Gate

PM demos 3 chat intents from CEO script.

---

## Sprint 6 — Demo Mode + Executive + Health + Tour

**Goal:** CEO-safe demo environment.

### Deliverables

- `demo_scenarios` seed migration 021 (hero data)
- `POST /v1/demo/seed`, `POST /v1/demo/reset`
- Demo Mode banner + hybrid replay auto-fallback
- Executive Dashboard (`/org/executive`)
- AI Health Monitor widget (Gemini, Ollama, queue, DB)
- `GET /v1/system/health`, `GET /v1/system/queues`
- Guided tour (driver.js, 10 steps, `data-tour`)
- Mission Control checklist widget

### Definition of Done

- [ ] Demo reset restores hero project in < 60s
- [ ] App fully usable in `replay` mode offline
- [ ] Executive dashboard aggregates 2+ projects
- [ ] Health monitor shows green/yellow/red
- [ ] Tour completes all 10 steps
- [ ] E2E test: demo reset → mission control loads

### Review Gate

Presenter runs pre-demo checklist once.

---

## Sprint 7 — SEO Workflow Loop

**Goal:** Complete product loop for demo script steps 2–15.

### Deliverables

- KB upload, RAG search (migrations 008)
- AI Memory timeline + facts
- Competitors, keywords, prospects CRUD + pipeline
- Mock discovery agent integration
- Outreach: drafts, approvals, mock send
- Content Studio: guest post generate
- Backlink Builder overview (2 categories)
- Analytics dashboards (real + estimated)
- Quick scan: `POST /technical/quick-scan`
- Gmail OAuth (optional — mock default)

### Definition of Done

- [ ] KB search returns seeded Product Overview content
- [ ] 47 prospects visible in pipeline
- [ ] Email draft → approve → mock send
- [ ] Guest post generates with KB citations
- [ ] Quick scan completes 10 pages or shows cache
- [ ] Analytics shows 90-day trend

### Review Gate

Full demo script walkthrough (without reports PDF).

---

## Sprint 8 — CEO Demo Hardening

**Goal:** 100% reliable CEO presentation.

### Deliverables

- PDF report generation (Reporting Agent + Playwright PDF)
- 4 KB seed documents (real content, not lorem)
- All 14 agent demo scenarios in `demo_scenarios`
- Playwright E2E: full 18-min CEO script
- Performance pass: Mission Control < 2s
- Security pass: RLS full matrix, threat mitigations
- DR restore drill documented
- Railway hobby plan live (no sleep)
- Presenter runbook rehearsed 2x

### Definition of Done

- [ ] CEO demo E2E passes 3x consecutive on staging
- [ ] Hybrid fallback tested (Gemini disabled)
- [ ] PDF report downloads
- [ ] All 16 showcase features demonstrable
- [ ] No P0 bugs open
- [ ] Architecture Freeze checklists 100%
- [ ] Readiness score ≥ 95%

### Review Gate

**CEO Demo Freeze sign-off** — Go/No-Go for investment narrative.

---

## Post-Sprint 8 (Alpha Backlog — Not MVP)

- Sprint 9: Workspace-level RBAC
- Sprint 10: GSC CSV + OAuth
- Sprint 11: Stripe billing
- Sprint 12: White-label reports
- Sprint 13: Automations builder
- Sprint 14: Public API v1

---

## Sprint Dependencies

```
S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
              ↘ S3 can parallel S4 start (search vs AI after S2)
S6 depends on S4 (agents) + S1 (orgs)
S7 depends on S4 + S5
S8 depends on all
```

---

## Sprint Review Ceremony (Each Sprint)

1. Demo to PM + CTO (15 min)
2. DoD checklist review
3. Update readiness score if needed
4. Go/No-Go next sprint

---

_Aligned with Product Freeze v1.1.0 and CEO Demo Freeze v1.1.0_
