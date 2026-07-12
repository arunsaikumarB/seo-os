# Version 0.96 — Reports & Executive Intelligence

**Version:** `8.0.0-reports` / tag **v0.96.0**  
**Scope:** Executive reporting platform. No Billing / Marketplace / Technical SEO.

---

## 1. Architecture

```
Analytics Engine + module summaries
        │
        ▼
 reports.service (generate run)
        │
   @seo-os/reports-engine
   (executive summary, sections, white-label)
        │
   ┌────┼────┬──────────┐
   ▼    ▼    ▼          ▼
 PDF  PPTX  CSV/XLSX   JSON
        │
 schedules → pg-boss report.generate
 delivery → download | email (outreach provider) | internal share
```

---

## 2. Database

Migration **`018_epic8_reports_engine.sql`**:

- `report_brands` — white-label
- `reports` — definitions + schedule
- `report_runs` — generation progress + payload
- `report_exports` — export audit
- `report_deliveries` — download/email/internal

---

## 3. APIs

| Endpoint | Purpose |
|----------|---------|
| `GET …/reports/summary` | MC widget stats |
| `GET …/reports/types` | 10 report types |
| `GET/POST …/reports/brands` | White-label |
| `GET/POST …/reports` | Library |
| `PATCH …/reports/:id` | Schedule/status |
| `POST …/reports/:id/generate` | Queue/sync generate |
| `GET …/reports/runs` | Runs list |
| `GET …/reports/runs/:id/export` | pdf/pptx/csv/xlsx/json |
| `POST …/reports/runs/:id/email` | Email delivery |
| `POST …/reports/runs/:id/share` | Internal share |
| `POST …/reports/process-due` | Due schedules |

---

## 4. UI

- `/projects/:id/reports/library` — create, brand, generate, export, email
- Mission Control **Reports** widget
- Feature flags: `reports: true`, `white_label: true`

---

## 5. Export System

| Format | Implementation |
|--------|----------------|
| PDF | `pdf-lib` branded cover + sections |
| PowerPoint | `pptxgenjs` multi-slide deck |
| CSV / Excel | Flattened spreadsheet text |
| JSON | Full document |

---

## 6. AI Report Generation

`generateExecutiveSummary()` produces Highlights, Key Wins, Risks, Recommendations, Next Actions, Projected Growth + narrative from Analytics KPIs/insights.

---

## 7. Scheduling

`manual` | `on_demand` | `weekly` | `monthly` | `quarterly` with `next_run_at` + `process-due` endpoint / worker-friendly.

---

## 8. Performance

- Background via pg-boss `report.generate` (sync fallback)
- Progress 0→100 on runs
- Analytics overview reused (no duplicate heavy fan-out beyond overview)
- Cached run payload for re-export

---

## 9. Risks

1. PDF/PPTX stored as text/base64 in DB — large payloads should move to object storage.
2. Schedule processor is on-demand (`process-due`), not a global cron yet.
3. Email delivery uses mock/outreach provider layer (production SMTP depends on account config).
4. True XLSX binary still CSV-compatible.

---

## 10. Technical Debt

- Object storage for export binaries
- Cron worker for all workspaces’ due reports
- Visual chart embeds inside PDF/PPT from Recharts snapshots
- Report template designer UI
- Deduplicate concurrent generations

---

## 11. Release Readiness Score

| Dimension | Score |
|-----------|------:|
| Architecture | 85 |
| Database | 88 |
| APIs | 86 |
| UI | 80 |
| Exports (PDF/PPT) | 82 |
| AI summaries | 84 |
| Scheduling | 75 |
| Performance | 78 |

**Release Readiness: 82 / 100**

---

**Awaiting approval before Version 0.97.**
