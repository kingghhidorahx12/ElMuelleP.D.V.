Option Explicit

Dim shell, fileSystem, portableRoot, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

portableRoot = fileSystem.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & portableRoot & "\Stop-ElMuellePOS.ps1" & Chr(34)
shell.Run command, 0, False
