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

  $resolvedOutput = [IO.Path]::GetFullPath($outputRoot)
  $expectedOutput = [IO.Path]::GetFullPath((Join-Path $projectRoot "dist\ElMuellePOS-Portable"))
  if ($resolvedOutput -ne $expectedOutput -or (Get-Item -LiteralPath $outputRoot).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw "La ruta de entrega no es segura para regenerar." }
  $checkedParent = Get-Item -LiteralPath $outputRoot
  while ($null -ne $checkedParent -and $checkedParent.FullName -ne $projectRoot) {
    if ($checkedParent.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw "La entrega atraviesa un enlace o unión. No se eliminó." }
    $checkedParent = $checkedParent.Parent
  }
  $previousData = Join-Path $outputRoot "app\data"
  if ((Test-Path -LiteralPath $previousData) -and @(Get-ChildItem -LiteralPath $previousData -Force | Where-Object Name -ne "products.json").Count -gt 0) { throw "La entrega anterior contiene datos. No se eliminaron; requiere recuperación técnica." }
  if ((Test-Path -LiteralPath (Join-Path $outputRoot "app\.env")) -or (Test-Path -LiteralPath (Join-Path $outputRoot "browser-profile"))) { throw "La entrega anterior contiene configuración o perfil. No se eliminó." }
  Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
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

# Herramientas disponibles también al recuperar en otro equipo, sin el repositorio.
New-Item -ItemType Directory -Path (Join-Path $appOutput "scripts") -Force | Out-Null
foreach ($file in @("restore-data.js", "recovery-custody.js", "manage-release.js")) {
  Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\$file") -Destination (Join-Path $appOutput "scripts\$file")
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

Las nuevas instalaciones guardan datos y respaldos en %LOCALAPPDATA%\ElMuellePOS\data, fuera del programa. La carpeta contiene información privada y la clave de cifrado. No debe compartirse ni subirse a GitHub.
Una instalación anterior con datos en app\data requiere copia verificada y selección explícita por el responsable técnico; el lanzador detendrá el arranque en lugar de abrir otra base.

RECUPERACIÓN Y CUSTODIA (responsable técnico)
El propietario eligió custodia local en esta misma PC. Carpeta prevista: %LOCALAPPDATA%\ElMuellePOS\resguardos, separada del programa y de data. El directorio de destino debe existir antes de exportar. No se crea ni se cambia un respaldo operativo al instalar.
El respaldo diario SQLite no incluye la clave. Para una copia autocontenida cifrada:
runtime\node.exe app\scripts\recovery-custody.js export --database "RUTA\el-muelle-pos.sqlite" --key-file "RUTA\.secrets.json" --destination "RUTA-LOCAL-DE-RESGUARDOS\respaldo.emrecovery"
Puede incluir --env-file y --backup-dir. Introduce la contraseña localmente, nunca en argumentos ni mensajes. Conserva la contraseña separada del archivo; comprueba una recuperación en otro destino antes de dar por completado el resguardo local.
Crear y abrir respaldos requiere al menos 6 caracteres, según la política aprobada por el propietario. Las contraseñas anteriores de 16 o más caracteres siguen siendo compatibles; no es necesario cambiarlas.
runtime\node.exe app\scripts\recovery-custody.js restore --archive "RUTA-LOCAL-DE-RESGUARDOS\respaldo.emrecovery" --destination "RUTA-NUEVA"
La recuperación no activa DATA_DIR ni ENV_FILE. Si se recupera configuración, se conserva como configuration.recovered.env para revisión técnica. El perfil del navegador requiere copia aparte con el navegador cerrado.
El resguardo en esta PC permite recuperar una base dañada o conservar datos ante una reinstalación que respete esa carpeta. No protege frente a pérdida o avería del disco o del equipo. La copia local no acredita custodia externa.
Las versiones anteriores no están certificadas para abrir una base migrada. No reemplaces código para volver de versión sin revisar compatibilidad y rutas.
"@
Set-Content -LiteralPath (Join-Path $outputRoot "LEEME-ENTREGA.txt") -Value $deliveryReadme -Encoding utf8

& $nodeCommand.Source (Join-Path $PSScriptRoot "seal-release.js") package $outputRoot
if ($LASTEXITCODE -ne 0) { throw "El paquete no superó el sellado de compatibilidad." }

if ($Zip) {
  New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
  $zipPath = Join-Path $distRoot "$portableName.zip"
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Compress-Archive -LiteralPath $outputRoot -DestinationPath $zipPath -Force
  Write-Host "Paquete portable y ZIP creados: $zipPath"
} else {
  Write-Host "Paquete portable creado: $outputRoot"
}
