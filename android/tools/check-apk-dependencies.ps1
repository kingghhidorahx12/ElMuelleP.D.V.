param([Parameter(Mandatory=$true)][string]$Apk)
$ErrorActionPreference='Stop'
$emRepo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$emRoot=Join-Path $emRepo ('.dev/android-dependencies-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $emRoot|Out-Null
$emSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $emRoot '/inheritance:r' '/grant:r' ('*'+$emSid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F'|Out-Null
if($LASTEXITCODE -ne 0){throw 'No se pudo proteger la comprobación de dependencias.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$emZip=[IO.Compression.ZipFile]::OpenRead((Get-Item -LiteralPath $Apk).FullName)
try{
 foreach($emEntry in $emZip.Entries){
  if(!$emEntry.FullName.StartsWith('assets/nodeapp/') -or !$emEntry.Name){continue}
  $emRelative=$emEntry.FullName.Substring('assets/nodeapp/'.Length)
  if($emRelative.StartsWith('app/initial-catalog/') -or $emRelative -notmatch '\.(?:cjs|js|json)$'){continue}
  $emFile=[IO.Path]::GetFullPath((Join-Path $emRoot $emRelative))
  if(!$emFile.StartsWith(([IO.Path]::GetFullPath($emRoot)+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)){throw 'RUTA_DE_ASSET_INVALIDA'}
  [IO.Directory]::CreateDirectory((Split-Path -Parent $emFile))|Out-Null
  $emInput=$emEntry.Open();$emOutput=[IO.File]::Open($emFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
  try{$emInput.CopyTo($emOutput)}finally{$emOutput.Dispose();$emInput.Dispose()}
 }
}finally{$emZip.Dispose()}
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'bundle-dependencies.cjs') $emRoot
$emExit=$LASTEXITCODE
exit $emExit
