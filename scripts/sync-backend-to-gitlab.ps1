# Sync apps/api + packages + workers + cutover tooling to GitLab branch ba-backend.
# Usage (from repo root):
#   powershell -File scripts/sync-backend-to-gitlab.ps1
#   powershell -File scripts/sync-backend-to-gitlab.ps1 -Message "feat(api): your change"

param(
  [string]$Message = "chore: sync backend to GitLab ba-backend",
  [string]$GitLabUrl = "http://gitlab.lstech-hq.lstechinc.com/websites/backlink-agent.git",
  [string]$Branch = "ba-backend"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$wt = Join-Path $env:TEMP "ba-backend-push"
if (Test-Path $wt) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  git worktree remove -f $wt | Out-Null
  $ErrorActionPreference = $prevEap
  Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
}

git worktree add --detach $wt HEAD
Push-Location $wt
try {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  git branch -D ba-backend-sync | Out-Null
  $ErrorActionPreference = $prevEap
  git checkout --orphan ba-backend-sync
  $ErrorActionPreference = "SilentlyContinue"
  git rm -rf --cached . | Out-Null
  $ErrorActionPreference = $prevEap
  Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

  # Backend runtime + shared libraries + optional workers + company cutover tooling
  git checkout HEAD -- `
    apps/api `
    packages `
    workers `
    scripts/build-api-deps.mjs `
    scripts/cutover `
    docker-compose.yml `
    docs/cutover `
    package.json `
    package-lock.json `
    turbo.json `
    tsconfig.base.json

  if (Test-Path apps/web) { Remove-Item -Recurse -Force apps/web }
  if (Test-Path apps/companion) { Remove-Item -Recurse -Force apps/companion }

  # Keep only company-relevant compose services for DevOps clarity
  if (-not (Test-Path scripts)) { New-Item -ItemType Directory -Path scripts | Out-Null }

  node -e @"
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.name='backlink-agent-backend';
p.description='Backlink Agent API + packages (GitLab ba-backend)';
p.workspaces=['apps/api','packages/*','workers/*'];
p.scripts={
  dev:'npm run dev --workspace=@seo-os/api',
  build:'npm run build --workspace=@seo-os/api',
  start:'npm run start --workspace=@seo-os/api',
  typecheck:'npm run typecheck --workspace=@seo-os/api',
  test:'npm run test --workspace=@seo-os/api',
  lint:'npm run lint --workspace=@seo-os/api'
};
fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');
"@

  @"
# Backlink Agent — Backend (``ba-backend``)

Synced from the product monorepo for company / DD3-style deploys.

## Quick start (company stack)

``````bash
# 1) Postgres (local practice — port 54332)
docker compose --profile company-postgres up -d company-postgres
docker compose up -d pgadmin   # http://localhost:5050

# 2) Restore a schema dump (from Phase 1 tooling), then:
cp apps/api/.env.company.example apps/api/.env
# edit LOCAL_JWT_SECRET + DATABASE_URL + CORS_ORIGIN

npm install
npm run build
npm run start   # or: npm run dev
``````

API listens on ``PORT`` (default ``3001``).

## Company env

See ``apps/api/.env.company.example`` and ``docs/cutover/no-supabase-phase-6.md``.

## Pair with frontend

GitLab branch ``ba-frontend`` (``apps/web`` + ``packages/shared``).
Set web ``VITE_AUTH_MODE=local`` and ``VITE_API_URL`` to this API.
"@ | Set-Content -Encoding utf8 README.md

  npm install --package-lock-only | Out-Null
  if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }

  git add -A
  git commit -m $Message
  $ErrorActionPreference = "SilentlyContinue"
  git remote remove gitlab | Out-Null
  $ErrorActionPreference = $prevEap
  git remote add gitlab $GitLabUrl
  git push -u gitlab "HEAD:${Branch}" --force
  Write-Host "Synced to $GitLabUrl branch $Branch"
  git rev-parse --short HEAD
}
finally {
  Pop-Location
  Set-Location $RepoRoot
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  git worktree remove -f $wt | Out-Null
  Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
  git branch -D ba-backend-sync | Out-Null
  $ErrorActionPreference = $prevEap
}
