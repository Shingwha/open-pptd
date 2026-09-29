<#
.SYNOPSIS
  open-pptd CLI one-shot installer (Windows / PowerShell).

.DESCRIPTION
  Downloads a runtime zip from GitHub Releases (latest by default), verifies its
  SHA256, unpacks it into ~/.open-pptd/cli/versions/<ver>, switches the `current`
  pointer, writes a launcher, and idempotently appends cli/bin to the USER-level
  PATH (no administrator required). Finally it installs the icon assets by
  default; fonts are opt-in.

  Usage (raw one-liner):
    irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex
  Or locally:
    powershell -ExecutionPolicy Bypass -File install.ps1 [-Version 2.0.0] [-InstallHome <dir>]
               [-Fonts] [-Force] [-DryRun] [-WhatIf]

.PARAMETER Version
  Pin the version to install (no leading v), e.g. 2.0.0. Defaults to latest.

.PARAMETER InstallHome
  open-pptd home directory. Defaults to $env:OPEN_PPTD_HOME or ~/.open-pptd.
  (Named InstallHome because $HOME is a read-only automatic variable.)

.PARAMETER Fonts
  Also download the fonts asset pack (~95MB). Icons are installed regardless.

.PARAMETER Force
  Re-download and reinstall even when a version is already installed (upgrade/repair).

.PARAMETER DryRun
  Dry run: print the planned steps without writing, downloading, or touching PATH.
  -WhatIf is equivalent.

.NOTES
  Idempotent: re-running the same command writes nothing when the installed
  version already satisfies the request.
  NOTE: this file is intentionally ASCII-only -- Windows PowerShell 5.1 decodes
  BOM-less .ps1 files with the ANSI code page, which corrupts non-ASCII text.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$Version = "",
  [string]$InstallHome = "",
  [switch]$Fonts,
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
# -WhatIf sets $WhatIfPreference; treat it the same as -DryRun.
$Dry = $WhatIfPreference -or $DryRun.IsPresent

# ---- Constants ----
$Repo = "Shingwha/open-pptd"
$GhBase = "https://github.com/$Repo"
$ApiLatest = "https://api.github.com/repos/$Repo/releases/latest"

# ---- Output helpers (ASCII only) ----
function Say([string]$m)  { Write-Host $m }
function Step([string]$m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Good([string]$m) { Write-Host "  OK  $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "  !   $m" -ForegroundColor Yellow }
function Die([string]$m)  { Write-Host "  ERR $m" -ForegroundColor Red; exit 1 }

function Download([string]$url, [string]$dest) {
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $dest -Headers @{ "User-Agent" = "open-pptd-installer" }
}

function Get-Sha256([string]$path) {
  return (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLower()
}

Say "open-pptd installer (Windows PowerShell)$(if ($Dry) { ' - dry-run' })"

# ---- (1) Home + target paths ----
if ($InstallHome) { $HomeDir = $InstallHome }
elseif ($env:OPEN_PPTD_HOME) { $HomeDir = $env:OPEN_PPTD_HOME }
else { $HomeDir = Join-Path $env:USERPROFILE ".open-pptd" }
$HomeDir = [System.IO.Path]::GetFullPath($HomeDir)
$VersionsDir = Join-Path $HomeDir "cli\versions"
$CurrentPtr  = Join-Path $HomeDir "cli\current"
$BinDir      = Join-Path $HomeDir "cli\bin"

# Detect installed version locally (no network): read current/package.json.
$Installed = ""
try {
  if (Test-Path (Join-Path $CurrentPtr "package.json")) {
    $Installed = (Get-Content (Join-Path $CurrentPtr "package.json") -Raw | ConvertFrom-Json).version
  }
} catch { $Installed = "" }

# ---- (2) Preflight: node ----
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Die "node not found. Install Node.js >= 18 and put it on PATH; the open-pptd runtime needs it." }
$nodeVer = (& node --version) 2>$null
Good "node $nodeVer ($($node.Source))"

# ---- (3) Idempotency probe ----
if (-not $Force) {
  if ($Version -and $Installed -eq $Version) {
    Good "already installed: v$Installed ($VersionsDir\$Version); nothing to do"
    Say "  next: open-pptd doctor"
    exit 0
  }
  if (-not $Version -and $Installed) {
    Good "already installed: v$Installed ($CurrentPtr)"
    Say "  next: open-pptd doctor"
    Say "  (to upgrade/reinstall latest: re-run with -Force)"
    exit 0
  }
}

# ---- (4) Resolve version (prefer SHA256SUMS, fall back to GitHub API) ----
# SHA256SUMS is a mandatory release asset whose content IS the checksums, so
# parsing it is steadier than the API (no rate limit, and the checksum file is
# needed for verification anyway). The API is only a fallback.
$SumsText = ""
if (-not $Version) {
  Say "`n> resolving latest version..."
  try {
    $SumsUrl = "$GhBase/releases/latest/download/SHA256SUMS"
    $SumsText = (Invoke-WebRequest -UseBasicParsing -Uri $SumsUrl -Headers @{ "User-Agent" = "open-pptd-installer" }).Content
    $m = [regex]::Match($SumsText, "open-pptd-v(\d+\.\d+\.\d+)\.zip")
    if ($m.Success) { $Version = $m.Groups[1].Value; Good "SHA256SUMS -> latest v$Version" }
  } catch { Warn "SHA256SUMS unavailable: $($_.Exception.Message)" }
  if (-not $Version) {
    try {
      $rel = Invoke-RestMethod -Uri $ApiLatest -Headers @{ "User-Agent" = "open-pptd-installer" }
      $Version = ($rel.tag_name -replace "^v", "")
      Good "GitHub API -> latest v$Version"
    } catch { Die "cannot resolve latest version (both SHA256SUMS and GitHub API failed): $($_.Exception.Message)" }
  }
}
if ($Version -notmatch "^\d+\.\d+\.\d+$") { Die "invalid version: $Version (expected x.y.z)" }
$RuntimeZip = "open-pptd-v$Version.zip"
# Tag-pinned URL: works for both `latest` and a pinned version (latest/download only serves the newest).
$RuntimeUrl = "$GhBase/releases/download/v$Version/$RuntimeZip"
$SumsUrlFinal = "$GhBase/releases/download/v$Version/SHA256SUMS"

# ---- (4b) Download runtime + mandatory SHA256 check ----
$TmpRoot = Join-Path $HomeDir "tmp"
$StageDir = Join-Path $TmpRoot "install-$Version-$PID"
$ZipPath = Join-Path $TmpRoot $RuntimeZip
$TargetVer = Join-Path $VersionsDir $Version

Step "install open-pptd v$Version"
Say "  home    : $HomeDir"
Say "  runtime : $RuntimeUrl"

if ($Dry) {
  Say "  [dry-run] download $RuntimeUrl -> $ZipPath"
  Say "  [dry-run] download $SumsUrlFinal -> verify SHA256 (abort + clean on mismatch)"
  Say "  [dry-run] unpack $ZipPath -> $StageDir, then rename to $TargetVer"
  Say "  [dry-run] switch current pointer -> versions\$Version"
  Say "  [dry-run] write launcher $BinDir\open-pptd.cmd"
  Say "  [dry-run] idempotent append of $BinDir to user PATH (SetEnvironmentVariable User + WM_SETTINGCHANGE, never setx)"
  Say "  [dry-run] download+install icon assets into $HomeDir\assets\icons (warn only on failure)"
  if ($Fonts) { Say "  [dry-run] download+install font assets into $HomeDir\assets\fonts (warn only on failure)" }
  Say "  [dry-run] final print: version / path / new-terminal hint / next step open-pptd doctor"
  Say "`nOK dry-run complete; nothing was changed"
  exit 0
}

New-Item -ItemType Directory -Force -Path $TmpRoot | Out-Null
try {
  Say "  - downloading runtime zip..."
  Download $RuntimeUrl $ZipPath
  $sumsPath = Join-Path $TmpRoot "SHA256SUMS"
  $expected = ""
  try {
    Download $SumsUrlFinal $sumsPath
    $line = (Get-Content $sumsPath | Where-Object { $_ -match [regex]::Escape($RuntimeZip) } | Select-Object -First 1)
    if ($line) { $expected = ($line -split "\s+")[0].ToLower() }
  } catch { Warn "could not fetch SHA256SUMS ($($_.Exception.Message))" }
  if (-not $expected) { Die "no checksum for $RuntimeZip in SHA256SUMS; refusing to install" }
  $actual = Get-Sha256 $ZipPath
  if ($actual -ne $expected) {
    Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue
    Die "SHA256 mismatch: expected $expected, got $actual (temp files cleaned, install aborted)"
  }
  Good "SHA256 verified ($($expected.Substring(0,12))...)"

  # ---- (5) Unpack to tmp, then rename (avoids half-written installs) ----
  if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
  New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
  Say "  - unpacking..."
  Expand-Archive -Path $ZipPath -DestinationPath $StageDir -Force
  # The runtime zip wraps everything in open-pptd/; strip that layer to match cli/versions/<ver>/bin.
  $srcRoot = $StageDir
  if (Test-Path (Join-Path $StageDir "open-pptd\bin\open-pptd.js")) { $srcRoot = Join-Path $StageDir "open-pptd" }
  if (-not (Test-Path (Join-Path $srcRoot "bin\open-pptd.js"))) {
    Remove-Item -Recurse -Force $StageDir -ErrorAction SilentlyContinue
    Die "malformed runtime zip: bin\open-pptd.js not found"
  }
  New-Item -ItemType Directory -Force -Path $VersionsDir | Out-Null
  if (Test-Path $TargetVer) { Remove-Item -Recurse -Force $TargetVer }
  Move-Item -Path $srcRoot -Destination $TargetVer
  Remove-Item -Recurse -Force $StageDir -ErrorAction SilentlyContinue
  Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue
  Good "unpacked to $TargetVer"

  # ---- (6) Switch current pointer (junction) ----
  if (Test-Path $CurrentPtr) {
    cmd /c rmdir "$CurrentPtr" 2>$null
    if (Test-Path $CurrentPtr) { Remove-Item -Recurse -Force $CurrentPtr }
  }
  New-Item -ItemType Junction -Path $CurrentPtr -Target $TargetVer | Out-Null
  Good "current -> versions\$Version"

  # ---- (7) Write launchers (resolve node at call time) ----
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $cmdLauncher = @"
@echo off
where node >nul 2>nul || (echo open-pptd: node not found, install Node.js and add it to PATH 1>&2 & exit /b 127)
node "%~dp0..\current\bin\open-pptd.js" %*
"@
  $shLauncher = @"
#!/bin/sh
command -v node >/dev/null 2>&1 || { echo "open-pptd: node not found, install Node.js and add it to PATH" >&2; exit 127; }
exec node "`$(dirname "`$0")/../current/bin/open-pptd.js" "`$@"
"@
  # Write without BOM (a BOM breaks @echo off and the shebang). .cmd uses CRLF.
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $BinDir "open-pptd.cmd"), ($cmdLauncher -replace "`r?`n", "`r`n"), $enc)
  [System.IO.File]::WriteAllText((Join-Path $BinDir "open-pptd"), ($shLauncher -replace "`r?`n", "`n"), $enc)
  Good "launcher: $BinDir\open-pptd.cmd"

  # ---- (8) PATH (user-level; never setx) ----
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $userPath) { $userPath = "" }
  if ($userPath -notlike "*$BinDir*") {
    $newPath = $userPath.TrimEnd(';')
    if ($newPath) { $newPath = "$newPath;$BinDir" } else { $newPath = $BinDir }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    # Broadcast WM_SETTINGCHANGE so already-running processes (explorer/new terminals) notice.
    if (-not ("Win32.Native" -as [type])) {
      Add-Type -Namespace Win32 -Name Native -MemberDefinition @'
[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
    }
    $res = [UIntPtr]::Zero
    [Win32.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, "Environment", 2, 5000, [ref]$res) | Out-Null
    Good "appended $BinDir to user PATH (and broadcast the change)"
  } else {
    Good "user PATH already contains $BinDir (idempotent, not written again)"
  }
  $env:Path = "$env:Path;$BinDir"  # make it usable in this session

  # ---- (9) Assets: icons by default; fonts opt-in ----
  function Install-Asset([string]$kind, [string]$zipName) {
    $url = "$GhBase/releases/download/v$Version/$zipName"
    $zip = Join-Path $TmpRoot $zipName
    # Asset zips keep their inner structure (icons: solid/regular/brands; fonts: *.ttf),
    # so extract into assets\<kind> to land at ~/.open-pptd/assets/<kind>.
    $dest = Join-Path $HomeDir "assets\$kind"
    try {
      Download $url $zip
      if ($SumsText -or (Test-Path $sumsPath)) {
        $txt = if ($SumsText) { $SumsText } else { Get-Content $sumsPath -Raw }
        $ln = ($txt -split "`n" | Where-Object { $_ -match [regex]::Escape($zipName) } | Select-Object -First 1)
        if ($ln) {
          $exp = ($ln -split "\s+")[0].ToLower(); $act = Get-Sha256 $zip
          if ($act -ne $exp) { Warn "$kind asset SHA256 mismatch; skipping"; Remove-Item -Force $zip -EA SilentlyContinue; return }
        }
      }
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      Expand-Archive -Path $zip -DestinationPath $dest -Force
      Remove-Item -Force $zip -EA SilentlyContinue
      Good "$kind assets installed into $dest"
    } catch {
      Warn "$kind asset download/extract failed (CLI still works; retry later with: open-pptd assets sync $kind): $($_.Exception.Message)"
    }
  }
  Say "`n> install assets"
  Install-Asset "icons" "open-pptd-icons-v$Version.zip"
  if ($Fonts) { Install-Asset "fonts" "open-pptd-fonts-v$Version.zip" }
  else { Warn "fonts not installed (large). When needed: open-pptd assets sync fonts" }

  # ---- (10) Wrap-up ----
  Say "`nOK install complete"
  Say "  version  : v$Version"
  Say "  location : $TargetVer"
  Say "  launcher : $BinDir\open-pptd.cmd"
  Say "  home     : $HomeDir"
  Say "  PATH     : appended (this session is immediate; OTHER windows need a NEW terminal)"
  Say "  next     : open-pptd doctor`n"
}
catch {
  Remove-Item -Recurse -Force $StageDir -ErrorAction SilentlyContinue
  Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue
  Die "install failed: $($_.Exception.Message)"
}
