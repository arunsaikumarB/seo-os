# Start SEO OS fully local (does not touch Railway / Netlify / cloud Supabase).
# Prerequisites: Docker Desktop running, Node 20+, Supabase CLI.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "==> Starting Supabase local stack..."
supabase start

Write-Host "==> Starting pgAdmin (http://localhost:5050)..."
docker compose up -d pgadmin

Write-Host @"

Local URLs
  Web:            http://localhost:5173
  API:            http://localhost:3001
  Supabase Studio http://127.0.0.1:54323
  pgAdmin:        http://localhost:5050  (admin@example.com / admin)
  Mailpit:        http://127.0.0.1:54324

pgAdmin DB server: host.docker.internal:54322  user/pass postgres/postgres

Ensure apps/api/.env and apps/web/.env point at 127.0.0.1 (see docs/local-setup.md).
Cloud backups (if present): apps/*/.env.cloud.bak

Starting API + Web (Ctrl+C stops)...
"@

npm run dev
