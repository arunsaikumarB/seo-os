# 04 — API FREEZE

**Product:** SEO OS  
**Document Type:** Architecture Freeze — REST API Contract  
**Version:** 1.1.0-FROZEN  
**Base URL:** `https://api.{env}.seoos.io/v1`  
**Status:** Approved — Pending Formal Sign-Off

---

## Purpose

Lock REST conventions, endpoint inventory, auth/RBAC, pagination, errors, rate limits, validation, idempotency, and versioning. All frontend and worker clients implement against this contract.

---

## Final Decisions

### D1 — API Conventions (FROZEN)

| Rule                 | Value                                                           |
| -------------------- | --------------------------------------------------------------- |
| Style                | REST JSON                                                       |
| Version              | URL path `/v1`                                                  |
| Project-scoped paths | `/v1/projects/:projectId/...`                                   |
| Org-scoped paths     | `/v1/organizations/:orgId/...`                                  |
| User-scoped paths    | `/v1/me/...`                                                    |
| System paths         | `/v1/system/...` (authenticated admin+)                         |
| Demo paths           | `/v1/demo/...` (Owner/admin + `demoMode`)                       |
| Dates                | ISO 8601 UTC                                                    |
| IDs                  | UUID strings                                                    |
| Content-Type         | `application/json`; uploads `multipart/form-data`               |
| Correlation          | `X-Trace-Id` optional client header; server generates if absent |

### D2 — Authentication (FROZEN)

| Method       | Header                                 | Use                             |
| ------------ | -------------------------------------- | ------------------------------- |
| User session | `Authorization: Bearer <supabase_jwt>` | All user routes                 |
| Context      | `X-Org-Id: <uuid>`                     | Required on org/project routes  |
| Idempotency  | `Idempotency-Key: <uuid>`              | POST send, run, create campaign |

**No `X-Project-Id` header** — project ID is always in URL path.

**Public routes (no auth):** `GET /health`, `GET /ready`, `GET /v1/version`

### D3 — RBAC Permission Strings (FROZEN)

```
org:read                    viewer+
org:manage_team             admin+
org:manage_settings         admin+
org:view_audit              admin+
org:manage_providers        admin+
org:manage_email            admin+

project:read                viewer+
project:write               member+
project:manage              manager+
project:delete              admin+

prospects:read              viewer+
prospects:write             member+
prospects:delete            manager+

agents:run                  member+
agents:cancel_own           member+
agents:cancel_any           manager+
agents:approve_artifact     manager+

outreach:draft              member+
outreach:approve            manager+
outreach:send               manager+

content:read                viewer+
content:write               member+
content:approve             manager+

kb:read                     viewer+
kb:write                    member+
kb:delete                   manager+

memory:read                 viewer+
memory:write                member+
memory:approve_facts        manager+

reports:read                viewer+
reports:generate            member+

technical:crawl             manager+
technical:read              viewer+

demo:seed                   admin+ (org.demo_enabled)
demo:reset                  admin+
```

**Role → permission mapping:** Enforced in middleware via lookup table — not inline per route.

### D4 — Response Envelope (FROZEN)

**Single resource:**

```json
{ "data": {} }
```

**List (cursor pagination):**

```json
{
  "data": [],
  "pagination": {
    "nextCursor": "string|null",
    "prevCursor": "string|null",
    "limit": 50,
    "hasMore": true
  },
  "meta": {}
}
```

**Async accepted:**

```json
{
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "pollUrl": "/v1/...",
    "streamUrl": "/v1/.../stream"
  }
}
```

**Provider-backed data must include:**

```json
"meta": {
  "provider": "mock",
  "isEstimated": true,
  "dataSource": "demo",
  "cost": "free"
}
```

`dataSource` enum: `live` | `estimated` | `demo`

### D5 — Error Format (RFC 7807 — FROZEN)

```json
{
  "type": "https://docs.seoos.io/errors/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "Human-readable summary",
  "instance": "/v1/projects/...",
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "domain", "message": "..." }],
  "traceId": "abc123"
}
```

### D6 — HTTP Status Code Usage (FROZEN)

| Code | Usage                                              |
| ---- | -------------------------------------------------- |
| 200  | GET, PATCH success                                 |
| 201  | POST create                                        |
| 202  | Async job queued                                   |
| 204  | DELETE success                                     |
| 400  | Validation                                         |
| 401  | Missing/invalid JWT                                |
| 403  | RBAC or tenant or approval violation               |
| 404  | Not found (or hidden for tenancy)                  |
| 409  | Conflict / idempotency replay                      |
| 422  | Business rule (budget exceeded, domain unverified) |
| 429  | Rate limit                                         |
| 500  | Internal                                           |
| 503  | Queue/DB unavailable                               |

### D7 — Pagination (FROZEN)

- Default: cursor-based, `limit` default 50, max 100
- Cursor: opaque base64 JSON `{ "id", "sortValue" }`
- Offset allowed only: `GET /v1/organizations/:orgId/audit-log?page=1`

### D8 — Filtering & Sorting (FROZEN)

- Equality: `?status=qualified`
- Multi: `?status=new,qualified`
- Range: `?minScore=70&from=2026-06-01`
- Search: `?search=query` (trigram on whitelisted fields)
- Sort: `?sort=-createdAt` (whitelist per resource)

### D9 — Rate Limiting (FROZEN — MVP Single Instance)

| Scope              | Limit           |
| ------------------ | --------------- |
| IP unauthenticated | 60/min          |
| User               | 120/min         |
| Org                | 300/min         |
| Agent runs         | 10/hour/project |
| Email send         | 20/day/account  |
| Crawl start        | 3/day/project   |
| Demo reset         | 5/day/org       |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

### D10 — Idempotency (FROZEN)

**Persistent table:** `idempotency_keys`

**Required on:**

- `POST .../outreach/messages/:id/send`
- `POST .../agents/run` (optional but recommended)
- `POST .../demo/reset`

**Behavior:** Same key + same scope within 24h → return cached response with `409` or `200` (frozen: return `200` with same body + header `X-Idempotent-Replayed: true`)

### D11 — Caching (FROZEN)

| Endpoint                      | Cache-Control           |
| ----------------------------- | ----------------------- |
| GET dashboard/mission-control | `private, max-age=60`   |
| GET agent definitions         | `private, max-age=3600` |
| GET providers/status          | `private, max-age=60`   |
| Mutations                     | `no-store`              |

**MVP:** In-memory LRU per API instance — document single-instance deployment constraint.

### D12 — Validation (FROZEN)

- All bodies validated with Zod schemas from `packages/shared`
- `domain`: lowercase hostname, no protocol
- `email`: RFC 5322 simplified
- `url`: valid HTTPS preferred
- `agentType`: must exist in `agent_definitions`
- `role`: enum whitelist

---

## MVP Endpoint Inventory (FROZEN — 98 Endpoints)

### Auth & User (6)

| Method | Path                            |
| ------ | ------------------------------- |
| GET    | `/v1/me`                        |
| PATCH  | `/v1/me`                        |
| GET    | `/v1/me/notifications`          |
| PATCH  | `/v1/me/notifications/:id/read` |
| POST   | `/v1/me/notifications/read-all` |
| GET    | `/v1/me/onboarding`             |

### Organizations (12)

| Method | Path                                          |
| ------ | --------------------------------------------- |
| POST   | `/v1/organizations`                           |
| GET    | `/v1/organizations/:orgId`                    |
| PATCH  | `/v1/organizations/:orgId`                    |
| GET    | `/v1/organizations/:orgId/members`            |
| POST   | `/v1/organizations/:orgId/invites`            |
| POST   | `/v1/organizations/:orgId/invites/:id/resend` |
| DELETE | `/v1/organizations/:orgId/invites/:id`        |
| POST   | `/v1/invites/:token/accept`                   |
| PATCH  | `/v1/organizations/:orgId/members/:userId`    |
| DELETE | `/v1/organizations/:orgId/members/:userId`    |
| GET    | `/v1/organizations/:orgId/audit-log`          |
| GET    | `/v1/organizations/:orgId/executive`          |

### Projects (10)

| Method | Path                                    |
| ------ | --------------------------------------- |
| GET    | `/v1/organizations/:orgId/projects`     |
| POST   | `/v1/organizations/:orgId/projects`     |
| GET    | `/v1/projects/:projectId`               |
| PATCH  | `/v1/projects/:projectId`               |
| DELETE | `/v1/projects/:projectId`               |
| POST   | `/v1/projects/:projectId/verify-domain` |
| GET    | `/v1/projects/:projectId/verify-domain` |
| GET    | `/v1/projects/:projectId/settings`      |
| PATCH  | `/v1/projects/:projectId/settings`      |
| POST   | `/v1/projects/:projectId/export`        |

### Mission Control & Search (4)

| Method | Path                                      |
| ------ | ----------------------------------------- |
| GET    | `/v1/projects/:projectId/mission-control` |
| GET    | `/v1/projects/:projectId/activity`        |
| GET    | `/v1/search`                              |
| POST   | `/v1/search/reindex`                      |

### AI Agents (14)

| Method | Path                                                    |
| ------ | ------------------------------------------------------- |
| GET    | `/v1/projects/:projectId/agents/definitions`            |
| GET    | `/v1/projects/:projectId/agents/definitions/:agentType` |
| POST   | `/v1/projects/:projectId/agents/run`                    |
| GET    | `/v1/projects/:projectId/agents/runs`                   |
| GET    | `/v1/projects/:projectId/agents/runs/:runId`            |
| GET    | `/v1/projects/:projectId/agents/runs/:runId/stream`     |
| POST   | `/v1/projects/:projectId/agents/runs/:runId/cancel`     |
| POST   | `/v1/projects/:projectId/agents/runs/:runId/retry`      |
| GET    | `/v1/projects/:projectId/agents/runs/:runId/artifacts`  |
| GET    | `/v1/projects/:projectId/agents/runs/:runId/steps`      |
| POST   | `/v1/projects/:projectId/agents/artifacts/:id/approve`  |
| POST   | `/v1/projects/:projectId/agents/artifacts/:id/reject`   |
| GET    | `/v1/projects/:projectId/agents/usage`                  |
| POST   | `/v1/projects/:projectId/agents/plan`                   |

### Knowledge Base (8)

| Method | Path                                                      |
| ------ | --------------------------------------------------------- |
| GET    | `/v1/projects/:projectId/knowledge/documents`             |
| POST   | `/v1/projects/:projectId/knowledge/documents/upload`      |
| POST   | `/v1/projects/:projectId/knowledge/documents/url`         |
| GET    | `/v1/projects/:projectId/knowledge/documents/:id`         |
| DELETE | `/v1/projects/:projectId/knowledge/documents/:id`         |
| POST   | `/v1/projects/:projectId/knowledge/documents/:id/reindex` |
| POST   | `/v1/projects/:projectId/knowledge/search`                |
| GET    | `/v1/projects/:projectId/knowledge/status`                |

### Memory (7)

| Method | Path                                         |
| ------ | -------------------------------------------- |
| GET    | `/v1/projects/:projectId/memory/entries`     |
| POST   | `/v1/projects/:projectId/memory/entries`     |
| DELETE | `/v1/projects/:projectId/memory/entries/:id` |
| GET    | `/v1/projects/:projectId/memory/facts`       |
| POST   | `/v1/projects/:projectId/memory/facts`       |
| PATCH  | `/v1/projects/:projectId/memory/facts/:id`   |
| POST   | `/v1/projects/:projectId/memory/search`      |

### Prospects (7)

| Method | Path                                           |
| ------ | ---------------------------------------------- |
| GET    | `/v1/projects/:projectId/prospects`            |
| POST   | `/v1/projects/:projectId/prospects`            |
| GET    | `/v1/projects/:projectId/prospects/:id`        |
| PATCH  | `/v1/projects/:projectId/prospects/:id`        |
| DELETE | `/v1/projects/:projectId/prospects/:id`        |
| POST   | `/v1/projects/:projectId/prospects/bulk`       |
| POST   | `/v1/projects/:projectId/prospects/:id/enrich` |

### Backlink Builder & Backlinks (9)

| Method | Path                                                  |
| ------ | ----------------------------------------------------- |
| GET    | `/v1/projects/:projectId/backlink-builder/overview`   |
| GET    | `/v1/projects/:projectId/backlink-builder/categories` |
| GET    | `/v1/projects/:projectId/playbooks`                   |
| POST   | `/v1/projects/:projectId/playbooks/:id/activate`      |
| GET    | `/v1/projects/:projectId/backlinks`                   |
| POST   | `/v1/projects/:projectId/backlinks`                   |
| GET    | `/v1/projects/:projectId/backlinks/:id`               |
| POST   | `/v1/projects/:projectId/backlinks/:id/verify`        |
| GET    | `/v1/projects/:projectId/backlinks/:id/checks`        |

### Content (8)

| Method | Path                                           |
| ------ | ---------------------------------------------- |
| GET    | `/v1/projects/:projectId/content`              |
| POST   | `/v1/projects/:projectId/content`              |
| GET    | `/v1/projects/:projectId/content/:id`          |
| PATCH  | `/v1/projects/:projectId/content/:id`          |
| POST   | `/v1/projects/:projectId/content/:id/generate` |
| GET    | `/v1/projects/:projectId/content/:id/versions` |
| POST   | `/v1/projects/:projectId/content/:id/approve`  |
| GET    | `/v1/projects/:projectId/content/:id/export`   |

### Outreach (14)

| Method | Path                                                     |
| ------ | -------------------------------------------------------- |
| GET    | `/v1/projects/:projectId/outreach/threads`               |
| POST   | `/v1/projects/:projectId/outreach/threads`               |
| GET    | `/v1/projects/:projectId/outreach/threads/:id`           |
| GET    | `/v1/projects/:projectId/outreach/approvals`             |
| POST   | `/v1/projects/:projectId/outreach/messages`              |
| PATCH  | `/v1/projects/:projectId/outreach/messages/:id`          |
| POST   | `/v1/projects/:projectId/outreach/messages/:id/submit`   |
| POST   | `/v1/projects/:projectId/outreach/messages/:id/approve`  |
| POST   | `/v1/projects/:projectId/outreach/messages/:id/reject`   |
| POST   | `/v1/projects/:projectId/outreach/messages/:id/send`     |
| POST   | `/v1/projects/:projectId/outreach/messages/:id/generate` |
| GET    | `/v1/projects/:projectId/campaigns`                      |
| POST   | `/v1/projects/:projectId/campaigns`                      |
| GET    | `/v1/projects/:projectId/campaigns/:id`                  |

### Competitors & Keywords (8)

| Method           | Path                                           |
| ---------------- | ---------------------------------------------- |
| GET/POST         | `/v1/projects/:projectId/competitors`          |
| GET/PATCH/DELETE | `/v1/projects/:projectId/competitors/:id`      |
| POST             | `/v1/projects/:projectId/competitors/:id/sync` |
| GET              | `/v1/projects/:projectId/keywords`             |
| POST             | `/v1/projects/:projectId/keywords`             |
| PATCH/DELETE     | `/v1/projects/:projectId/keywords/:id`         |

### Technical SEO (7)

| Method | Path                                           |
| ------ | ---------------------------------------------- |
| GET    | `/v1/projects/:projectId/technical/overview`   |
| POST   | `/v1/projects/:projectId/technical/crawls`     |
| POST   | `/v1/projects/:projectId/technical/quick-scan` |
| GET    | `/v1/projects/:projectId/technical/crawls/:id` |
| GET    | `/v1/projects/:projectId/technical/issues`     |
| GET    | `/v1/projects/:projectId/technical/robots`     |
| POST   | `/v1/projects/:projectId/technical/cwv`        |

### Analytics & Reports (8)

| Method | Path                                           |
| ------ | ---------------------------------------------- |
| GET    | `/v1/projects/:projectId/analytics/overview`   |
| GET    | `/v1/projects/:projectId/analytics/outreach`   |
| GET    | `/v1/projects/:projectId/analytics/ai`         |
| POST   | `/v1/projects/:projectId/analytics/import/gsc` |
| GET    | `/v1/projects/:projectId/reports`              |
| POST   | `/v1/projects/:projectId/reports`              |
| GET    | `/v1/projects/:projectId/reports/:id`          |
| GET    | `/v1/projects/:projectId/reports/:id/download` |

### Email & Integrations (4)

| Method | Path                                                    |
| ------ | ------------------------------------------------------- |
| GET    | `/v1/organizations/:orgId/email-accounts`               |
| POST   | `/v1/organizations/:orgId/email-accounts/connect/gmail` |
| DELETE | `/v1/organizations/:orgId/email-accounts/:id`           |
| GET    | `/v1/integrations/catalog`                              |

### System, Providers, Demo (8)

| Method | Path                   |
| ------ | ---------------------- |
| GET    | `/health`              |
| GET    | `/ready`               |
| GET    | `/v1/version`          |
| GET    | `/v1/system/health`    |
| GET    | `/v1/system/queues`    |
| GET    | `/v1/providers/status` |
| POST   | `/v1/demo/seed`        |
| POST   | `/v1/demo/reset`       |

### AI Command Center (8) — MVP Mandatory

| Method | Path                                           | Description                        | Min Role |
| ------ | ---------------------------------------------- | ---------------------------------- | -------- |
| GET    | `/v1/projects/:projectId/ai/conversations`     | List chat sessions                 | member   |
| POST   | `/v1/projects/:projectId/ai/conversations`     | New conversation                   | member   |
| GET    | `/v1/projects/:projectId/ai/conversations/:id` | Get messages                       | member   |
| POST   | `/v1/projects/:projectId/ai/chat`              | Send message (SSE stream)          | member   |
| DELETE | `/v1/projects/:projectId/ai/conversations/:id` | Delete session                     | member   |
| POST   | `/v1/projects/:projectId/ai/chat/run-agent`    | Convert intent to agent run        | member   |
| GET    | `/v1/projects/:projectId/ai/timeline`          | AI activity timeline aggregate     | viewer   |
| GET    | `/v1/projects/:projectId/ai/health`            | AI provider health (project scope) | viewer   |

**SSE chat events:** `token`, `citation`, `agent_delegated`, `complete`, `error`

**Total: 106 endpoints**

### D13 — Approval Gate (FROZEN)

`ApprovalPolicyService` is the **only** path to transition `outreach_messages.status` to `sent`.

Required fields on send:

- `status === 'approved'`
- `approved_by` NOT NULL
- `approved_at` NOT NULL
- Caller has `outreach:send` permission

Reject → `revision_requested` → must re-submit before approve.

### D14 — Versioning Strategy (FROZEN)

- Breaking changes → `/v2`
- Deprecation: `Sunset` + `Link` headers, minimum 6 months post-GA
- Non-breaking: optional fields only

### D15 — Webhooks (FROZEN — Stub Only MVP)

No webhook delivery in MVP.  
Tables deferred.  
`POST /v1/webhooks` returns `501 Not Implemented` with link to waitlist.

---

## Assumptions

1. Single API deployment (no horizontal scale) for MVP
2. SSE supported by Railway/Render proxy (no buffering)
3. Max upload size 50MB via multipart
4. OpenAPI 3.1 spec generated from Zod at build time (Week 2 deliverable)

---

## Risks

| Risk                                                     | Mitigation                                    |
| -------------------------------------------------------- | --------------------------------------------- |
| 98 endpoints = large surface                             | Generate routes from registry; contract tests |
| In-memory rate limit + idempotency breaks multi-instance | Infra freeze: single instance MVP             |
| SSE proxy timeout                                        | Keep-alive ping every 15s                     |

---

## Resolved Open Questions

| ID   | Decision                                             |
| ---- | ---------------------------------------------------- |
| AQ-1 | OpenAPI at `/v1/openapi.json`: **Yes, staging only** |
| AQ-2 | Search scope: **Org + active project context**       |

## Open Questions

**None.**

---

## Review Checklist

- [ ] All UI pages have backing API endpoints
- [ ] Permission strings cover all mutating routes
- [ ] No `/workspace/` in any path
- [ ] Idempotency on send frozen
- [ ] Approval gate centralized — documented
- [ ] Provider meta required on estimated data responses
- [ ] Demo endpoints restricted to demo-enabled orgs
- [ ] Error code catalog matches middleware implementation plan
- [ ] 98 endpoints reviewed against Database Freeze tables

---

## Sign-Off Criteria

| Role               | Criteria                                | Sign-Off |
| ------------------ | --------------------------------------- | -------- |
| Principal Engineer | Endpoint inventory complete             | ☐        |
| Frontend Lead      | All screens mapped to endpoints         | ☐        |
| Security           | RBAC matrix covers sensitive routes     | ☐        |
| QA                 | Contract test plan covers all endpoints | ☐        |
| CTO                | Scope matches Product Freeze            | ☐        |

---

_Supersedes: API Specification v1.0 where paths conflict._
