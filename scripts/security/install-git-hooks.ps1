$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$gitDir = Join-Path $repoRoot ".git"
$hooksDir = Join-Path $gitDir "hooks"
$sourceDir = Join-Path $PSScriptRoot "hooks"

if (-not (Test-Path $gitDir)) {
    throw "Could not find .git directory at $gitDir"
}

New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null

Copy-Item -Force (Join-Path $sourceDir "pre-commit") (Join-Path $hooksDir "pre-commit")
Copy-Item -Force (Join-Path $sourceDir "pre-push") (Join-Path $hooksDir "pre-push")

Write-Host "Installed DegreeForge privacy Git hooks:"
Write-Host "  - .git/hooks/pre-commit"
Write-Host "  - .git/hooks/pre-push"
