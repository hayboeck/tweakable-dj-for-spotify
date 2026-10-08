@echo off
rem Eigenes Node.js fuer Tweakable DJ (Windows): laedt die in node-version.txt festgelegte Version einmalig von
rem https://nodejs.org/dist/ in den Unterordner node\ des Programmordners. Ohne Adminrechte und ohne Aenderung am PATH des
rem Systems; "Tweakable DJ.cmd" ruft diese Datei auf (ein Doppelklick darauf schadet nicht, laedt aber nur Node.js).
rem   get-node.cmd           sorgt dafuer, dass node\current\node.exe die festgelegte Version ist, und laedt sie bei Bedarf.
rem                          Exit-Code 0: node\current\node.exe ist da (klappt der Download nicht, ggf. noch die vorige
rem                          Version); der PATH dieses Fensters beginnt dann mit node\current. 1: kein eigenes Node.js.
rem   get-node.cmd --check   laedt nichts: 0 = passt, 1 = Download noetig, 2 = fuer dieses System gibt es keins
rem Ablauf: node\download\ leeren, SHASUMS256.txt und die ZIP-Datei laden (curl.exe, sonst PowerShell), SHA-256 vergleichen
rem (certutil), nur node.exe und LICENSE entpacken (tar.exe, sonst PowerShell), mit "node.exe -v" pruefen, nach node\new\
rem verschieben und gegen node\current\ tauschen (die alte Version kommt weg). So gilt ein halb fertiger Download nie als
rem fertig. Laesst sich node\current\ gerade nicht wegschieben (z. B. laeuft ein automatischer Lauf damit), bleibt node\new\
rem bis zum naechsten Start liegen. Laeuft die geladene Fassung auf diesem PC nicht, merkt sich das eine Datei
rem node\not-runnable-<Name> (dann kein neuer Versuch mit derselben Version).
rem Nur fuer Tests: TWEAKABLE_DJ_NODE_MIRROR = andere Adresse statt https://nodejs.org/dist
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

set "TDJ_VERSION="
if exist "node-version.txt" for /f "usebackq tokens=1" %%v in ("node-version.txt") do if not defined TDJ_VERSION set "TDJ_VERSION=%%v"
echo %TDJ_VERSION%| findstr /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul || goto keins
rem Prozessor: ARM64 oder x64 (auch aus einem 32-Bit-Fenster heraus); fuer 32-Bit-Windows gibt es kein aktuelles Node.js.
set "TDJ_ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "TDJ_ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "TDJ_ARCH=arm64"
if /i "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 goto keins
set "TDJ_NAME=node-v%TDJ_VERSION%-win-%TDJ_ARCH%"
set "TDJ_WANT=v%TDJ_VERSION%"
set "TDJ_BASE=https://nodejs.org/dist"
if defined TWEAKABLE_DJ_NODE_MIRROR set "TDJ_BASE=%TWEAKABLE_DJ_NODE_MIRROR%"
set "TDJ_URL=%TDJ_BASE%/v%TDJ_VERSION%"

rem Reste vom letzten Tausch weg; eine schon gepruefte neue Version (node\new) jetzt einsetzen.
if exist "node\old\" rd /s /q "node\old" 2>nul
call :passt node\new && call :tauschen
call :passt node\current && goto bereit
if exist "node\not-runnable-%TDJ_NAME%" goto keins
if /i "%~1"=="--check" exit /b 1

echo.
echo Node.js wird einmalig heruntergeladen (ca. 40 MB) ...
echo Node.js is being downloaded once (about 40 MB) ...
if exist "node\download\" rd /s /q "node\download" 2>nul
if exist "node\download\" goto fehler
md "node\download" 2>nul
if not exist "node\download\" goto fehler
call :holen "%TDJ_URL%/SHASUMS256.txt" "node\download\SHASUMS256.txt" || goto fehler
call :holen "%TDJ_URL%/%TDJ_NAME%.zip" "node\download\%TDJ_NAME%.zip" || goto fehler

rem Pruefsumme: erwartet laut SHASUMS256.txt, tatsaechlich laut certutil (2. Zeile; aeltere Windows trennen mit Leerzeichen)
set "TDJ_EXPECTED="
for /f "usebackq tokens=1,2" %%a in ("node\download\SHASUMS256.txt") do if /i "%%b"=="%TDJ_NAME%.zip" set "TDJ_EXPECTED=%%a"
set "TDJ_ACTUAL="
for /f "skip=1 delims=" %%h in ('%SystemRoot%\System32\certutil.exe -hashfile "node\download\%TDJ_NAME%.zip" SHA256') do if not defined TDJ_ACTUAL set "TDJ_ACTUAL=%%h"
if defined TDJ_ACTUAL set "TDJ_ACTUAL=%TDJ_ACTUAL: =%"
if not defined TDJ_EXPECTED goto pruefsumme
if /i not "%TDJ_EXPECTED%"=="%TDJ_ACTUAL%" goto pruefsumme

md "node\download\x"
if not exist "%SystemRoot%\System32\tar.exe" goto entpackenPS
"%SystemRoot%\System32\tar.exe" -xf "node\download\%TDJ_NAME%.zip" -C "node\download\x" "%TDJ_NAME%/node.exe" "%TDJ_NAME%/LICENSE" || goto fehler
goto entpackt
:entpackenPS
set "TDJ_ZIP=%CD%\node\download\%TDJ_NAME%.zip"
set "TDJ_TO=%CD%\node\download\x"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; try { Expand-Archive -LiteralPath $env:TDJ_ZIP -DestinationPath $env:TDJ_TO; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }" || goto fehler
:entpackt
if not exist "node\download\x\%TDJ_NAME%\node.exe" goto fehler
call :passt "node\download\x\%TDJ_NAME%" || goto laeuftNicht
if exist "node\new\" rd /s /q "node\new" 2>nul
move "node\download\x\%TDJ_NAME%" "node\new" >nul || goto fehler
rd /s /q "node\download" 2>nul
call :tauschen
call :passt node\current && goto geladen
echo Die neue Version von Node.js gilt ab dem naechsten Start ^(die bisherige ist gerade in Gebrauch^).
echo The new version of Node.js will be used from the next start ^(the current one is in use right now^).
goto bereit
:geladen
echo Node.js %TDJ_VERSION% ist bereit.
echo Node.js %TDJ_VERSION% is ready.
echo.
goto bereit

:pruefsumme
echo Die Pruefsumme der heruntergeladenen Datei stimmt nicht ^(SHASUMS256.txt^). Die Datei wurde verworfen.
echo The checksum of the downloaded file does not match ^(SHASUMS256.txt^). The file was discarded.
goto fehler

:laeuftNicht
echo Das heruntergeladene Node.js laeuft auf diesem PC nicht.
echo The downloaded Node.js does not run on this PC.
type nul > "node\not-runnable-%TDJ_NAME%"
goto fehler

:fehler
if exist "node\download\" rd /s /q "node\download" 2>nul
echo Node.js konnte nicht heruntergeladen werden.
echo Node.js could not be downloaded.
rem Eine vorige eigene Version tut es vorerst auch (Tweakable DJ braucht nur Version 18 oder neuer).
if exist "node\current\node.exe" goto bereit
endlocal
exit /b 1

:keins
endlocal
exit /b 2

rem Eigenes Node.js da: PATH dieses Fensters (nicht des Systems) beginnt mit node\current; --check aendert nichts.
:bereit
if /i "%~1"=="--check" exit /b 0
endlocal & set "PATH=%~dp0node\current;%PATH%"
exit /b 0

rem --- Unterprogramme ---

rem Ordner %1 enthaelt node.exe in der festgelegten Version (Pfade ohne Leerzeichen, relativ zum Programmordner)?
:passt
if not exist "%~1\node.exe" exit /b 1
set "TDJ_FOUND="
for /f "delims=" %%v in ('%~1\node.exe -v 2^>nul') do if not defined TDJ_FOUND set "TDJ_FOUND=%%v"
if "%TDJ_FOUND%"=="%TDJ_WANT%" exit /b 0
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

rem Datei %1 nach %2 laden: curl.exe (seit Windows 10 1803 dabei), sonst PowerShell. Bricht ab, wenn 60 Sekunden lang
rem fast nichts ankommt.
:holen
if not exist "%SystemRoot%\System32\curl.exe" goto holenPS
"%SystemRoot%\System32\curl.exe" -fL --retry 2 --connect-timeout 20 --speed-limit 1000 --speed-time 60 --progress-bar -o "%~2" "%~1"
exit /b
:holenPS
set "TDJ_FROM=%~1"
set "TDJ_TO=%CD%\%~2"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -UseBasicParsing -Uri $env:TDJ_FROM -OutFile $env:TDJ_TO; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
exit /b
