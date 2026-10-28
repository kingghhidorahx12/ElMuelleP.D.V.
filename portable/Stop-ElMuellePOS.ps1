param([string]$PortableRoot = $PSScriptRoot)
$ErrorActionPreference = "Stop"

$nodePath = Join-Path $PortableRoot "runtime\node.exe"
$appRoot = Join-Path $PortableRoot "app"
$serverEntry = Join-Path $appRoot "src\server.js"
$env:EL_MUELLE_STORAGE_MODE = "windows-user"
$storageJson = & $nodePath (Join-Path $appRoot "src\persistence.js") --paths
if ($LASTEXITCODE -ne 0) { throw "No se pudo resolver el almacenamiento. No se detuvo ningún proceso." }
$storage = $storageJson | ConvertFrom-Json
$env:DATA_DIR = $storage.dataDir
$env:ENV_FILE = $storage.envPath
$pidPath = Join-Path $storage.runtimeDir "server.pid"
if (-not (Test-Path -LiteralPath $pidPath)) {
  Write-Host "No hay un servidor portable registrado para detener."
  exit 0
}

$serverId = (Get-Content -LiteralPath $pidPath -Raw).Trim()
if ($serverId -notmatch '^\d+$') { throw "El registro del servidor no es válido." }
try {
  $server = Get-CimInstance Win32_Process -Filter "ProcessId = $serverId" -ErrorAction Stop
  if ($null -eq $server) {
    Remove-Item -LiteralPath $pidPath -Force
    Write-Host "El proceso registrado ya terminó."
    exit 0
  }
  if ($server.Name -ne "node.exe" -or $server.ExecutablePath -ne $nodePath -or -not $server.CommandLine.Contains($serverEntry)) {
    throw "El PID registrado no pertenece al servidor portable actual."
  }

  & $nodePath (Join-Path $appRoot "src\stop-server.js") $serverId
  if ($LASTEXITCODE -ne 0) { throw "No se completó el cierre seguro. No se forzó el servidor." }
  Remove-Item -LiteralPath $pidPath -Force
  Write-Host "Servidor local detenido."
} catch {
  throw "No se confirmó el cierre del servidor. Se conservó el registro; requiere revisión técnica."
}
