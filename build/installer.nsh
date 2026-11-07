; justNotes Windows installer and uninstaller screens (used by electron-builder's NSIS build).
;
; Installer:   Welcome (thank you) -> Choose the install folder -> Installing -> Finished ("Run justNotes now")
; Uninstaller: Are you sure? -> "Okay, we understand" (continues by itself after a few seconds)
;              -> Removing -> Done, with a link to send feedback on GitHub
;
; Automatic updates run the installer silently, so none of these screens appear then.
; Plain ASCII text on purpose (shows correctly in every Windows language setting).

!include WinMessages.nsh

!define JN_FEEDBACK_URL "https://github.com/justpoqui/justNotes/issues/new?labels=feedback&title=Feedback%20after%20uninstalling%20justNotes&body=Hi%20justpoqui%2C%0A%0AI%20uninstalled%20justNotes%20because%3A%0A%0AWhat%20would%20have%20made%20it%20better%3A%0A"

; Always install for the current user (no administrator password; updates install quietly),
; so the "only for me / for everyone" page is skipped.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER

  ; ---------- 1. Welcome ----------
  !macro customWelcomePage
    !define MUI_WELCOMEPAGE_TITLE "Welcome to justNotes"
    !define MUI_WELCOMEPAGE_TEXT "Thank you for choosing justNotes!$\r$\n$\r$\njustNotes keeps your notebooks as simple files on your own computer. There's no account to make and nothing is stored in the cloud.$\r$\n$\r$\nThis will install justNotes ${VERSION}. Click Next to choose where to install it."
    !insertmacro MUI_PAGE_WELCOME
  !macroend

  ; (2. The install folder page comes from allowToChangeInstallationDirectory.)

  ; ---------- 4. Finished, with "Run justNotes now" ----------
  !macro customFinishPage
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_TITLE "justNotes is installed"
    !define MUI_FINISHPAGE_TEXT "justNotes ${VERSION} is ready to use. You'll find it in the Start menu and on your desktop.$\r$\n$\r$\nYour notes will be kept in Documents\justNotes.$\r$\n$\r$\nClick Finish to close this window."
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_TEXT "Run justNotes now"
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !insertmacro MUI_PAGE_FINISH
  !macroend

!else

  Var jnCountdown
  Var jnCountdownLabel

  ; ---------- 1. Are you sure? ----------
  !macro customUnWelcomePage
    !define MUI_WELCOMEPAGE_TITLE "Uninstall justNotes?"
    !define MUI_WELCOMEPAGE_TEXT "Are you sure you want to remove justNotes from this computer?$\r$\n$\r$\nYour notes are safe either way: everything in Documents\justNotes stays where it is, and so do your backups.$\r$\n$\r$\nClick Yes, uninstall to continue, or Cancel to keep justNotes."
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.jnConfirmShow
    !insertmacro MUI_UNPAGE_WELCOME

    ; ---------- 2. Okay, we understand (continues by itself) ----------
    UninstPage custom un.jnUnderstandCreate un.jnUnderstandLeave

    ; (The page functions live in here because this runs after the installer's UI library is loaded.)
    Function un.jnConfirmShow
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${WM_SETTEXT} 0 "STR:Yes, uninstall"
    FunctionEnd

    Function un.jnUnderstandCreate
      !insertmacro MUI_HEADER_TEXT "Okay, we understand" "Thanks for giving justNotes a try."
      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}
      ${NSD_CreateLabel} 0 0 100% 48u "No problem. justNotes will be removed from this computer in a moment.$\r$\n$\r$\nYour notes in Documents\justNotes are not touched, so you can always come back to them."
      Pop $0
      ${NSD_CreateLabel} 0 64u 100% 14u "Uninstalling in 5 seconds..."
      Pop $jnCountdownLabel
      StrCpy $jnCountdown 5
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${WM_SETTEXT} 0 "STR:Uninstall now"
      GetDlgItem $0 $HWNDPARENT 3 ; no going back from here (Cancel still works)
      ShowWindow $0 ${SW_HIDE}
      ${NSD_CreateTimer} un.jnUnderstandTick 1000
      nsDialogs::Show
    FunctionEnd

    Function un.jnUnderstandTick
      IntOp $jnCountdown $jnCountdown - 1
      ${If} $jnCountdown <= 0
        ${NSD_KillTimer} un.jnUnderstandTick
        SendMessage $HWNDPARENT ${WM_COMMAND} 1 0 ; same as clicking "Uninstall now"
      ${ElseIf} $jnCountdown == 1
        ${NSD_SetText} $jnCountdownLabel "Uninstalling in 1 second..."
      ${Else}
        ${NSD_SetText} $jnCountdownLabel "Uninstalling in $jnCountdown seconds..."
      ${EndIf}
    FunctionEnd

    Function un.jnUnderstandLeave
      ${NSD_KillTimer} un.jnUnderstandTick
    FunctionEnd
  !macroend


  ; (3. The "Removing" progress page is the standard one.)

  ; ---------- 4. Done, with a feedback link ----------
  ; (These settings apply to the finish page that follows this hook.)
  !macro customUninstallPage
    !define MUI_FINISHPAGE_TITLE "justNotes has been removed"
    !define MUI_FINISHPAGE_TEXT "justNotes is no longer installed on this computer. Your notes are still in Documents\justNotes whenever you want them.$\r$\n$\r$\nWe'd love to hear why you uninstalled, or what would have made justNotes better for you."
    !define MUI_FINISHPAGE_LINK "Send feedback to justpoqui on GitHub"
    !define MUI_FINISHPAGE_LINK_LOCATION "${JN_FEEDBACK_URL}"
  !macroend

!endif
