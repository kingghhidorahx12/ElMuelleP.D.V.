param(
  [switch]$NoBrowser,
  [ValidateRange(1,65535)][int]$Port = 3000
)
$ErrorActionPreference = "Stop"

$portableRoot = $PSScriptRoot
$appRoot = Join-Path $portableRoot "app"
$nodePath = Join-Path $portableRoot "runtime\node.exe"
$url = "http://127.0.0.1:$Port"
$env:PORT = [string]$Port
$env:HOST = "127.0.0.1"


function Test-PosServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$url/api/health" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "No se encontró el runtime de Node dentro del paquete portable. Vuelve a generar la entrega."
}

# La instalación es por usuario (PrivilegesRequired=lowest). Los datos no viven
# dentro de Programs ni de la carpeta portable. No se adopta una base legada.
$env:EL_MUELLE_STORAGE_MODE = "windows-user"
$releaseManifest = Join-Path $portableRoot "release-manifest.json"
if (-not (Test-Path -LiteralPath $releaseManifest)) { throw "La revisión no tiene compatibilidad de seguridad verificada. Recupera un paquete aprobado; no uses código histórico." }
$releaseHasher = [Security.Cryptography.SHA256]::Create()
try { $releaseHash = ([BitConverter]::ToString($releaseHasher.ComputeHash([IO.File]::ReadAllBytes($releaseManifest)))).Replace('-', '').ToLowerInvariant() }
finally { $releaseHasher.Dispose() }
& $nodePath (Join-Path $appRoot "src\release-compatibility.js") --package $portableRoot --sha256 $releaseHash
if ($LASTEXITCODE -ne 0) { throw "Revisión incompatible o alterada. No se inició ni se preparó el almacenamiento." }
$selectedStorage = & $nodePath (Join-Path $appRoot "src\persistence.js") --paths
if ($LASTEXITCODE -ne 0) { throw "No se pudieron comprobar las rutas persistentes." }
$selectedPaths = $selectedStorage | ConvertFrom-Json
& $nodePath (Join-Path $appRoot "src\release-compatibility.js") --manifest $releaseManifest --sha256 $releaseHash --data-dir $selectedPaths.dataDir --configuration-file $selectedPaths.envPath
if ($LASTEXITCODE -ne 0) { throw "Los datos requieren otra revisión compatible. No se preparó ni modificó el almacenamiento." }
$storageJson = & $nodePath (Join-Path $appRoot "src\persistence.js") --prepare
if ($LASTEXITCODE -ne 0) { throw "No se pudo preparar el almacenamiento persistente. Requiere revisión técnica; no se inició otra base." }
$storage = $storageJson | ConvertFrom-Json
# Las versiones anteriores conocen DATA_DIR/ENV_FILE, aunque no conozcan el modo.
$env:DATA_DIR = $storage.dataDir
$env:ENV_FILE = $storage.envPath
$pidPath = Join-Path $storage.runtimeDir "server.pid"
$logsPath = $storage.logsDir
$serverEntry = Join-Path $appRoot "src\server.js"

if (Test-PosServer) {
  if (-not (Test-Path -LiteralPath $pidPath)) { throw "El puerto 3000 ya está ocupado por otra instalación. No se modificó ese servidor." }
  $registeredServerId = (Get-Content -LiteralPath $pidPath -Raw).Trim()
  if ($registeredServerId -notmatch '^\d+$') { throw "El registro del servidor no es válido." }
  $registeredServer = Get-CimInstance Win32_Process -Filter "ProcessId = $registeredServerId" -ErrorAction Stop
  if ($registeredServer.ExecutablePath -ne $nodePath -or -not $registeredServer.CommandLine.Contains($serverEntry)) { throw "El servidor activo no pertenece a esta instalación. No se reutilizó." }
}

if (-not (Test-PosServer)) {
  New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
  $outputLog = Join-Path $logsPath "server.out.log"
  $errorLog = Join-Path $logsPath "server.err.log"
  $server = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverEntry + '"') -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog
  Set-Content -LiteralPath $pidPath -Value $server.Id -NoNewline

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 300
    if (Test-PosServer) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    throw "El servidor local no inició. Revisa $errorLog"
  }
}

if ($NoBrowser) {
  Write-Host "El Muelle POS está listo en $url (sin abrir navegador)."
  return
}

$browserCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
)
$browserPath = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if (-not $browserPath) {
  throw "Se requiere Microsoft Edge o Google Chrome para usar la báscula mediante Web Serial."
}

$browserProfile = $storage.browserProfileDir
New-Item -ItemType Directory -Path $browserProfile -Force | Out-Null

$setupRequired = $true
try {
  $publicSettings = Invoke-RestMethod -Uri "$url/api/settings" -TimeoutSec 2
  $setupRequired = $publicSettings.setupRequired -eq $true
} catch {
  # Si no puede leerse el estado, se conserva el arranque compacto y seguro.
}

$windowArguments = if ($setupRequired) {
  @("--window-size=1060,720")
} else {
  @("--start-maximized")
}

$browserArguments = @("--app=$url", ('--user-data-dir="' + $browserProfile + '"'), "--no-first-run", "--no-default-browser-check") + $windowArguments
Start-Process -FilePath $browserPath -ArgumentList $browserArguments

Write-Host "El Muelle POS está listo en $url"
