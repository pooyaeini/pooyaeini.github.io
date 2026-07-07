# ============================================================
#  One-time publish helper for GitHub Pages
#  Usage:  right-click > Run with PowerShell,  OR  in a terminal:
#     powershell -ExecutionPolicy Bypass -File .\publish.ps1
#  It will ask for your GitHub username, then push the site.
#  A browser window may pop up once to log in to GitHub — that's normal.
# ============================================================

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$user = Read-Host "Enter your GitHub username exactly (e.g. pooyaeini)"
if ([string]::IsNullOrWhiteSpace($user)) { Write-Host "No username entered. Exiting."; exit 1 }

$repo = "$user.github.io"
$url  = "https://github.com/$user/$repo.git"

Write-Host ""
Write-Host "Target repository : $repo"
Write-Host "Your site URL will be : https://$repo"
Write-Host ""
Write-Host "BEFORE continuing, create an EMPTY repo on GitHub named EXACTLY:  $repo"
Write-Host "  (github.com > New repository > name = $repo > Public > do NOT add a README)"
Read-Host "Press Enter once that empty repo exists"

git branch -M main
if (git remote | Select-String -Quiet "^origin$") { git remote remove origin }
git remote add origin $url
git push -u origin main

Write-Host ""
Write-Host "Done pushing. Your site will be live in ~1 minute at:  https://$repo"
Write-Host "If it 404s at first, wait a minute and refresh."
