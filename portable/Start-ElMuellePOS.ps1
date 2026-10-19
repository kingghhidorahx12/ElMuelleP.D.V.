$ErrorActionPreference = "Stop"

$portableRoot = $PSScriptRoot
$appRoot = Join-Path $portableRoot "app"
$nodePath = Join-Path $portableRoot "runtime\node.exe"
$url = "http://127.0.0.1:3000"
$pidPath = Join-Path $portableRoot "server.pid"
$logsPath = Join-Path $portableRoot "logs"

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

if (-not (Test-PosServer)) {
  New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
  $outputLog = Join-Path $logsPath "server.out.log"
  $errorLog = Join-Path $logsPath "server.err.log"
  $server = Start-Process -FilePath $nodePath -ArgumentList "src/server.js" -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog
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

$browserProfile = Join-Path $portableRoot "browser-profile"
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

$browserArguments = @("--app=$url", "--user-data-dir=$browserProfile", "--no-first-run", "--no-default-browser-check") + $windowArguments
Start-Process -FilePath $browserPath -ArgumentList $browserArguments

Write-Host "El Muelle POS está listo en $url"
