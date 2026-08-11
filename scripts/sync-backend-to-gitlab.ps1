# Sync apps/api + packages + workers + cutover tooling to GitLab branch ba-backend.
# NEVER uses git push --force.
#
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
  param([Parameter(Mandatory = $true)][string[]]$GitArgs)
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  & git @GitArgs 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  return $code
}

$srcCommit = (git rev-parse HEAD).Trim()
if (-not $srcCommit) { throw "Could not resolve source commit" }

$export = Join-Path $env:TEMP "ba-backend-export"
$slice = Join-Path $env:TEMP "ba-backend-slice"
$wt = Join-Path $env:TEMP "ba-backend-push"
foreach ($p in @($export, $slice, $wt)) {
  if (Test-Path $p) {
    Invoke-GitQuiet -GitArgs @('worktree', 'remove', '-f', $p) | Out-Null
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
  }
}

git worktree add --detach $export $srcCommit
if ($LASTEXITCODE -ne 0) { throw "git worktree add (export) failed" }

New-Item -ItemType Directory -Path $slice | Out-Null
$paths = @(
  'apps\api',
  'packages',
  'workers',
  'scripts\build-api-deps.mjs',
  'scripts\cutover',
  'docker-compose.yml',
  'docs\cutover',
  'package.json',
  'package-lock.json',
  'turbo.json',
  'tsconfig.base.json',
  '.env.company.backend.example'
)
foreach ($rel in $paths) {
  $src = Join-Path $export $rel
  $dst = Join-Path $slice $rel
  if (-not (Test-Path $src)) { throw "Missing in export: $rel" }
  $dstParent = Split-Path $dst -Parent
  if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }
  Copy-Item -Path $src -Destination $dst -Recurse -Force
}
# DD3 layout: root .env.example (not under apps/api)
Copy-Item (Join-Path $slice '.env.company.backend.example') (Join-Path $slice '.env.example') -Force

Push-Location $slice
try {
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

**Env (DD3 layout):** put ``.env`` at this **repo root** (next to ``package.json``), not under ``apps/api/``.

``````bash
cp .env.example .env
# edit LOCAL_JWT_SECRET + DATABASE_URL + CORS_ORIGIN
npm install
npm run build
npm run start
``````

See ``docs/cutover/no-supabase-phase-6.md``.
"@ | Set-Content -Encoding utf8 README.md

  npm install --package-lock-only
  if ($LASTEXITCODE -ne 0) { throw "npm install --package-lock-only failed" }
  if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
}
finally {
  Pop-Location
}

git clone --branch $Branch --single-branch $GitLabUrl $wt
if ($LASTEXITCODE -ne 0) { throw "git clone of $Branch failed" }

Push-Location $wt
try {
  git pull --ff-only origin $Branch
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot fast-forward $Branch. Resolve on GitLab first — this script will NOT force-push."
  }

  Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
  Copy-Item -Path (Join-Path $slice '*') -Destination $wt -Recurse -Force

  git add -A
  $fileCount = (git ls-files | Measure-Object).Count
  if ($fileCount -lt 50) { throw "Refusing to push sparse tree ($fileCount files)." }

  $status = git status --porcelain
  if (-not $status) {
    Write-Host "No changes to sync; $Branch already up to date."
    git rev-parse --short HEAD
    return
  }

  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw "commit failed" }

  # NEVER --force / --force-with-lease
  git push origin "HEAD:${Branch}"
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed (non-fast-forward). Do NOT force-push — pull/reconcile on GitLab, then re-run sync."
  }

  Write-Host "Synced to $GitLabUrl branch $Branch ($fileCount files) without force-push"
  git rev-parse --short HEAD
}
finally {
  Pop-Location
  Set-Location $RepoRoot
  Invoke-GitQuiet -GitArgs @('worktree', 'remove', '-f', $export) | Out-Null
  Remove-Item -Recurse -Force $export -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $slice -ErrorAction SilentlyContinue
}
