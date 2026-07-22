# Capability 3 — Contact Form Intelligence

Extends Site Intelligence for contact-form / outreach workflows. Does **not** change CSM, BEE, AI Review, SIE architecture, WordPress Intelligence, or Directory Intelligence.

## What it adds

| Step | Capability |
|---|---|
| Detection | Multi-signal form claim (≥2): contact heading/URL, form tag, email/message fields, CF7/Gravity/WPForms/HubSpot/Typeform/Google/Jotform |
| Platform | CF7, Gravity, WPForms, Ninja, Elementor, Fluent, HubSpot, Typeform, Google Forms, Jotform, Tally, Zoho, Airtable, Custom HTML |
| Intent | Guest Post / Write For Us / Business Listing / Advertising / Partnership / Media / Support / Sales / Newsletter / Jobs / Feedback / General — **not every form is a backlink path** |
| Field map | Name, email, message, company, website, attachments, etc. Honeypots excluded from visible fields |
| Strategy | Guest Post / Business Listing / Partnership / General Outreach / Media Request / Advertising / Unsupported |
| Messages | Strategy-specific subject + body outline (never one prompt for all) |
| Attachments | Images / PDF / DOCX / ZIP / media kit awareness |
| Anti-spam | Honeypot, Turnstile, reCAPTCHA, hCaptcha, math CAPTCHA — **never auto-solve** |
| Validation | Required fields, email/URL/phone patterns, maxlength, accept formats |
| Success | Thank-you / confirmation / redirect patterns stored — never assume success |
| Learning | Platform, strategy, fields, attachments, validation, success indicators |
| Health | Campaign Health → Contact Form Health strip |
| Outreach | Editorial/general contact → Outreach stage + professional message; **browser still submits** |

## Soft-attach rules

When WordPress already owns guest post / comment / dashboard / email, or Directory owns a path, Contact Form knowledge is attached without overriding that strategy. Contact-form-only sites (or WP contact_form workflow) get full strategy enrichment.

## Files

- `packages/backlink-builder/src/contact-form-intelligence.ts`
- Hook: `enrichWithContactFormIntelligence` after Directory enrich in `analyzeFetchedSite`
- API: learning seed + outreach metadata in `saveIntelligenceResult`
- Tests: `contact-form-intelligence.test.ts` (mock fixtures only)

## Success criteria coverage

Mock fixtures distinguish CF7 general contact, Write For Us guest post, media outreach, and job forms (Unsupported). CAPTCHA is expected intervention; honeypots are never filled; strategy is chosen before `entry_url` execution.
