# Dumps the live structure of the pipeline spreadsheet: tabs, sizes, header rows,
# and who has access. Read-only - it never writes.
#
# NOTE: ASCII only, deliberately. Windows PowerShell 5.1 reads .ps1 as ANSI, so a
# UTF-8 em-dash decodes to a smart quote and silently terminates a string literal.
#
# Prerequisite (run once):
#   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform
#   gcloud auth application-default set-quota-project john-lau-v01
#
# Usage:  powershell -ExecutionPolicy Bypass -File tools\inspect-sheet.ps1

$ErrorActionPreference = "Stop"
$SHEET_ID = "1ngkYK5XJijW5JIfUD14IzxAQHxBYXVSGwa9mGejsOhI"
$BOT      = "capture-worker@john-lau-v01.iam.gserviceaccount.com"
$SHEETS   = "https://sheets.googleapis.com/v4/spreadsheets/"
$DRIVE    = "https://www.googleapis.com/drive/v3/files/"

# gcloud may not be on PATH in a shell that started before it was installed.
$gcloud = (Get-Command gcloud -ErrorAction SilentlyContinue).Source
if (-not $gcloud) {
  $fallback = "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  if (Test-Path $fallback) { $gcloud = $fallback } else { throw "gcloud not found. Open a new terminal." }
}

$token = & $gcloud auth application-default print-access-token
if (-not $token) { throw "No ADC token. Run the login command in the header comment." }
# x-goog-user-project is required with user ADC. Google client libraries add it
# automatically from the ADC quota_project_id; raw REST calls must send it or
# every request 403s against Google's own gcloud client project.
$headers = @{ Authorization = "Bearer $token"; "x-goog-user-project" = "john-lau-v01" }

function Get-Api($url) {
  try { return Invoke-RestMethod -Uri $url -Headers $headers -Method Get -ErrorAction Stop }
  catch {
    Write-Host ("  request failed: " + $_.Exception.Message) -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host ("  " + $_.ErrorDetails.Message) -ForegroundColor DarkGray }
    return $null
  }
}

function Col-Name($i) {
  $n = ""
  $x = $i
  while ($true) {
    $n = [string][char][int](65 + ($x % 26)) + $n
    $x = [int][math]::Floor($x / 26) - 1
    if ($x -lt 0) { break }
  }
  return $n
}

Write-Host ""
Write-Host "=== SPREADSHEET ===" -ForegroundColor Cyan
$metaUrl = $SHEETS + $SHEET_ID + "?fields=properties.title,sheets.properties(title,sheetId,hidden,gridProperties)"
$meta = Get-Api $metaUrl
if (-not $meta) { throw "Could not read the spreadsheet. Check the scopes on your ADC token." }
Write-Host $meta.properties.title

Write-Host ""
Write-Host "=== TABS ===" -ForegroundColor Cyan
foreach ($s in $meta.sheets) {
  $p = $s.properties
  $vis = ""
  if ($p.hidden) { $vis = "  (hidden)" }
  "{0,-20} {1,6} rows x {2,3} cols{3}" -f $p.title, $p.gridProperties.rowCount, $p.gridProperties.columnCount, $vis
}

Write-Host ""
Write-Host "=== HEADER ROWS ===" -ForegroundColor Cyan
foreach ($s in $meta.sheets) {
  $title = $s.properties.title
  Write-Host ""
  Write-Host $title -ForegroundColor Yellow
  $range = [System.Uri]::EscapeDataString($title + "!1:1")
  $row = Get-Api ($SHEETS + $SHEET_ID + "/values/" + $range)
  if ($row -and $row.values) {
    $cells = $row.values[0]
    for ($i = 0; $i -lt $cells.Count; $i++) {
      "  {0,-4} [{1,2}] {2}" -f (Col-Name $i), $i, $cells[$i]
    }
  } else {
    Write-Host "  (empty)" -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "=== ACCESS ===" -ForegroundColor Cyan
$permUrl = $DRIVE + $SHEET_ID + "/permissions?fields=permissions(emailAddress,role,type)&supportsAllDrives=true"
$perms = Get-Api $permUrl
if ($perms) {
  foreach ($p in $perms.permissions) {
    $who = $p.emailAddress
    if (-not $who) { $who = "(" + $p.type + ")" }
    "{0,-55} {1}" -f $who, $p.role
  }
  $bot = $perms.permissions | Where-Object { $_.emailAddress -eq $BOT }
  Write-Host ""
  if ($bot) {
    Write-Host ("BOT OK - " + $BOT + " has '" + $bot.role + "'") -ForegroundColor Green
    if (@("writer","owner","organizer","fileOrganizer") -notcontains $bot.role) {
      Write-Host "  but V2 needs write access - share as Editor." -ForegroundColor Yellow
    }
  } else {
    Write-Host ("BOT NOT FOUND - " + $BOT + " is not on this file.") -ForegroundColor Red
    Write-Host "  Share the sheet with that address as Editor." -ForegroundColor Yellow
  }
}

Write-Host ""
