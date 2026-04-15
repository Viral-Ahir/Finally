# FinAlly — Stop script for Windows PowerShell

$ErrorActionPreference = "Stop"

$ContainerName = "finally"

# Check Docker is running
try {
    docker info 2>&1 | Out-Null
} catch {
    Write-Error "Docker is not running."
    exit 1
}

# Stop and remove the container (volume is preserved)
$existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $ContainerName }
if ($existing) {
    Write-Host "Stopping FinAlly..."
    docker stop $ContainerName 2>&1 | Out-Null
    docker rm $ContainerName 2>&1 | Out-Null
    Write-Host "FinAlly stopped. Your data is preserved in the Docker volume."
} else {
    Write-Host "FinAlly is not running."
}
