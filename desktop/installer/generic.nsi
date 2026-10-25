Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef OUTFILE
  !error "OUTFILE is required"
!endif
!ifndef SHELL
  !error "SHELL is required"
!endif
!ifndef HELPER
  !error "HELPER is required"
!endif

Var AppName
Var AppId
Var AppFolder

Name "$AppName"
OutFile "${OUTFILE}"
BrandingText "$AppName"
!define MUI_ABORTWARNING
!define MUI_ICON "${ICON_ICO}"
!define MUI_UNICON "${ICON_ICO}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\app.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Run the app"

!ifdef SYSTEM_WIDE
  RequestExecutionLevel admin
  InstallDir "$PROGRAMFILES64\URLtoApp"
  !define UNINST_ROOT HKLM
  !define SHELL_CONTEXT all
!else
  RequestExecutionLevel user
  InstallDir "$LOCALAPPDATA\Programs\URLtoApp"
  !define UNINST_ROOT HKCU
  !define SHELL_CONTEXT current
!endif

Var IconPath

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=helper.exe "${HELPER}"
  nsExec::ExecToStack '"$PLUGINSDIR\helper.exe" --installer "$EXEPATH" --target "$PLUGINSDIR\meta"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "This file is not a valid URL to App installer."
    Abort
  ${EndIf}
  ReadINIStr $AppName "$PLUGINSDIR\meta\meta.ini" "app" "name"
  ReadINIStr $AppId "$PLUGINSDIR\meta\meta.ini" "app" "id"
  ReadINIStr $AppFolder "$PLUGINSDIR\meta\meta.ini" "app" "folder"
  ${If} $AppName == ""
  ${OrIf} $AppId == ""
    MessageBox MB_ICONSTOP "This installer is missing its app metadata."
    Abort
  ${EndIf}
  ${If} $AppFolder == ""
    StrCpy $AppFolder "$AppId"
  ${EndIf}
  !ifdef SYSTEM_WIDE
    StrCpy $INSTDIR "$PROGRAMFILES64\$AppFolder"
  !else
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\$AppFolder"
  !endif
FunctionEnd

Function un.onInit
  ReadINIStr $AppName "$INSTDIR\meta.ini" "app" "name"
  ReadINIStr $AppId "$INSTDIR\meta.ini" "app" "id"
  ReadINIStr $AppFolder "$INSTDIR\meta.ini" "app" "folder"
  ${If} $AppName == ""
    StrCpy $AppName "URL to App"
  ${EndIf}
  ${If} $AppId == ""
    StrCpy $AppId "url2app"
  ${EndIf}
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File /oname=app.exe "${SHELL}"
  nsExec::ExecToStack '"$PLUGINSDIR\helper.exe" --installer "$EXEPATH" --target "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "The app files could not be installed."
    Abort
  ${EndIf}

  SetShellVarContext ${SHELL_CONTEXT}
  ${If} ${FileExists} "$INSTDIR\app.ico"
    StrCpy $IconPath "$INSTDIR\app.ico"
  ${Else}
    StrCpy $IconPath "$INSTDIR\app.exe"
  ${EndIf}

  CreateShortcut "$DESKTOP\$AppName.lnk" "$INSTDIR\app.exe" "" "$IconPath" 0
  CreateDirectory "$SMPROGRAMS\$AppName"
  CreateShortcut "$SMPROGRAMS\$AppName\$AppName.lnk" "$INSTDIR\app.exe" "" "$IconPath" 0

  WriteUninstaller "$INSTDIR\uninstall.exe"
  CreateShortcut "$SMPROGRAMS\$AppName\Uninstall.lnk" "$INSTDIR\uninstall.exe"

  WriteRegStr ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" "DisplayName" "$AppName"
  WriteRegStr ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" "DisplayIcon" "$IconPath"
  WriteRegStr ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" "DisplayVersion" "1.0.0"
  WriteRegStr ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" "InstallLocation" "$INSTDIR"
  WriteRegStr ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" "Publisher" "URL to App"
  WriteRegStr ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" "NoModify" 1
  WriteRegDWORD ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ReadINIStr $AppName "$INSTDIR\meta.ini" "app" "name"
  ReadINIStr $AppId "$INSTDIR\meta.ini" "app" "id"
  SetShellVarContext ${SHELL_CONTEXT}

  DeleteRegKey ${UNINST_ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId"
  Delete "$DESKTOP\$AppName.lnk"
  RMDir /r "$SMPROGRAMS\$AppName"

  Delete "$INSTDIR\app.exe"
  Delete "$INSTDIR\config.json"
  Delete "$INSTDIR\icon.png"
  Delete "$INSTDIR\app.ico"
  Delete "$INSTDIR\meta.ini"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
