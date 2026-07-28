# SEO OS Companion — Phase 1 (MVP)

Manifest V3 browser extension for Chromium (Chrome, Brave, Edge, Arc, Opera).

Floating widget on every page → detect form fields → match via alias dictionary → **Fill Form** with your business profile. Never submits, never solves CAPTCHA, never fills login/payment forms.

## Install (unpacked)

```bash
cd apps/companion
npm install
npm run build
```

1. Open `chrome://extensions` (or Brave/Edge equivalent)
2. Enable **Developer mode**
3. **Load unpacked** → select `apps/companion/dist`

## Dev

```bash
npm run dev
```

CRXJS serves an unpacked extension; load the path printed by Vite (usually `apps/companion/dist`).

## Usage

1. Click the toolbar icon → edit **business profile** → Save  
2. Open any submission/directory page  
3. Click the teal **S** FAB (bottom-right) to expand  
4. Press **Fill Form** → read Matched / Filled / Skipped summary  

## Architecture (modular for later phases)

| Module | Role |
|--------|------|
| `core/detect` | Find `input` / `textarea` / `select`, read labels & signals |
| `core/match` | Alias dictionary + confidence scoring |
| `core/fill` | Write values; **never** clicks Submit |
| `core/safety` | Skip login, payment, CAPTCHA-related controls |
| `core/profile` | Sync storage for fill values |
| `core/hooks` | Stubs for Phase 2 domain learning & Phase 3 AI matching |
| `components/Widget` | Collapsed FAB → expanded panel |
| `popup` | Profile editor |
| `background` | MV3 service worker |

## Safety (hard rules)

- Fill only medium/high confidence matches  
- Skip unknown fields  
- Never click Submit  
- Never solve CAPTCHA  
- Never interact with login or payment forms  

## Phase roadmap hooks

- **Phase 2:** `DomainLearningHook.getDomainAliases(hostname)`  
- **Phase 3:** `AiMatchHook.suggestRole(field)`
