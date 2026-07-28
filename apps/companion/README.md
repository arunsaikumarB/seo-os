# SEO OS Companion — Phase 2.1 (Production Handoff)

Stateless delivery layer. **No chrome.storage. No business profile. No token cache.**

## Flow

1. Assisted Manual → **Open package**
2. API creates 5-minute **single-use** handoff (+ package in response)
3. SEO OS tab: `postMessage` hydrates Companion **in memory**
4. Directory tab: URL hash → one `GET /v1/extension/opportunity/current` → burn token
5. Fill Current Step → user reviews / CAPTCHA / Submit

## Install

```bash
cd apps/companion && npm run build
```

Load unpacked → `apps/companion/dist`

## Diagnostics

Message Received · Token Valid · Package Request Started · API Reachable · Authenticated · Package Loaded · Connected · Opportunity · Domain
