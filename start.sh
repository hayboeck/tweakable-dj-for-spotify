#!/bin/sh
# Startet die Oberfläche von Tweakable DJ im Browser (Linux und Mac).
#   Linux: im Terminal im Ordner von Tweakable DJ  ./start.sh  eingeben
#   Mac:   Doppelklick auf "Tweakable DJ.command" (ruft diese Datei auf)
# Klappt ./start.sh nicht („Keine Berechtigung“), einmalig  chmod +x start.sh  eingeben
# oder stattdessen  sh start.sh  verwenden.
#
# Mit --hidden (so startet die Verknüpfung auf dem Desktop): ohne Terminal. Die Ausgaben stehen in ui.log; fehlt Node.js,
# ist es zu alt oder lässt sich die Oberfläche nicht starten, meldet das eine Systembenachrichtigung (notify-send bzw.
# osascript), denn es gibt kein Fenster für die Meldung.
#
# Beendet sich die Oberfläche mit Code 75 („Jetzt aktualisieren“ hat eine neue Version installiert), startet sie hier
# gleich wieder, ohne den Browser noch einmal zu öffnen. Alles steht in der Funktion main, die erst die letzte Zeile
# aufruft: Dann hat sh die Datei schon ganz gelesen, und ein Update darf sie ersetzen, während sie läuft.

# Bei einem Fehler das Fenster offen halten, damit man die Meldung lesen kann (ohne Terminal gibt es nichts zu warten).
fertig() {
  if [ -t 0 ]; then
    printf '\nZum Schließen Enter drücken / Press Enter to close … '
    read -r _
  fi
  exit "$1"
}

# Systembenachrichtigung (nur ohne Fenster): Linux notify-send, Mac osascript; fehlt beides, bleibt nur ui.log.
melde() {
  if command -v notify-send >/dev/null 2>&1; then
    notify-send --app-name="Tweakable DJ" -- "Tweakable DJ" "$1"
  elif [ -x /usr/bin/osascript ]; then
    /usr/bin/osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Tweakable DJ"' -e 'end run' "$1"
  fi
  printf '%s\n' "$1" >>ui.log 2>/dev/null
}

# Oberfläche starten; ohne Fenster kommen Meldungen, die Node.js selbst ausgibt (z. B. eine kaputte Programmdatei), nach ui.log.
oberflaeche() {
  if [ -n "$hidden" ]; then
    node ui.mjs "$@" 2>>ui.log
  else
    node ui.mjs "$@"
  fi
}

main() {
  # In den Ordner wechseln, in dem diese Datei liegt.
  cd "$(dirname "$0")" || exit 1

  # Übliche Installationsorte von Node.js ergänzen, falls sie fehlen (z. B. Homebrew auf dem Mac).
  PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

  hidden=
  [ "$1" = "--hidden" ] && hidden=1

  if ! command -v node >/dev/null 2>&1; then
    if [ -n "$hidden" ]; then
      melde "Node.js fehlt. Bitte installieren (Version 18 oder neuer): https://nodejs.org / Node.js is missing. Please install it (version 18 or newer): https://nodejs.org"
      exit 1
    fi
    echo "Node.js ist nicht installiert (oder nicht auffindbar)."
    echo "Bitte Node.js installieren, Version 18 oder neuer: https://nodejs.org"
    echo "Danach Tweakable DJ noch einmal starten."
    echo
    echo "Node.js is not installed (or can't be found)."
    echo "Please install Node.js, version 18 or newer: https://nodejs.org"
    echo "Then start Tweakable DJ again."
    fertig 1
  fi

  if ! node -e 'process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)'; then
    if [ -n "$hidden" ]; then
      melde "Node.js ist zu alt ($(node --version)), Tweakable DJ braucht 18 oder neuer: https://nodejs.org / Node.js is too old ($(node --version)), Tweakable DJ needs 18 or newer: https://nodejs.org"
      exit 1
    fi
    echo "Node.js ist zu alt: $(node --version). Tweakable DJ braucht Version 18 oder neuer."
    echo "Neue Version: https://nodejs.org"
    echo
    echo "Node.js is too old: $(node --version). Tweakable DJ needs version 18 or newer."
    echo "New version: https://nodejs.org"
    fertig 1
  fi

  # Sagt ui.mjs, dass diese Datei nach einem Update neu startet (sonst: Hinweis, Tweakable DJ selbst neu zu starten),
  # und ob es ein Fenster gibt (TWEAKABLE_DJ_HIDDEN gilt auch für den Neustart nach einem Update).
  TWEAKABLE_DJ_LAUNCHER=1
  export TWEAKABLE_DJ_LAUNCHER
  if [ -n "$hidden" ]; then
    TWEAKABLE_DJ_HIDDEN=1
    export TWEAKABLE_DJ_HIDDEN
  fi
  oberflaeche "$@"
  code=$?
  while [ "$code" -eq 75 ]; do
    echo
    echo "Tweakable DJ startet neu … / Tweakable DJ is restarting …"
    oberflaeche --no-browser
    code=$?
  done
  if [ -n "$hidden" ]; then
    # Bekannte Probleme meldet ui.mjs selbst (und endet mit 0); alles andere hier.
    [ "$code" -eq 0 ] || melde "Tweakable DJ ließ sich nicht starten. Details in ui.log im Ordner von Tweakable DJ. / Tweakable DJ couldn't start. Details are in ui.log in the Tweakable DJ folder."
    exit "$code"
  fi
  [ "$code" -eq 0 ] || fertig "$code"
}

main "$@"; exit $?
