# Version 0.97 — AI Technical SEO Engine

**Version:** `9.0.0-technical-seo` / tag **v0.97.0**  
**Scope:** Website health intelligence — detect, explain, prioritize, recommend/generate fixes, track progress.  
**Out of scope:** Billing, Marketplace, Chrome Extension, Mobile App.

---

## 1. Architecture Summary

```
Browser Intelligence + rule engine (@seo-os/technical-seo)
        │
        ▼
 technical-seo.service (audits / issues / health snapshots / crawl queue)
        │
   ┌────┼────────┬──────────┬────────────┐
   ▼    ▼        ▼          ▼            ▼
 API  pg-boss   Platform   Workflows   Reports/Analytics
      CRAWL     events     triggers    metrics hooks
        │
        ▼
 Web: Technical SEO overview + Mission Control widget
```

Modules covered: website health, site audit, CWV, indexability, crawlability, internal linking, redirects, broken links, canonicals, duplicate content, structured data, meta, OG/Twitter, sitemap, robots, images, JS SEO, accessibility, performance, security headers, HTTPS, mobile.

Agents: Technical SEO, Performance, Accessibility, Schema, Security, Crawl.

---

## 2. Database Changes

Migration **`019_epic9_technical_seo.sql`**:

| Table | Purpose |
|-------|---------|
| `technical_audits` | Audit runs (full / incremental / quick) |
| `technical_issues` | Issues with severity, impact, AI fix payloads |
| `technical_health_snapshots` | Score history (overall + dimensions) |
| `technical_crawl_queue` | Parallel crawl job queue |

Also extends `workflows.trigger_type` for `critical_seo_issue_detected` and `technical_audit_completed`.

---

## 3. API Endpoints

Base: `/v1/projects/:projectId/technical-seo`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/summary` | Health, counts, trend, agents (MC) |
| GET | `/modules` | 23 module catalog |
| GET | `/agents` | 6 specialist agents |
| GET | `/analytics` | Health trends, resolution, fix time |
| GET | `/audits` | Audit list |
| GET | `/audits/:id` | Audit detail |
| POST | `/audits` | Queue audit (`targetUrl`, `mode`) |
| GET | `/issues` | Filter by audit/severity/status |
| PATCH | `/issues/:id` | Status → open/in_progress/fixed/ignored/reopened |
| GET | `/export?format=` | `csv` \| `xlsx` \| `json` \| `pdf` |

Platform events: `technical_audit_completed`, `critical_seo_issue_detected`.

---

## 4. UI Screens

- `/projects/:id/technical/overview` — health KPIs, start audit, trend/donut/score charts, audit timeline, issues + AI Fix Assistant, export
- Mission Control **Website Health** widget
- Feature flag: `technical_seo: true`

---

## 5. AI Agents

| Agent | Role |
|-------|------|
| Technical SEO Agent | Site-wide detection & prioritization |
| Performance Agent | CWV / speed |
| Accessibility Agent | A11y + heading structure |
| Schema Agent | JSON-LD / structured data |
| Security Agent | HTTPS + headers |
| Crawl Agent | Queue, robots, sitemap |

Rule engine emits Severity, Business Impact, SEO Impact, Explanation, Recommended Fix, Estimated Fix Time, Confidence, plus suggested HTML/meta/canonical/robots/schema/alt/redirects where applicable.

---

## 6. Mission Control Changes

Live widget surfaces: Website Health score, Critical Issues, Warnings, Passed Checks, Crawl Queue, Fix Progress, Health Trend delta.

Summary payload includes `technicalSeo` from `getTechnicalSummary`.

---

## 7. Workflow Integration

- Trigger types: `critical_seo_issue_detected`, `technical_audit_completed`
- Template: **Critical SEO Issue Response** — notify → generate fix → approval → export recommendation
- Event bus fan-out via `WORKFLOW_TRIGGERABLE_EVENTS`

---

## 8. Reports Integration

Executive / Client SEO reports pull `technicalHealthScore`, `pagesAudited`, `criticalSeoIssues`, `issueResolutionRate`, `averageFixMinutes` into a **Technical SEO Health** section.

---

## 9. Performance Strategy

| Capability | Implementation |
|------------|----------------|
| Incremental audits | Skip re-inserting open issue codes |
| Caching | Browser Intelligence summary reused |
| Parallel crawling | `technical_crawl_queue` + `QUEUES.CRAWL` |
| Queue processing | pg-boss `technical.audit` / `technical_audit` |
| Background workers | Existing crawl worker path |
| Quick mode | Reduced page sample for fast signal |

---

## 10. Risks

- Rule-based detection approximates a full crawler; depth depends on Browser Intelligence coverage
- PDF issue export is a lightweight listing (full branded PDF remains Reports Engine)
- New workflow trigger types require migration constraint update (included in 019)
- Agent types beyond `technical_seo` are catalogued in-module, not all registered in AI Workforce runtime yet

---

## 11. Technical Debt

- Deep JS rendering / Lighthouse CWV lab data not wired
- Internal link map / crawl graph are summary-level (charts), not full graph UI
- Excel export is CSV-compatible (`xlsx` content-type text/csv) pending a real spreadsheet lib
- Specialty agents should eventually map to runnable `AGENT_TYPES` with dedicated prompts

---

## 12. Release Readiness Score

**88 / 100**

| Area | Score |
|------|-------|
| Schema + migration | 95 |
| Engine + API | 90 |
| UI + MC | 88 |
| Workflows + events | 85 |
| Reports/Analytics hooks | 85 |
| Export | 82 |
| Deep crawl / CWV fidelity | 70 |

Ready for **v0.97.0** production tag. Wait for approval before Version 0.98.
