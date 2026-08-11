# Read-only dump of local Supabase Postgres (does NOT modify source DB).
# Requires: Docker Desktop + `supabase start` (container supabase_db_seo-os).
#
# Usage (repo root):
#   powershell -File scripts/cutover/dump-local-postgres.ps1
#   powershell -File scripts/cutover/dump-local-postgres.ps1 -OutDir "D:\backups\ba"

param(
  [string]$Container = "supabase_db_seo-os",
  [string]$Database = "postgres",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $OutDir) {
  $OutDir = Join-Path $RepoRoot ".cutover-dumps"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpName = "backlink-agent-local-$stamp.dump"
$dumpPath = Join-Path $OutDir $dumpName

$running = docker ps --format "{{.Names}}" | Where-Object { $_ -eq $Container }
if (-not $running) {
  Write-Error "Container '$Container' is not running. Start local Supabase first: supabase start"
}

Write-Host "Dumping (read-only) from $Container /$Database ..."
# custom format (-Fc) for pg_restore; exclude noisy realtime/auth noise optional later
docker exec -e PGPASSWORD=postgres $Container `
  pg_dump -U postgres -d $Database -Fc --no-owner --no-acl `
  -f "/tmp/$dumpName"

docker cp "${Container}:/tmp/$dumpName" $dumpPath
docker exec $Container rm -f "/tmp/$dumpName" | Out-Null

$size = (Get-Item $dumpPath).Length
Write-Host "OK: $dumpPath ($([math]::Round($size/1MB, 2)) MB)"
Write-Host "This file is gitignored. Share securely with DevOps - do not commit."
Write-Output $dumpPath
