# Capability 1 — WordPress Intelligence

Extends Site Intelligence with deep WordPress knowledge. Does **not** change CSM, BEE, AI Review, or SIE architecture.

## What it adds

| Step | Capability |
|---|---|
| Detection | Multi-signal WP claim (≥2 markers): wp-content, wp-includes, wp-json, xmlrpc, wp-admin, generator, REST, RSS, theme assets |
| Plugins | CF7, Gravity, WPForms, Ninja, Elementor, Fluent, Jetpack, Yoast, RankMath, Classic/Gutenberg, Woo, MemberPress, UM, BuddyPress |
| Page intents | WP-aware Blog/Tag/Archive/Search/Author/Comment |
| Comment strategy | `Comment Posting` + payload hints (comment/author/email/website; skip article/images/metadata/video) |
| Guest post | Write For Us / submission form → `Guest Post` |
| Dashboard | wp-login / wp-admin / membership → `Dashboard Submission` + expected Login |
| Contact | Plugin-backed → `Contact Form Submission` |
| Email | Guidelines email → Outreach Queue flags; **no browser automation** |
| Learning | theme, plugins, method, URLs, fields, success rate on profile |
| Health | Campaign Health → WordPress Health strip |

## Files

- `packages/backlink-builder/src/wordpress-intelligence.ts`
- Hook: `enrichWithWordPressIntelligence` at end of `analyzeFetchedSite`
- API: outreach flags in `saveIntelligenceResult`; `startJob` skips browser for email strategy
- Tests: `wordpress-intelligence.test.ts`

## Success criteria coverage

Mock fixtures distinguish comment / guest post / contact / email workflows. Automation does not start until SIE+WP profile completes; email sites never open Chromium.
