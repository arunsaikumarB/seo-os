# Version 0.98 — Integrations Platform

**Version:** `10.0.0-integrations` / tag **v0.98.0**  
**Scope:** Provider-based Integration Hub connecting SEO OS to external services.  
**Out of scope:** Ahrefs, Semrush, Moz, Facebook, LinkedIn, Chrome Extension, Marketplace.

---

## 1. Architecture

```
Provider catalog (@seo-os/integrations)
        │
   IntegrationProvider contract
   (connect · disconnect · health · sync · permissions · refresh · usage)
        │
        ▼
 integrations.service
   encrypted credentials · sync jobs · snapshots · usage
        │
   ┌────┼────────┬──────────┐
   ▼    ▼        ▼          ▼
 API  pg-boss  Platform   Reports/Analytics
      LOW      events     metrics enrichment
```

Providers: GSC, GA4, SMTP, Gmail, Outlook, WordPress, Slack — each independently replaceable.

---

## 2. Database

Migration **`020_epic10_integrations_platform.sql`**:

| Table | Purpose |
|-------|---------|
| `integration_connections` | Connected providers per org/workspace |
| `integration_credentials` | AES-256-GCM encrypted secrets (no client RLS read) |
| `integration_sync_jobs` | Sync queue with retry/conflict |
| `integration_sync_logs` | Per-job logs |
| `integration_usage` | Usage metrics |
| `integration_snapshots` | Synced payloads (GSC/GA4/WP/Slack) |

---

## 3. APIs

Base: `/v1/projects/:projectId/integrations`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/summary` | Hub + MC stats |
| GET | `/catalog` | Available providers |
| GET/POST | `/connections` | List / connect |
| POST | `/connections/:id/disconnect` | Disconnect |
| POST | `/connections/:id/health` | Health check |
| POST | `/connections/:id/refresh` | Token refresh |
| POST | `/connections/:id/sync` | Manual/scheduled sync |
| GET | `/connections/:id/permissions` | Scopes |
| GET | `/sync-jobs` | Sync history |
| GET | `/usage` | Usage metrics |
| GET | `/metrics` | Latest GSC/GA4 snapshots |
| POST | `/connections/:id/wordpress/drafts` | AI draft (user-controlled publish) |

---

## 4. Provider Interfaces

`IntegrationProvider` requires: Connect, Disconnect, Health Check, Sync, Permissions, Token Refresh, Usage Metrics.  
Email providers reuse Outreach Engine (`smtp` / `gmail` / `outlook`) via existing `@seo-os/providers` abstraction.

---

## 5. UI

- `/projects/:id/integrations/hub` — Integration Hub
- `/org/integrations` — same hub (uses current project context)
- Mission Control **Integrations** widget
- Feature flag: `integrations: true`

Hub shows: Connected, Available, Status, Last Sync, Sync History, Errors, Usage, Permissions.

---

## 6. Sync Engine

- Modes: full · incremental · manual · scheduled  
- Queue: `QUEUES.LOW` / `integration.sync`  
- Retry with backoff, conflict status, sync logs, cursor storage  
- Fallback sync when workers offline

---

## 7. Mission Control

Widget: Connected count, Sync queue, Last sync, Failed syncs, API health.

---

## 8. Security Review

| Control | Status |
|---------|--------|
| Encrypted credential storage (AES-256-GCM) | Yes |
| Credentials table deny-all RLS for clients | Yes |
| Token refresh + key_version / rotated_at | Yes |
| Permission scopes on connection | Yes |
| Audit logs via platform event bus | Yes |
| Secret rotation support (key_version) | Yes |
| Full Google OAuth redirect flow | Stub connect (credentials payload) — debt |

---

## 9. Risks

- Live GSC/GA4/Slack APIs are stubbed until OAuth app credentials are configured
- Org hub requires an active project context for API calls
- Unique connection index may need ops care for multi-account same provider

---

## 10. Technical Debt

- Implement real OAuth redirect + callback endpoints
- Nodemailer / Gmail API / Graph live sends (email still stubbed in providers package)
- WordPress REST live CRUD; publishing remains user-gated by design
- Slack Incoming Webhooks / Bot token live posts
- Scheduled sync cron worker beyond on-demand queue

---

## 11. Release Readiness

**86 / 100**

| Area | Score |
|------|-------|
| Architecture / package | 92 |
| Database / security | 90 |
| API + sync engine | 88 |
| UI + MC | 85 |
| Analytics/Reports enrichment | 85 |
| Live external API fidelity | 65 |

Ready for **v0.98.0**. Wait for approval before Version 0.99.
