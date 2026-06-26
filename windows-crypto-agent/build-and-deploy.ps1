param([string]$Action = 'run')

$ErrorActionPreference = 'Continue'
$ImageName = 'quantum-safe-windows-crypto-agent:latest'
$ContainerName = 'crypto-agent-container'

function Write-Status {
    param([string]$Message, [string]$Type)
    $colors = @{
        'Info' = 'Cyan'
        'Success' = 'Green'
        'Error' = 'Red'
        'Warning' = 'Yellow'
    }
    $prefix = @{
        'Info' = '[Info]'
        'Success' = '[Success]'
        'Error' = '[Error]'
        'Warning' = '[Warning]'
    }
    Write-Host "$($prefix[$Type]) $Message" -ForegroundColor $colors[$Type]
}

function Check-Prerequisites {
    Write-Status "Checking Docker..." "Info"
    try {
        $version = docker version --format '{{.Server.Os}}/{{.Server.Arch}}'
        Write-Status "Docker OK: $version" "Success"
        return $true
    } catch {
        Write-Status "Docker not found or not running" "Error"
        return $false
    }
}

function Build-Image {
    Write-Status "Building image (15-30 min first time)..." "Info"
    try {
        docker build -t $ImageName .
        Write-Status "Build SUCCESS" "Success"
        return $true
    } catch {
        Write-Status "Build FAILED" "Error"
        return $false
    }
}

function Run-Container {
    Write-Status "Starting container..." "Info"
    try {
        docker run -d --name $ContainerName -p 9502:9502 --network xencrypt-network $ImageName
        Write-Status "Container started, waiting for health..." "Info"
        Start-Sleep -Seconds 15
        $health = docker inspect $ContainerName --format '{{.State.Health.Status}}'
        if ($health -eq 'healthy') {
            Write-Status "Container is healthy" "Success"
        } else {
            Write-Status "Health check timeout (initializing)" "Warning"
        }
    } catch {
        Write-Status "Failed to start container: $_" "Error"
    }
}

function Verify-Config {
    Write-Status "Verifying configuration..." "Info"
    
    $fips = docker exec $ContainerName powershell -Command "(Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy' -Name Enabled -ErrorAction SilentlyContinue).Enabled" 2>$null
    if ($fips -eq '1') { 
        Write-Status "[OK] FIPS 140-2" "Success" 
    } else { 
        Write-Status "[FAIL] FIPS 140-2" "Error" 
    }
    
    $tls = docker exec $ContainerName powershell -Command "(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\Server' -Name Enabled -ErrorAction SilentlyContinue).Enabled" 2>$null
    if ($tls -eq '1') { 
        Write-Status "[OK] TLS 1.2" "Success" 
    } else { 
        Write-Status "[FAIL] TLS 1.2" "Error" 
    }
    
    $svc = docker exec $ContainerName powershell -Command "Get-Service CryptoAgentService -ErrorAction SilentlyContinue | Select -ExpandProperty Status" 2>$null
    if ($svc -eq 'Running') { 
        Write-Status "[OK] Agent Service RUNNING" "Success" 
    } else { 
        Write-Status "[FAIL] Agent Service" "Error" 
    }
}

function Scan-System {
    Write-Status "Running system audit..." "Info"
    docker exec $ContainerName powershell -Command "cd C:\CryptoAgent; python windows_audit.py" 2>&1
}

function Show-Logs {
    Write-Status "Showing container logs..." "Info"
    docker logs -f $ContainerName
}

function Stop-Container {
    Write-Status "Stopping container..." "Info"
    docker stop $ContainerName 2>$null
    docker rm $ContainerName 2>$null
    Write-Status "Container stopped" "Success"
}

function Clean-All {
    Write-Status "Cleaning up..." "Info"
    docker stop $ContainerName 2>$null
    docker rm $ContainerName 2>$null
    docker rmi $ImageName 2>$null
    Write-Status "Cleanup complete" "Success"
}

Write-Host ""
Write-Host "============================================================"
Write-Host "   Quantum-Safe Windows Crypto Agent"
Write-Host "============================================================"
Write-Host ""

switch ($Action.ToLower()) {
    'build' { Check-Prerequisites; Build-Image }
    'run' { Check-Prerequisites; if (Build-Image) { Run-Container } }
    'verify' { Verify-Config }
    'scan' { Scan-System }
    'logs' { Show-Logs }
    'stop' { Stop-Container }
    'clean' { Clean-All }
    default { Write-Status "Usage: .\script.ps1 [build|run|verify|scan|logs|stop|clean]" "Error" }
}

Write-Host ""
Write-Host "============================================================"
Write-Host ""
