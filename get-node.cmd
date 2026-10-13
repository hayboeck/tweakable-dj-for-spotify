@echo off
rem Eigenes Node.js fuer Tweakable DJ (Windows): laedt die in node-version.txt festgelegte Version einmalig von
rem https://nodejs.org/dist/ in den Unterordner node\ des Programmordners. Ohne Adminrechte und ohne Aenderung am PATH;
rem "Tweakable DJ.cmd" ruft diese Datei auf und startet danach node\current\node.exe (ein Doppelklick auf diese Datei schadet
rem nicht, laedt aber nur Node.js).
rem   get-node.cmd           sorgt dafuer, dass node\current\node.exe die festgelegte Version ist, und laedt sie bei Bedarf.
rem                          Exit-Code 0: node\current\node.exe ist da - die festgelegte Version oder, wenn der Download nicht
rem                          klappt bzw. sie auf diesem PC nicht laeuft, die vorige (dann ist TWEAKABLE_DJ_NODE_FALLBACK=1).
rem                          1: kein eigenes Node.js. 2: fuer dieses System gibt es keins (32-Bit-Windows), node-version.txt
rem                          ist ungueltig, oder die festgelegte Version laeuft hier nicht und es gibt keine vorige.
rem   get-node.cmd --check   laedt nichts: 0 = nichts zu tun (passt; oder die vorige Version tut es, weil die festgelegte hier
rem                          nicht laeuft; oder ein Download wurde heute schon versucht und ein brauchbares Node.js ab 18 ist
rem                          da, eigenes oder installiertes), 1 = Download noetig, 2 = fuer dieses System gibt es keins.
rem                          So versucht der Start ohne Fenster den Download hoechstens einmal am Tag (node\last-download).
rem Ablauf: node\download\ leeren, SHASUMS256.txt und die ZIP-Datei laden (curl.exe; klappt das nicht, PowerShell),
rem SHA-256 vergleichen (certutil), nur node.exe und LICENSE entpacken (tar.exe, sonst PowerShell), mit "node.exe -v"
rem pruefen, nach node\new\ verschieben und gegen node\current\ tauschen (die alte Version kommt weg). So gilt ein halb
rem fertiger Download nie als fertig. Laesst sich node\current\ gerade nicht wegschieben (z. B. laeuft ein automatischer
rem Lauf damit), bleibt node\new\ bis zum naechsten Start liegen. Laeuft die geladene Fassung auf diesem PC nicht, merkt
rem sich das eine Datei node\not-runnable-<Name> (kein neuer Versuch mit derselben Version; loescht man sie, versucht es
rem der naechste Start erneut).
rem Immer nur ein Aufruf zugleich (z. B. zwei Doppelklicks, oder Oberflaeche und zweite Verknuepfung): Die Sperre ist die
rem offene Datei node\lock. Endet ein Aufruf - auch abgebrochen oder mit geschlossenem Fenster -, gibt Windows sie frei;
rem eine verwaiste Sperre gibt es also nicht. Der zweite wartet, bis der erste fertig ist (hoechstens etwa 20 Minuten).
rem Nur fuer Tests: TWEAKABLE_DJ_NODE_MIRROR = andere Adresse statt https://nodejs.org/dist, TWEAKABLE_DJ_NODE_ARCH = x64
rem bzw. arm64 statt des Prozessors dieses PCs.
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

rem Version aus node-version.txt: erst pruefen, dass die Datei nur Ziffern und Punkte enthaelt, dann einlesen.
if not exist "node-version.txt" goto keins
findstr /r "[^0-9.]" "node-version.txt" >nul 2>nul && goto keins
set "version="
for /f "usebackq delims=" %%v in ("node-version.txt") do if not defined version set "version=%%v"
echo(%version%| findstr /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul || goto keins
rem Prozessor: ARM64 oder x64 (auch aus einem 32-Bit-Fenster heraus); fuer 32-Bit-Windows gibt es kein aktuelles Node.js.
set "arch=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "arch=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "arch=arm64"
if /i "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "arch="
if /i "%TWEAKABLE_DJ_NODE_ARCH%"=="x64" set "arch=x64"
if /i "%TWEAKABLE_DJ_NODE_ARCH%"=="arm64" set "arch=arm64"
if not defined arch goto keins
set "name=node-v%version%-win-%arch%"
set "want=v%version%"
set "url=https://nodejs.org/dist/v%version%"
if defined TWEAKABLE_DJ_NODE_MIRROR set "url=%TWEAKABLE_DJ_NODE_MIRROR%/v%version%"
set "fallback="

if not exist "node\" md "node" 2>nul
set "told="
set "waited=0"
:sperren
set "locked="
rem 2>nul nur fuer die Meldung, wenn die Sperre belegt ist; die Ausgaben des Ablaufs (2>&1) bleiben sichtbar.
2>nul (
  9>"node\lock" (
    set "locked=1"
    call :ablauf %1 2>&1
  )
)
if defined locked goto ende
rem Ein anderer Aufruf ist dran. Laedt er gerade, einmal darauf hinweisen; dann jede Sekunde neu versuchen.
if not defined told if exist "node\download\" (
  set "told=1"
  echo Node.js wird gerade schon heruntergeladen ^(von einem anderen Start von Tweakable DJ^). Bitte warten ...
  echo Node.js is already being downloaded ^(by another start of Tweakable DJ^). Please wait ...
)
set /a waited+=1
if %waited% GEQ 1200 goto zuLange
ping -n 2 127.0.0.1 >nul
goto sperren

:zuLange
echo Ein anderer Start von Tweakable DJ laedt Node.js schon seit ueber 20 Minuten. Bitte spaeter noch einmal versuchen.
echo Another start of Tweakable DJ has been downloading Node.js for over 20 minutes. Please try again later.
if exist "node\current\node.exe" set "fallback=1"
if exist "node\current\node.exe" (set "rc=0") else set "rc=1"
goto fertig

:ende
set "rc=%errorlevel%"
:fertig
rem Ergebnis an den Aufrufer: Exit-Code, und ob nur die vorige Version da ist (TWEAKABLE_DJ_NODE_FALLBACK)
endlocal & set "TWEAKABLE_DJ_NODE_FALLBACK=%fallback%" & exit /b %rc%

:keins
endlocal & set "TWEAKABLE_DJ_NODE_FALLBACK=" & exit /b 2

rem --- Unterprogramme (laufen mit der Sperre) ---

rem Eigentlicher Ablauf; %1 = --check oder leer. Exit-Code wie oben beschrieben.
:ablauf
rem Reste vom letzten Tausch weg; eine schon gepruefte neue Version (node\new) jetzt einsetzen.
if exist "node\old\" rd /s /q "node\old" 2>nul
call :passt node\new && call :tauschen
call :passt node\current && exit /b 0
if exist "node\not-runnable-%name%" goto laeuftHierNicht
if /i not "%~1"=="--check" goto laden
rem --check: Download noetig - ausser er wurde heute schon versucht und ein brauchbares Node.js ist da.
set "tried="
if exist "node\last-download" set /p tried=<"node\last-download"
if not "%tried%"=="%date%" exit /b 1
call :brauchbar && exit /b 0
exit /b 1

:laeuftHierNicht
if exist "node\current\node.exe" set "fallback=1"
if /i "%~1"=="--check" if defined fallback (exit /b 0) else exit /b 2
echo Node.js %version% laeuft auf diesem PC nicht ^(Datei node\not-runnable-%name%; loescht man sie, versucht es der
echo naechste Start erneut^).
echo Node.js %version% does not run on this PC ^(file node\not-runnable-%name%; delete it to try again on the next start^).
if defined fallback exit /b 0
exit /b 2

:laden
echo.
echo Node.js wird einmalig heruntergeladen ^(ca. 35 MB^) ...
echo Node.js is being downloaded once ^(about 35 MB^) ...
rem Zeitpunkt des Versuchs (fuer --check: hoechstens einmal am Tag ohne Fenster)
>"node\last-download" echo(%date%
if exist "node\download\" rd /s /q "node\download" 2>nul
if exist "node\download\" goto fehler
md "node\download" 2>nul
if not exist "node\download\" goto fehler
call :holen "%url%/SHASUMS256.txt" "node\download\SHASUMS256.txt" || goto fehler
call :holen "%url%/%name%.zip" "node\download\%name%.zip" || goto fehler

rem Pruefsumme: erwartet laut SHASUMS256.txt, tatsaechlich laut certutil (2. Zeile; aeltere Windows trennen mit Leerzeichen)
set "expected="
for /f "usebackq tokens=1,2" %%a in ("node\download\SHASUMS256.txt") do if /i "%%b"=="%name%.zip" set "expected=%%a"
set "actual="
for /f "skip=1 delims=" %%h in ('%SystemRoot%\System32\certutil.exe -hashfile "node\download\%name%.zip" SHA256') do if not defined actual set "actual=%%h"
if defined actual set "actual=%actual: =%"
if not defined expected goto pruefsumme
if /i not "%expected%"=="%actual%" goto pruefsumme

md "node\download\x"
if not exist "%SystemRoot%\System32\tar.exe" goto entpackenPS
"%SystemRoot%\System32\tar.exe" -xf "node\download\%name%.zip" -C "node\download\x" "%name%/node.exe" "%name%/LICENSE" || goto fehler
goto entpackt
:entpackenPS
set "zipFile=%CD%\node\download\%name%.zip"
set "toDir=%CD%\node\download\x"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; try { Expand-Archive -LiteralPath $env:zipFile -DestinationPath $env:toDir; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }" || goto fehler
:entpackt
if not exist "node\download\x\%name%\node.exe" goto fehler
call :passt "node\download\x\%name%" || goto laeuftNicht
if exist "node\new\" rd /s /q "node\new" 2>nul
move "node\download\x\%name%" "node\new" >nul || goto fehler
rd /s /q "node\download" 2>nul
call :tauschen
call :passt node\current && goto geladen
echo Die neue Version von Node.js gilt ab dem naechsten Start ^(die bisherige ist gerade in Gebrauch^).
echo The new version of Node.js will be used from the next start ^(the current one is in use right now^).
exit /b 0
:geladen
echo Node.js %version% ist bereit.
echo Node.js %version% is ready.
echo.
exit /b 0

:pruefsumme
echo Die Pruefsumme der heruntergeladenen Datei stimmt nicht ^(SHASUMS256.txt^). Die Datei wurde verworfen.
echo The checksum of the downloaded file does not match ^(SHASUMS256.txt^). The file was discarded.
goto fehler

:laeuftNicht
echo Das heruntergeladene Node.js laeuft auf diesem PC nicht.
echo The downloaded Node.js does not run on this PC.
type nul > "node\not-runnable-%name%"
if exist "node\download\" rd /s /q "node\download" 2>nul
goto vorige

:fehler
if exist "node\download\" rd /s /q "node\download" 2>nul
echo Node.js konnte nicht heruntergeladen werden.
echo Node.js could not be downloaded.
:vorige
rem Eine vorige eigene Version tut es vorerst auch (Tweakable DJ braucht nur Version 18 oder neuer).
if not exist "node\current\node.exe" exit /b 1
set "fallback=1"
exit /b 0

rem Ordner %1 enthaelt node.exe in der festgelegten Version (Pfade ohne Leerzeichen, relativ zum Programmordner)?
:passt
if not exist "%~1\node.exe" exit /b 1
set "found="
for /f "delims=" %%v in ('%~1\node.exe -v 2^>nul') do if not defined found set "found=%%v"
if "%found%"=="%want%" exit /b 0
exit /b 1

rem Gibt es ein brauchbares Node.js ab Version 18 - das eigene (auch eine vorige Version) oder ein installiertes?
:brauchbar
if exist "node\current\node.exe" "node\current\node.exe" -e "process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)" >nul 2>nul && exit /b 0
where node >nul 2>nul || exit /b 1
node -e "process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)" >nul 2>nul && exit /b 0
exit /b 1

rem node\new gegen node\current tauschen; die alte Version kommt weg. Fehler: alles bleibt, wie es war.
:tauschen
if not exist "node\current\" goto tauschenNeu
ren "node\current" old 2>nul
if exist "node\current\" exit /b 1
:tauschenNeu
ren "node\new" current 2>nul
if exist "node\current\" goto tauschenFertig
if exist "node\old\" ren "node\old" current 2>nul
exit /b 1
:tauschenFertig
if exist "node\old\" rd /s /q "node\old" 2>nul
exit /b 0

rem Datei %1 nach %2 laden: zuerst curl.exe (seit Windows 10 1803 dabei; bricht ab, wenn 60 Sekunden lang fast nichts
rem ankommt). Klappt das nicht - ausser bei einer Fehlerantwort des Servers wie 404 (curl-Code 22) -, noch einmal mit
rem PowerShell (z. B. in Netzen, deren Pruefung der Verbindung curl nicht mag; Zeitlimit 60 Sekunden ohne Antwort).
:holen
if not exist "%SystemRoot%\System32\curl.exe" goto holenPS
"%SystemRoot%\System32\curl.exe" -fL --retry 2 --connect-timeout 20 --speed-limit 1000 --speed-time 60 --progress-bar -o "%~2" "%~1"
if not errorlevel 1 exit /b 0
if errorlevel 22 if not errorlevel 23 exit /b 1
echo Zweiter Versuch mit PowerShell ...
echo Second attempt with PowerShell ...
:holenPS
set "fromUrl=%~1"
set "toFile=%CD%\%~2"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri $env:fromUrl -OutFile $env:toFile; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
exit /b
