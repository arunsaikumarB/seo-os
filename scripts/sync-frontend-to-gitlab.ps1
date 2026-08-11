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

$wt = Join-Path $env:TEMP "ba-frontend-push"
if (Test-Path $wt) {
  git worktree remove -f $wt 2>$null
  Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
}

git worktree add --detach $wt HEAD
Push-Location $wt
try {
  git checkout --orphan ba-frontend-sync
  git rm -rf --cached . 2>$null | Out-Null
  Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

  git checkout HEAD -- apps/web packages/shared package.json package-lock.json turbo.json tsconfig.base.json

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

  npm install --package-lock-only | Out-Null
  if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }

  git add -A
  git commit -m $Message
  git remote remove gitlab 2>$null
  git remote add gitlab $GitLabUrl
  git push -u gitlab "HEAD:${Branch}" --force
  Write-Host "Synced to $GitLabUrl branch $Branch"
  git rev-parse --short HEAD
}
finally {
  Pop-Location
  Set-Location $RepoRoot
  git worktree remove -f $wt 2>$null
  Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
}
