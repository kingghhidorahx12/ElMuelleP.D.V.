param(
  [switch]$Clean,
  [switch]$SkipPortableBuild
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$portableBuildScript = Join-Path $PSScriptRoot "build-portable.ps1"
$installerScript = Join-Path $projectRoot "installer\ElMuellePOS.iss"
$compilerCandidates = @(
  (Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
  (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
  (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
)
$compilerCandidates = @($compilerCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) })

if ($compilerCandidates.Count -eq 0) {
  throw "No se encontró Inno Setup 6. Instálalo y vuelve a ejecutar npm run build:installer."
}

if (-not $SkipPortableBuild) {
  & $portableBuildScript -Clean
}
if (-not $SkipPortableBuild -and $null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& $compilerCandidates[0] $installerScript
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Instalador creado en dist\installer\ElMuellePOS-Setup.exe"
