param([string]$Apk)
$ErrorActionPreference='Stop'
$emRepo=Split-Path -Parent $PSScriptRoot
$emJava=Join-Path $emRepo '.dev/android-tools/jdk/jdk-21.0.13+9/bin'
$emOutput=Join-Path $emRepo '.dev/em003-brand-tests'
New-Item -ItemType Directory -Path $emOutput -Force | Out-Null
& (Join-Path $emJava 'javac.exe') -encoding UTF-8 -d $emOutput (Join-Path $PSScriptRoot 'tools/PrepareSplash.java') (Join-Path $PSScriptRoot 'tools/TestBrandAssets.java') (Join-Path $PSScriptRoot 'app/src/main/java/mx/elmuelle/pdv/BrandGeometry.java')
if($LASTEXITCODE -ne 0){throw 'No se pudieron compilar las pruebas de marca.'}
$emArguments=@($emRepo,$emOutput)
if($Apk){
 $emApk=(Get-Item -LiteralPath $Apk).FullName
 $emResources=(& (Join-Path $emRepo '.dev/android-tools/sdk/build-tools/35.0.0/aapt.exe') dump --values resources $emApk) -join "`n"
 if($LASTEXITCODE -ne 0){throw 'No se pueden inspeccionar los recursos de APK.'}
 $emArguments+=$emApk
 foreach($emName in @('muelle_icon','muelle_round_icon','muelle_launch_icon')){
  $emPattern='resource 0x[0-9a-f]+ mx\.elmuelle\.pdv:drawable/'+[regex]::Escape($emName)+':[^\r\n]*\r?\n\s*\(string8\) "([^"]+)"'
  $emMatch=[regex]::Match($emResources,$emPattern)
  if(!$emMatch.Success){throw ('Falta el recurso Android '+$emName)}
  $emArguments+=$emMatch.Groups[1].Value
 }
}
& (Join-Path $emJava 'java.exe') '-Djava.awt.headless=true' -cp $emOutput TestBrandAssets @emArguments
if($LASTEXITCODE -ne 0){throw 'Falló la geometría de marca.'}
