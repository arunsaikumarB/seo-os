# Epic 4 Report — Relationship Intelligence Engine v1.0

**Epic goal:** Build an AI-powered relationship intelligence system for SEO, backlink acquisition, partnerships, digital PR, and content collaboration — not a CRM.  
**API version:** `4.0.0-epic4`  
**Date:** 2026-07-09  
**Status:** Complete — awaiting approval before Epic 5

---

## Executive Summary

Epic 4 delivers the **Relationship Intelligence Engine** — a compliance-first system that discovers public contact information from Browser Intelligence scans, builds organization and contact profiles, scores relationship quality, maintains a chronological timeline, recommends outreach targets, and surfaces live metrics on Mission Control.

| Deliverable                                  | Status |
| -------------------------------------------- | ------ |
| Organization profiles (company intelligence) | ✅     |
| Contact profiles (public data only)          | ✅     |
| Relationship scoring model                   | ✅     |
| Relationship timeline                        | ✅     |
| Relationship Intelligence Agent definition   | ✅     |
| Browser Intelligence auto-enrichment hook    | ✅     |
| Campaign / Backlink Builder timeline hooks   | ✅     |
| REST API (`/relationships/*`)                | ✅     |
| Relationship Hub UI + org detail             | ✅     |
| Mission Control widget                       | ✅     |
| Migration 013 applied                        | ✅     |
| Build / Typecheck                            | ✅     |

**Epic completion score: 84/100**  
**Recommendation: Go — await explicit approval before Epic 5**

---

## 1. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 apps/web                                     │
│  Relationship Hub │ Organization Detail │ Mission Control Widget           │
│  Backlink Builder Relationships (legacy view + link to hub)                │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ /v1/projects/:id/relationships/*
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                                 apps/api                                     │
│  relationship-intelligence.service — discovery, enrichment, scoring, timeline│
│  browser-intelligence.service — auto-enrich on scan complete               │
│  campaign.service — campaign_created timeline events                         │
│  backlink-builder.service — backlink_verified timeline events              │
└───────────────┬─────────────────────────────┬───────────────────────────────┘
                │                             │
┌───────────────▼──────────────┐   ┌────────▼──────────┐
│ @seo-os/seo-intelligence     │   │ Integrations      │
│ relationship-agent           │   │ Browser Intel     │
│ contact-discovery            │   │ Knowledge Engine  │
│ relationship-scoring         │   │ AI Memory         │
└───────────────┬──────────────┘   │ Campaign Engine   │
                │                  │ Backlink Builder  │
┌───────────────▼─────────────────────────────────────────────────────────────┐
│ Supabase migration 013                                                         │
│ relationship_organizations │ relationship_contacts │ relationship_timeline    │
│ relationship_tags │ relationship_org_tags │ backlink_relationships.organization_id │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Workflow:**

```
Browser Intelligence Scan → Website Profile → enrichFromWebsiteProfile()
  → Organization Profile → Contact Discovery → Scoring → Timeline Events
  → Legacy backlink_relationships sync → Recommended Outreach Contact
```

---

## 2. Database Changes

**Migration:** `013_epic4_relationship_intelligence.sql` (applied)

| Table                        | Purpose                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `relationship_organizations` | Company profiles: domain, industry, page URLs, social, scores, warmth, campaign/backlink counts |
| `relationship_contacts`      | Public contact profiles: role, email, LinkedIn, Twitter, confidence, recommended flag           |
| `relationship_timeline`      | Chronological relationship events                                                               |
| `relationship_tags`          | Workspace-scoped organization tags                                                              |
| `relationship_org_tags`      | Organization ↔ tag junction                                                                     |

**Alter:** `backlink_relationships.organization_id` FK to `relationship_organizations`

**Indexes:** warmth, priority score, recommended contacts, timeline by org/workspace

**RLS:** All new tables use `can_access_workspace(workspace_id)`

---

## 3. API Endpoints

Base: `/v1/projects/:projectId/relationships`

| Method | Path                    | Role   | Description                                     |
| ------ | ----------------------- | ------ | ----------------------------------------------- |
| GET    | `/summary`              | viewer | Mission Control metrics                         |
| GET    | `/organizations`        | viewer | List organizations by priority                  |
| GET    | `/organizations/:orgId` | viewer | Organization detail + contacts + timeline       |
| GET    | `/contacts`             | viewer | List contacts (`?recommended=true`)             |
| GET    | `/contacts/recommended` | viewer | Campaign-matched recommended contacts           |
| GET    | `/timeline`             | viewer | Workspace relationship timeline                 |
| POST   | `/discover`             | member | Enrich all recent browser profiles              |
| POST   | `/enrich`               | member | Enrich single website profile (`{ profileId }`) |

---

## 4. AI Agent Design

**Agent ID:** `relationship_intelligence_agent`  
**Package:** `@seo-os/seo-intelligence` (`relationship-agent.ts`)

| Responsibility           | Implementation                                                               |
| ------------------------ | ---------------------------------------------------------------------------- |
| Discover public contacts | `extractContactsFromPages()` — emails, authors, social links, role detection |
| Build company profiles   | `buildOrganizationFromProfile()` from website profile data                   |
| Detect roles             | Pattern matching: Editor, Marketing Manager, SEO Manager, Founder, etc.      |
| Score relationships      | `scoreRelationship()` — 6 dimensions + warmth + recommended action           |
| Recommend outreach       | `recommendOutreachContact()` — role + email + confidence weighting           |
| Maintain history         | `relationship_timeline` events via `logRelationshipTimeline()`               |
| Suggest next actions     | Scoring model `recommendedAction` string on org notes                        |

**Note:** Agent is defined in seo-intelligence (same pattern as Browser Intelligence Agent). Full runtime handler registration deferred to Sprint 4 workforce expansion.

---

## 5. New Screens

| Route                                              | Screen                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/projects/:id/relationships`                      | **Relationship Hub** — summary metrics, org/contact/timeline tabs, discover action |
| `/projects/:id/relationships/organizations/:orgId` | **Organization Detail** — scores, public pages, contacts, timeline                 |
| `/projects/:id/backlink-builder/relationships`     | Legacy domain list (updated with link to hub)                                      |

**Components:**

- `RelationshipIntelligenceWidget` — Mission Control live widget
- Demo data + resolver stubs for offline demo mode

---

## 6. Mission Control Updates

**Widget:** Relationship Intelligence (violet theme)

| Metric              | Source                                               |
| ------------------- | ---------------------------------------------------- |
| Contacts Discovered | `relationship_contacts` count                        |
| Organizations       | `relationship_organizations` count                   |
| Warm Relationships  | warm + hot warmth levels                             |
| Hot Leads           | hot warmth count                                     |
| Partners            | partner warmth count                                 |
| Pending Follow-ups  | timeline events (submission_sent, content_generated) |
| Top Partners        | top 5 by relationship_score                          |
| Relationship Health | average relationship_score                           |

**Inline card:** Relationship Health card now uses live API data instead of static placeholders.

---

## 7. Relationship Scoring Model

**Function:** `scoreRelationship(input)` in `relationship-scoring.ts`

| Score                   | Range                       | Inputs                                                                                        |
| ----------------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| Relationship Strength   | 5–100                       | DA, contacts, email, backlinks won, warmth                                                    |
| Response Probability    | 5–90                        | Contact email, form, prior wins                                                               |
| Campaign Suitability    | 10–100                      | Guest post availability, DA, campaigns                                                        |
| Collaboration Potential | 10–100                      | Guest post, contacts, DA, wins                                                                |
| Priority Score          | 5–100                       | Weighted composite: strength 30%, response 25%, suitability 25%, collaboration 20%, risk −10% |
| Risk Score              | 5–90                        | Inverse of contact availability and win history                                               |
| Warmth                  | cold / warm / hot / partner | Derived from strength thresholds                                                              |

**Outreach recommendation:** Highest-weighted contact by role (Editor +20), email (+15), confidence score.

---

## 8. Risks

| Risk                            | Severity | Mitigation                                                     |
| ------------------------------- | -------- | -------------------------------------------------------------- |
| Public email accuracy           | Medium   | Confidence scores; human review before outreach (no auto-send) |
| Duplicate organizations         | Low      | `UNIQUE(workspace_id, domain)` upsert                          |
| Stale contact data              | Medium   | Re-enrich on browser rescan; `last_enriched_at` timestamp      |
| Contact discovery depth         | Medium   | v1 uses page metadata; HTML author extraction limited          |
| GDPR / privacy perception       | Medium   | Public-only disclaimer on all surfaces; no login scraping      |
| Agent not in workforce registry | Low      | Documented; runtime handler in future sprint                   |

---

## 9. Technical Debt

1. **Relationship Agent runtime handler** — defined in package but not registered in `AgentRegistry` / `AGENT_TYPES`
2. **HTML-level contact extraction** — `extractContactsFromPages` does not yet parse full HTML bodies from `website_pages`
3. **Campaign ↔ org linking** — `campaign_created` events are workspace-level; no domain/org FK on campaigns yet
4. **Automation content_generated** — not yet wired to relationship timeline
5. **Tag management UI** — tables exist; no CRUD UI for tags
6. **Duplicate outreach prevention** — timeline tracks events; no explicit dedup gate before campaign assignment
7. **AI Memory write-back** — reads memory context count; does not persist relationship facts to memory store

---

## 10. Epic Completion Score

| Category                  | Weight | Score | Notes                                                  |
| ------------------------- | ------ | ----- | ------------------------------------------------------ |
| Schema & persistence      | 15%    | 95    | Migration applied, RLS, indexes                        |
| Intelligence package      | 15%    | 88    | Discovery, scoring, agent definition                   |
| API completeness          | 15%    | 90    | 8 endpoints, auth/RBAC                                 |
| Integrations              | 15%    | 78    | Browser, campaign, backlink verify; automation partial |
| UI / UX                   | 15%    | 82    | Hub, detail, widget, demo mode                         |
| Compliance                | 10%    | 95    | Public-only, disclaimers, no email send                |
| Scoring & recommendations | 10%    | 85    | 6-dimension model + outreach picker                    |
| Testing                   | 5%     | 40    | Build only; no dedicated test suite                    |

**Weighted total: 84/100**

---

## Integrations Summary

| System               | Integration                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Browser Intelligence | Auto `enrichFromWebsiteProfile()` on scan complete (including cache hits)                    |
| Knowledge Engine     | Indirect — profiles sourced from `website_profiles` built by browser scans                   |
| AI Memory            | Read context count during enrichment                                                         |
| Campaign Engine      | `campaign_created` timeline events on campaign create                                        |
| Backlink Builder     | `backlink_verified` events + `backlinks_won` increment; legacy `backlink_relationships` sync |

---

## Out of Scope (Honored)

- ❌ Email sending
- ❌ Inbox
- ❌ Follow-up automation
- ❌ Analytics
- ❌ Reports

---

## Approval Gate

Epic 4 is complete. **Do not begin Epic 5** until explicit approval is received.
