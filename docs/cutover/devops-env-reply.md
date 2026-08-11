# Reply to DevOps — “.env is not set up right”

Paste this (adjust URLs when you have company hostnames).

---

You're right that there is **no committed `.env`** in GitLab (by design — secrets stay off git).

Use the **company** examples only (ignore Supabase / Railway / Netlify values).

### Backend (`ba-backend`)

```bash
cp apps/api/.env.company.example apps/api/.env
```

Edit `apps/api/.env` to:

```env
NODE_ENV=production
PORT=3001
COMPANY_STACK=true
LOCAL_JWT_SECRET=<generate-a-random-string-at-least-32-chars>
DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:DB_PORT/backlink_agent
CORS_ORIGIN=https://<YOUR_WEB_PUBLIC_URL>
PROVIDER_MODE=mvp
ENABLE_WORKERS=true
```

Notes:
- `COMPANY_STACK=true` is required — it turns on local auth + direct Postgres.
- **Do not** require `SUPABASE_URL` / anon / service role keys when `COMPANY_STACK=true`.
- Restore the dump into Postgres **before** starting the API.
- `DATABASE_URL` must point at **your** company Postgres (not localhost:54322 Supabase).

### Frontend (`ba-frontend`)

```bash
cp apps/web/.env.company.example apps/web/.env
```

Edit `apps/web/.env` to:

```env
VITE_AUTH_MODE=local
VITE_API_URL=https://<YOUR_API_PUBLIC_URL>
```

Notes:
- `VITE_AUTH_MODE=local` is required (no Supabase Auth in browser).
- **Do not** set Railway / cloud Supabase URLs.
- Rebuild web after changing `VITE_*` (`npm run build`).

### Quick verify after start

1. `GET https://<API>/ready` → database ok, `dataMode` = `pg`
2. `GET https://<API>/v1/auth/mode` → `companyStack: true`, `authMode: local`, `supabaseRequired: false`
3. Open web → signup/login (local password, not Google/Supabase)

### Common mistakes

| Mistake | Fix |
| --- | --- |
| Copied `.env.example` (Supabase placeholders) | Use `.env.company.example` |
| Left `LOCAL_JWT_SECRET=replace-with-...` | Put a real 32+ char secret |
| Looking for Supabase keys | Not needed for company stack |
| Web still has `VITE_AUTH_MODE=supabase` | Set `local` |
| `CORS_ORIGIN` / `VITE_API_URL` mismatch | Web URL ↔ API URL must match each other |
| Dump not restored | API will fail DB checks |

Full runbook: `docs/cutover/no-supabase-phase-6.md` on `ba-backend`.

If you paste your current (redacted) `.env` keys/names only — no secrets — I can spot the mismatch.
