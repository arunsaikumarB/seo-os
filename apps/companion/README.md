# SEO OS Companion — Phase 2.2 (Activate Package)

Lightweight browser assistant. **One active package in memory. No tokens. No chrome.storage. No backend fetch after activate.**

## Flow

1. Assisted Manual → **Activate Package** (sends full package via `postMessage`)
2. Companion replaces any previous package in memory (synced via service worker for other tabs)
3. **Open website** → directory form
4. **Fill Current Step** → uses only the in-memory package
5. User reviews / CAPTCHA / Submit
6. **Clear Package** or close browser → memory empty

## Install

```bash
cd apps/companion && npm run build
```

Load unpacked → `apps/companion/dist` (reload after rebuild)

## Diagnostics

Connected · Package Loaded · Current Opportunity · Current Domain · Fields · Generated
