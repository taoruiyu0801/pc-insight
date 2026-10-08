@echo off
setlocal
if exist "%~dp0.tools\activitywatch\activitywatch\aw-qt.exe" (
  start "" "%~dp0.tools\activitywatch\activitywatch\aw-qt.exe"
) else (
  echo ActivityWatch portable files are not present. See README.md for setup.
  pause
)
