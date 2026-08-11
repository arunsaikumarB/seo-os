# Restore a dump into the optional company-postgres container (port 54332).
# Does NOT touch Supabase local DB (54322) or any cloud database.
#
# Prerequisites:
#   docker compose --profile company-postgres up -d company-postgres
#   A .dump file from scripts/cutover/dump-local-postgres.ps1
#
# Usage:
#   powershell -File scripts/cutover/restore-company-postgres.ps1 -DumpPath .cutover-dumps\xxx.dump

param(
  [Parameter(Mandatory = $true)]
  [string]$DumpPath,
  [string]$Container = "ba-company-postgres",
  [string]$Database = "backlink_agent"
)

$ErrorActionPreference = "Stop"
$DumpPath = Resolve-Path $DumpPath

$running = docker ps --format "{{.Names}}" | Where-Object { $_ -eq $Container }
if (-not $running) {
  Write-Error "Container '$Container' not running. Start it with:`n  docker compose --profile company-postgres up -d company-postgres"
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RolesSql = Join-Path $RepoRoot "scripts\cutover\prepare-company-roles.sql"

Write-Host "Restoring INTO $Container /$Database only (source dump is not modified) ..."
docker cp $DumpPath "${Container}:/tmp/restore.dump"
docker cp $RolesSql "${Container}:/tmp/prepare-company-roles.sql"

# Drop+recreate target DB inside company container only - never supabase_db_*
docker exec -e PGPASSWORD=postgres $Container `
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Database' AND pid <> pg_backend_pid();"
docker exec -e PGPASSWORD=postgres $Container `
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $Database;"
docker exec -e PGPASSWORD=postgres $Container `
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $Database OWNER postgres;"

# Stub Supabase roles / schemas so RLS policies restore
docker exec -e PGPASSWORD=postgres $Container `
  psql -U postgres -d $Database -v ON_ERROR_STOP=1 -f /tmp/prepare-company-roles.sql
# pgvector image provides vector; create extension early
docker exec -e PGPASSWORD=postgres $Container `
  psql -U postgres -d $Database -c "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;"

# pg_restore often exits 1 with non-fatal Supabase-only extension warnings (pg_net, vault)
docker exec -e PGPASSWORD=postgres $Container `
  pg_restore -U postgres -d $Database --no-owner --no-acl "/tmp/restore.dump"
$restoreCode = $LASTEXITCODE
if ($restoreCode -gt 1) {
  Write-Error "pg_restore failed with exit code $restoreCode"
} elseif ($restoreCode -eq 1) {
  Write-Host "pg_restore reported warnings (exit 1) - verify table counts below."
}

docker exec $Container rm -f /tmp/restore.dump | Out-Null

$tableCount = docker exec -e PGPASSWORD=postgres $Container `
  psql -U postgres -d $Database -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
Write-Host "Public tables restored: $($tableCount.Trim())"
Write-Host "Done. Connect pgAdmin / psql:"
Write-Host "  Host 127.0.0.1  Port 54332  DB $Database  User postgres  Pass postgres"

