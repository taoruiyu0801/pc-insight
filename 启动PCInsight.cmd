@echo off
setlocal
if exist "%~dp0release\PCInsight.exe" (
  start "" "%~dp0release\PCInsight.exe"
) else (
  echo PCInsight.exe was not found. Please build the desktop app first.
  pause
)
