# Architecture (v0.99 snapshot)

```
Web (Netlify SPA)
   │  Bearer JWT
   ▼
API (Railway Express)
   ├─ RBAC + rate limit + metrics
   ├─ Modules (workforce → integrations)
   ├─ pg-boss workers
   └─ Supabase (Postgres + Auth + RLS)
```

Observability: pino logs + `/metrics` + `/ops/health`  
Secrets: env + AES-GCM for integration credentials  
No new business domains in 0.99 — readiness only.
