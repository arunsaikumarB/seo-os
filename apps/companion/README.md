# SEO OS Companion — Phase 2 (Opportunity-Aware)

Lightweight **delivery layer** for SEO OS. The extension never owns business data.

## Architecture

```
SEO OS → Current Opportunity → Generated Package → Open Package
  → Companion fetches package → Analyze submission form → Fill → User reviews / CAPTCHA / Submit
```

## Install

```bash
cd apps/companion
npm run build
```

Load unpacked → `apps/companion/dist`

## Usage

1. Install Companion  
2. In SEO OS **Assisted Manual**, click **Open package**  
3. Directory tab opens with a short-lived handoff token  
4. Companion shows **Connected · Current Opportunity · domain**  
5. Click **Fill Current Step**  
6. Review, solve CAPTCHA, submit yourself  

## Removed (Phase 1)

- Business profile editor  
- Demo values  
- Local company data storage  

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/projects/:id/extension/handoff` | User JWT + X-Org-Id |
| GET | `/v1/extension/opportunity/current` | Handoff Bearer token |

## Safety

Never Submit · Never CAPTCHA · Never payment/login · Never guess unknown fields  

## Learning

`core/learning/store.ts` is a stub for Phase 3 mappings / wizard memory.
