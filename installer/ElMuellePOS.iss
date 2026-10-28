#define MyAppName "El Muelle POS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "El Muelle Marisquería"
#define MyAppExe "Abrir-ElMuellePOS.vbs"
#define MyReleaseHash GetSHA256OfFile("..\dist\ElMuellePOS-Portable\release-manifest.json")

[Setup]
AppId={{B2F014C6-CAEF-4DF9-AE86-E0A49025D95D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
SetupIconFile=..\public\assets\brand\el-muelle-app-icon.ico
DefaultDirName={localappdata}\Programs\ElMuellePOS
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist\installer
OutputBaseFilename=ElMuellePOS-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\app\public\assets\brand\el-muelle-app-icon.ico

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "..\dist\ElMuellePOS-Portable\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\portable\Stop-ElMuellePOS.ps1"; Flags: dontcopy
Source: "..\dist\ElMuellePOS-Portable\runtime\node.exe"; Flags: dontcopy
Source: "..\dist\ElMuellePOS-Portable\release-manifest.json"; Flags: dontcopy
Source: "..\dist\ElMuellePOS-Portable\app\src\release-compatibility.js"; Flags: dontcopy
Source: "..\dist\ElMuellePOS-Portable\app\src\persistence.js"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\app\public\assets\brand\el-muelle-app-icon.ico"
Name: "{autoprograms}\Cerrar servidor El Muelle POS"; Filename: "{app}\Cerrar-ElMuellePOS.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\app\public\assets\brand\el-muelle-app-icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\app\public\assets\brand\el-muelle-app-icon.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "Abrir El Muelle POS"; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  FindRec: TFindRec;
  HasLegacy: Boolean;
  ResultCode: Integer;
  PidPath: String;
begin
  Result := '';
  { Descriptor embebido y hash ligados a esta compilación, antes de reemplazar. }
  ExtractTemporaryFile('node.exe');
  ExtractTemporaryFile('release-manifest.json');
  ExtractTemporaryFile('release-compatibility.js');
  ExtractTemporaryFile('persistence.js');
  if not ExecAndLogOutput(ExpandConstant('{tmp}\node.exe'),
    '"' + ExpandConstant('{tmp}\release-compatibility.js') + '" --manifest "' + ExpandConstant('{tmp}\release-manifest.json') + '" --sha256 {#MyReleaseHash} --installed-root "' + ExpandConstant('{app}') + '" --data-dir "' + ExpandConstant('{localappdata}\ElMuellePOS\data') + '" --configuration-file "' + ExpandConstant('{localappdata}\ElMuellePOS\config\.env') + '"',
    ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, ResultCode, nil) then
  begin
    Result := 'No se pudo comprobar la compatibilidad de seguridad. No se reemplazaron archivos.';
    exit;
  end;
  if ResultCode <> 0 then
  begin
    Result := 'Revisión o datos incompatibles: requiere esquema, cifrado y permisos individuales verificados. No se reemplazaron archivos ni datos.';
    exit;
  end;
  HasLegacy := False;
  { Sólo el catálogo inicial puede estar dentro del programa reemplazable. }
  if FindFirst(ExpandConstant('{app}\app\data\*'), FindRec) then
  begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') and
           (CompareText(FindRec.Name, 'products.json') <> 0) then HasLegacy := True;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
  if HasLegacy or FileExists(ExpandConstant('{app}\app\.env')) or
     DirExists(ExpandConstant('{app}\browser-profile')) then
  begin
    Result := 'La instalación contiene datos o configuración heredados. Requiere recuperación verificada fuera del programa antes de actualizar. No se reemplazaron archivos.';
    exit;
  end;
  PidPath := ExpandConstant('{localappdata}\ElMuellePOS\runtime-state\server.pid');
  if FileExists(PidPath) then
  begin
    ExtractTemporaryFile('Stop-ElMuellePOS.ps1');
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\Stop-ElMuellePOS.ps1') + '" -PortableRoot "' + ExpandConstant('{app}') + '"',
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Result := 'No se pudo comprobar el cierre seguro. No se reemplazaron archivos.';
      exit;
    end;
    if ResultCode <> 0 then Result := 'El servidor sigue activo o pertenece a otra instalación. Cierra la aplicación de forma segura antes de actualizar; no se forzó su terminación.';
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    MsgBox('Las nuevas instalaciones conservan ventas, respaldos y clave en la carpeta ElMuellePOS de los datos locales de tu usuario, fuera del programa. Los datos legados requieren revisión técnica antes de una actualización. Respalda también la clave antes de eliminar archivos manualmente.', mbInformation, MB_OK);
end;
