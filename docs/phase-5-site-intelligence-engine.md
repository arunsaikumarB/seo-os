# Phase 5 — Site Intelligence Engine

**Understand → Strategize → Execute.** Execution begins only after a domain-keyed Site Profile is complete with an evidence-backed `entry_url`.

## Scope respected

| Constraint | How |
|---|---|
| UI frozen | Campaign Health audit section only (dev page); no workflow/page redesign |
| CSM unchanged | Profiles additive (`site_profiles`); lifecycle transitions untouched |
| One truth system | Page-intent detectors extend Phase 4.5 Detector Registry patterns |
| Phase 4 mechanics | `bee_profile` shares PLAYWRIGHT queue + pool; leases/timeouts unchanged |
| No CAPTCHA solve | Detection/classification only |
| No generation changes | `guidelines_mismatch` flag only |

## Pipeline

```
Approved → [SIE: fingerprint → crawl ≤15/depth3/90s → classify → strategy]
        → profile complete → Ready execution starts at entry_url
```

## Deliverables

1. Migration `092_site_intelligence_engine.sql` — `site_profiles`, `site_profile_jobs`, opportunity soft links
2. Package modules: fingerprint, crawl, page-intent detectors, strategy, guidelines, `analyzeFetchedSite`
3. API: `site-intelligence.service.ts`, `bee_profile` worker, `startJob` gate, learning write-back
4. Campaign Health: `siteIntelligenceAudit`
5. Vitest fixtures covering fingerprint, bounded crawl, core login-vs-form fix, guidelines, dashboard expected login, form disambiguation, learning

## Acceptance mapping

| # | Covered by |
|---|---|
| 1 Fingerprints | `site-intelligence.test.ts` WP / Google Forms / Unknown |
| 2 Bounded crawl | frontier ≤15, Write For Us prioritized |
| 3 Core fix | Sign-in nav + `/write-for-us` form → Direct Submission, zero expected login |
| 4 Guidelines | Classified Guidelines → Email Outreach, fields extracted |
| 5 Dashboard | `expectedInterventions: [Login Required]` |
| 6 Form disambiguation | Newsletter/search/comment ≠ Submission Form |
| 7 Fallback chain | Strategy plan includes Contact fallback |
| 8 Learning reuse | `recordStrategyOutcome` + worker verify-then-reuse path |
| 9 Shared domain | `ensureSiteIntelligence` one profile per domain |
| 10–11 | Chaos/stress: run existing Phase 4/4.5 suites with SIE gate (soft-skip if migration absent) |

## Ops

- Apply: `npx supabase db push`
- Progress copy when queued on profile: `Queued — AI is analyzing website…`
- Delete domain profile: `deleteSiteProfile(workspaceId, domain)` (Advanced Tools can wire later)

## Report template (fill after chaos run)

| Metric | Before (4.5) | After (5) |
|---|---|---|
| Profile completion rate | — | _measure_ |
| Strategy distribution | — | Campaign Health `byStrategy` |
| False-intervention rate | Phase 4.5 baseline | _measure_ |
| Expected vs surprise interventions | — | timeline `Expected Intervention` |
| Crawl cost (pages / ms) | — | `crawl_stats` / audit averages |
