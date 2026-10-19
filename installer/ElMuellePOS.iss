#define MyAppName "El Muelle POS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "El Muelle Marisquería"
#define MyAppExe "Abrir-ElMuellePOS.vbs"

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
UninstallDisplayIcon={app}\app\public\assets\brand\el-muelle-app-icon.ico

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "..\dist\ElMuellePOS-Portable\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\app\public\assets\brand\el-muelle-app-icon.ico"
Name: "{autoprograms}\Cerrar servidor El Muelle POS"; Filename: "{app}\Cerrar-ElMuellePOS.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\app\public\assets\brand\el-muelle-app-icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\app\public\assets\brand\el-muelle-app-icon.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "Abrir El Muelle POS"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    MsgBox('Tus ventas y respaldos se conservan en la carpeta data de la instalación. Respáldalos antes de eliminar manualmente la carpeta.', mbInformation, MB_OK);
end;
