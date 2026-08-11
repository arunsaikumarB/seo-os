# List API files still calling getSupabaseAdmin (Phase 4 remaining surface).
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\apps\api\src")
$files = Get-ChildItem -Path $root -Recurse -Filter "*.ts" |
  Where-Object { Select-String -Path $_.FullName -Pattern "getSupabaseAdmin" -Quiet }
Write-Host "getSupabaseAdmin call sites: $($files.Count) files"
$files | ForEach-Object { $_.FullName.Replace((Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path + "\", "") }
