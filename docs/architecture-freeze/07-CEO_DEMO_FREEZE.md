# 07 — CEO DEMO FREEZE

**Product:** SEO OS  
**Document Type:** Architecture Freeze — CEO Presentation & Demo Reliability  
**Version:** 1.1.0-FROZEN  
**Status:** Approved — Pending Formal Sign-Off  
**Priority:** **HIGHEST** — Demo failure blocks investment decision

---

## Purpose

Define a **complete, reliable, premium 15–20 minute CEO presentation** that succeeds even when Gemini, Gmail, Railway, or Supabase experience issues. This document is authoritative for demo UX, data, scripts, and fallbacks.

---

## Final Decisions

### D1 — Demo Objectives (FROZEN)

| Objective                                   | Success Signal                                                       |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Prove "AI SEO Operating System" positioning | CEO can articulate difference from Ahrefs + Pitchbox                 |
| Show end-to-end workflow in one product     | Single login → project → agent → prospect → email → content → report |
| Demonstrate AI moat                         | Memory + KB grounding visible in outputs                             |
| Show enterprise readiness                   | Mission Control, audit, RBAC, data badges                            |
| De-risk technical bet                       | Provider adapters + mock/live transparency                           |
| Survive external API failures               | **Zero demo-blocking failures** via hybrid replay mode               |

### D2 — Demo Environment (FROZEN)

| Setting           | Value                                               |
| ----------------- | --------------------------------------------------- |
| URL               | `https://demo.seoos.io`                             |
| API               | `https://demo-api.seoos.io`                         |
| Database          | Supabase `demo` project                             |
| Default mode      | **`hybrid`** — live AI with auto-fallback to replay |
| Demo org flag     | `organizations.settings.demo_enabled = true`        |
| Pre-warm          | 10 minutes before presentation                      |
| Presenter account | `ceo-demo@acme-agency.test` (Owner)                 |

### D3 — Demo Accounts (FROZEN)

| Account                       | Role    | Purpose                                   |
| ----------------------------- | ------- | ----------------------------------------- |
| `ceo-demo@acme-agency.test`   | Owner   | Primary presenter                         |
| `strategist@acme-agency.test` | Manager | Show approval workflow handoff (optional) |
| `viewer@acme-agency.test`     | Viewer  | Quick RBAC flash (optional, 30s)          |

**Password:** Stored in team vault — not in repo.  
**Seed:** Migration 021 creates all three.

### D4 — Hero Organization (FROZEN)

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| Org name        | **Acme Agency**                            |
| Slug            | `acme-agency`                              |
| Industry        | Digital Marketing / SEO Agency             |
| Plan badge      | **Demo Pro** (cosmetic)                    |
| Team size shown | 8 members (3 seeded, 5 "pending" cosmetic) |
| `demo_enabled`  | true                                       |
| `provider_mode` | hybrid                                     |

### D5 — Hero Project (FROZEN)

| Field        | Value                                                        |
| ------------ | ------------------------------------------------------------ |
| Project name | **FlowTask — SaaS Client**                                   |
| Domain       | `flowtask.io`                                                |
| URL          | `https://flowtask.io`                                        |
| Industry     | B2B SaaS — Project Management                                |
| Description  | Mid-market project management platform for engineering teams |
| Fixed UUID   | `11111111-1111-1111-1111-111111111001`                       |

**Secondary project (sparse — for agency scale flash):**

| Field  | Value                                                      |
| ------ | ---------------------------------------------------------- |
| Name   | **Bright Smile Dental**                                    |
| Domain | `brightsmile-dental.com`                                   |
| UUID   | `11111111-1111-1111-1111-111111111002`                     |
| Data   | Empty pipeline — show "12 client projects" scale narrative |

### D6 — Pre-Seeded Demo Data (FROZEN)

#### Competitors (3)

| Domain        | Name       | Priority |
| ------------- | ---------- | -------- |
| `asana.com`   | Asana      | High     |
| `monday.com`  | Monday.com | High     |
| `clickup.com` | ClickUp    | Medium   |

#### Keywords (12 — sample)

`project management software`, `team collaboration tools`, `engineering project tracking`, `agile project management`, `saas productivity`, + 7 more seeded

#### Prospects (47 total — varied stages)

| Status    | Count |
| --------- | ----- |
| new       | 12    |
| qualified | 15    |
| contacted | 10    |
| replied   | 5     |
| won       | 3     |
| lost      | 2     |

**Hero prospect (for live demo actions):**

| Field   | Value                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain  | `techproductivity.com`                                                                                                                      |
| Contact | `Sarah Chen`, `editor@techproductivity.com`                                                                                                 |
| Type    | Guest Post Outreach                                                                                                                         |
| Score   | 92                                                                                                                                          |
| UUID    | `22222222-2222-2222-2222-222222222001`                                                                                                      |
| Summary | "High-authority productivity blog accepting guest contributions. Recent article on remote team workflows aligns with FlowTask positioning." |

#### Backlinks (12)

| Status  | Count |
| ------- | ----- |
| live    | 8     |
| lost    | 2     |
| pending | 2     |

#### Campaigns (2)

1. **"Q3 Guest Post Push"** — active, 18 prospects, 34% reply rate (demo)
2. **"Resource Page Outreach"** — paused, 8 prospects

#### Pending Approvals (5)

- 3 outreach emails (including hero prospect draft)
- 1 guest post content piece
- 1 QA-reviewed email revision

#### Knowledge Base (4 documents — pre-indexed)

| Document                        | Type | Purpose for demo   |
| ------------------------------- | ---- | ------------------ |
| `FlowTask Product Overview.pdf` | PDF  | KB search demo     |
| `Brand Voice Guidelines.md`     | MD   | AI grounding       |
| `Services & Pricing.md`         | MD   | Outreach accuracy  |
| `Case Study — Acme Corp.md`     | MD   | Content generation |

**KB search demo query (frozen):**  
_"What are FlowTask's main features for engineering teams?"_  
**Expected answer cites:** Product Overview PDF, features section.

#### AI Memory (pre-seeded)

| Type             | Count | Example                                                                        |
| ---------------- | ----- | ------------------------------------------------------------------------------ |
| Episodic entries | 20    | "Outreach to editor@devblog.io — replied positive"                             |
| Approved facts   | 8     | "Short subject lines (<40 chars) outperform for SaaS editors by 2x reply rate" |

#### Agent Runs (historical — 15)

- 10 completed (mix of agent types)
- 2 running (cosmetic — will show completed in demo)
- 1 failed (show error handling UX — optional deep dive)
- 2 pending approval artifacts

#### Analytics

- 90 days `metric_snapshots` seeded with upward trends
- Reply rate: 34% (demo narrative)
- Backlinks won: +12 this quarter
- DA trend: 38 → 42 (badge: **Estimated**)

#### Reports (2 pre-generated)

1. Monthly SEO Summary — June 2026 (PDF ready)
2. Outreach Activity Report (PDF ready)

### D7 — Mission Control (Demo Landing — FROZEN)

**Presenter lands on:** `/projects/11111111-...-1001/mission-control`

**Must display on load (< 2s with cache):**

- CEO Briefing (pre-generated, dated today)
- 4 KPI cards with sparklines
- Outreach funnel chart
- AI Activity Timeline (last 10 runs)
- Approval Queue (5 items)
- AI Workforce panel (2 agents "active" cosmetic pulse)

### D8 — Presentation Script (FROZEN — 18 Minutes)

| Min   | Step                        | Screen                                | Narration Focus                            | Mode             |
| ----- | --------------------------- | ------------------------------------- | ------------------------------------------ | ---------------- |
| 0:00  | Login                       | `/login`                              | "One platform for entire SEO operation"    | Live             |
| 0:30  | Mission Control             | Mission Control                       | Agency scale, KPIs, AI timeline            | Live             |
| 1:00  | **AI Command Center**       | `/command-center`                     | "@ceo prioritize link building" + delegate | Hybrid           |
| 1:30  | **Mission Control tour**    | Mission Control                       | Workforce panel, approvals                 | Live             |
| 2:00  | KB search                   | Knowledge search                      | "AI knows the client's real product"       | Live             |
| 2:30  | Memory                      | Memory facts                          | "Platform learns from every campaign"      | Live             |
| 3:30  | Competitors                 | Competitors list                      | Competitive intelligence                   | Live (demo data) |
| 4:30  | **Competitor Intelligence** | Agent + thinking + collaboration tree | Agent collaboration visible                | Hybrid           |
| 6:30  | Prospects                   | Pipeline                              | "47 qualified opportunities"               | Live             |
| 7:30  | Hero prospect               | Prospect detail                       | Score, AI summary                          | Live             |
| 8:30  | **Email Personalization**   | Agent + thinking panel                | KB-grounded draft                          | Hybrid           |
| 10:00 | Approvals + mock send       | Approvals                             | Human-in-the-loop                          | Mock send        |
| 10:30 | Content Studio              | Guest post                            | AI draft with citations                    | Hybrid           |
| 11:30 | **Quick Live Scan**         | Technical quick-scan                  | Real crawl wow moment                      | Live/cache       |
| 12:30 | Analytics                   | Analytics                             | ROI, labeled estimates                     | Live             |
| 13:30 | Report PDF                  | Reports                               | Client deliverable                         | Live/replay      |
| 14:30 | Executive                   | `/org/executive`                      | Multi-client rollup                        | Live             |
| 15:30 | Provider + AI Health        | System dashboards                     | Adapters + Gemini status                   | Live             |
| 16:30 | ⌘K palette                  | Command palette                       | Power-user UX                              | Live             |
| 17:00 | Close                       | Mission Control                       | "AI Workforce for SEO Teams"               | Live             |

**Total: ~17 minutes + buffer**

### D9 — Walkthrough Mode (FROZEN)

**Library:** driver.js (FREE, OSS)

| Step | Anchor `data-tour`     | Highlight         |
| ---- | ---------------------- | ----------------- |
| 1    | `tour-mission-control` | Full dashboard    |
| 2    | `tour-ceo-briefing`    | CEO Agent card    |
| 3    | `tour-approval-queue`  | Pending approvals |
| 4    | `tour-ai-workforce`    | Agent panel       |
| 5    | `tour-kb-nav`          | Sidebar Knowledge |
| 6    | `tour-agents-nav`      | Sidebar Agents    |
| 7    | `tour-prospects-nav`   | Sidebar Prospects |
| 8    | `tour-outreach-nav`    | Sidebar Outreach  |
| 9    | `tour-analytics-nav`   | Sidebar Analytics |
| 10   | `tour-command-palette` | ⌘K hint           |

**Trigger:** Auto on first login to demo org; manual "Restart Tour" in user menu.  
**Skip:** Always allowed.  
**Presenter shortcut:** `Shift + T` toggles tour off instantly.

### D10 — Command Palette Actions (FROZEN — MVP Demo Set)

| Command                     | Action                 |
| --------------------------- | ---------------------- |
| Go to Mission Control       | Navigate               |
| Go to Prospects             | Navigate               |
| Run Prospect Discovery      | Start agent (replay)   |
| Run Competitor Intelligence | Start agent (replay)   |
| Run Email Personalization   | Start on hero prospect |
| Open Approval Queue         | Navigate               |
| Generate Report             | Navigate to new report |
| Search prospects...         | Fuzzy search           |
| Toggle Demo Mode banner     | Show/hide              |
| Reset Demo Data             | Admin only — confirm   |

### D11 — AI Thinking Panel (FROZEN)

**UX:**

- Opens automatically on agent run
- Shows: step labels ("Building context", "Searching knowledge base", "Generating draft")
- SSE token stream (or replay chunks in demo mode)
- Elapsed timer
- Token count incrementing
- Cancel button (Manager+)
- On complete: "View Artifact" CTA

**Demo reliability:** If live stream fails in first 3s → auto-switch to replay chunks without user-visible error (log internally).

### D12 — AI Command Center (FROZEN — MVP Mandatory)

**Route:** `/projects/:id/command-center`

**Demo script (minute 1:30–2:30):**

1. Open Command Center
2. Ask: _"What should we prioritize for FlowTask link building this quarter?"_
3. @ceo routing → streamed strategic answer
4. Follow-up: _"@prospect_discovery find guest post opportunities"_ → agent delegation → Thinking panel

**Demo replay:** `demo_scenarios` type `chat` if Gemini down.

**Narration:** _"Your AI workforce on demand — grounded in your data, delegates to specialists."_

**Also retain:** CEO Briefing on Mission Control, KB search, prospect-level AI actions.

### D13 — Demo Mode & Replay (FROZEN)

| Setting                            | Behavior                                       |
| ---------------------------------- | ---------------------------------------------- |
| `organizations.settings.demo_mode` | `hybrid` \| `live` \| `replay`                 |
| **hybrid (default)**               | Try live Gemini 3s → fallback replay           |
| **replay**                         | All agents use `demo_scenarios` canned streams |
| **live**                           | No fallback — staging only                     |

**Demo scenarios table** — minimum 1 scenario per agent type × hero project:

| agent_type              | scenario_name            | duration   |
| ----------------------- | ------------------------ | ---------- |
| ceo                     | `briefing_flowtask_q3`   | 8s stream  |
| competitor_intelligence | `asana_gap_analysis`     | 25s stream |
| prospect_discovery      | `discover_47_prospects`  | 30s stream |
| email_personalization   | `sarah_chen_guest_post`  | 15s stream |
| guest_post_writer       | `remote_teams_article`   | 20s stream |
| reporting               | `june_monthly_report`    | 12s stream |
| qa                      | `email_qa_pass`          | 5s stream  |
| + 7 more                | one each remaining agent | 5–15s      |

**Reset demo:** `POST /v1/demo/reset` — restores hero project to seed state in < 60s.  
**Presenter rehearsal:** Reset before every practice run.

### D14 — Fallback Scenarios (FROZEN)

| Failure                 | User-Visible Behavior                | Presenter Action                   |
| ----------------------- | ------------------------------------ | ---------------------------------- |
| Gemini 429/5xx          | Seamless replay stream               | Continue — no mention              |
| Gemini slow (>5s)       | "Thinking..." + replay               | Continue                           |
| Gmail OAuth down        | Mock send — toast "Sent (demo mode)" | Say "production uses Gmail"        |
| Railway cold start      | 15s load — use pre-warmed tab        | Open tab 10 min early              |
| Supabase pause          | Switch to local backup env           | **Disaster** — restore before demo |
| Playwright verify fails | Show last successful check seeded    | Skip live verify                   |
| Quick scan fails        | Show cached scan from 24h ago        | "Ran this morning"                 |
| SSE disconnect          | Auto-reconnect; resume replay        | Refresh if needed                  |
| Wrong account           | N/A                                  | Use bookmarked demo URL            |

**Golden rule:** Presenter never debugs on screen. If failure visible → skip step, use pre-baked artifact.

### D15 — Quick Live Scan (FROZEN)

**Endpoint:** `POST /v1/projects/:id/technical/quick-scan`

| Setting         | Value                                       |
| --------------- | ------------------------------------------- |
| Max pages       | 10                                          |
| Target          | `flowtask.io` OR presenter-verified domain  |
| Duration target | < 30 seconds                                |
| Animation       | Progress bar + pages found counter          |
| Fallback        | Cached `crawl_runs` from seed if live fails |

**Narration:** "Real technical crawl — not simulated."

### D16 — Executive Dashboard (FROZEN)

**Route:** `/org/executive`

**Widgets:**

- Total projects: 12 (10 cosmetic + 2 seeded)
- Aggregate backlinks this month
- Aggregate reply rate
- Top performing project
- AI tokens used org-wide
- Projects needing attention (approvals pending)

**Data:** Aggregated from seeded projects + cosmetic multipliers.

### D17 — Provider Status Dashboard (FROZEN)

**Route:** `/projects/:id/system/providers`

| Provider      | Display       | Status                     |
| ------------- | ------------- | -------------------------- |
| Backlink data | Mock Provider | ✅ Demo Data               |
| SERP          | Mock Provider | ✅ Demo Data               |
| AI            | Gemini        | ✅ Connected / ⚠️ Fallback |
| Embeddings    | Gemini        | ✅                         |
| Email         | Mock/Gmail    | ✅                         |
| Crawl         | Live          | ✅ / domain required       |

**Purpose:** CEO sees honest transparency + adapter architecture story.

### D18 — Reports (Demo — FROZEN)

**Live generate:** June 2026 Monthly Summary (triggers Reporting Agent — replay 12s)  
**Pre-baked:** PDF already in Storage — download works if generate fails

**Report must include:**

- Executive summary (CEO Agent tone)
- Backlink chart
- Outreach metrics
- AI activity summary
- Data sources footnote ("Estimated metrics labeled")

### D19 — Onboarding (Demo — FROZEN)

**CEO demo skips onboarding** — lands on Mission Control.

**Optional 60s flash:** "New client setup in 2 minutes" — show create project wizard on **secondary empty project** if time permits.

**Animated onboarding** plays for new non-demo signups only.

### D20 — Achievement / Progress (FROZEN — Light)

**Onboarding checklist on Mission Control (cosmetic for demo):**

- ✅ Upload knowledge base
- ✅ Add competitors
- ✅ Run first agent
- ✅ Send first outreach
- ⬜ Win first backlink (narrative: "in progress")

**No gamification badges in MVP** — checklist only.

### D21 — Pre-Demo Checklist (FROZEN — Presenter Runbook)

**T-24 hours:**

- [ ] Run `POST /v1/demo/reset` on demo environment
- [ ] Verify all 4 KB documents indexed
- [ ] Run CEO demo E2E test on staging — 100% pass
- [ ] Confirm Gemini quota remaining
- [ ] Confirm Railway on hobby plan (no sleep)

**T-1 hour:**

- [ ] Reset demo data again
- [ ] Login presenter account — verify Mission Control loads
- [ ] Open hero prospect — verify draft exists
- [ ] Test ⌘K command palette
- [ ] Disable browser extensions / notifications
- [ ] Full screen, zoom 100%

**T-10 minutes:**

- [ ] Hit `/ready` — green
- [ ] Open Mission Control tab (keep warm)
- [ ] Open second tab: hero prospect detail
- [ ] Phone on silent

**T-0:** Follow script D8.

### D22 — Post-Demo (FROZEN)

- Leave demo environment running 24h for CEO follow-up access
- Do not reset until CEO confirms done
- Capture CEO questions → backlog for Alpha

---

## Assumptions

1. CEO presentation is 15–20 minutes with 5 min buffer
2. CEO uses provided demo account — does not type
3. Presenter drives all interactions
4. Internet available in presentation room
5. Backup laptop with same bookmarks configured
6. Hybrid replay mode is acceptable — CEO told "production uses live AI" once

---

## Risks

| Risk                          | Mitigation                                            |
| ----------------------------- | ----------------------------------------------------- |
| CEO asks "is this real data?" | Transparent badges + live quick scan                  |
| CEO asks "why not ChatGPT?"   | KB grounding + memory + workflow demo                 |
| CEO asks about Ahrefs         | Provider status screen + adapter story                |
| CEO wants to type in AI chat  | CEO Briefing regenerate + roadmap answer              |
| Demo reset mid-presentation   | Disable reset button for presenter role during window |
| Over-rehearsed feels scripted | Vary narration; live quick scan is genuinely live     |

---

## Resolved Open Questions

| ID    | Decision                                                           |
| ----- | ------------------------------------------------------------------ |
| CDQ-1 | Email send in CEO demo: **Mock only**                              |
| CDQ-2 | Hero domain: **flowtask.io** (presenter-owned test domain)         |
| CDQ-3 | Approval handoff second presenter: **Optional strategist account** |

## Open Questions

**None.**

---

## Review Checklist

- [ ] Hero org, project, prospect UUIDs frozen
- [ ] 47 prospects seeded with correct pipeline distribution
- [ ] 4 KB documents content written (not lorem ipsum)
- [ ] Demo scenario per agent type in `demo_scenarios`
- [ ] 18-minute script timed in rehearsal
- [ ] Walkthrough 10 steps with `data-tour` attributes defined
- [ ] Fallback table rehearsed for top 3 failures
- [ ] E2E Playwright test automates script D8
- [ ] Executive dashboard shows agency scale
- [ ] Provider status screen tells adapter story
- [ ] Pre-demo checklist assigned to owner
- [ ] Hybrid mode auto-fallback tested

---

## Sign-Off Criteria

| Role               | Criteria                                    | Sign-Off |
| ------------------ | ------------------------------------------- | -------- |
| CEO                | Script aligns with investment narrative     | ☐        |
| PM                 | Demo proves all frozen MVP modules          | ☐        |
| UX Lead            | Mission Control + thinking panel approved   | ☐        |
| Principal Engineer | Replay fallback tested                      | ☐        |
| DevOps             | Pre-warm + reset procedures validated       | ☐        |
| Presenter          | Full rehearsal completed 2x without failure | ☐        |

**CEO Demo Freeze is the last document to sign before implementation.**

---

_This document supersedes all prior demo narratives. Implementation must prioritize CEO Demo checklist items in Week 7–8._
