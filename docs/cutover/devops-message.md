# Message to paste to DevOps

Copy/adapt below (attach the dump file via secure channel — it is **not** in GitLab).

---

Hi — Backlink Agent company stack is ready for deploy.

**Pull from GitLab**

- Frontend: http://gitlab.lstech-hq.lstechinc.com/websites/backlink-agent/-/tree/ba-frontend  
- Backend: http://gitlab.lstech-hq.lstechinc.com/websites/backlink-agent/-/tree/ba-backend  

Runbook: `docs/cutover/no-supabase-phase-6.md` on `ba-backend`.

**DB dump (sending separately — do not expect it in git)**

- File: `backlink-agent-local-20260811-210529.dump` (~1.11 MB, `pg_restore` custom format)  
- Restore helper: `scripts/cutover/restore-company-postgres.ps1`

**Env (DD3 root layout — next to `package.json`, not under `apps/`)**

- Backend: `cp .env.example .env` → set `LOCAL_JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGIN=<web URL>`  
- Frontend: `cp .env.example .env` and `.env.production` → `VITE_AUTH_MODE=local`, `VITE_API_URL=<api URL>`  
- No Supabase Cloud keys needed when `COMPANY_STACK=true`

**URLs for you to set on company host**

- Web public URL → API `CORS_ORIGIN`  
- API public URL → Web `VITE_API_URL`

**Already verified locally (2026-08-11)**

- Company Postgres restore (~151 public tables)  
- `/ready` + `/v1/auth/mode` (`companyStack: true`)  
- Signup → login → create org → create project  

Ping me with the final API + web hostnames once assigned.
