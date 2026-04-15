#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Autonomous task orchestrator for the Agent Boilerplate.
    Executes all pending tasks via Claude Code CLI with security scans,
    checkpoints, rate-limit handling, and hard-stop on failure.

.DESCRIPTION
    Reads tasks from .agents/state.json, executes them sequentially via
    Claude Code CLI (--agent engineer), runs security scans between tasks,
    and handles rate limits gracefully.

    Prerequisites:
    - Claude Code CLI installed globally ('claude' command available)
    - Tool auto-approval configured (--dangerously-skip-permissions or settings)
    - Manager has pre-generated handoff files in .agents/handoffs/
    - Tasks defined in .agents/state.json with auto_run.task_order

.PARAMETER CheckpointSeconds
    Pause duration between tasks in seconds. Default: 45.
    During this window you can Ctrl+C to abort.

.PARAMETER MaxRetries
    Maximum retry attempts per task before halting. Default: 3.

.PARAMETER RateLimitWaitHours
    Hours to wait if Claude CLI hits rate limits. Default: 5.

.PARAMETER SkipSecurity
    Skip security scans between tasks. Not recommended.

.PARAMETER DryRun
    Preview the execution plan without invoking Claude CLI.

.EXAMPLE
    .\.github\scripts\auto-run.ps1
    .\.github\scripts\auto-run.ps1 -CheckpointSeconds 60 -MaxRetries 2
    .\.github\scripts\auto-run.ps1 -DryRun
#>

[CmdletBinding()]
param(
    [int]$CheckpointSeconds = 45,
    [int]$MaxRetries = 3,
    [double]$RateLimitWaitHours = 5,
    [switch]$SkipSecurity,
    [switch]$DryRun,
    [switch]$ManualMode
)

$ErrorActionPreference = "Stop"

# ─── Resolve Paths ────────────────────────────────────────────────────────────

$ProjectRoot = & git rev-parse --show-toplevel 2>$null
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }

$AgentsDir    = Join-Path $ProjectRoot ".agents"
$StateFile    = Join-Path $AgentsDir "state.json"
$HandoffsDir  = Join-Path $AgentsDir "handoffs"
$HandoffFile  = Join-Path $AgentsDir "handoff.md"

# ─── Helpers ──────────────────────────────────────────────────────────────────

function Write-Banner {
    param([string]$Text, [ConsoleColor]$Color = "Cyan")
    $line = [string]::new([char]0x2550, 60)
    Write-Host ""
    Write-Host $line -ForegroundColor $Color
    Write-Host "  $Text" -ForegroundColor $Color
    Write-Host $line -ForegroundColor $Color
    Write-Host ""
}

function Write-TaskLine {
    param(
        [string]$TaskId,
        [string]$Title,
        [string]$Status,
        [int]$Current,
        [int]$Total
    )
    $icons = @{
        starting      = [char]0x25B6   # ▶
        running       = [char]0x231B   # ⌛
        security      = [char]0x2630  # ☰ (trigram for scan)
        done          = [char]0x2705   # ✅
        failed        = [char]0x274C   # ❌
        "rate-limited" = [char]0x23F8  # ⏸
    }
    $icon = if ($icons.ContainsKey($Status)) { $icons[$Status] } else { "-" }
    $color = switch ($Status) {
        "done"         { "Green"  }
        "failed"       { "Red"    }
        "rate-limited" { "Yellow" }
        default        { "White"  }
    }
    Write-Host "  [$Current/$Total] $icon $TaskId`: $Title  ($Status)" -ForegroundColor $color
}

function Read-StateFile {
    if (-not (Test-Path $StateFile)) {
        Write-Error "State file not found: $StateFile"
        exit 1
    }
    # Read as UTF-8 explicitly (PS 5.1 defaults to system ANSI, which mangles multi-byte chars)
    $content = [System.IO.File]::ReadAllText($StateFile, [System.Text.Encoding]::UTF8)
    # Strip UTF-8 BOM if present (PS 5.1 Set-Content -Encoding UTF8 writes BOM)
    if ($content -and $content[0] -eq [char]0xFEFF) { $content = $content.Substring(1) }
    $content | ConvertFrom-Json
}

function Save-StateFile {
    param($State)
    # Use UTF8Encoding($false) to write UTF-8 without BOM — PS 5.1 Set-Content -Encoding UTF8 writes BOM
    $noBomUtf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($StateFile, ($State | ConvertTo-Json -Depth 10), $noBomUtf8)
}

function Get-PendingTasks {
    param($State)
    $tasks = [System.Collections.ArrayList]::new()

    # Explicit order from auto_run config, or natural sort
    $order = @()
    if ($State.auto_run -and $State.auto_run.task_order) {
        $order = @($State.auto_run.task_order)
    }

    $allTasks = @{}
    $State.tasks.PSObject.Properties | ForEach-Object {
        $allTasks[$_.Name] = $_.Value
    }

    if ($order.Count -gt 0) {
        foreach ($id in $order) {
            if ($allTasks.ContainsKey($id) -and $allTasks[$id].status -in @("pending", "not_started")) {
                [void]$tasks.Add(@{ id = $id; data = $allTasks[$id] })
            }
        }
    }
    else {
        $allTasks.GetEnumerator() | Sort-Object Name | ForEach-Object {
            if ($_.Value.status -in @("pending", "not_started")) {
                [void]$tasks.Add(@{ id = $_.Key; data = $_.Value })
            }
        }
    }

    return $tasks
}

function Test-RateLimited {
    param([string]$Output, [int]$ExitCode)
    if ($ExitCode -eq 0) { return $false }
    $patterns = @("rate.limit", "usage.limit", "too many requests", "429",
                   "throttl", "capacity", "overloaded", "quota")
    foreach ($p in $patterns) {
        if ($Output -match $p) { return $true }
    }
    return $false
}

function Invoke-Claude {
    param(
        [string]$Agent,
        [string]$Prompt
    )

    if ($DryRun) {
        Write-Host "    [DRY RUN] claude --agent $Agent -p ..." -ForegroundColor DarkGray
        return @{ ExitCode = 0; Output = "[dry run - no execution]"; RateLimited = $false }
    }

    # ── Manual Mode (GitHub Copilot Chat) ──────────────────────────────────────
    if ($ManualMode) {
        $agentLabel = switch ($Agent) {
            "engineer" { "Engineer  --  implement the task" }
            "security" { "Security  --  audit for vulnerabilities" }
            default    { $Agent }
        }
        $border = [string]::new([char]0x2500, 62)
        Write-Host ""
        Write-Host "  $([char]0x250C)$border$([char]0x2510)" -ForegroundColor Cyan
        Write-Host "  $([char]0x2502)  COPILOT CHAT  --  $($agentLabel.PadRight(43))$([char]0x2502)" -ForegroundColor Cyan
        Write-Host "  $([char]0x2514)$border$([char]0x2518)" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Open VS Code Copilot Chat  (Ctrl+Alt+I)" -ForegroundColor White
        Write-Host "  Switch to Agent mode, then paste this prompt:" -ForegroundColor White
        Write-Host ""
        Write-Host "  $([char]0x250C)$border$([char]0x2510)" -ForegroundColor Yellow
        # Word-wrap prompt at 60 chars per line
        $words = $Prompt -split ' '
        $line  = "  $([char]0x2502)  "
        foreach ($word in $words) {
            if (($line.Length + $word.Length) -gt 64) {
                Write-Host $line -ForegroundColor Yellow
                $line = "  $([char]0x2502)  $word "
            } else {
                $line += "$word "
            }
        }
        if ($line.Trim() -ne "$([char]0x2502)") { Write-Host $line -ForegroundColor Yellow }
        Write-Host "  $([char]0x2514)$border$([char]0x2518)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Full task details: .agents/handoff.md" -ForegroundColor DarkGray
        Write-Host ""

        $confirm = Read-Host "  Done? Press Enter to validate, or type 'skip' to skip this task"
        if ($confirm -eq 'skip') {
            return @{ ExitCode = 1; Output = "skipped by user"; RateLimited = $false }
        }
        return @{ ExitCode = 0; Output = "[manual completion confirmed]"; RateLimited = $false }
    }

    # ── Claude Code CLI ────────────────────────────────────────────────────────
    $output = $null
    try {
        $output = & claude --agent $Agent -p --dangerously-skip-permissions $Prompt 2>&1 |
                  Out-String
    }
    catch {
        $output = $_.Exception.Message
    }

    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }

    $rateLimited = Test-RateLimited -Output $output -ExitCode $exitCode

    return @{
        ExitCode    = $exitCode
        Output      = $output
        RateLimited = $rateLimited
    }
}

function Get-ChangedFiles {
    $files = & git diff --name-only HEAD~1 2>$null
    if (-not $files) { $files = & git diff --name-only --cached 2>$null }
    if (-not $files) { $files = & git diff --name-only 2>$null }
    if ($files) { return ($files -join ", ") }
    return "all recently modified files"
}

function Show-Countdown {
    param([int]$Seconds, [string]$NextTaskId)
    Write-Host ""
    Write-Host "    Next: $NextTaskId - starting in ${Seconds}s  (Ctrl+C to abort)" -ForegroundColor DarkCyan
    for ($i = $Seconds; $i -gt 0; $i--) {
        Write-Host "`r    $([char]0x23F1) ${i}s remaining...    " -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds 1
    }
    Write-Host "`r    Continuing...                " -ForegroundColor DarkGray
    Write-Host ""
}

function Wait-ForRateLimit {
    param([double]$Hours)
    $totalSec = [int]($Hours * 3600)
    Write-Banner "RATE LIMITED" Yellow
    Write-Host "    Claude Code CLI hit usage limits." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    Options:" -ForegroundColor White
    Write-Host "      Press Enter  - wait $Hours hours, then resume" -ForegroundColor Gray
    Write-Host "      Ctrl+C       - abort and switch to Copilot native" -ForegroundColor Gray
    Write-Host ""
    Read-Host "    Press Enter to wait, or Ctrl+C to abort"

    Write-Host "    Waiting $Hours hours..." -ForegroundColor DarkGray
    for ($s = $totalSec; $s -gt 0; $s -= 60) {
        $h = [math]::Floor($s / 3600)
        $m = [math]::Floor(($s % 3600) / 60)
        Write-Host "`r    $([char]0x23F8) ${h}h ${m}m remaining...    " -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds ([math]::Min(60, $s))
    }
    Write-Host "`r    Rate limit window passed. Resuming...         " -ForegroundColor Green
    Write-Host ""
}

# ─── Pre-flight Checks ───────────────────────────────────────────────────────

# Verify claude CLI exists (skip check in ManualMode)
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCmd -and -not $DryRun -and -not $ManualMode) {
    Write-Error "Claude Code CLI not found. Install: https://github.com/anthropic-ai/claude-code`nOr run with -ManualMode to use GitHub Copilot Chat instead."
    exit 1
}

# Read state
$state = Read-StateFile
$pendingTasks = Get-PendingTasks -State $state
$totalTasks = $pendingTasks.Count

if ($totalTasks -eq 0) {
    Write-Host "No pending tasks in state.json. Nothing to run." -ForegroundColor Yellow
    exit 0
}

# Override defaults from state.json auto_run config if present
if ($state.auto_run) {
    if ($state.auto_run.checkpoint_seconds -and -not $PSBoundParameters.ContainsKey('CheckpointSeconds')) {
        $CheckpointSeconds = $state.auto_run.checkpoint_seconds
    }
    if ($state.auto_run.max_retries -and -not $PSBoundParameters.ContainsKey('MaxRetries')) {
        $MaxRetries = $state.auto_run.max_retries
    }
    if ($state.auto_run.rate_limit_wait_hours -and -not $PSBoundParameters.ContainsKey('RateLimitWaitHours')) {
        $RateLimitWaitHours = $state.auto_run.rate_limit_wait_hours
    }
    if ($state.auto_run.PSObject.Properties.Name -contains 'security_between_tasks') {
        if (-not $state.auto_run.security_between_tasks -and -not $PSBoundParameters.ContainsKey('SkipSecurity')) {
            $SkipSecurity = [switch]::new($true)
        }
    }
}

# Verify handoff files
$missingHandoffs = @()
foreach ($t in $pendingTasks) {
    $path = Join-Path $HandoffsDir "$($t.id).md"
    if (-not (Test-Path $path)) { $missingHandoffs += $t.id }
}
if ($missingHandoffs.Count -gt 0) {
    Write-Host "Missing handoff files: $($missingHandoffs -join ', ')" -ForegroundColor Red
    Write-Host "Run /auto-run in Copilot first to generate them." -ForegroundColor Yellow
    exit 1
}

# ─── Display Plan ─────────────────────────────────────────────────────────────

Write-Banner "AUTONOMOUS TASK RUNNER"
Write-Host "  Project:     $($state.project)" -ForegroundColor White
Write-Host "  Tasks:       $totalTasks pending" -ForegroundColor White
Write-Host "  Checkpoint:  ${CheckpointSeconds}s" -ForegroundColor White
Write-Host "  Retries:     $MaxRetries per task" -ForegroundColor White
Write-Host "  Security:    $(if ($SkipSecurity) { 'SKIPPED' } else { 'after each task' })" -ForegroundColor White
Write-Host "  Rate limit:  wait ${RateLimitWaitHours}h on throttle" -ForegroundColor White
if ($DryRun)     { Write-Host "  Mode:        DRY RUN" -ForegroundColor Yellow }
if ($ManualMode) { Write-Host "  Mode:        MANUAL (GitHub Copilot Chat)" -ForegroundColor Magenta }
Write-Host ""
Write-Host "  Task queue:" -ForegroundColor Gray
foreach ($t in $pendingTasks) {
    Write-Host "    $($t.id): $($t.data.title)" -ForegroundColor Gray
}
Write-Host ""

if ($ManualMode) {
    Write-Host "  Copilot Chat will be used for each task." -ForegroundColor Magenta
    Write-Host "  The script pauses and shows you what to paste." -ForegroundColor Magenta
    Write-Host ""
}

if (-not $DryRun) {
    Write-Host "  Starting in 5 seconds... (Ctrl+C to abort)" -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

# ─── Main Loop ────────────────────────────────────────────────────────────────

$completed = [System.Collections.ArrayList]::new()
$failed    = [System.Collections.ArrayList]::new()
$startTime = Get-Date
$halted    = $false

for ($i = 0; $i -lt $pendingTasks.Count; $i++) {
    $task     = $pendingTasks[$i]
    $taskId   = $task.id
    $taskTitle = $task.data.title
    $taskNum  = $i + 1

    Write-Banner "TASK $taskNum/$totalTasks  $([char]0x2014)  $taskId" White
    Write-TaskLine -TaskId $taskId -Title $taskTitle -Status "starting" -Current $taskNum -Total $totalTasks

    # Copy handoff file into place
    $srcHandoff = Join-Path $HandoffsDir "$taskId.md"
    Copy-Item $srcHandoff $HandoffFile -Force

    # Update state: in_progress
    $state = Read-StateFile
    $state.current_task.id          = $taskId
    $state.current_task.title       = $taskTitle
    $state.current_task.status      = "in_progress"
    $state.current_task.assigned_to = "engineer"
    $state.tasks.$taskId.status     = "in_progress"
    $state.last_updated             = (Get-Date -Format "o")
    $state.last_updated_by          = "auto-run"
    Save-StateFile -State $state

    # ── Engineer Execution (with retries) ──
    $success    = $false
    $attempts   = 0

    while (-not $success -and $attempts -lt $MaxRetries) {
        $attempts++
        if ($attempts -gt 1) {
            Write-Host "    Retry $attempts/$MaxRetries..." -ForegroundColor Yellow
        }

        Write-TaskLine -TaskId $taskId -Title $taskTitle -Status "running" -Current $taskNum -Total $totalTasks

        $engineerPrompt = "Read .agents/handoff.md carefully. It contains all context, acceptance criteria, and a 'Files to Read First' list. " +
            "IMPORTANT: Do NOT scan the full file tree or read entire directories to discover the project structure. " +
            "Use CLAUDE.md for project architecture overview. Read ONLY the files listed in the handoff's 'Files to Read First' section, " +
            "plus any files you need to write or modify. This keeps token usage low. " +
            "Implement task $taskId`: $taskTitle. " +
            "When complete: (1) commit with git add -A and git commit -m 'feat($taskId): [description]', " +
            "(2) set .agents/state.json tasks.$taskId.status to 'done', " +
            "(3) append a one-line summary to .agents/state.md, " +
            "(4) update .agents/workspace-map.md only if you created or moved files."

        $result = Invoke-Claude -Agent "engineer" -Prompt $engineerPrompt

        # Rate limit?
        if ($result.RateLimited) {
            Write-TaskLine -TaskId $taskId -Title $taskTitle -Status "rate-limited" -Current $taskNum -Total $totalTasks
            Wait-ForRateLimit -Hours $RateLimitWaitHours
            $attempts--  # Don't count rate-limit as a failed attempt
            continue
        }

        # Non-zero exit?
        if ($result.ExitCode -ne 0) {
            Write-Host "    Claude CLI exited with code $($result.ExitCode)" -ForegroundColor Red
            $tail = if ($result.Output.Length -gt 500) {
                $result.Output.Substring($result.Output.Length - 500)
            } else { $result.Output }
            Write-Host "    Last output:" -ForegroundColor DarkGray
            Write-Host $tail -ForegroundColor DarkGray
            continue
        }

        # Verify state.json updated
        $state      = Read-StateFile
        $taskStatus = $state.tasks.$taskId.status
        if ($taskStatus -eq "done") {
            $success = $true
        }
        else {
            Write-Host "    Claude exited OK but task status is '$taskStatus' (expected 'done'). Retrying..." -ForegroundColor Yellow
        }
    }

    # ── Handle failure ──
    if (-not $success) {
        Write-TaskLine -TaskId $taskId -Title $taskTitle -Status "failed" -Current $taskNum -Total $totalTasks
        Write-Banner "TASK FAILED  $([char]0x2014)  $taskId" Red
        Write-Host "    Failed after $MaxRetries attempts. Halting." -ForegroundColor Red
        Write-Host ""
        Write-Host "    To resume after fixing:" -ForegroundColor Yellow
        Write-Host "      .\.github\scripts\auto-run.ps1" -ForegroundColor White
        Write-Host "    (completed tasks are skipped automatically)" -ForegroundColor Gray

        [void]$failed.Add($taskId)

        $state = Read-StateFile
        $state.tasks.$taskId.status = "blocked"
        $state.context.blocked_on   = "$taskId failed after $MaxRetries attempts"
        $state.last_updated         = (Get-Date -Format "o")
        $state.last_updated_by      = "auto-run"
        Save-StateFile -State $state

        $halted = $true
        break
    }

    Write-TaskLine -TaskId $taskId -Title $taskTitle -Status "done" -Current $taskNum -Total $totalTasks
    [void]$completed.Add($taskId)

    # ── Security Scan ──
    if (-not $SkipSecurity) {
        Write-TaskLine -TaskId $taskId -Title $taskTitle -Status "security" -Current $taskNum -Total $totalTasks

        $changedFiles  = Get-ChangedFiles
        $securityPrompt = "Audit these specific files for security vulnerabilities (OWASP Top 10): $changedFiles. " +
            "Read ONLY these files -- do not scan the full project tree. " +
            "Report findings grouped by severity (CRITICAL, HIGH, MEDIUM, LOW). " +
            "Keep output compact. CRITICAL findings are hard blockers."

        $secResult = Invoke-Claude -Agent "security" -Prompt $securityPrompt

        if ($secResult.RateLimited) {
            Write-Host "    Security scan rate limited - will need manual audit later." -ForegroundColor Yellow
        }
        elseif ($secResult.Output -match "CRITICAL") {
            Write-Banner "CRITICAL SECURITY FINDING  $([char]0x2014)  $taskId" Red
            Write-Host $secResult.Output -ForegroundColor Red
            Write-Host ""
            Write-Host "    Task queue HALTED. Review findings before continuing." -ForegroundColor Red

            $state = Read-StateFile
            $state.security_status.open_findings    += 1
            $state.security_status.cleared_for_push  = $false
            $state.context.blocked_on                = "CRITICAL security finding in $taskId"
            $state.last_updated                      = (Get-Date -Format "o")
            $state.last_updated_by                   = "auto-run"
            Save-StateFile -State $state

            $halted = $true
            break
        }
        else {
            Write-Host "    Security: PASS" -ForegroundColor Green
        }
    }

    # ── Checkpoint ──
    if ($i -lt $pendingTasks.Count - 1) {
        $nextTask = $pendingTasks[$i + 1]
        Show-Countdown -Seconds $CheckpointSeconds -NextTaskId $nextTask.id
    }
}

# ─── Final Summary ────────────────────────────────────────────────────────────

$elapsed = (Get-Date) - $startTime
$summaryColor = if ($failed.Count -eq 0 -and -not $halted) { "Green" } else { "Red" }

Write-Banner "EXECUTION COMPLETE" $summaryColor
Write-Host "  Duration:   $([math]::Round($elapsed.TotalMinutes, 1)) minutes" -ForegroundColor White
Write-Host "  Completed:  $($completed.Count)/$totalTasks" -ForegroundColor White

if ($completed.Count -gt 0) {
    Write-Host "  $([char]0x2705) $($completed -join ', ')" -ForegroundColor Green
}
if ($failed.Count -gt 0) {
    Write-Host "  $([char]0x274C) $($failed -join ', ')" -ForegroundColor Red
}

$remainingIds = $pendingTasks | Where-Object { $_.id -notin $completed -and $_.id -notin $failed } |
                ForEach-Object { $_.id }
if ($remainingIds.Count -gt 0) {
    Write-Host "  $([char]0x23F8) $($remainingIds -join ', ')" -ForegroundColor Yellow
}

Write-Host ""

# ─── Final Full-Codebase Security Scan ───────────────────────────────────────

if (-not $halted -and -not $SkipSecurity -and $completed.Count -gt 0) {
    Write-Banner "FINAL SECURITY SCAN" Cyan
    Write-Host "  Auditing entire codebase before marking build complete..." -ForegroundColor White
    Write-Host ""

    $finalSecPrompt = "Perform a full security audit of the newly built application. " +
        "Audit all files in packages/client/src/, packages/server/src/, and any config files " +
        "(vite.config.ts, tsconfig*.json, package.json files). " +
        "Focus on: OWASP Top 10, API key exposure, XSS, injection risks, insecure dependencies, " +
        "and any auth/input validation issues in the Express proxy. " +
        "Report all findings grouped by severity (CRITICAL, HIGH, MEDIUM, LOW). " +
        "CRITICAL findings are hard blockers -- list them first."

    $finalSecResult = Invoke-Claude -Agent "security" -Prompt $finalSecPrompt

    if ($finalSecResult.RateLimited) {
        Write-Host "  Final security scan rate limited -- run a manual audit before pushing." -ForegroundColor Yellow
    }
    elseif ($finalSecResult.Output -match "CRITICAL") {
        Write-Banner "CRITICAL SECURITY FINDING -- DO NOT PUSH" Red
        Write-Host $finalSecResult.Output -ForegroundColor Red

        $state = Read-StateFile
        $state.security_status.open_findings   += 1
        $state.security_status.cleared_for_push = $false
        $state.context.blocked_on               = "CRITICAL security finding in final scan"
        $state.last_updated                     = (Get-Date -Format "o")
        $state.last_updated_by                  = "auto-run"
        Save-StateFile -State $state
    }
    else {
        Write-Host "  Final security scan: PASS" -ForegroundColor Green
        Write-Host $finalSecResult.Output -ForegroundColor DarkGray

        $state = Read-StateFile
        $state.security_status.cleared_for_push = $true
        $state.last_updated                     = (Get-Date -Format "o")
        $state.last_updated_by                  = "auto-run"
        Save-StateFile -State $state
    }
    Write-Host ""
}

if (-not $halted) {
    Write-Host "  All tasks complete. Return to Copilot Manager for final review and push." -ForegroundColor Cyan
}
else {
    Write-Host "  Execution halted. Fix the issue, then re-run to continue." -ForegroundColor Yellow
}
Write-Host ""
