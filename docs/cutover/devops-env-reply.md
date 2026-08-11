# Reply to DevOps — company `.env` (DD3 root layout)

Paste this.

---

You're right — use the **DD3 layout**: `.env` at the **repo root** (next to `package.json`), not under `apps/`.

There is no committed real `.env` in GitLab (secrets stay off git). Copy from `.env.example`.

### Backend (`ba-backend`)

```bash
cd /opt/www/backlink-agent   # ba-backend root
cp .env.example .env
nano .env
```

```env
NODE_ENV=production
PORT=3001
COMPANY_STACK=true
LOCAL_JWT_SECRET=<random 32+ characters>
DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:PORT/backlink_agent
CORS_ORIGIN=https://<your-web-url>
PROVIDER_MODE=mvp
ENABLE_WORKERS=true
```

Do **not** put this under `apps/api/.env` on company servers.

### Frontend (`ba-frontend`)

```bash
cd /opt/www/backlink-agent   # ba-frontend root
cp .env.example .env
cp .env.example .env.production
nano .env
nano .env.production
```

```env
VITE_AUTH_MODE=local
VITE_API_URL=https://<your-api-url>
```

For internal QA on the same host:

```env
VITE_AUTH_MODE=local
VITE_API_URL=http://localhost:3001
```

Build from **this same root** (not `cd apps/web`):

```bash
npm install
npm run build
# -> apps/web/dist
```

### Verify

1. `GET /ready` → database ok, `dataMode=pg`
2. `GET /v1/auth/mode` → `companyStack: true`

### Note

Local developer laptops may still use `apps/api/.env` + `apps/web/.env` for Supabase demos. **Company/DD3 deploy = root `.env` only.**

---
