# Epic 7 — Analytics & Insights Engine

**Version:** `7.0.0-epic7` (Version 0.95)  
**Scope:** Measurement layer only. No PDF/PPT (Reports Engine). No Billing / Marketplace / Technical SEO.

---

## 1. Analytics Architecture

```
Modules (Mission Control, Knowledge, Memory, Browser/SEO Intel,
Campaigns, Backlinks, Automation, Relationships, Outreach,
Workflows, Executive)
        │
        ▼
┌───────────────────────────────┐
│  analytics.service (API)      │
│  aggregates live module data  │
└───────────────┬───────────────┘
                │
    ┌───────────┼────────────┐
    ▼           ▼            ▼
@seo-os/     snapshots    exports
analytics-   insights     CSV/XLSX/JSON
engine       cache
(insights +
 forecasts)
                │
                ▼
 Web dashboards (Recharts) + Mission Control widget
```

---

## 2. Database Changes

Migration **`017_epic7_analytics_insights.sql`**:

| Table | Purpose |
|-------|---------|
| `analytics_snapshots` | Period metric snapshots (materialized-friendly) |
| `analytics_insights` | Cached AI insight rows |
| `analytics_exports` | Export audit trail |

RLS: `can_access_workspace` SELECT policies.

---

## 3. API Endpoints

| Method | Path | Role |
|--------|------|------|
| GET | `/v1/projects/:id/analytics/overview` | viewer |
| GET | `/v1/projects/:id/analytics/mission-control` | viewer |
| GET | `/v1/projects/:id/analytics/insights` | viewer |
| GET | `/v1/projects/:id/analytics/dashboards/:key` | viewer |
| GET | `/v1/projects/:id/analytics/export?dashboard=&format=` | member |

Dashboard keys: `executive`, `seo`, `backlinks`, `campaigns`, `workflows`, `relationships`, `outreach`, `ai`, `team`, `system`.

Export formats: `csv`, `xlsx` (CSV-compatible), `json`.

---

## 4. Dashboard Screens

- `/projects/:id/analytics/overview` — KPIs, growth, insights, forecasts, exports
- `/projects/:id/analytics/:section` — deep-dive per domain
- Feature flag: `analytics: true`
- Demo mode fixtures in `resolver.ts`

---

## 5. Charts & Visualizations

Recharts wrappers in `apps/web/src/components/analytics/charts.tsx`:

- Line / Area trends
- Horizontal bars
- Donut / pie
- Funnel bars

---

## 6. AI Insight Generation

`@seo-os/analytics-engine` `generateInsights()` + `buildForecasts()`:

- Campaign A vs B lift
- Guest post vs directory success
- Reply rate week-over-week
- Relationship quality improvements
- Workflow success health
- AI hours saved

Forecasts: expected backlinks, replies, campaign completion, relationship growth, AI productivity, ROI index.

---

## 7. Mission Control Enhancements

`AnalyticsMissionWidget` on Mission Control:

- Top executive KPIs
- Weekly growth chart
- Top AI insights
- Link to full Analytics

---

## 8. Performance Strategy

| Technique | Implementation |
|-----------|----------------|
| Aggregated queries | Parallel `Promise.all` over module summaries |
| Snapshot tables | `analytics_snapshots` ready for cron materialization |
| Caching | React Query `staleTime` 45–60s; insight persist only on overview |
| Lazy loading | Analytics routes via `React.lazy` |
| Background-friendly | Export logging; snapshots designed for workers |
| MC isolation | Analytics fetched on separate endpoint (not bloating summary) |

---

## 9. Risks

1. Overview aggregation is multi-query — may slow under large tenants without snapshots.
2. Trend series currently synthesized when historical daily buckets are sparse.
3. `xlsx` export is CSV-compatible (true XLSX binary deferred).
4. Insight persistence can duplicate on repeated overview loads (TTL/expiry present; dedupe later).
5. Some opportunity fields (`country`, `industry`) may be sparsely populated.

---

## 10. Technical Debt

- Nightly job to fill `analytics_snapshots`
- True historical time-series from event tables
- Heat maps / stacked bars polish
- Shared Redis cache for overview
- Deduplicate insight inserts
- Spreadsheet binary (SheetJS) if needed before Reports Engine

---

## 11. Epic Completion Score

| Dimension | Score |
|-----------|------:|
| Architecture & data model | 86 |
| API coverage | 88 |
| Dashboards & charts | 82 |
| Insights & forecasting | 80 |
| Mission Control integration | 84 |
| Exports | 78 |
| Performance foundations | 76 |
| Demo / UX polish | 80 |

**Epic Completion Score: 82 / 100**

---

**Awaiting your approval before starting the Reports Engine.**
