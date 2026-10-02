#!/bin/sh
# Startet die Oberfläche von Tweakable DJ im Browser (Mac: Doppelklick im Finder).
# Beim allerersten Öffnen: Rechtsklick → Öffnen (siehe README, Abschnitt 7).
# Die eigentliche Arbeit macht start.sh im selben Ordner.

cd "$(dirname "$0")" || exit 1
exec /bin/sh ./start.sh
