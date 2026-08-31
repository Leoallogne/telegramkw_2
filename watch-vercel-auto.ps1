$ProjectName = "telegramkw-2"
$RetrySeconds = 10
$BaseDir = $PSScriptRoot
$LogDir = Join-Path $BaseDir "vercel-logs"
$LogFile = Join-Path $LogDir "latest.log"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Get-LatestDeploymentUrl {
    try {
        $json = vercel ls --json 2>$null | ConvertFrom-Json
        if (-not $json -or -not $json.deployments) {
            return $null
        }

        $latest = $json.deployments |
            Sort-Object {
                if ($_.createdAt) { [long]$_.createdAt } else { 0 }
            } -Descending |
            Select-Object -First 1

        if (-not $latest) {
            return $null
        }

        return $latest.url
    }
    catch {
        return $null
    }
}

function Get-Timestamp {
    return [DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss")
}

while ($true) {
    $deploymentUrl = Get-LatestDeploymentUrl

    if (-not $deploymentUrl) {
        Write-Host "[$(Get-Timestamp)] No deployment found yet. Retrying in $RetrySeconds seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds $RetrySeconds
        continue
    }

    $timestamp = [DateTime]::Now.ToString("yyyyMMdd-HHmmss")
    $perDeploymentLog = Join-Path $LogDir ("deployment-$timestamp.log")

    Write-Host "" 
    Write-Host "==== Vercel Smart Monitor ====" -ForegroundColor Cyan
    Write-Host "Project: $ProjectName" -ForegroundColor Cyan
    Write-Host "Deployment: $deploymentUrl" -ForegroundColor Cyan
    Write-Host "Log file: $perDeploymentLog" -ForegroundColor Cyan
    Write-Host "==============================" -ForegroundColor Cyan

    try {
        & vercel logs $deploymentUrl --follow 2>&1 | Tee-Object -FilePath $perDeploymentLog -Append
    }
    catch {
        Write-Host "[$(Get-Timestamp)] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "[$(Get-Timestamp)] Reconnecting to latest deployment in $RetrySeconds seconds..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds $RetrySeconds
}
