param([switch]$BuildTests,[switch]$ViewportTests,[switch]$ScaleTests)
$ErrorActionPreference='Stop'
$emRepo=Split-Path -Parent $PSScriptRoot
$emTools=Join-Path $emRepo '.dev/android-tools'
$env:JAVA_HOME=(Get-ChildItem (Join-Path $emTools 'jdk') -Directory | Select-Object -First 1).FullName
$env:PATH=(Join-Path $env:JAVA_HOME 'bin')+';'+$env:PATH
$env:GRADLE_USER_HOME=Join-Path $emTools 'gradle-cache'
$emSigning=Join-Path $emTools 'signing'
if(!(Test-Path -LiteralPath $emSigning)){New-Item -ItemType Directory -Path $emSigning | Out-Null}
$emPasswordFile=Join-Path $emSigning 'password.dpapi'
$env:MUELLE_ANDROID_KEYSTORE=Join-Path $emSigning 'elmuelle-android.p12'
Add-Type -AssemblyName System.Security
if(!(Test-Path -LiteralPath $emPasswordFile)){
 if(Test-Path -LiteralPath $env:MUELLE_ANDROID_KEYSTORE){throw 'Falta la contraseña protegida de la clave original. No se crea otra clave.'}
 $emRandom=[byte[]]::new(32)
 [Security.Cryptography.RandomNumberGenerator]::Fill($emRandom)
 $emClear=[Text.Encoding]::UTF8.GetBytes([Convert]::ToBase64String($emRandom))
 $emWrapped=[Security.Cryptography.ProtectedData]::Protect($emClear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 [IO.File]::WriteAllBytes($emPasswordFile,$emWrapped)
}
$emBytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($emPasswordFile),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$env:MUELLE_ANDROID_STORE_PASS=[Text.Encoding]::UTF8.GetString($emBytes)
$emSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
& icacls.exe $emSigning '/inheritance:r' '/grant:r' ('*'+$emSid.Value+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'No se pudo proteger la carpeta privada de firma y activación'}
$emAllowedSids=@($emSid.Value,'S-1-5-18','S-1-5-32-544')
foreach($emRule in (Get-Acl -LiteralPath $emSigning).Access){if($emRule.AccessControlType -eq 'Allow' -and $emRule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $emAllowedSids){throw 'La carpeta de firma conserva permisos no autorizados'}}
try{
 if(!(Test-Path -LiteralPath $env:MUELLE_ANDROID_KEYSTORE)){
  & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $env:MUELLE_ANDROID_KEYSTORE -storetype PKCS12 -storepass:env MUELLE_ANDROID_STORE_PASS -keypass:env MUELLE_ANDROID_STORE_PASS -alias elmuelle-pdv -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=El Muelle PDV Android, O=El Muelle'
  if($LASTEXITCODE -ne 0){throw 'No se pudo crear la firma privada Android'}
 }
 & 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'prepare-assets.cjs')
 if($LASTEXITCODE -ne 0){throw 'Preparación Android rechazada'}
 $emTasks=@('assembleRelease')
 if($BuildTests){$emTasks+=@('assembleDebug','assembleDebugAndroidTest')}
 if($ViewportTests){$emTasks+=@('testDebugUnitTest','--tests','mx.elmuelle.pdv.DesktopGeometryTest')}
 if($ScaleTests){$emTasks+=@('testDebugUnitTest','--tests','mx.elmuelle.pdv.ScaleDecoderTest','--tests','mx.elmuelle.pdv.ScaleUsbRegressionTest','--tests','mx.elmuelle.pdv.ScaleSerialPolicyTest','--tests','mx.elmuelle.pdv.ScaleTraceTest','--tests','mx.elmuelle.pdv.ScaleAutoSessionTest')}
 & (Join-Path $emTools 'gradle813/gradle-8.13/bin/gradle.bat') -p $PSScriptRoot --no-daemon @emTasks
 if($LASTEXITCODE -ne 0){throw 'Compilación Android rechazada'}
}finally{
 [Array]::Clear($emBytes,0,$emBytes.Length)
 Remove-Item Env:MUELLE_ANDROID_STORE_PASS -ErrorAction SilentlyContinue
 Remove-Item Env:MUELLE_ANDROID_KEYSTORE -ErrorAction SilentlyContinue
}
