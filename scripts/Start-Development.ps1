param([switch]$NoBrowser, [switch]$Stop)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.dev'
$devScript = Join-Path $PSScriptRoot 'dev-server.js'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$url = 'http://localhost:3001'

if ($Stop) {
  & $nodePath $devScript --stop
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener el entorno de desarrollo.' }
  exit 0
}

function Get-DevelopmentState {
  try {
    $state = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/__dev/status' -TimeoutSec 2
    if ($state.identity -ne 'el-muelle-dev-v1' -or $state.projectRoot -ne $projectRoot) {
      throw 'El puerto 3001 pertenece a otro proyecto.'
    }
    return $state
  } catch { return $null }
}

$state = Get-DevelopmentState
if (-not $state) {
  if ((Test-Path -LiteralPath $runtimeDir) -and ((Get-Item -LiteralPath $runtimeDir).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'La carpeta .dev no puede ser un enlace.'
  }
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $server = Start-Process -FilePath $nodePath -ArgumentList @('"' + $devScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server.out.log') -RedirectStandardError (Join-Path $runtimeDir 'server.err.log')
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 200
    $state = Get-DevelopmentState
    if ($state -and $state.ready) { break }
    if ($server.HasExited) { break }
  }
} else {
  for ($attempt = 0; $attempt -lt 60 -and -not $state.ready; $attempt++) {
    Start-Sleep -Milliseconds 200
    $state = Get-DevelopmentState
    if (-not $state) { break }
  }
}
if (-not $state -or -not $state.ready) {
  throw 'El entorno no quedo listo. Revisa .dev/server.err.log; comprueba tambien que el puerto 3001 este libre.'
}
if (-not $NoBrowser) { Start-Process $url -WindowStyle Hidden }
Write-Output "Desarrollo listo: $url | datos sinteticos: .dev/data | admin 864209 | empleado 135790"
