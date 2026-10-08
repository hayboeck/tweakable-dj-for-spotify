@echo off
rem Startet die Oberflaeche von Tweakable DJ im Browser.
rem   Doppelklick auf diese Datei: mit Fenster, z. B. zum Fehlersuchen. Das Fenster muss offen bleiben, solange
rem   Tweakable DJ laeuft.
rem   Mit --hidden (so startet die Verknuepfung auf dem Desktop, ueber "conhost.exe --headless"): ohne Fenster, die
rem   Ausgaben stehen in ui.log. Hier wartet nie ein "pause" (das bliebe unsichtbar haengen): Muss Node.js erst geladen
rem   werden, fehlt es, ist es zu alt oder endet node unerwartet mit einem Fehler, startet diese Datei sich mit Fenster neu
rem   (TWEAKABLE_DJ_WINDOW=1), damit man den Download bzw. die Meldung sieht.
rem   Mit --now (zweite Verknuepfung "Tweakable DJ - Playlist neu erstellen"): ebenfalls ohne Fenster, aber statt der Oberflaeche
rem   "node dj.mjs --now" - erstellt die Playlist neu und meldet sich mit einer Systembenachrichtigung.
rem
rem Node.js: Beim ersten Start laedt get-node.cmd eine eigene, portable Fassung (Version laut node-version.txt) einmalig in den
rem Unterordner node\; danach nimmt diese Datei immer sie (get-node.cmd stellt node\current an den Anfang des PATH, nur fuer
rem dieses Fenster). Klappt der Download nicht (z. B. offline), tut es ein installiertes Node.js ab Version 18.
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
  if defined TWEAKABLE_DJ_WINDOW set "TWEAKABLE_DJ_HIDDEN="
  if exist "%~dp0get-node.cmd" if defined TWEAKABLE_DJ_HIDDEN (
    call "%~dp0get-node.cmd" --check
    if errorlevel 1 if not errorlevel 2 (
      set "TWEAKABLE_DJ_WINDOW=1"
      if /i "%~1"=="--now" (start "Tweakable DJ" "%~f0" --now) else start "Tweakable DJ" "%~f0"
      exit /b 0
    )
  )
  if exist "%~dp0get-node.cmd" call "%~dp0get-node.cmd"
  where node 1>nul 2>nul
  if errorlevel 1 (
    if defined TWEAKABLE_DJ_HIDDEN (
      start "Tweakable DJ" "%~f0"
      exit /b 1
    )
    echo.
    echo Node.js fehlt: Es liess sich nicht herunterladen, und es ist auch keins installiert.
    echo Bitte die Internetverbindung pruefen und Tweakable DJ noch einmal starten - oder Node.js von
    echo https://nodejs.org installieren ^(Version 18 oder neuer^).
    echo.
    echo Node.js is missing: it couldn't be downloaded, and none is installed.
    echo Please check the internet connection and start Tweakable DJ again - or install Node.js from
    echo https://nodejs.org ^(version 18 or newer^).
    pause
    if defined TWEAKABLE_DJ_WINDOW exit
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
    if defined TWEAKABLE_DJ_WINDOW exit
    exit /b 1
  )
  if /i "%~1"=="--now" (
    node dj.mjs --now
    if defined TWEAKABLE_DJ_WINDOW exit
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
  if defined TWEAKABLE_DJ_WINDOW exit
  exit /b
)
