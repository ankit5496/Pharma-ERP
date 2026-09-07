<#
.SYNOPSIS
  Starts the local PostgreSQL cluster if it is not already running.

.DESCRIPTION
  Exists because a PostgreSQL installed without a Windows service does not come
  back after a reboot, and the failure is confusing rather than obvious: the API
  validates its database connection at boot and exits, so the web app keeps
  serving pages while every request that touches data fails. You get a login
  screen that refuses to log you in.

  Safe to run repeatedly — it checks first and does nothing if the port is
  already listening.

.PARAMETER Register
  Registers PostgreSQL as an auto-starting Windows service, so this script is
  never needed again. REQUIRES AN ADMINISTRATOR SHELL; the script says so and
  exits rather than failing halfway.

.EXAMPLE
  pnpm dev:db
  # start it now

.EXAMPLE
  # In an Administrator PowerShell, once and for all:
  .\scripts\dev-db.ps1 -Register
#>
[CmdletBinding()]
param(
  [switch]$Register,
  # Override if your install differs. Defaults match a stock Windows installer.
  [string]$PgRoot = 'C:\Program Files\PostgreSQL\18',
  [int]$Port = 5432
)

$ErrorActionPreference = 'Stop'

$pgCtl = Join-Path $PgRoot 'bin\pg_ctl.exe'
$dataDir = Join-Path $PgRoot 'data'
$logFile = Join-Path $env:TEMP 'pharma-erp-pg.log'

if (-not (Test-Path $pgCtl)) {
  Write-Error @"
pg_ctl.exe not found at:
  $pgCtl

Point -PgRoot at your PostgreSQL install, e.g.
  .\scripts\dev-db.ps1 -PgRoot 'C:\Program Files\PostgreSQL\16'
"@
  exit 1
}

function Test-PostgresListening {
  $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
# -Register: make this script unnecessary
# ---------------------------------------------------------------------------
if ($Register) {
  $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
             ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

  if (-not $isAdmin) {
    # Checked up front rather than letting pg_ctl fail partway through, which
    # leaves you guessing whether anything was changed.
    Write-Error @"
-Register needs an Administrator shell.

Right-click PowerShell -> "Run as administrator", then:
  cd "$PSScriptRoot\.."
  .\scripts\dev-db.ps1 -Register
"@
    exit 1
  }

  $serviceName = 'postgresql-18-pharma-erp'

  if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    Write-Host "Service '$serviceName' already exists."
  } else {
    & $pgCtl register -N $serviceName -D $dataDir -S auto
    Write-Host "Registered '$serviceName' to start automatically at boot."
  }

  Start-Service -Name $serviceName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3

  if (Test-PostgresListening) {
    Write-Host "PostgreSQL is listening on port $Port. You will not need this script again."
  } else {
    Write-Warning "Service registered but nothing is listening on port $Port yet. Check: Get-Service $serviceName"
  }

  exit 0
}

# ---------------------------------------------------------------------------
# Default: start it if it is down
# ---------------------------------------------------------------------------
if (Test-PostgresListening) {
  Write-Host "PostgreSQL is already running on port $Port."
  exit 0
}

Write-Host "PostgreSQL is not running. Starting it..."

# Detached, then polled. Two Windows-specific details, both learned the hard way:
#
#   * `pg_ctl -w` blocks unpredictably here, so waiting on the port is more
#     reliable than waiting on the process.
#   * pg_ctl's own output MUST be redirected to a file. With -NoNewWindow and no
#     redirection, the postgres server it spawns inherits this console's stdout
#     handle and holds it open for its whole lifetime — so this script appears to
#     hang forever even though the database started fine.
$ctlOut = Join-Path $env:TEMP 'pharma-erp-pg-ctl.out'

Start-Process -FilePath $pgCtl `
  -ArgumentList '-D', "`"$dataDir`"", '-l', "`"$logFile`"", 'start' `
  -RedirectStandardOutput $ctlOut `
  -RedirectStandardError "$ctlOut.err" `
  -WindowStyle Hidden

for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  if (Test-PostgresListening) {
    Write-Host "PostgreSQL is listening on port $Port."
    Write-Host ""
    Write-Host "Tip: run this once in an Administrator shell to make it permanent:"
    Write-Host "  .\scripts\dev-db.ps1 -Register"
    exit 0
  }
}

Write-Error @"
PostgreSQL did not start within 20 seconds. Last lines of its log:

$(if (Test-Path $logFile) { Get-Content $logFile -Tail 15 | Out-String } else { '(no log at ' + $logFile + ')' })
"@
exit 1
