# API Documentation (ops + version)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | no | Liveness |
| `GET /ready` | no | Readiness (DB, queue, encryption) |
| `GET /metrics` | no* | In-process latency counters |
| `GET /ops/health` | no* | Aggregated app/DB/queue/AI/integrations |
| `GET /v1/version` | no | `11.0.0-production-ready` |

\* Restrict at the edge (IP allowlist / auth) for public internet if desired.

Product APIs remain under `/v1/projects/:projectId/...` with Bearer JWT + RBAC.

Full module surfaces: Intelligence, Campaigns, Backlink Builder, Outreach, Workflows, Analytics, Reports, Technical SEO, Integrations.
