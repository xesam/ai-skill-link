#!/usr/bin/env pwsh
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Exit codes
$EXIT_USAGE = 1
$EXIT_SKILL_NOT_FOUND = 2
$EXIT_TARGET_CONFLICT = 3
$EXIT_LINK_FAILED = 4

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$DEFAULT_REPO = $SCRIPT_DIR
$CONF_DEFAULT = Join-Path $SCRIPT_DIR "skill-link.conf"
$CONF_LOCAL   = Join-Path $SCRIPT_DIR "skill-link.local.conf"

function Show-Help {
    @"
Usage:
  skill-link.ps1 <skill_name...> --cli <name> [options]
  skill-link.ps1 --all --cli <name> [options]

Link selected skills from this repository into a known AI CLI skills directory.

Required:
  -c, --cli <name>        Target AI CLI name (use "all" to target every supported CLI)

Selection:
  <skill_name...>         One or more skill names (directory names)
  -a, --all               Link all available skills (mutually exclusive with skill names)

Options:
  -f, --force             Replace existing destination entry
  -n, --dry-run           Show planned actions without modifying files
  -r, --repo <dir>        Skills repository root (default: script directory)
  -u, --unlink            Remove symlinks instead of creating them
  -l, --list              List available skills and exit
      --list-clis         List supported CLI names and target paths
      --relative          Create relative symlinks instead of absolute symlinks
  -v, --verbose           Print extra logs
  -h, --help              Show this help

CLI configuration:
  Defined in skill-link.conf (default) and skill-link.local.conf (user overrides).
  Use --list-clis to see all configured CLIs.
  Use --cli all to target every configured CLI.
"@
}

function Write-Fail {
    param([string]$Message, [int]$ExitCode)
    Write-Host "[ERR] $Message" -ForegroundColor Red
    exit $ExitCode
}

# Parse [clis] section from a config file, return ordered hashtable of name->path.
function Read-CliSection {
    param([string]$File)
    if (-not (Test-Path $File)) { return @{} }
    $result = [ordered]@{}
    $inClis = $false
    foreach ($line in (Get-Content $File)) {
        if ($line -match '^\s*[#;]' -or $line -match '^\s*$') { continue }
        if ($line -match '^\[([^\]]+)\]') {
            $inClis = ($matches[1].Trim() -eq 'clis')
            continue
        }
        if ($inClis -and $line -match '^([^=]+)=(.+)$') {
            $name = $matches[1].Trim()
            $path = $matches[2].Trim()
            $home = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }
            if ($path.StartsWith('~')) { $path = $home + $path.Substring(1) }
            if ($name) { $result[$name] = $path }
        }
    }
    return $result
}

# Merge default and local configs; local entries override default.
function Get-MergedClis {
    $map = [ordered]@{}
    foreach ($entry in (Read-CliSection $CONF_DEFAULT).GetEnumerator()) { $map[$entry.Key] = $entry.Value }
    foreach ($entry in (Read-CliSection $CONF_LOCAL).GetEnumerator())   { $map[$entry.Key] = $entry.Value }
    return $map
}

# Return the skills directory for a CLI name (from merged config).
function Get-CliTargetDir {
    param([string]$Cli)
    $map = Get-MergedClis
    if ($map.Contains($Cli)) { return $map[$Cli] }
    return $null
}

function Show-SupportedClis {
    (Get-MergedClis).GetEnumerator() | ForEach-Object {
        "{0,-12} -> {1}" -f $_.Key, $_.Value
    }
}

# All CLI names from merged config, used when --cli all is specified.
function Get-AllCliNames {
    return @((Get-MergedClis).Keys)
}

function Get-Skills {
    param([string]$Repo)
    $Repo = Resolve-Path $Repo | Select-Object -ExpandProperty Path
    # Normalize path separators for regex matching
    $RepoNormalized = $Repo -replace '\\', '/'
    Get-ChildItem -Path $Repo -Recurse -Filter "SKILL.md" -File |
        Where-Object {
            $normalizedPath = $_.FullName -replace '\\', '/'
            $normalizedPath -match "^$([regex]::Escape($RepoNormalized))/[^/]+/SKILL\.md$"
        } |
        ForEach-Object { Split-Path -Parent $_.FullName | Split-Path -Leaf } |
        Sort-Object -Unique
}

function Get-RelativePath {
    param([string]$From, [string]$To)
    # Normalize paths - $To must exist, $From may not exist yet
    $To = Resolve-Path $To | Select-Object -ExpandProperty Path
    $From = $From -replace '\\', '/'
    $To = $To -replace '\\', '/'

    # Extract drive letters (handle both E:/ and E: formats)
    $FromDrive = $null
    $ToDrive = $null
    if ($From -match '^([a-zA-Z]:)(/.*)?$') {
        $FromDrive = $matches[1].ToUpper()
        $From = if ($matches[2]) { $matches[2] } else { "" }
    }
    if ($To -match '^([a-zA-Z]:)(/.*)?$') {
        $ToDrive = $matches[1].ToUpper()
        $To = if ($matches[2]) { $matches[2] } else { "" }
    }

    # If different drives, return absolute path (with drive letter)
    if ($FromDrive -and $ToDrive -and $FromDrive -ne $ToDrive) {
        return "$ToDrive$To" -replace '/', '\'
    }

    $FromParts = $From -split '/' | Where-Object { $_ -ne '' }
    $ToParts = $To -split '/' | Where-Object { $_ -ne '' }

    $CommonLength = 0
    $MaxLength = [Math]::Min($FromParts.Length, $ToParts.Length)
    for ($i = 0; $i -lt $MaxLength; $i++) {
        if ($FromParts[$i] -eq $ToParts[$i]) {
            $CommonLength++
        } else {
            break
        }
    }

    $UpCount = $FromParts.Length - $CommonLength
    $RelativeParts = $ToParts[$CommonLength..($ToParts.Length - 1)]

    $Result = @()
    for ($i = 0; $i -lt $UpCount; $i++) {
        $Result += ".."
    }
    $Result += $RelativeParts

    return $Result -join '\'
}

# Parse arguments
$CLI_NAME = ""
$REPO_ROOT = $DEFAULT_REPO
$USE_ALL = $false
$FORCE = $false
$DRY_RUN = $false
$USE_RELATIVE = $false
$DO_UNLINK = $false
$VERBOSE = $false
$DO_LIST = $false
$DO_LIST_CLIS = $false
$SKILLS = @()

$i = 0
$args_array = $args
while ($i -lt $args_array.Length) {
    $arg = $args_array[$i]
    switch ($arg) {
        { $_ -in "-c", "--cli" } {
            if ($i + 1 -ge $args_array.Length) {
                Write-Fail "Missing value for $arg" $EXIT_USAGE
            }
            $CLI_NAME = $args_array[++$i]
        }
        { $_ -in "-r", "--repo" } {
            if ($i + 1 -ge $args_array.Length) {
                Write-Fail "Missing value for $arg" $EXIT_USAGE
            }
            $REPO_ROOT = $args_array[++$i]
        }
        { $_ -in "-a", "--all" } {
            $USE_ALL = $true
        }
        { $_ -in "-f", "--force" } {
            $FORCE = $true
        }
        { $_ -in "-n", "--dry-run" } {
            $DRY_RUN = $true
        }
        "--relative" {
            $USE_RELATIVE = $true
        }
        { $_ -in "-v", "--verbose" } {
            $VERBOSE = $true
        }
        { $_ -in "-u", "--unlink" } {
            $DO_UNLINK = $true
        }
        { $_ -in "-l", "--list" } {
            $DO_LIST = $true
        }
        "--list-clis" {
            $DO_LIST_CLIS = $true
        }
        { $_ -in "-h", "--help" } {
            Show-Help
            exit 0
        }
        "--" {
            $i++
            while ($i -lt $args_array.Length) {
                $SKILLS += $args_array[$i++]
            }
        }
        default {
            if ($arg.StartsWith("-")) {
                Write-Fail "Unknown option: $arg" $EXIT_USAGE
            } else {
                $SKILLS += $arg
            }
        }
    }
    $i++
}

$REPO_ROOT = Resolve-Path $REPO_ROOT | Select-Object -ExpandProperty Path

if ($DO_LIST) {
    Get-Skills -Repo $REPO_ROOT
    exit 0
}

if ($DO_LIST_CLIS) {
    Show-SupportedClis
    exit 0
}

if ($USE_ALL -and $SKILLS.Length -gt 0) {
    Write-Fail "--all cannot be used with explicit skill names" $EXIT_USAGE
}

if ([string]::IsNullOrEmpty($CLI_NAME)) {
    Write-Fail "--cli is required" $EXIT_USAGE
}

# Expand "all" into canonical CLI names; validate single name otherwise.
$CLI_NAMES = @()
if ($CLI_NAME.ToLower() -eq "all") {
    $CLI_NAMES = Get-AllCliNames
} else {
    $testDir = Get-CliTargetDir -Cli $CLI_NAME
    if (-not $testDir) {
        Write-Fail "Unsupported CLI: $CLI_NAME (use --list-clis)" $EXIT_USAGE
    }
    $CLI_NAMES = @($CLI_NAME)
}

if ($USE_ALL) {
    $SKILLS = Get-Skills -Repo $REPO_ROOT
}

if ($SKILLS.Length -eq 0) {
    Write-Fail "No skills specified. Provide skill names or use --all" $EXIT_USAGE
}

$total_failed = 0
$total_conflicts = 0
$total_missing = 0

foreach ($cli_name in $CLI_NAMES) {
    $TARGET_DIR = Get-CliTargetDir -Cli $cli_name

    if ($CLI_NAMES.Length -gt 1) {
        Write-Host "`n==> $cli_name ($TARGET_DIR)"
    }

    if ($DRY_RUN) {
        Write-Host "[DRY-RUN] ensure target dir: $TARGET_DIR"
    } else {
        New-Item -ItemType Directory -Path $TARGET_DIR -Force | Out-Null
    }

    $success = 0
    $skipped = 0
    $failed = 0
    $conflicts = 0
    $missing = 0

    foreach ($skill in $SKILLS) {
        $src = Join-Path $REPO_ROOT $skill
        $dst = Join-Path $TARGET_DIR $skill

        if ($DO_UNLINK) {
            $dstExists = Test-Path $dst -PathType Any
            $dstIsSymlink = $false
            $currentTarget = $null

            if ($dstExists) {
                $item = Get-Item $dst -Force -ErrorAction SilentlyContinue
                if ($item -and ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
                    $dstIsSymlink = $true
                    $currentTarget = $item.Target
                }
            }

            if (-not $dstExists -and -not $dstIsSymlink) {
                Write-Host "[SKIP] not linked: $dst"
                $skipped++
                continue
            }

            if ($dstIsSymlink) {
                $srcAbs = if (Test-Path $src) { (Resolve-Path $src).Path } else { $src }
                $targetAbs = if ([System.IO.Path]::IsPathRooted($currentTarget)) {
                    $currentTarget
                } else {
                    try { (Resolve-Path (Join-Path (Split-Path $dst) $currentTarget)).Path } catch { $null }
                }
                $isOurs = ($targetAbs -eq $srcAbs) -or ($currentTarget -eq $src)

                if (-not $isOurs -and -not $FORCE) {
                    Write-Host "[ERR] symlink points elsewhere ($currentTarget), use --force to remove: $dst" -ForegroundColor Red
                    $failed++
                    $conflicts++
                    continue
                }

                if ($DRY_RUN) {
                    Write-Host "[DRY-RUN] Remove-Item $dst"
                    $success++
                } else {
                    Remove-Item $dst -Force
                    Write-Host "[OK] unlinked: $dst" -ForegroundColor Green
                    $success++
                }
                continue
            }

            if (-not $FORCE) {
                Write-Host "[ERR] not a symlink: $dst, use --force to remove" -ForegroundColor Red
                $failed++
                $conflicts++
                continue
            }
            if ($DRY_RUN) {
                Write-Host "[DRY-RUN] Remove-Item -Recurse $dst"
                $success++
            } else {
                Remove-Item $dst -Recurse -Force
                Write-Host "[OK] removed: $dst" -ForegroundColor Green
                $success++
            }
            continue
        }

        if (-not (Test-Path $src) -or -not (Test-Path (Join-Path $src "SKILL.md"))) {
            Write-Host "[ERR] skill not found or invalid: $skill" -ForegroundColor Red
            $failed++
            $missing++
            continue
        }

        $link_src = $src
        # Relative links improve portability when moving parent directories together.
        if ($USE_RELATIVE) {
            $rel = Get-RelativePath -From $TARGET_DIR -To $src
            $link_src = $rel
        }

        $dstExists = Test-Path $dst
        $dstIsSymlink = $false
        $currentTarget = $null

        if ($dstExists) {
            try {
                $item = Get-Item $dst -ErrorAction Stop
                $dstIsSymlink = $item.Attributes -band [System.IO.FileAttributes]::ReparsePoint
                if ($dstIsSymlink) {
                    $currentTarget = $item.Target
                }
            } catch {
                $dstIsSymlink = $false
            }
        }

        if ($dstIsSymlink) {
            if ($currentTarget -eq $link_src -or $currentTarget -eq $src) {
                Write-Host "[SKIP] already linked: $dst -> $currentTarget"
                $skipped++
                continue
            }
            if ($FORCE) {
                if ($DRY_RUN) {
                    Write-Host "[DRY-RUN] remove existing symlink: $dst"
                } else {
                    Remove-Item $dst -Force
                }
            } else {
                Write-Host "[ERR] destination exists with different symlink: $dst" -ForegroundColor Red
                $failed++
                $conflicts++
                continue
            }
        } elseif ($dstExists) {
            if ($FORCE) {
                if ($DRY_RUN) {
                    Write-Host "[DRY-RUN] remove existing path: $dst"
                } else {
                    Remove-Item $dst -Recurse -Force
                }
            } else {
                Write-Host "[ERR] destination exists and is not a symlink: $dst" -ForegroundColor Red
                $failed++
                $conflicts++
                continue
            }
        }

        if ($DRY_RUN) {
            Write-Host "[DRY-RUN] New-Item -ItemType SymbolicLink -Path '$dst' -Target '$link_src'"
            $success++
        } else {
            try {
                New-Item -ItemType SymbolicLink -Path $dst -Target $link_src -Force | Out-Null
                Write-Host "[OK] linked: $dst -> $link_src" -ForegroundColor Green
                $success++
            } catch {
                Write-Host "[ERR] failed to link: $dst -> $link_src" -ForegroundColor Red
                $failed++
            }
        }
    }

    Write-Host "Summary: success=$success skipped=$skipped failed=$failed"

    $total_failed += $failed
    $total_conflicts += $conflicts
    $total_missing += $missing
}

if ($total_failed -gt 0) {
    if ($total_missing -gt 0 -and $total_conflicts -eq 0) {
        exit $EXIT_SKILL_NOT_FOUND
    }
    if ($total_conflicts -gt 0) {
        exit $EXIT_TARGET_CONFLICT
    }
    exit $EXIT_LINK_FAILED
}

exit 0
