# Capability 2 — Directory Intelligence

Extends Site Intelligence for Business Directory websites. Does **not** change CSM, BEE core, AI Review, WordPress Intelligence, or SIE architecture.

## What it adds

| Step | Capability |
|---|---|
| Detection | Multi-signal business directory claim (≥2 markers): Business Directory, Add Listing, Submit Listing, Yellow Pages, Local Listings, etc. |
| Platform | PHP Link Directory, eSyndiCat, Arfooo, IndexU, BDP, GeoDirectory, Directorist, Sabai, Brilliant, HivePress, WP directory plugins, Custom PHP |
| Page intents | Add Listing vs Category (never confused), Register, Login, Dashboard, Pricing |
| Entry URL | Best Submit Listing / Add Business URL before browser opens |
| Categories | Extract hierarchy + smart match from business text; overrideable suggestion |
| Field map | Business name, website, description, category, contact, address, media, hours |
| Strategies | Direct / Dashboard / Registration / Contact / Email / Premium / Unsupported |
| Pricing | Free vs paid/sponsored/featured; **paid → Needs Review, never payment** |
| Approval | Immediate / manual / pending / email verify / admin + timeline |
| Learning | Platform, categories, submission URL, fields, approval, success rate |
| Health | Campaign Health → Directory Health strip |

## Execution gate

Browser starts only after platform + category + submission page + fields + strategy are resolved. Paid / premium directories skip browser and flag `needs_human_review` on the opportunity (additive metadata; no CSM rewrite).

## Files

- `packages/backlink-builder/src/directory-intelligence.ts`
- Hook: `enrichWithDirectoryIntelligence` after WordPress enrich in `analyzeFetchedSite`
- API: paid → Needs Review flags in `saveIntelligenceResult`; `startJob` skips browser via `isPaidDirectoryNeedsReview`
- Tests: `directory-intelligence.test.ts` (mock fixtures only)

## Success criteria coverage

Mock fixtures distinguish free direct submission vs paid Needs Review. Category pages are not treated as submission pages. Automation opens verified `entry_url`; previously learned directory memory is stored on the site profile for reuse.
