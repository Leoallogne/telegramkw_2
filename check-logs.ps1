# Script untuk fetch Vercel deployment logs
Write-Host "📋 Fetching Vercel Deployment Logs..." -ForegroundColor Yellow

# Get latest deployment info
$deployInfo = vercel ls --json | ConvertFrom-Json | Select-Object -First 1

Write-Host "Latest Deployment: $($deployInfo.url)" -ForegroundColor Cyan

# Fetch build logs
Write-Host "`n🔍 BUILD LOGS:" -ForegroundColor Green
vercel logs $deployInfo.url --follow 2>&1

Write-Host "`n✅ Done" -ForegroundColor Green
