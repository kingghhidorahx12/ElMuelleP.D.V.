param(
  [switch]$Clean,
  [switch]$SkipPortableBuild,
  [string]$OutputDirectory
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

$portableRoot = Join-Path $projectRoot "dist\ElMuellePOS-Portable"
$manifest = Join-Path $portableRoot "release-manifest.json"
if (-not (Test-Path -LiteralPath $manifest)) { throw "Falta el descriptor de seguridad del paquete. Regenera el portable." }
$releaseHasher = [Security.Cryptography.SHA256]::Create()
try { $releaseHash = ([BitConverter]::ToString($releaseHasher.ComputeHash([IO.File]::ReadAllBytes($manifest)))).Replace('-', '').ToLowerInvariant() }
finally { $releaseHasher.Dispose() }
& node.exe (Join-Path $projectRoot "src\release-compatibility.js") --package $portableRoot --sha256 $releaseHash
if ($LASTEXITCODE -ne 0) { throw "El paquete no corresponde a una revisión compatible verificada." }
$compilerArgs = @()
if ($OutputDirectory) { $compilerArgs += "/O$([IO.Path]::GetFullPath($OutputDirectory))" }
$effectiveOutput = if ($OutputDirectory) { [IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $projectRoot "dist\installer" }
if (Test-Path -LiteralPath (Join-Path $effectiveOutput "ElMuellePOS-Setup.exe.release.json")) { throw "La salida ya tiene una revisión sellada. Elige una ruta nueva para conservar el EXE y su recibo." }
$compilerArgs += $installerScript
& $compilerCandidates[0] @compilerArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node.exe (Join-Path $PSScriptRoot "seal-release.js") installer $portableRoot (Join-Path $effectiveOutput "ElMuellePOS-Setup.exe")
if ($LASTEXITCODE -ne 0) { throw "No se pudo generar el recibo de identidad del instalador." }
Write-Host "Instalador creado en $effectiveOutput"
