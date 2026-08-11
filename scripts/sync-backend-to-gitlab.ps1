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

function Invoke-GitQuiet {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  & git @GitArgs 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  return $code
}

$srcCommit = (git rev-parse HEAD).Trim()
if (-not $srcCommit) { throw "Could not resolve source commit" }

$wt = Join-Path $env:TEMP "ba-backend-push"
if (Test-Path $wt) {
  Invoke-GitQuiet worktree remove -f $wt | Out-Null
  Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
}

git worktree add --detach $wt $srcCommit
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

Push-Location $wt
try {
  Invoke-GitQuiet branch -D ba-backend-sync | Out-Null
  git checkout --orphan ba-backend-sync
  if ($LASTEXITCODE -ne 0) { throw "orphan checkout failed" }

  Invoke-GitQuiet rm -rf --cached . | Out-Null
  Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

  # Restore from source commit (orphan HEAD is unborn — cannot use HEAD)
  git checkout $srcCommit -- `
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
  if ($LASTEXITCODE -ne 0) { throw "Failed to restore backend paths from $srcCommit" }
  if (-not (Test-Path "apps/api/package.json")) { throw "apps/api missing after checkout — aborting push" }
  if (-not (Test-Path "package.json")) { throw "package.json missing after checkout — aborting push" }

  if (Test-Path apps/web) { Remove-Item -Recurse -Force apps/web }
  if (Test-Path apps/companion) { Remove-Item -Recurse -Force apps/companion }

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

  npm install --package-lock-only
  if ($LASTEXITCODE -ne 0) { throw "npm install --package-lock-only failed" }
  if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }

  git add -A
  git status --short | Select-Object -First 40
  $fileCount = (git ls-files | Measure-Object).Count
  if ($fileCount -lt 50) { throw "Refusing to push sparse tree ($fileCount files). Expected full backend slice." }

  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw "commit failed" }

  Invoke-GitQuiet remote remove gitlab | Out-Null
  git remote add gitlab $GitLabUrl
  git push -u gitlab "HEAD:${Branch}" --force
  if ($LASTEXITCODE -ne 0) { throw "git push to GitLab failed" }

  Write-Host "Synced to $GitLabUrl branch $Branch ($fileCount files)"
  git rev-parse --short HEAD
}
finally {
  Pop-Location
  Set-Location $RepoRoot
  Invoke-GitQuiet worktree remove -f $wt | Out-Null
  Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
  Invoke-GitQuiet branch -D ba-backend-sync | Out-Null
}
