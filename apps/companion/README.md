# SEO OS Companion — Phase 1.1 (Form Intelligence)

Manifest V3 extension for Chromium (Chrome, Brave, Edge, Arc, Opera).

Deterministic form intelligence: richer DOM scan, per-field classification, weighted confidence ≥80%, inspect overlays, fill highlights, Next Missing. **No AI. No auto-submit.**

## Install

```bash
cd apps/companion
npm install
npm run build
```

Load unpacked → `apps/companion/dist`

## Phase 1.1 features

| Feature | Behavior |
|---------|----------|
| DOM scanner | `input`, `textarea`, `select`, radio, checkbox, `contenteditable` |
| Classifier | Per-field roles (never page-level “payment”) |
| Pricing | Skip payment/pricing controls only; still fill business fields |
| Confidence | Exact label +60, placeholder +25, name +20, aria +20, nearby +15, section +10 · fill ≥80% |
| Inspect Fields | Color overlays + hover tooltip (role / confidence / alias) |
| After fill | Green filled · yellow skipped · red required missing |
| Summary | Detected / Filled / Skipped / Missing / CAPTCHA + missing required list |
| Next Missing | Scrolls to next required unfilled field |
| Debug | Console log of each field’s confidence & matched-by |

## Safety

- Never click Submit
- Never solve CAPTCHA
- Never fill login or payment fields
- Unknown / low-confidence fields skipped

## Modules

- `core/detect/dom-scanner.ts`
- `core/match/{aliases,confidence,classifier}.ts`
- `core/fill/form-filler.ts`
- `core/overlay/{inspector,highlights,missing-nav}.ts`
- `core/hooks.ts` — Phase 2/3 stubs
