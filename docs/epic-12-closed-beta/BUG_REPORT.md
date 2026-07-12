# Bug Report — v0.99.5 sprint

## Fixed / hardened this release
| Area | Change |
|------|--------|
| Offline UX | Offline banner when connectivity drops |
| Worker retries | Default `retryLimit: 3`, backoff on enqueue |
| Onboarding time messaging | Clarified &lt;15 minute path to first value |
| Help discoverability | Restart tour, AI assistant link, Feedback CTA |
| Tour coverage | Integrations + Feedback steps added |
| Empty feedback state | Explicit empty copy in Feedback Center |

## Known residual (track in beta)
- Playwright browser E2E still deferred
- In-memory rate limiter (multi-replica)
- Live OAuth for GSC/GA4 still stub-capable
- Some org placeholder settings pages remain

Use Feedback Center to file new bugs during cohort.
