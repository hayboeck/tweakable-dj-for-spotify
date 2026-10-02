#!/bin/sh
# Startet die Oberfläche von Tweakable DJ im Browser (Linux und Mac).
#   Linux: im Terminal im Ordner von Tweakable DJ  ./start.sh  eingeben
#   Mac:   Doppelklick auf "Tweakable DJ.command" (ruft diese Datei auf)
# Klappt ./start.sh nicht („Keine Berechtigung“), einmalig  chmod +x start.sh  eingeben
# oder stattdessen  sh start.sh  verwenden.

# In den Ordner wechseln, in dem diese Datei liegt.
cd "$(dirname "$0")" || exit 1

# Übliche Installationsorte von Node.js ergänzen, falls sie fehlen (z. B. Homebrew auf dem Mac).
PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

# Bei einem Fehler das Fenster offen halten, damit man die Meldung lesen kann.
fertig() {
  if [ -t 0 ]; then
    printf '\nZum Schließen Enter drücken / Press Enter to close … '
    read -r _
  fi
  exit "$1"
}

if ! command -v node >/dev/null 2>&1; then
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
  echo "Node.js ist zu alt: $(node --version). Tweakable DJ braucht Version 18 oder neuer."
  echo "Neue Version: https://nodejs.org"
  echo
  echo "Node.js is too old: $(node --version). Tweakable DJ needs version 18 or newer."
  echo "New version: https://nodejs.org"
  fertig 1
fi

node ui.mjs || fertig $?
