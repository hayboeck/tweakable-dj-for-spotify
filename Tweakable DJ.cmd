@echo off
rem Startet die Oberflaeche von Tweakable DJ im Browser.
rem   Doppelklick auf diese Datei: mit Fenster, z. B. zum Fehlersuchen. Das Fenster muss offen bleiben, solange
rem   Tweakable DJ laeuft.
rem   Mit --hidden (so startet die Verknuepfung auf dem Desktop, ueber "conhost.exe --headless"): ohne Fenster, die
rem   Ausgaben stehen in ui.log. Hier wartet nie ein "pause" (das bliebe unsichtbar haengen). Gibt es kein brauchbares
rem   Node.js, ist es zu alt oder endet node unerwartet mit einem Fehler, startet diese Datei sich mit Fenster neu
rem   (TWEAKABLE_DJ_WINDOW=1), damit man die Meldung sieht.
rem   Mit --now (zweite Verknuepfung "Tweakable DJ - Playlist neu erstellen"): ebenfalls ohne Fenster, aber statt der Oberflaeche
rem   "node dj.mjs --now" - erstellt die Playlist neu und meldet sich mit einer Systembenachrichtigung.
rem
rem Node.js: Beim ersten Start laedt get-node.cmd eine eigene, portable Fassung (Version laut node-version.txt) einmalig in den
rem Unterordner node\; danach nimmt diese Datei immer sie (node\current\node.exe). Klappt der Download nicht (z. B. offline)
rem bzw. laeuft die neue Version auf diesem PC nicht, tut es zuerst die vorige eigene Version, sonst ein installiertes
rem Node.js ab Version 18. Welches, steht in TWEAKABLE_DJ_NODE (relativer Pfad bzw. "node"). Der PATH bleibt, wie er ist;
rem so stoeren auch Zeichen wie ; %% ^ im Ordnernamen nicht.
rem Ohne Fenster laedt diese Datei nichts: Ist ein Download noetig (get-node.cmd --check), startet sie sich dafuer mit Fenster
rem neu (TWEAKABLE_DJ_WINDOW=download) - aber nur, wenn es gar kein brauchbares Node.js gibt oder heute noch kein Versuch
rem war; sonst startet sie gleich ohne Fenster mit dem vorhandenen. Nach dem Download startet das Fenster Tweakable DJ wieder
rem ohne Fenster (conhost --headless, wie die Verknuepfung) und schliesst sich.
rem Kann Tweakable DJ in seinem Ordner nicht schreiben (get-node.cmd endet mit 3, z. B. unter C:\Program Files), zeigt ein
rem Fenster die Meldung und Tweakable DJ startet nicht (ohne Schreibrecht liesse sich nichts speichern).
rem Nur fuer Tests: TWEAKABLE_DJ_TEST_START=1 - statt sich neu zu starten (mit bzw. ohne Fenster), nur "START ..." ausgeben.
rem
rem Alles Weitere steht in EINEM Klammerblock, der mit exit /b endet: cmd.exe liest den ganzen Block ein, bevor es
rem ihn ausfuehrt, und liest danach nichts mehr aus dieser Datei. So darf "Jetzt aktualisieren" die Datei ersetzen,
rem waehrend sie laeuft (sonst liest cmd.exe an der alten Stelle in der neuen Datei weiter). Deshalb auch "call" mit
rem doppelten Prozentzeichen: Variablen, die erst im Block gesetzt werden, liest cmd.exe so erst beim Ausfuehren.
rem Endet die Oberflaeche mit Code 75 (Update installiert), startet die Schleife in "cmd /c" sie ohne Browser neu.
rem Die Schleife steht ganz in dieser einen Befehlszeile, liest also ebenfalls nichts aus der Datei nach. Ohne Fenster
rem bleibt es dabei, weil TWEAKABLE_DJ_HIDDEN gesetzt bleibt.
(
  cd /d "%~dp0"
  set "TWEAKABLE_DJ_HIDDEN="
  if /i "%~1"=="--hidden" set "TWEAKABLE_DJ_HIDDEN=1"
  if /i "%~1"=="--now" set "TWEAKABLE_DJ_HIDDEN=1"
  if defined TWEAKABLE_DJ_WINDOW set "TWEAKABLE_DJ_HIDDEN="
  set "TWEAKABLE_DJ_NODE="
  set "TWEAKABLE_DJ_NODE_FALLBACK="
  set "TWEAKABLE_DJ_NODE_NONE="
  if exist get-node.cmd if defined TWEAKABLE_DJ_HIDDEN (
    call .\get-node.cmd --check
    if errorlevel 3 (
      set "TWEAKABLE_DJ_WINDOW=1"
      if defined TWEAKABLE_DJ_TEST_START (echo START window %1) else start "Tweakable DJ" "%~f0"
      exit /b 1
    )
    if errorlevel 1 if not errorlevel 2 (
      set "TWEAKABLE_DJ_WINDOW=download"
      if defined TWEAKABLE_DJ_TEST_START (echo START window %1) else if /i "%~1"=="--now" (start "Tweakable DJ" "%~f0" --now) else start "Tweakable DJ" "%~f0"
      exit /b 0
    )
  )
  if exist get-node.cmd if not defined TWEAKABLE_DJ_HIDDEN (
    call .\get-node.cmd
    rem Hoechster Code zuerst: In .cmd-Dateien setzt "set" den Errorlevel auf 0 zurueck.
    if errorlevel 3 (
      pause
      if defined TWEAKABLE_DJ_WINDOW exit
      exit /b 1
    )
    if errorlevel 2 (set "TWEAKABLE_DJ_NODE_NONE=1" & set "TWEAKABLE_DJ_NODE_FALLBACK=1") else if errorlevel 1 set "TWEAKABLE_DJ_NODE_FALLBACK=1"
  )
  rem Node.js waehlen: das eigene, wenn es laeuft - ab Version 18 -, sonst ein installiertes.
  if exist "node\current\node.exe" "node\current\node.exe" -e "process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)" 2>nul && set "TWEAKABLE_DJ_NODE=node\current\node.exe"
  if not defined TWEAKABLE_DJ_NODE (
    where node 1>nul 2>nul && set "TWEAKABLE_DJ_NODE=node"
  )
  if not defined TWEAKABLE_DJ_NODE (
    if defined TWEAKABLE_DJ_HIDDEN (
      set "TWEAKABLE_DJ_WINDOW=1"
      if defined TWEAKABLE_DJ_TEST_START (echo START window %1) else start "Tweakable DJ" "%~f0"
      exit /b 1
    )
    echo.
    if defined TWEAKABLE_DJ_NODE_NONE (
      echo Node.js fehlt: Fuer dieses System kann Tweakable DJ kein eigenes Node.js einrichten ^(siehe oben^), und es ist
      echo auch keins installiert. Bitte Node.js von https://nodejs.org installieren ^(Version 18 oder neuer^).
      echo.
      echo Node.js is missing: Tweakable DJ can't set up its own Node.js on this system ^(see above^), and none is installed.
      echo Please install Node.js from https://nodejs.org ^(version 18 or newer^).
    ) else (
      echo Node.js fehlt: Tweakable DJ konnte sein eigenes Node.js nicht einrichten ^(siehe oben^), und es ist auch keins
      echo installiert. Bitte die Internetverbindung pruefen und Tweakable DJ noch einmal starten - oder Node.js von
      echo https://nodejs.org installieren ^(Version 18 oder neuer^).
      echo.
      echo Node.js is missing: Tweakable DJ couldn't set up its own Node.js ^(see above^), and none is installed.
      echo Please check the internet connection and start Tweakable DJ again - or install Node.js from
      echo https://nodejs.org ^(version 18 or newer^).
    )
    pause
    if defined TWEAKABLE_DJ_WINDOW exit
    exit /b 1
  )
  call "%%TWEAKABLE_DJ_NODE%%" -e "process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)"
  if errorlevel 1 (
    if defined TWEAKABLE_DJ_HIDDEN (
      set "TWEAKABLE_DJ_WINDOW=1"
      if defined TWEAKABLE_DJ_TEST_START (echo START window %1) else start "Tweakable DJ" "%~f0"
      exit /b 1
    )
    echo Node.js ist zu alt. Tweakable DJ braucht Version 18 oder neuer: https://nodejs.org
    echo.
    echo Node.js is too old. Tweakable DJ needs version 18 or newer: https://nodejs.org
    pause
    if defined TWEAKABLE_DJ_WINDOW exit
    exit /b 1
  )
  rem Fenster nur fuer den Download geoeffnet: jetzt ohne Fenster weiter und dieses Fenster schliessen. Klappte der Download
  rem nicht, bleibt die Meldung vorher kurz stehen; ein neuer Versuch ohne Fenster kommt fruehestens morgen.
  if "%TWEAKABLE_DJ_WINDOW%"=="download" (
    if defined TWEAKABLE_DJ_NODE_FALLBACK (
      echo.
      echo Tweakable DJ startet trotzdem, mit dem vorhandenen Node.js. Dieses Fenster schliesst sich gleich.
      echo Tweakable DJ starts anyway, with the Node.js that is already there. This window will close in a moment.
      if not defined TWEAKABLE_DJ_TEST_START ping -n 9 127.0.0.1 >nul
    )
    set "TWEAKABLE_DJ_WINDOW="
    if defined TWEAKABLE_DJ_TEST_START (echo START hidden %1) else if /i "%~1"=="--now" (start "" "%SystemRoot%\System32\conhost.exe" --headless "%SystemRoot%\System32\cmd.exe" /d /c ".\Tweakable DJ.cmd" --now) else start "" "%SystemRoot%\System32\conhost.exe" --headless "%SystemRoot%\System32\cmd.exe" /d /c ".\Tweakable DJ.cmd" --hidden
    if defined TWEAKABLE_DJ_TEST_START exit /b 0
    exit
  )
  if /i "%~1"=="--now" (
    call "%%TWEAKABLE_DJ_NODE%%" dj.mjs --now
    if defined TWEAKABLE_DJ_WINDOW exit
    exit /b
  )
  set "TWEAKABLE_DJ_LAUNCHER=1"
  call "%%TWEAKABLE_DJ_NODE%%" ui.mjs %*
  if errorlevel 75 if not errorlevel 76 cmd /d /c "for /l %%i in (0,0,1) do @(echo.&echo Tweakable DJ startet neu ... / Tweakable DJ is restarting ...&%%TWEAKABLE_DJ_NODE%% ui.mjs --no-browser&(if errorlevel 76 exit)&(if not errorlevel 75 exit))"
  if defined TWEAKABLE_DJ_HIDDEN (
    if errorlevel 1 (
      set "TWEAKABLE_DJ_WINDOW=1"
      if defined TWEAKABLE_DJ_TEST_START (echo START window %1) else start "Tweakable DJ" "%~f0"
    )
    exit /b
  )
  pause
  if defined TWEAKABLE_DJ_WINDOW exit
  exit /b
)
