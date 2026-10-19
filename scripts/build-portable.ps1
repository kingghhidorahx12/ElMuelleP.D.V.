param(
  [switch]$Clean,
  [switch]$Zip
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$portableName = "ElMuellePOS-Portable"
$distRoot = Join-Path $projectRoot "dist"
$outputRoot = Join-Path $distRoot $portableName

if (Test-Path -LiteralPath $outputRoot) {
  if (-not $Clean) {
    throw "Ya existe $outputRoot. Ejecuta nuevamente con -Clean para regenerar sólo esa carpeta de entrega."
  }

  Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
if (-not (Test-Path -LiteralPath $nodeCommand.Source)) {
  throw "No se localizó node.exe. Instala Node.js en esta computadora de desarrollo e inténtalo de nuevo."
}

New-Item -ItemType Directory -Path $outputRoot, (Join-Path $outputRoot "app"), (Join-Path $outputRoot "runtime") -Force | Out-Null
$appOutput = Join-Path $outputRoot "app"

foreach ($directory in @("src", "public", "node_modules")) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $appOutput $directory) -Recurse -Force
}

# Respaldos locales de diseño: no forman parte de la aplicación entregable.
foreach ($legacyPreviewFile in @(
  "app-antes-fijar-tarjetas.js",
  "styles-antes-boton-menu.css",
  "styles-respaldo-antes-5x3.css"
)) {
  $legacyPreviewPath = Join-Path $appOutput "public\$legacyPreviewFile"
  if (Test-Path -LiteralPath $legacyPreviewPath) {
    Remove-Item -LiteralPath $legacyPreviewPath -Force
  }
}

New-Item -ItemType Directory -Path (Join-Path $appOutput "data") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "data\products.json") -Destination (Join-Path $appOutput "data\products.json") -Force
foreach ($file in @("package.json", "README.md", "LICENSE.md", ".env.example")) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $appOutput $file) -Force
}

Copy-Item -LiteralPath $nodeCommand.Source -Destination (Join-Path $outputRoot "runtime\node.exe") -Force
foreach ($file in @("Start-ElMuellePOS.ps1", "Stop-ElMuellePOS.ps1", "Abrir-ElMuellePOS.cmd", "Cerrar-ElMuellePOS.cmd", "Abrir-ElMuellePOS.vbs", "Cerrar-ElMuellePOS.vbs")) {
  Copy-Item -LiteralPath (Join-Path $projectRoot "portable\$file") -Destination (Join-Path $outputRoot $file) -Force
}

$deliveryReadme = @"
EL MUELLE POS - ENTREGA PORTABLE

1. Copia esta carpeta completa a la computadora del local.
2. No copies una carpeta que ya tenga datos operativos encima de otra.
3. Haz doble clic en Abrir-ElMuellePOS.vbs. No abre una ventana de CMD.
4. El sistema se abrirá en Edge o Chrome; ahí define la cuenta y el PIN del dueño.
5. Para apagar el servidor local al terminar, usa Cerrar-ElMuellePOS.vbs.

Los datos y respaldos se guardan en app\data. Esa carpeta no debe compartirse por correo ni subirse a GitHub.
"@
Set-Content -LiteralPath (Join-Path $outputRoot "LEEME-ENTREGA.txt") -Value $deliveryReadme -Encoding utf8

if ($Zip) {
  New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
  $zipPath = Join-Path $distRoot "$portableName.zip"
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Compress-Archive -LiteralPath $outputRoot -DestinationPath $zipPath -Force
  Write-Host "Paquete portable y ZIP creados: $zipPath"
} else {
  Write-Host "Paquete portable creado: $outputRoot"
}
