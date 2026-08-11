# Local Development Guide (no cloud deploys)

Run the **entire app on your machine**. Production (Netlify / Railway / cloud Supabase) is left alone.

- Candidate demo on this PC: [demo-today.md](./demo-today.md)  
- Azure QA handoff for DevOps: [azure-qa-deploy.md](./azure-qa-deploy.md)

Cloud credentials are backed up as `apps/api/.env.cloud.bak` and `apps/web/.env.cloud.bak` (gitignored). To switch back to cloud env later, copy those over `.env`.

## Prerequisites

| Tool | Purpose |
| --- | --- |
| Node.js ≥ 20 | Runtime |
| Docker Desktop | Local containers |
| Supabase CLI | Local Postgres + Auth + Storage |
| pgAdmin (browser UI) | Manage local Postgres |

## One-time / daily start

```powershell
# 1) Docker Desktop must be running

# 2) Local Supabase (Postgres :54322, Auth/API :54321, Studio :54323)
supabase start

# 3) pgAdmin 4 UI
docker compose up -d pgadmin

# 4) Ensure apps point at localhost (see Env files below)
#    First time: migrations already applied by `supabase start`

# 5) Run API + Web
npm run dev
```

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:3001 |
| Supabase Studio | http://127.0.0.1:54323 |
| pgAdmin | http://localhost:5050 |
| Local mail (Mailpit) | http://127.0.0.1:54324 |

## Env files (localhost)

### `apps/api/.env`

```env
NODE_ENV=development
PORT=3001
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from: supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from: supabase status>
SUPABASE_JWT_SECRET=<from: supabase status>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
CORS_ORIGIN=http://localhost:5173
PROVIDER_MODE=mvp
# true = Link Probe / submit queues run (required for AI Review → Approve)
ENABLE_WORKERS=true
```

### `apps/web/.env`

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<same anon key>
VITE_API_URL=http://localhost:3001
```

Print keys anytime:

```powershell
supabase status -o env
```

## pgAdmin 4 connection

1. Open http://localhost:5050  
2. Login: `admin@example.com` / `admin`  
3. **Register → Server**:
   - Host: `host.docker.internal` (or `172.17.0.1` if that fails)
   - Port: `54322`
   - Database: `postgres`
   - Username: `postgres`
   - Password: `postgres`

Desktop pgAdmin 4 (installed on Windows) can use Host `127.0.0.1` Port `54322` with the same user/password.

## Auth (local)

Signup is enabled locally (`supabase/config.toml`).

1. Open http://localhost:5173/signup  
2. Create an account (email confirmation goes to Mailpit: http://127.0.0.1:54324)  
3. Or confirm via Supabase Studio → Authentication → Users

## Useful commands

| Command | Description |
| --- | --- |
| `supabase start` | Start local DB + Auth |
| `supabase stop` | Stop local Supabase |
| `supabase status` | URLs + keys |
| `npm run db:push` | Apply new migrations |
| `npm run dev` | API + Web |
| `docker compose up -d pgadmin` | Start pgAdmin only |
| `docker compose --profile bare-postgres up -d postgres` | Bare Postgres **without** Supabase CLI (do not combine with `supabase start`) |

## Do not disturb production

- Do **not** point local `.env` at Railway/Netlify/cloud Supabase while developing locally.
- Do **not** run `railway up` / Netlify deploy for day-to-day local work.
- Restore cloud env from `*.env.cloud.bak` only when you intentionally need cloud again.
