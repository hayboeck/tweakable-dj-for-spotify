@echo off
rem Startet die Oberflaeche von Tweakable DJ im Browser.
rem   Doppelklick auf diese Datei: mit Fenster, z. B. zum Fehlersuchen. Das Fenster muss offen bleiben, solange
rem   Tweakable DJ laeuft.
rem   Mit --hidden (so startet die Verknuepfung auf dem Desktop, ueber "conhost.exe --headless"): ohne Fenster, die
rem   Ausgaben stehen in ui.log. Hier wartet nie ein "pause" (das bliebe unsichtbar haengen): Fehlt Node.js, ist es zu alt
rem   oder endet node unerwartet mit einem Fehler, startet diese Datei sich mit Fenster neu, damit man die Meldung sieht.
rem   Mit --now (zweite Verknuepfung "Tweakable DJ - Playlist neu erstellen"): ebenfalls ohne Fenster, aber statt der Oberflaeche
rem   "node dj.mjs --now" - erstellt die Playlist neu und meldet sich mit einer Systembenachrichtigung.
rem
rem Alles Weitere steht in EINEM Klammerblock, der mit exit /b endet: cmd.exe liest den ganzen Block ein, bevor es
rem ihn ausfuehrt, und liest danach nichts mehr aus dieser Datei. So darf "Jetzt aktualisieren" die Datei ersetzen,
rem waehrend sie laeuft (sonst liest cmd.exe an der alten Stelle in der neuen Datei weiter).
rem Endet die Oberflaeche mit Code 75 (Update installiert), startet die Schleife in "cmd /c" sie ohne Browser neu.
rem Die Schleife steht ganz in dieser einen Befehlszeile, liest also ebenfalls nichts aus der Datei nach. Ohne Fenster
rem bleibt es dabei, weil TWEAKABLE_DJ_HIDDEN gesetzt bleibt.
(
  cd /d "%~dp0"
  set "TWEAKABLE_DJ_HIDDEN="
  if /i "%~1"=="--hidden" set "TWEAKABLE_DJ_HIDDEN=1"
  if /i "%~1"=="--now" set "TWEAKABLE_DJ_HIDDEN=1"
  where node 1>nul 2>nul
  if errorlevel 1 (
    if defined TWEAKABLE_DJ_HIDDEN (
      start "Tweakable DJ" "%~f0"
      exit /b 1
    )
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
    if defined TWEAKABLE_DJ_HIDDEN (
      start "Tweakable DJ" "%~f0"
      exit /b 1
    )
    echo Node.js ist zu alt. Tweakable DJ braucht Version 18 oder neuer: https://nodejs.org
    echo.
    echo Node.js is too old. Tweakable DJ needs version 18 or newer: https://nodejs.org
    pause
    exit /b 1
  )
  if /i "%~1"=="--now" (
    node dj.mjs --now
    exit /b
  )
  set "TWEAKABLE_DJ_LAUNCHER=1"
  node ui.mjs %*
  if errorlevel 75 if not errorlevel 76 cmd /d /c "for /l %%i in (0,0,1) do @(echo.&echo Tweakable DJ startet neu ... / Tweakable DJ is restarting ...&node ui.mjs --no-browser&(if errorlevel 76 exit)&(if not errorlevel 75 exit))"
  if defined TWEAKABLE_DJ_HIDDEN (
    if errorlevel 1 start "Tweakable DJ" "%~f0"
    exit /b
  )
  pause
  exit /b
)
