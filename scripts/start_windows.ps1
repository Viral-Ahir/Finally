# FinAlly — Start script for Windows PowerShell
# Usage: .\scripts\start_windows.ps1 [-Build]
param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"

$ContainerName = "finally"
$ImageName = "finally"
$VolumeName = "finally-data"
$Port = "8000"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$EnvFile = Join-Path $ProjectDir ".env"

# Check Docker is running
try {
    docker info 2>&1 | Out-Null
} catch {
    Write-Error "Docker is not running. Please start Docker and try again."
    exit 1
}

# Build image if -Build flag passed or image doesn't exist
$needsBuild = $Build
if (-not $needsBuild) {
    try {
        docker image inspect $ImageName 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { $needsBuild = $true }
    } catch {
        $needsBuild = $true
    }
}
if ($needsBuild) {
    Write-Host "Building Docker image..."
    docker build -t $ImageName $ProjectDir
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# Stop and remove existing container (if any)
$existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $ContainerName }
if ($existing) {
    Write-Host "Stopping existing container..."
    docker stop $ContainerName 2>&1 | Out-Null
    docker rm $ContainerName 2>&1 | Out-Null
}

# Build run arguments
$runArgs = @("-d", "--name", $ContainerName, "-v", "${VolumeName}:/app/db", "-p", "${Port}:8000")

if (Test-Path $EnvFile) {
    $runArgs += @("--env-file", $EnvFile)
} else {
    Write-Warning "No .env file found at $EnvFile - running without environment variables."
    Write-Warning "Copy .env.example to .env and fill in your API keys."
}

$runArgs += $ImageName

# Run the container
Write-Host "Starting FinAlly..."
docker run @runArgs
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "FinAlly is running at http://localhost:${Port}"
Write-Host 'To stop: .\scripts\stop_windows.ps1'