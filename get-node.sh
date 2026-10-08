#!/bin/sh
# Eigenes Node.js für Tweakable DJ (macOS und Linux): lädt die in node-version.txt festgelegte Version einmalig von
# https://nodejs.org/dist/ in den Unterordner node/ des Programmordners. Ohne Adminrechte und ohne Änderung am PATH des
# Systems; start.sh ruft diese Datei auf.
#   sh get-node.sh           sorgt dafür, dass node/current/bin/node die festgelegte Version ist, und lädt sie bei Bedarf.
#                            Exit-Code 0: node/current/bin/node ist da (klappt der Download nicht, ggf. noch die vorige
#                            Version); 1: kein eigenes Node.js.
#   sh get-node.sh --check   lädt nichts: 0 = passt, 1 = Download nötig, 2 = für dieses System gibt es keins
#   sh get-node.sh --message der Hinweis auf den Download (für die Systembenachrichtigung ohne Fenster)
#   sh get-node.sh --name    nur die Datei, die es laden würde (für Tests)
# Mac: node-v…-darwin-arm64 bzw. -x64 als .tar.gz (Prüfsumme mit shasum), Linux: -linux-x64 bzw. -arm64 als .tar.xz (ohne xz
# als .tar.gz; Prüfsumme mit sha256sum). Laden mit curl (sonst wget), entpacken mit tar – nur bin/node und LICENSE.
# Ablauf wie in get-node.cmd: node/download/ leeren, SHASUMS256.txt und das Archiv laden, SHA-256 vergleichen, entpacken, mit
# "node -v" prüfen, nach node/new/ verschieben und gegen node/current/ tauschen (die alte Version kommt weg). So gilt ein halb
# fertiger Download nie als fertig. Läuft die geladene Fassung auf diesem Rechner nicht (z. B. Linux mit musl), merkt sich das
# die Datei node/not-runnable-<Name> (dann kein neuer Versuch mit derselben Version).
# Nur für Tests: TWEAKABLE_DJ_NODE_MIRROR (andere Adresse statt https://nodejs.org/dist), TWEAKABLE_DJ_NODE_OS und
# TWEAKABLE_DJ_NODE_ARCH (statt uname -s und uname -m).

cd "$(dirname "$0")" || exit 1

version=$(tr -d ' \t\r\n' < node-version.txt 2>/dev/null)
case "$version" in
  *[!0-9.]* | '') exit 2 ;;
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) exit 2 ;;
esac

os=${TWEAKABLE_DJ_NODE_OS:-$(uname -s)}
arch=${TWEAKABLE_DJ_NODE_ARCH:-$(uname -m)}
case "$os" in
  Darwin)
    platform=darwin ext=tar.gz size=55
    # Terminal unter Rosetta meldet x86_64, der Mac kann aber arm64.
    if [ -z "$TWEAKABLE_DJ_NODE_ARCH" ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then arch=arm64; fi
    ;;
  Linux)
    platform=linux
    if command -v xz >/dev/null 2>&1; then ext=tar.xz size=30; else ext=tar.gz size=60; fi
    ;;
  *) exit 2 ;;
esac
case "$arch" in
  x86_64 | amd64 | x64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) exit 2 ;;
esac
name="node-v$version-$platform-$arch"
file="$name.$ext"
url="${TWEAKABLE_DJ_NODE_MIRROR:-https://nodejs.org/dist}/v$version"
message="Node.js wird einmalig heruntergeladen (ca. $size MB) … / Node.js is being downloaded once (about $size MB) …"

case "$1" in
  --name) echo "$file"; exit 0 ;;
  --message) echo "$message"; exit 0 ;;
esac

# Ordner $1 enthält bin/node in der festgelegten Version?
passt() {
  [ -x "$1/bin/node" ] && [ "$("$1/bin/node" -v 2>/dev/null)" = "v$version" ]
}

# node/new gegen node/current tauschen; die alte Version kommt weg. Fehler: alles bleibt, wie es war.
tauschen() {
  if [ -d node/current ]; then mv node/current node/old || return 1; fi
  if ! mv node/new node/current; then
    [ -d node/old ] && mv node/old node/current
    return 1
  fi
  rm -rf node/old
}

# Datei $1 nach $2 laden; bricht ab, wenn 60 Sekunden lang fast nichts ankommt. Fortschritt nur im Terminal.
holen() {
  if command -v curl >/dev/null 2>&1; then
    if [ -t 2 ]; then fortschritt=--progress-bar; else fortschritt=-sS; fi
    curl -fL $fortschritt --retry 2 --connect-timeout 20 --speed-limit 1000 --speed-time 60 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 60 -O "$2" "$1"
  else
    echo "Weder curl noch wget gefunden. / Neither curl nor wget found."
    return 1
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    openssl dgst -sha256 "$1" | awk '{ print $NF }'
  fi
}

# Klappt der Download nicht: Eine vorige eigene Version tut es vorerst auch (Tweakable DJ braucht nur Version 18 oder neuer).
fehler() {
  rm -rf node/download
  echo "Node.js konnte nicht heruntergeladen werden. / Node.js could not be downloaded."
  [ -x node/current/bin/node ] && exit 0
  exit 1
}

# Reste vom letzten Tausch weg; eine schon geprüfte neue Version (node/new) jetzt einsetzen.
rm -rf node/old
passt node/new && tauschen
passt node/current && exit 0
[ -f "node/not-runnable-$name" ] && exit 2
[ "$1" = "--check" ] && exit 1

echo
echo "$message"
rm -rf node/download
mkdir -p node/download || fehler
holen "$url/SHASUMS256.txt" node/download/SHASUMS256.txt || fehler
holen "$url/$file" "node/download/$file" || fehler
expected=$(awk -v f="$file" '$2 == f { print $1; exit }' node/download/SHASUMS256.txt)
actual=$(sha256 "node/download/$file")
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "Die Prüfsumme der heruntergeladenen Datei stimmt nicht (SHASUMS256.txt). Die Datei wurde verworfen."
  echo "The checksum of the downloaded file does not match (SHASUMS256.txt). The file was discarded."
  fehler
fi
mkdir node/download/x || fehler
tar -xf "node/download/$file" -C node/download/x "$name/bin/node" "$name/LICENSE" || fehler
if ! passt "node/download/x/$name"; then
  echo "Das heruntergeladene Node.js läuft auf diesem Rechner nicht. / The downloaded Node.js does not run on this computer."
  : > "node/not-runnable-$name"
  fehler
fi
rm -rf node/new
mv "node/download/x/$name" node/new || fehler
rm -rf node/download
tauschen
if passt node/current; then
  echo "Node.js $version ist bereit. / Node.js $version is ready."
  echo
else
  echo "Die neue Version von Node.js gilt ab dem nächsten Start. / The new version of Node.js will be used from the next start."
fi
exit 0
