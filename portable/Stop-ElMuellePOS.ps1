$ErrorActionPreference = "Stop"

$pidPath = Join-Path $PSScriptRoot "server.pid"
$nodePath = Join-Path $PSScriptRoot "runtime\node.exe"
if (-not (Test-Path -LiteralPath $pidPath)) {
  Write-Host "No hay un servidor portable registrado para detener."
  exit 0
}

$serverId = Get-Content -LiteralPath $pidPath -Raw
try {
  $server = Get-CimInstance Win32_Process -Filter "ProcessId = $serverId" -ErrorAction Stop
  if ($server.Name -ne "node.exe" -or $server.ExecutablePath -ne $nodePath) {
    throw "El PID registrado no pertenece al servidor portable actual."
  }

  Stop-Process -Id $server.ProcessId -Force
  Write-Host "Servidor local detenido."
} catch {
  Write-Host "El servidor ya no estaba en ejecución o no pertenece a esta entrega."
} finally {
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}
