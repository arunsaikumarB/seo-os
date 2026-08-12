# Reply to DevOps — company `.env` (DD3 root layout)

Paste this.

---

Use a file named **`.env`** (not `root.env`). Put it next to `package.json`. The API loads `CORS_ORIGIN` from that `.env` on startup.

There is no committed real `.env` in GitLab (secrets stay off git). Copy from `.env.example`.

### Backend (`ba-backend`)

```bash
cd /opt/www/backlink-agent   # ba-backend — same folder as package.json
cp .env.example .env
nano .env
```

```env
NODE_ENV=production
PORT=3001
COMPANY_STACK=true
LOCAL_JWT_SECRET=<random 32+ characters>
DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:PORT/backlink_agent
CORS_ORIGIN=http://10.0.12.193:5000
PROVIDER_MODE=mvp
ENABLE_WORKERS=true
```

After restart, PM2 logs should show:
`[api] dotenv loaded from: .../.env`
`[api] CORS_ORIGIN= http://10.0.12.193:5000`

`CORS_ORIGIN` must be the **exact frontend URL** the browser uses (scheme + IP/host + port).  
Current company pair: web `http://10.0.12.193:5000` → in `.env`: `CORS_ORIGIN=http://10.0.12.193:5000`  
(Internal LAN only: `CORS_ORIGIN=*` also works.)

Do **not** use a file named `root.env`. Do **not** put company secrets under `apps/api/.env`.

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
