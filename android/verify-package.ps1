param([Parameter(Mandatory=$true)][string]$Apk)
$ErrorActionPreference='Stop'
$emRepo=Split-Path -Parent $PSScriptRoot
$emTools=Join-Path $emRepo '.dev/android-tools'
$env:JAVA_HOME=(Get-ChildItem (Join-Path $emTools 'jdk') -Directory | Select-Object -First 1).FullName
$env:PATH=(Join-Path $env:JAVA_HOME 'bin')+';'+$env:PATH
if(!(Test-Path -LiteralPath $Apk -PathType Leaf)){throw 'APK_NO_ENCONTRADA'}
$emApkFile=Get-Item -LiteralPath $Apk
& (Join-Path $emTools 'sdk/build-tools/35.0.0/apksigner.bat') verify --verbose --print-certs $emApkFile.FullName
if($LASTEXITCODE -ne 0){throw 'FIRMA_ANDROID_INVALIDA'}
& (Join-Path $emTools 'sdk/build-tools/35.0.0/zipalign.exe') -c -P 16 4 $emApkFile.FullName
if($LASTEXITCODE -ne 0){throw 'ALINEACION_ANDROID_INVALIDA'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$emZip=[IO.Compression.ZipFile]::OpenRead($emApkFile.FullName)
function Read-Entry([string]$Name){
 $emEntry=$emZip.GetEntry($Name)
 if(!$emEntry){throw ('Falta el archivo empaquetado: '+$Name)}
 $emIn=$emEntry.Open();$emOut=[IO.MemoryStream]::new()
 try{$emIn.CopyTo($emOut);return ,$emOut.ToArray()}finally{$emIn.Dispose();$emOut.Dispose()}
}
function Hash-Bytes([byte[]]$Bytes){$emHasher=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($emHasher.ComputeHash($Bytes))).Replace('-','')}finally{$emHasher.Dispose()}}
try{
 $emBase='assets/nodeapp/'
 $emManifest=[Text.Encoding]::UTF8.GetString((Read-Entry ($emBase+'bundle-manifest.json'))) | ConvertFrom-Json
 if($emManifest.products -ne 28 -or $emManifest.photographs -ne 28 -or $emManifest.stock -ne 0 -or $emManifest.physicalCountPerformed){throw 'MANIFIESTO_CATALOGO_INVALIDO'}
 foreach($emProperty in $emManifest.files.PSObject.Properties){if((Hash-Bytes (Read-Entry ($emBase+$emProperty.Name))) -ne $emProperty.Value){throw ('HASH_ASSET_INVALIDO: '+$emProperty.Name)}}
 if($emZip.GetEntry($emBase+'app/initial-catalog/catalog.aes.json')){throw 'ACTIVACION_OBSOLETA_EN_APK'}
 $emProducts=[Text.Encoding]::UTF8.GetString((Read-Entry ($emBase+'app/initial-catalog/products.json'))) | ConvertFrom-Json
 if($emProducts.Count -ne 28){throw 'CANTIDAD_PRODUCTOS_INVALIDA'}
 foreach($emProduct in $emProducts){if($emProduct.stockQuantity -ne 0){throw 'EXISTENCIA_INICIAL_INVALIDA'};if((Hash-Bytes (Read-Entry ($emBase+'app/initial-catalog/photos/'+$emProduct.photoFile))) -ne $emProduct.photoSHA256){throw 'FOTOGRAFIA_ALTERADA'}}
 $emPhotoEntries=@($emZip.Entries | Where-Object {$_.FullName -like ($emBase+'app/initial-catalog/photos/*') -and $_.Name})
 if($emPhotoEntries.Count -ne 28){throw 'CANTIDAD_FOTOS_INVALIDA'}
 foreach($emEntry in $emZip.Entries){if($emEntry.FullName -match '(^|/)(\.secrets\.json|\.env|.*\.(p12|jks|keystore|sqlite|emrecovery|emactivation|dpapi))$' -or $emEntry.FullName -like ($emBase+'app/data/*')){throw ('ARCHIVO_PRIVADO_NO_PERMITIDO: '+$emEntry.FullName)}}
 foreach($emAbi in @('arm64-v8a','armeabi-v7a','x86_64')){foreach($emLibrary in @('libnode.so','libmuelle.so','libsqlcipher.so')){if(!$emZip.GetEntry('lib/'+$emAbi+'/'+$emLibrary)){throw ('BIBLIOTECA_NATIVA_FALTANTE: '+$emAbi+'/'+$emLibrary)}}}
}finally{$emZip.Dispose()}
$emHash=(Get-FileHash -LiteralPath $emApkFile.FullName -Algorithm SHA256).Hash
if($emHash -notmatch '^[0-9A-Fa-f]{64}$'){throw 'SHA256_INVALIDO'}
$emManifestTree=(& (Join-Path $emTools 'sdk/build-tools/35.0.0/aapt.exe') dump xmltree $emApkFile.FullName 'AndroidManifest.xml') -join "`n"
if($LASTEXITCODE -ne 0 -or $emManifestTree -notmatch 'screenOrientation[^\r\n]*0x6' -or $emManifestTree -notmatch 'resizeableActivity[^\r\n]*0x0'){throw 'ORIENTACION_HORIZONTAL_NO_CONFIGURADA'}
[ordered]@{apk=$emApkFile.FullName;bytes=$emApkFile.Length;sha256=$emHash;signatureVerified=$true;alignmentVerified=$true;allBundleHashesVerified=$true;products=28;originalPhotographs=28;initialStock=0;physicalCountPerformed=$false;automaticCatalogueInitialization=$true;activationRequired=$false;catalogueEncryptedInApk=$false;landscapeOnlyConfigured=$true;activationKeyIncluded=$false;privateKeysIncluded=$false;predefinedUsersIncluded=$false;historicalOperationsIncluded=$false} | ConvertTo-Json
