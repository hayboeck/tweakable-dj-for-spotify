@echo off
rem Startet die Oberflaeche von Tweakable DJ im Browser.
cd /d "%~dp0"
where node 1>nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte von https://nodejs.org installieren ^(Version 18 oder neuer^) und danach erneut starten.
  echo.
  echo Node.js was not found.
  echo Please install it from https://nodejs.org ^(version 18 or newer^) and then start again.
  pause
  exit /b 1
)
node -e "process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js ist zu alt. Tweakable DJ braucht Version 18 oder neuer: https://nodejs.org
  echo.
  echo Node.js is too old. Tweakable DJ needs version 18 or newer: https://nodejs.org
  pause
  exit /b 1
)
node ui.mjs
pause
