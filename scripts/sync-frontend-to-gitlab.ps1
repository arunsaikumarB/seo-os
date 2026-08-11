# Sync apps/web + packages/shared to GitLab branch ba-frontend.
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

$wt = Join-Path $env:TEMP "ba-frontend-push"
if (Test-Path $wt) {
  Invoke-GitQuiet worktree remove -f $wt | Out-Null
  Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
}

git worktree add --detach $wt $srcCommit
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

Push-Location $wt
try {
  Invoke-GitQuiet branch -D ba-frontend-sync | Out-Null
  git checkout --orphan ba-frontend-sync
  if ($LASTEXITCODE -ne 0) { throw "orphan checkout failed" }

  Invoke-GitQuiet rm -rf --cached . | Out-Null
  Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

  git checkout $srcCommit -- apps/web packages/shared package.json package-lock.json turbo.json tsconfig.base.json
  if ($LASTEXITCODE -ne 0) { throw "Failed to restore frontend paths from $srcCommit" }
  if (-not (Test-Path "apps/web/package.json")) { throw "apps/web missing after checkout — aborting push" }

  if (Test-Path apps/api) { Remove-Item -Recurse -Force apps/api }
  if (Test-Path apps/companion) { Remove-Item -Recurse -Force apps/companion }
  if (Test-Path workers) { Remove-Item -Recurse -Force workers }

  node -e @"
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.name='backlink-agent-frontend';
p.description='Backlink Agent frontend (GitLab ba-frontend)';
p.workspaces=['apps/web','packages/shared'];
p.scripts={
  dev:'npm run dev --workspace=@seo-os/web',
  build:'npm run build --workspace=@seo-os/web',
  typecheck:'npm run typecheck --workspace=@seo-os/web',
  lint:'npm run lint --workspace=@seo-os/web'
};
fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');
"@

  @"
# Backlink Agent — Frontend (``ba-frontend``)

Synced from the product monorepo (``apps/web`` + ``packages/shared``).

``````bash
npm install
cp apps/web/.env.example apps/web/.env
npm run dev
npm run build   # -> apps/web/dist
``````
"@ | Set-Content -Encoding utf8 README.md

  npm install --package-lock-only
  if ($LASTEXITCODE -ne 0) { throw "npm install --package-lock-only failed" }
  if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }

  git add -A
  $fileCount = (git ls-files | Measure-Object).Count
  if ($fileCount -lt 50) { throw "Refusing to push sparse tree ($fileCount files). Expected full frontend slice." }

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
  Invoke-GitQuiet branch -D ba-frontend-sync | Out-Null
}
