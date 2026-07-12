# Version 0.99.5 — Closed Beta / Customer Validation

**API:** `11.0.5-closed-beta` · **Tag:** `v0.99.5`  
**Scope:** Beta program, feedback, UX/help, stability — **no new SEO modules**.

## Deliverables

| # | Doc |
|---|-----|
| 1 | [BETA_REPORT.md](./BETA_REPORT.md) |
| 2 | [BUG_REPORT.md](./BUG_REPORT.md) |
| 3 | [FEEDBACK_SUMMARY.md](./FEEDBACK_SUMMARY.md) |
| 4 | [UX_IMPROVEMENTS.md](./UX_IMPROVEMENTS.md) |
| 5 | [PERFORMANCE_IMPROVEMENTS.md](./PERFORMANCE_IMPROVEMENTS.md) |
| 6 | [STABILITY_IMPROVEMENTS.md](./STABILITY_IMPROVEMENTS.md) |
| 7 | [DOCUMENTATION_STATUS.md](./DOCUMENTATION_STATUS.md) |
| 8–10 | [READINESS.md](./READINESS.md) |

## Shipped
- Migration `022` — invitations, announcements, feedback, usage events, org flags, `beta_mode`
- Org APIs under `/v1/organizations/:orgId/beta/*` + `/v1/beta/announcements`
- Feedback Center, Closed Beta Dashboard, announcement bar, offline banner
- Onboarding copy → &lt;15 minutes; expanded product tour
- Job enqueue defaults: retryLimit 3 + backoff
- Feature flags: `closed_beta`, `feedback_center`
