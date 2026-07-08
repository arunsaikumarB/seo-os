# 02 — UI/UX FREEZE

**Product:** SEO OS — _The AI Workforce for SEO Teams_  
**Document Type:** Architecture Freeze — User Interface & Experience  
**Version:** 1.1.0-FROZEN  
**Status:** Approved — Pending Formal Sign-Off

---

## Purpose

Lock navigation, page inventory, design system, interaction patterns, responsive behavior, accessibility baseline, and CEO-facing UX for MVP implementation.

---

## Final Decisions

### D1 — Design System

| Element           | Decision                                                 |
| ----------------- | -------------------------------------------------------- |
| Component library | shadcn/ui + Tailwind CSS                                 |
| Font              | Inter (UI), JetBrains Mono (code/IDs)                    |
| Icons             | Lucide React                                             |
| Charts            | Recharts                                                 |
| Toasts            | Sonner                                                   |
| Forms             | react-hook-form + Zod (schemas from `packages/shared`)   |
| Themes            | Light (default) + Dark — user toggle + system preference |
| Density           | Comfortable (default); compact deferred                  |

**Design inspiration (FROZEN):** Linear, Vercel, Notion, GitHub, Stripe Dashboard, Cursor.

**Visual principles:**

- Generous whitespace, subtle borders (`border-border/60`)
- Muted backgrounds for depth; single accent (indigo)
- Typography hierarchy: clear H1 → caption scale
- **Animations:** Subtle, 150–200ms, `ease-out` — page fade, modal scale, skeleton shimmer
- No gratuitous motion; respect `prefers-reduced-motion`
- Enterprise data density without clutter — Stripe-style tables

### D2 — Route Convention (FROZEN)

All project-scoped routes use `/projects/:projectId/...`  
Org-scoped routes use `/org/...`  
Auth routes: `/login`, `/signup`, `/invite/:token`, `/onboarding/*`

### D3 — Navigation Tree (MVP — Implemented Routes Only)

```
/login, /signup, /invite/:token
/onboarding/organization
/onboarding/project

/projects                                    [Org: all projects]
/org/team
/org/settings/general
/org/settings/notifications
/org/settings/security
/org/executive                              [Agency rollup — MVP]
/org/audit-log
/org/integrations                           [Gmail + stubs]
/org/billing                              [Coming Soon page only]

/projects/:projectId/mission-control        [Primary dashboard — MVP]
/projects/:projectId/command-center         [AI Command Center chat — MVP]
/projects/:projectId/search                 [Universal search results]
/projects/:projectId/system/providers       [Provider status — MVP]
/projects/:projectId/system/health          [AI Health Monitor — MVP]
/projects/:projectId/agents/catalog
/projects/:projectId/agents/runs
/projects/:projectId/agents/runs/:runId
/projects/:projectId/knowledge/library
/projects/:projectId/knowledge/search
/projects/:projectId/memory/timeline
/projects/:projectId/memory/facts
/projects/:projectId/prospects/pipeline
/projects/:projectId/prospects/:prospectId
/projects/:projectId/content/library
/projects/:projectId/content/:contentId
/projects/:projectId/outreach/inbox
/projects/:projectId/outreach/approvals
/projects/:projectId/outreach/campaigns
/projects/:projectId/outreach/campaigns/:campaignId
/projects/:projectId/outreach/crm
/projects/:projectId/backlink-builder/overview
/projects/:projectId/backlink-builder/outreach-based
/projects/:projectId/backlink-builder/content-based
/projects/:projectId/technical/overview
/projects/:projectId/technical/crawls/:crawlId
/projects/:projectId/competitors
/projects/:projectId/competitors/:competitorId
/projects/:projectId/analytics/overview
/projects/:projectId/analytics/outreach
/projects/:projectId/analytics/ai
/projects/:projectId/reports/library
/projects/:projectId/reports/new
/projects/:projectId/reports/:reportId
/projects/:projectId/settings/*

/org/executive                              [Executive Dashboard — MVP]

/coming-soon/automations                    [Stub — linked from nav]
/coming-soon/marketplace                    [Stub — linked from nav]
```

**Removed from MVP routes:** `/dashboard` → replaced by `/mission-control`

### D4 — Sidebar Structure (Project Context)

```
Mission Control
AI Command Center
AI Agents
Knowledge Base
AI Memory
─────────────────
Prospects
Content Studio
Outreach
Backlink Builder
─────────────────
Technical SEO
Competitors
Analytics
Reports
─────────────────
Automations ⧗
Integrations
Marketplace ⧗
Settings
─────────────────
[Org ▾] [Project ▾] [🔔] [Avatar]
```

### D5 — Global Shell Components (FROZEN)

| Component           | Behavior                                      |
| ------------------- | --------------------------------------------- |
| Command Palette     | `⌘K` / `Ctrl+K` — navigation, actions, search |
| Breadcrumbs         | All pages below project level                 |
| Project Switcher    | Header dropdown — switches project context    |
| Org Switcher        | Header dropdown — multi-org users             |
| Notification Bell   | Last 20, mark read, badge count               |
| Data Source Badge   | On every metric: Live / Estimated / Demo      |
| Demo Mode Banner    | Amber bar when `demoMode=true`                |
| Walkthrough Overlay | 10-step CEO path — dismissible, resumable     |

### D6 — Mission Control Layout (FROZEN — Replaces Generic Dashboard)

**Desktop 12-column grid:**

| Row | Columns | Content                                                        |
| --- | ------- | -------------------------------------------------------------- |
| 1   | 12      | CEO Briefing card (collapsible, regenerate)                    |
| 2   | 3+3+3+3 | KPI cards: Backlinks, Reply Rate, Pending Approvals, AI Tokens |
| 3   | 7+5     | Outreach Funnel chart \| AI Activity Timeline                  |
| 4   | 6+6     | Approval Queue widget \| AI Workforce status panel             |
| 5   | 12      | Strategy Initiatives (from SEO Strategist)                     |

**AI Workforce panel:** Shows 14 agents as nodes; running agents pulse; click → run detail.

**AI Thinking Panel:** Slide-over drawer during agent run — SSE stream, step labels, cancel.

### D7 — Interaction Patterns (FROZEN)

| Pattern      | Specification                                              |
| ------------ | ---------------------------------------------------------- |
| Loading      | Skeleton screens (tables/cards); button spinners on submit |
| Empty states | Illustration + headline + primary CTA + secondary link     |
| Errors       | Toast (transient); inline (forms); full page (404/403/500) |
| Success      | Toast + optional confetti on onboarding milestones only    |
| Approvals    | Sticky footer on approval pages; reject requires reason    |
| Agent runs   | Always navigate to run detail; stream in thinking panel    |
| Modals       | Confirm destructive actions; type-to-confirm on delete     |
| Drawers      | Quick view prospect, document detail, thinking panel       |

### D8 — Responsive Breakpoints

| Breakpoint | Width      | Layout                                                          |
| ---------- | ---------- | --------------------------------------------------------------- |
| Mobile     | < 768px    | Bottom tabs: Mission Control, Prospects, Outreach, Agents, More |
| Tablet     | 768–1023px | Collapsed sidebar (icons) or hamburger → Sheet                  |
| Desktop    | ≥ 1024px   | Full sidebar 256px                                              |

**Mobile MVP scope:** Full read access; create/edit on Prospects, Approvals, Agents; simplified tables (card view).

### D9 — Accessibility (WCAG 2.1 AA — MVP Baseline)

- Focus rings on all interactive elements
- `aria-label` on icon-only buttons
- Skip to main content link
- Charts: data table toggle alternative
- SSE streaming: `aria-live="polite"` with throttled updates (max 1/2s)
- `prefers-reduced-motion`: disable typewriter, confetti, page transitions
- Color + icon + text for status (never color alone)
- Minimum contrast 4.5:1 body text

### D10 — Keyboard Shortcuts (FROZEN)

| Shortcut     | Action                              |
| ------------ | ----------------------------------- |
| `⌘/Ctrl + K` | Command palette                     |
| `⌘/Ctrl + /` | Shortcuts help modal                |
| `G → D`      | Mission Control                     |
| `G → P`      | Prospects                           |
| `G → O`      | Outreach inbox                      |
| `G → A`      | Agents catalog                      |
| `N`          | New (contextual)                    |
| `Esc`        | Close modal/drawer                  |
| `J / K`      | Next/prev thread in inbox (desktop) |

### D11 — Coming Soon Pages

Routes `/coming-soon/automations` and `/coming-soon/marketplace`:  
Static page with feature preview, benefit copy, email waitlist capture (stored in `waitlist_signups` table).  
**No functional backend** beyond email capture.

### D12 — Onboarding UX (FROZEN)

| Step | Screen                        | Required               |
| ---- | ----------------------------- | ---------------------- |
| 1    | Create organization           | Yes                    |
| 2    | Create first project          | Yes                    |
| 3    | Upload first KB doc (or skip) | Skippable              |
| 4    | Add first competitor          | Skippable              |
| 5    | Launch walkthrough            | Auto for demo accounts |

Progress stored in `onboarding_progress` — checklist visible on Mission Control until complete.

### D13 — Page Inventory Count

| Category          | MVP Pages | Stub Pages  |
| ----------------- | --------- | ----------- |
| Auth + Onboarding | 5         | 0           |
| Org-level         | 8         | 1 (billing) |
| Project-level     | 35        | 0           |
| System            | 2         | 0           |
| Coming Soon       | 0         | 2           |
| **Total**         | **50**    | **3**       |

---

## Assumptions

1. CEO demo uses desktop 1440px viewport primarily
2. Mobile is functional but not demo-critical for MVP
3. Inter font available via Google Fonts or self-hosted
4. No custom illustration budget — use Lucide + simple SVG patterns
5. Walkthrough uses overlay library (e.g., driver.js) — OSS

---

## Risks

| Risk                             | Mitigation                                          |
| -------------------------------- | --------------------------------------------------- |
| 50 pages = high UI surface       | Shared layouts, DataTable component, feature slices |
| Mission Control complexity       | Build from widget registry pattern                  |
| Command palette scope creep      | MVP: nav + 10 actions only                          |
| Walkthrough breaks on UI changes | E2E test anchors on `data-tour` attributes          |

---

## Resolved Open Questions

| ID   | Decision                                         |
| ---- | ------------------------------------------------ |
| UQ-1 | Executive route: **`/org/executive`**            |
| UQ-2 | Confetti on onboarding: **Yes, milestones only** |
| UQ-3 | CEO demo theme: **Light primary**                |

## Open Questions

**None.**

---

## Review Checklist

- [ ] All MVP routes listed — no orphan pages from old UX spec
- [ ] Mission Control wireframe approved
- [ ] `/dashboard` redirect to `/mission-control` documented
- [ ] Coming Soon pages don't imply working features
- [ ] Data source badges specified on all metric components
- [ ] `data-tour` attribute convention defined for walkthrough
- [ ] Mobile bottom tab scope agreed
- [ ] Accessibility baseline accepted by UX + Eng
- [ ] Command palette MVP action list finalized (see CEO Demo Freeze)

---

## Sign-Off Criteria

| Role          | Criteria                                     | Sign-Off |
| ------------- | -------------------------------------------- | -------- |
| UX Lead       | All MVP pages have purpose + layout decision | ☐        |
| PM            | User journeys map to frozen routes           | ☐        |
| Frontend Lead | Component reuse plan viable                  | ☐        |
| CEO           | Mission Control meets demo expectations      | ☐        |
| Accessibility | AA baseline checklist accepted               | ☐        |

---

_Reference: UI/UX Specification v1.0 — superseded where conflicting._
