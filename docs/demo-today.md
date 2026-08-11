# Candidate demo today (local machine)

Production API (Railway) is down. For today’s demo, use the **local stack on this PC**.

## Before she arrives

1. Docker Desktop running  
2. `supabase start`  
3. `docker compose up -d pgadmin` (optional)  
4. From repo root: `npm run dev`  
5. Confirm:
   - Web: http://localhost:5173  
   - API: http://localhost:3001/health → `ok`

## How she uses the app

| Situation | What to do |
| --- | --- |
| **Same desk / your laptop** | Open http://localhost:5173 — create her a user (sign up) on **local** Supabase |
| **Another PC on office LAN** | Share your machine IP + open Windows Firewall for 5173/3001/54321, set `CORS_ORIGIN` + Vite env to that IP — brittle; prefer same machine or Azure QA |
| **Remote (home)** | Wait for Azure QA **or** ask eng to open a temporary tunnel (API + web + auth must all be reachable) |

**Recommended for today:** she sits with you (or uses your machine / shared screen + she drives mouse) on **localhost**.

## Demo path to walk through

1. Sign up / sign in  
2. Create organization  
3. Create project / site  
4. **Create** opportunities → **Import** → **AI Review**  
5. **Generate Content** (keywords + further info + article from bank / LLM)  
6. **Submit** → **Results** → **Reports**  
7. Optional: Companion extension from `apps/companion/dist` (Load unpacked)

## Local mail (if magic-link / confirm email)

Mailpit: http://127.0.0.1:54324  

## Azure QA (parallel track)

Hand `docs/azure-qa-deploy.md` + GitHub `master` to DevOps.  
They deploy API container + web static to Azure and point env at QA Supabase.  
After Azure is up, future demos use the QA URL instead of localhost.
