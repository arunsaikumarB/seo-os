# Sync apps/web + packages/shared to GitLab branch ba-frontend.
# NEVER uses git push --force.
#
# Usage (from repo root):
#   powershell -File scripts/sync-frontend-to-gitlab.ps1
#   powershell -File scripts/sync-frontend-to-gitlab.ps1 -Message "feat(web): your change"

param(
  [string]$Message = "chore: sync frontend to GitLab ba-frontend",
  [string]$GitLabUrl = "http://gitlab.lstech-hq.lstechinc.com/websites/backlink-agent.git",
  [string]$Branch = "ba-frontend"
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

$export = Join-Path $env:TEMP "ba-frontend-export"
$slice = Join-Path $env:TEMP "ba-frontend-slice"
$wt = Join-Path $env:TEMP "ba-frontend-push"
foreach ($p in @($export, $slice, $wt)) {
  if (Test-Path $p) {
    Invoke-GitQuiet -GitArgs @('worktree', 'remove', '-f', $p) | Out-Null
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
  }
}

git worktree add --detach $export $srcCommit
if ($LASTEXITCODE -ne 0) { throw "git worktree add (export) failed" }

New-Item -ItemType Directory -Path $slice | Out-Null
foreach ($rel in @('apps\web', 'packages\shared', 'package.json', 'package-lock.json', 'turbo.json', 'tsconfig.base.json', '.env.company.frontend.example')) {
  $src = Join-Path $export $rel
  $dst = Join-Path $slice $rel
  if (-not (Test-Path $src)) { throw "Missing in export: $rel" }
  $dstParent = Split-Path $dst -Parent
  if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }
  Copy-Item -Path $src -Destination $dst -Recurse -Force
}
# DD3 layout: root .env.example (not under apps/web)
Copy-Item (Join-Path $slice '.env.company.frontend.example') (Join-Path $slice '.env.example') -Force

Push-Location $slice
try {
  node -e @"
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.name='backlink-agent-frontend';
p.description='Backlink Agent frontend (GitLab ba-frontend)';
p.workspaces=['apps/web','packages/shared'];
p.engines={ node: '>=18.18.0' };
p.scripts={
  dev:'npm run dev --workspace=@seo-os/web',
  build:'npm run build --workspace=@seo-os/web',
  typecheck:'npm run typecheck --workspace=@seo-os/web',
  lint:'npm run lint --workspace=@seo-os/web'
};
fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');
"@

  @"
# Backlink Agent - Frontend (``ba-frontend``)

Synced from the product monorepo (``apps/web`` + ``packages/shared``).

**Node:** ``>=18.18.0`` is enough for FE (React 18 / Vite 6).

**Env (DD3 layout):** put ``.env`` at this **repo root** (next to ``package.json``), not under ``apps/web/``.

``````bash
cp .env.example .env
cp .env.example .env.production
# edit VITE_API_URL + VITE_AUTH_MODE=local
npm install
npm run build   # from this root -> apps/web/dist
``````
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
    throw "Cannot fast-forward $Branch. Resolve on GitLab first - this script will NOT force-push."
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
    throw "git push failed (non-fast-forward). Do NOT force-push - pull/reconcile on GitLab, then re-run sync."
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
