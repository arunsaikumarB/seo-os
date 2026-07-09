# Epic 3 Report — AI Browser Intelligence Engine v1.0

**Epic goal:** Build an AI-powered website intelligence system that understands websites, discovers backlink opportunities, and provides actionable recommendations — without being a browser automation tool.  
**API version:** `3.0.0-epic3`  
**Date:** 2026-07-09  
**Status:** Complete — awaiting approval before Epic 4

---

## Executive Summary

Epic 3 delivers the **Browser Intelligence Engine** — a compliance-first website analysis system that crawls public pages within limits, respects robots.txt disallow rules, builds persistent website profiles, detects opportunities and contact methods, generates AI summaries/recommendations, and stores findings in the Knowledge Engine.

| Deliverable                                                  | Status |
| ------------------------------------------------------------ | ------ |
| Public page crawl (fetch-based, rate-limited)                | ✅     |
| robots.txt compliance (disallow + crawl-delay)               | ✅     |
| Website profiles (persistent)                                | ✅     |
| Page intelligence (contact, guest post, resource, FAQ, etc.) | ✅     |
| Technology & CMS detection                                   | ✅     |
| AI summary + recommendations                                 | ✅     |
| Knowledge Engine auto-storage                                | ✅     |
| Browser Intelligence Agent definition                        | ✅     |
| CRAWL queue integration                                      | ✅     |
| Incremental rescan + content cache                           | ✅     |
| Mission Control widget                                       | ✅     |
| Website Scanner UI (dashboard, history, profiles, detail)    | ✅     |
| Migration 012 applied                                        | ✅     |
| Build / Typecheck                                            | ✅     |

**Epic completion score: 86/100**  
**Recommendation: Go — await explicit approval before Epic 4**

---

## 1. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 apps/web                                     │
│  Browser Scanner Dashboard │ Scan Detail │ Mission Control Widget            │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ /v1/projects/:id/intelligence/browser/*
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                                 apps/api                                     │
│  browser-intelligence.service — scan orchestration, profiles, KB storage     │
│  website-scan.service — delegates to browser intelligence pipeline             │
│  pg-boss CRAWL queue — async scan jobs                                       │
└───────────────┬─────────────────────────────┬───────────────────────────────┘
                │                             │
┌───────────────▼──────────────┐   ┌────────▼──────────┐
│ @seo-os/seo-intelligence     │   │ Knowledge Engine  │
│ robots-compliance            │   │ kb_documents      │
│ page-intelligence            │   └───────────────────┘
│ website-profile              │
│ browser-recommendations      │
│ browser-scan-pipeline        │
└───────────────┬──────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────────────────┐
│ Supabase migration 012                                                         │
│ website_profiles │ browser_intelligence_discoveries │ browser_scan_cache       │
│ website_scans (+ ai_summary, discoveries) │ website_pages (+ page_type)        │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Browser Intelligence Architecture

**Workflow:**

```
Website → Discovery → Page Analysis → Metadata Extraction → Technology Detection
  → Contact Detection → Opportunity Detection → AI Summary → Recommendation → Knowledge Engine
```

**Scan phases (8):**

1. Discovering pages
2. Reading content
3. Extracting metadata
4. Finding opportunities
5. Finding contact pages
6. Building profile
7. Generating AI summary
8. Completed

**Compliance layer:**

- Fetches `robots.txt` and filters disallowed URLs
- Honors `Crawl-delay` (minimum 200ms politeness)
- User-Agent: `SEO-OS-BrowserIntelligence/1.0`
- No form submission, CAPTCHA, or authentication bypass

---

## 3. AI Agent Design

### Browser Intelligence Agent

| Attribute | Value                                                    |
| --------- | -------------------------------------------------------- |
| ID        | `browser_intelligence_agent`                             |
| Role      | Website analysis, opportunity detection, recommendations |

**Responsibilities:**

- Visit public pages (within limits)
- Build website profiles
- Extract structured information
- Summarize websites
- Detect backlink opportunities
- Detect submission requirements
- Score website quality
- Recommend next actions

Implemented in `@seo-os/seo-intelligence/browser-scan-pipeline.ts` and orchestrated by `browser-intelligence.service.ts`.

---

## 4. Database Changes

**Migration:** `012_epic3_browser_intelligence.sql` (applied)

### New tables

| Table                              | Purpose                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `website_profiles`                 | Persistent profiles per domain (DR, CMS, contacts, opportunities, AI summary) |
| `browser_intelligence_discoveries` | Per-scan discoveries (opportunities, resource pages, guest post pages)        |
| `browser_scan_cache`               | Content hash cache for incremental rescans                                    |

### Extended tables

**`website_scans`:** `profile_id`, `ai_summary`, `ai_recommendations`, `discoveries_count`, `contact_pages_found`, `guest_post_pages_found`, `broken_links_found`, `scan_type`, `retry_count`, `pages_read`

**`website_pages`:** `http_status`, `page_type`, `has_contact_form`, `content_hash`, `links_found`, `broken_links`

---

## 5. API Endpoints

Base: `/v1/projects/:projectId/intelligence/browser`

| Method | Path                         | Purpose                                        |
| ------ | ---------------------------- | ---------------------------------------------- |
| GET    | `/summary`                   | Browser Intelligence metrics (Mission Control) |
| GET    | `/scans`                     | Scan history                                   |
| POST   | `/scans`                     | Start scan (`{ url? }`)                        |
| GET    | `/profiles`                  | Website profiles list                          |
| GET    | `/profiles/:profileId`       | Profile detail                                 |
| GET    | `/scans/:scanId/discoveries` | Scan discoveries                               |

**Enhanced existing:**

- `GET /intelligence/website/scans/:scanId` — now includes `discoveries`

---

## 6. Queue Architecture

| Queue    | Job                         | Handler                                                         |
| -------- | --------------------------- | --------------------------------------------------------------- |
| `crawl`  | `browser.intelligence.scan` | `handleIntelligenceScanJobs` → `executeBrowserIntelligenceScan` |
| `ingest` | (unchanged)                 | KB document ingestion after scan                                |

**When `ENABLE_WORKERS=false`:** scans run inline (dev mode).

**Performance controls:**

- Max 50 pages per scan
- 200ms+ politeness delay between fetches
- 2 retries per page
- 12s fetch timeout
- 24h profile cache skip (incremental rescan)
- Content hash deduplication via `browser_scan_cache`

---

## 7. Mission Control Updates

New **Browser Intelligence** widget displays:

- Websites Scanned
- Currently Scanning
- Pages Read
- Opportunities Found
- Contact Pages
- Guest Post Pages
- Broken Links
- AI Discoveries
- Scan Queue (active scans)
- Compliance disclaimer

Data: `GET /mission-control/summary` → `browserIntelligence`

---

## 8. Website Scanner Screens

| Screen            | Route                                 | Purpose                                                |
| ----------------- | ------------------------------------- | ------------------------------------------------------ |
| Scanner Dashboard | `/intelligence/browser`               | Start scans, pipeline progress, recent scans, profiles |
| Scan Detail       | `/intelligence/browser/scans/:scanId` | AI summary, pages, discoveries                         |
| Legacy Analyzer   | `/intelligence/website`               | Preserved for backward compatibility                   |

---

## 9. Performance Strategy

| Strategy            | Implementation                                |
| ------------------- | --------------------------------------------- |
| Queue support       | pg-boss `crawl` queue                         |
| Rate limiting       | robots crawl-delay + 200ms default delay      |
| Retry strategy      | Up to 2 retries per page fetch                |
| Incremental rescans | 24h profile cache; content hash skip          |
| Caching             | `browser_scan_cache` per URL                  |
| Duplicate detection | Domain-level profile upsert; URL content hash |

---

## 10. Compliance Summary

**The engine DOES:**

- Analyze public pages only
- Respect robots.txt disallow rules
- Use identifiable User-Agent
- Store findings for human review
- Display compliance disclaimers

**The engine does NOT:**

- Submit forms automatically
- Create accounts
- Solve CAPTCHAs
- Log in to third-party sites
- Impersonate humans
- Bypass authentication

---

## 11. Risks

| Risk                                         | Severity | Mitigation                                 |
| -------------------------------------------- | -------- | ------------------------------------------ |
| Fetch-based crawl misses JS-rendered content | High     | Playwright worker planned for Epic 4+      |
| Heuristic DR/traffic not production-accurate | Medium   | Integrate Moz/Ahrefs APIs later            |
| No SSRF blocklist on outbound URLs           | Medium   | Add IP blocklist per infra freeze          |
| Large sites truncated at 50 pages            | Low      | Configurable limits + pagination in future |
| KB auto-ingest may hit document limits       | Low      | Graceful fallback if upload fails          |

---

## 12. Technical Debt

1. **No headless browser** — fetch + regex only; SPAs partially invisible
2. **Broken link detection** — structure exists; live HEAD checks not implemented
3. **Nested sitemap indexes** — single-level sitemap parsing only
4. **Playwright worker** — scaffold exists, not wired
5. **SSRF protection** — not implemented
6. **Profile detail page** — list view only; no dedicated `/profiles/:id` UI route
7. **SSE live progress** — polling only

---

## 13. Epic Completion Score

| Category                     | Weight | Score      | Notes                                        |
| ---------------------------- | ------ | ---------- | -------------------------------------------- |
| Website profiling            | 20%    | 90         | Full profile schema + persistence            |
| Page intelligence            | 20%    | 85         | Contact, guest post, resource, FAQ detection |
| AI summary & recommendations | 15%    | 88         | Template + heuristics; not LLM               |
| Compliance                   | 15%    | 92         | robots.txt, disclaimers, no automation       |
| Queue & performance          | 15%    | 82         | CRAWL queue; no Playwright                   |
| UI & Mission Control         | 10%    | 88         | Dashboard + detail + widget                  |
| Knowledge Engine integration | 5%     | 85         | Auto-store on scan complete                  |
| **Weighted total**           |        | **86/100** |                                              |

---

## Go / No-Go for Epic 4

### Recommendation: **GO** (with approval gate)

Epic 3 establishes a compliant, intelligent website analysis foundation. Profiles persist across scans, findings flow into the Knowledge Engine, and Mission Control surfaces live browser intelligence metrics.

**Do not start Epic 4 automatically.** Await explicit stakeholder approval.

---

## Verification

```bash
npx turbo run build --filter=@seo-os/seo-intelligence --filter=@seo-os/api --filter=@seo-os/web
npm run db:push   # migration 012

# Routes
/projects/:id/intelligence/browser          — Scanner Dashboard
/projects/:id/intelligence/browser/scans/:id — Scan Detail
/projects/:id/mission-control               — Browser Intelligence widget
```

---

_Epic 3 complete. Awaiting approval before Epic 4._
