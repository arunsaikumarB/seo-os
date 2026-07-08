# 01 — PRODUCT FREEZE

**Product:** SEO OS (working title)  
**Tagline:** _The AI Workforce for SEO Teams_  
**Document Type:** Architecture Freeze — Product Scope  
**Version:** 1.1.0-FROZEN  
**Status:** Approved — Pending Formal Sign-Off  
**Effective:** Locks all MVP scope decisions

---

## Purpose

Lock product scope, naming, personas, modules, roles, MVP priorities, and release boundaries. All engineering, design, and QA work must trace to this document.

---

## Final Decisions

### D1 — Product Identity

| Decision         | Value                                             |
| ---------------- | ------------------------------------------------- |
| Product name     | **SEO OS** (working title)                        |
| Tagline          | **The AI Workforce for SEO Teams**                |
| Category         | Enterprise Modular SaaS — AI SEO Operating System |
| Architecture     | Multi-tenant, modular, provider-agnostic          |
| Deployment model | Multi-tenant (org → unlimited projects)           |
| MVP stage        | Proof of Concept + CEO Demo → Private Alpha       |
| Revenue          | Pre-revenue; no Stripe in MVP                     |

### D2 — Tenancy & Scale (FROZEN)

| Entity                      | Limit MVP       | Limit GA                            |
| --------------------------- | --------------- | ----------------------------------- |
| Organizations               | Unlimited       | Unlimited                           |
| Projects / websites per org | Unlimited       | Unlimited (fair-use meters post-GA) |
| Team members per org        | Unlimited       | Unlimited (seat metering post-GA)   |
| Agency support              | **Yes — P0**    | Yes                                 |
| White-label                 | **Future — GA** | Yes (agency/enterprise)             |

### D3 — Naming Convention (FROZEN)

| Layer               | Term                   | Rule                      |
| ------------------- | ---------------------- | ------------------------- |
| User-facing UI      | **Project**            | One project = one website |
| Database / internal | `workspaces`           | Table name only           |
| API paths           | `/projects/:projectId` | Never `/workspace/`       |
| API JSON            | `projectId`            | Maps to `workspaces.id`   |

### D4 — MVP Priorities (FROZEN — Ordered)

1. **Great UX** — enterprise-grade, Linear/Vercel-quality polish
2. **AI experience** — workforce, thinking panel, command center, collaboration visibility
3. **Demo quality** — Demo Mode must never fail CEO presentation
4. **Future scalability** — adapters, modular monorepo; perfect production scale **not** required for MVP

### D5 — Free-First Policy (FROZEN)

1. Open source → 2. Self-hosted → 3. Free tier → 4. Paid (adapters only, never coupled logic)

All paid providers behind interfaces. Business logic never imports vendor SDKs directly.

### D6 — Core Principles (Non-Negotiable)

1. Quality over volume in outreach
2. Human approval before external email send (default, non-bypassable MVP)
3. Transparent data sourcing — Live / Estimated / Demo badges on all metrics
4. Free-first infrastructure — no paid SEO APIs in MVP
5. Provider adapter pattern for all external services
6. Versioned AI artifacts + audit trail
7. **Demo Mode** — full app functional without live providers

### D7 — MVP Showcase Features (FROZEN — All Mandatory)

| Feature                                 | MVP | Sprint |
| --------------------------------------- | --- | ------ |
| Mission Control dashboard               | ✅  | 2      |
| Live AI Workforce panel                 | ✅  | 4      |
| AI Thinking panel (SSE)                 | ✅  | 4      |
| AI Activity Timeline                    | ✅  | 4      |
| **AI Command Center (chat)**            | ✅  | 5      |
| Universal Search                        | ✅  | 3      |
| Global Command Palette (⌘K)             | ✅  | 2      |
| **Demo Mode** (full stack)              | ✅  | 6      |
| Executive Dashboard                     | ✅  | 6      |
| Live Website Scanner (quick scan)       | ✅  | 7      |
| AI Health Monitor                       | ✅  | 6      |
| Provider Status Dashboard               | ✅  | 3      |
| Guided Product Tour                     | ✅  | 6      |
| Animated onboarding                     | ✅  | 2      |
| AI Notifications                        | ✅  | 5      |
| AI Collaboration (agent DAG visibility) | ✅  | 4      |

### D8 — Module Scope Matrix (FROZEN)

| Module                   | MVP                       | Alpha            | GA v1         |
| ------------------------ | ------------------------- | ---------------- | ------------- |
| Mission Control          | ✅                        | ✅               | ✅            |
| Projects                 | ✅ Unlimited              | ✅               | ✅            |
| AI Agents (14)           | ✅                        | ✅               | ✅            |
| AI Command Center        | ✅                        | ✅               | ✅            |
| Knowledge Base           | ✅                        | ✅               | ✅            |
| AI Memory                | ✅                        | ✅               | ✅            |
| Prospect Discovery       | ✅                        | ✅               | ✅            |
| Backlink Builder         | ⚡ 2 categories           | Expand           | Full 50+      |
| Content Studio           | ✅                        | ✅               | ✅            |
| Outreach                 | ✅ Mock + Gmail opt       | ✅               | ✅            |
| Technical SEO            | ⚡ Quick scan + 500 crawl | ✅               | ✅            |
| Competitor Intelligence  | ✅ Mock                   | BYO key          | Live APIs     |
| Analytics                | ✅                        | ✅               | ✅            |
| Reports                  | ✅ PDF                    | ✅               | ✅            |
| Team / RBAC              | ✅ Org-level              | + workspace RBAC | ✅            |
| Demo Mode                | ✅                        | ✅               | ✅            |
| Notifications (AI-aware) | ✅                        | ✅               | ✅            |
| Onboarding (animated)    | ✅                        | ✅               | ✅            |
| Automations              | ❌ Coming Soon            | ❌               | ✅            |
| Marketplace              | ❌ Coming Soon            | ❌               | ✅            |
| Billing / Stripe         | ❌                        | ❌               | ✅            |
| White-label              | ❌                        | ⚡ Reports only  | ✅            |
| SSO                      | ❌                        | ❌               | ✅ Enterprise |

### D9 — Demo Mode Requirements (FROZEN)

Demo Mode provides complete pre-seeded experience:

- Demo organizations
- Demo projects
- Demo competitors, keywords, prospects
- Demo AI Memory + Knowledge Base
- Demo reports + analytics
- Demo outreach + backlinks
- AI Activity Timeline + Live AI Workforce
- Demo data badges on all estimated metrics
- **Functions when live providers (Gemini, Gmail, crawl) are unavailable** via hybrid replay

Toggle: org-level `demo_enabled` + modes `live` | `hybrid` | `replay`

### D10 — Backlink Builder MVP Categories

**Enabled:** Outreach-Based (6 types) + Content-Based (4 types)  
**Locked (Coming Soon UI):** All other categories — no DB writes

### D11 — User Roles (Org-Level MVP)

Owner | Admin | Manager | Member | Viewer — per frozen RBAC matrix in API Freeze.  
**Members can run agents:** **Yes** (resolved PQ-2).  
**Workspace-level RBAC:** Alpha (Sprint 9+).

### D12 — AI Stack (FROZEN)

| Layer    | Provider                   | Label                      |
| -------- | -------------------------- | -------------------------- |
| Primary  | Gemini Free API            | FREE TIER                  |
| Fallback | Ollama                     | SELF HOSTED                |
| Future   | OpenAI                     | FUTURE PAID (adapter stub) |
| Routing  | Provider abstraction layer | Required                   |

### D13 — Non-Goals (MVP)

Mass email spam, auto forum posting, paid SEO APIs, Stripe, SSO, functional marketplace, on-prem, cross-project memory, black-hat automation, perfect multi-region HA.

### D14 — Resolved Open Questions

| ID   | Decision                                                      |
| ---- | ------------------------------------------------------------- |
| PQ-1 | Supabase region: **us-east-1**                                |
| PQ-2 | Members run agents: **Yes**                                   |
| PQ-3 | CEO demo email send: **Mock primary**; Gmail optional staging |

---

## Assumptions

1. CEO demo gates investment; Demo Mode is insurance
2. English-only MVP
3. Unlimited projects = no hard cap; UI performant to ~100 projects/org
4. White-label is post-GA; architecture accommodates it
5. AI Command Center is structured chat with agent routing — not unbounded autonomous agent

---

## Risks

| Risk                                 | Mitigation                       |
| ------------------------------------ | -------------------------------- |
| MVP scope increased (Command Center) | Sprint plan isolates to Sprint 5 |
| Unlimited projects UI perf           | Virtualized lists, pagination    |
| Demo vs live confusion               | Badges + Demo Mode banner        |

---

## Open Questions

**None.** All product questions resolved. See `00-FREEZE_INDEX` for cross-doc tracker.

---

## Review Checklist

- [x] Tagline and product name frozen
- [x] Unlimited orgs/projects frozen
- [x] Agency + future white-label noted
- [x] All 16 showcase features in MVP scope
- [x] Demo Mode requirements complete
- [x] MVP priorities ordered
- [x] Open questions resolved

---

## Sign-Off Criteria

| Role | Sign-Off |
| ---- | -------- |
| CEO  | ☐        |
| CTO  | ☐        |
| PM   | ☐        |

---

_Version 1.1.0 — supersedes v1.0.0_
