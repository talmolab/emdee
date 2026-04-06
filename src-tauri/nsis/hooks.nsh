; NSIS installer hooks for emdee
; Adds/removes the install directory to/from the user's PATH environment variable.

!include "StrFunc.nsh"
${StrContains}
${StrReplace}

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Add $INSTDIR to user PATH if not already present
  ReadRegStr $0 HKCU "Environment" "Path"
  ${StrContains} $1 "$INSTDIR" "$0"
  ${If} $1 == ""
    ${If} $0 != ""
      StrCpy $1 "$0;$INSTDIR"
    ${Else}
      StrCpy $1 "$INSTDIR"
    ${EndIf}
    WriteRegExpandStr HKCU "Environment" "Path" "$1"
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Remove $INSTDIR from user PATH
  ReadRegStr $0 HKCU "Environment" "Path"
  ${StrContains} $1 "$INSTDIR" "$0"
  ${If} $1 != ""
    ; Handle all possible positions: middle, start, end, or only entry
    ${StrReplace} $1 ";$INSTDIR" "" "$0"
    ${StrReplace} $1 "$INSTDIR;" "" "$1"
    ${StrReplace} $1 "$INSTDIR" "" "$1"
    WriteRegExpandStr HKCU "Environment" "Path" "$1"
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
