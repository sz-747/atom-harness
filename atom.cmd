@echo off
rem Compatibility entrypoint; Atom is launched by PowerShell.
powershell.exe -NoLogo -NoProfile -File "%~dp0atom.ps1" %*
exit /b %ERRORLEVEL%
