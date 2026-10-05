[English](README.md) · **Deutsch**

# Tweakable DJ for Spotify

**Dein persönlicher, einstellbarer DJ für Spotify – ohne Ansagen, mit mehr Abwechslung.**

Der KI-DJ von Spotify spricht zwischen den Songs, und seine Stimme lässt sich nicht abschalten. Tweakable DJ kommt ohne Ansagen aus: Er befüllt die Playlist **„Tweakable DJ“** mit einem Mix aus deinen Lieblingssongs und neuen Songs, die zu deinem Geschmack passen, am stärksten zu dem, was du gerade hörst.
Wie viel Abwechslung, wie viele Favoriten und wie oft derselbe Künstler vorkommt, stellst du selbst ein.
Die Oberfläche gibt es auf Deutsch und Englisch, umschaltbar oben rechts (DE | EN).

<p align="center"><img src="docs/screenshot-main.de.png" width="600" alt="Die Oberfläche von Tweakable DJ: Voreinstellungen wie Entdecken und Meine aktuelle Phase, die Einstellungen der Playlist mit Reglern und die Buttons Probelauf und Playlist neu erstellen"></p>

Tweakable DJ ist ein unabhängiges Projekt und kein offizielles Spotify-Produkt (mehr dazu in [Abschnitt 12](#12-datenquellen-marken-und-lizenz)).

> **Das brauchst du**
>
> - **Spotify Premium**. Tweakable DJ braucht eine eigene Spotify-App, und die erlaubt Spotify nur mit Premium.
> - Ein kostenloses **Last.fm-Konto**, das mit Spotify verbunden ist („Scrobbling“). Darüber kennt der DJ deinen Hörverlauf.
> - **Node.js 18 oder neuer** (kostenlos, <https://nodejs.org>)
> - Einen **PC oder Mac** mit Windows, macOS oder Linux. Tweakable DJ läuft dort, nicht im Internet.
> - Etwa **10 Minuten** für die [Einrichtung](#7-einrichtung-einmalig)
>
> Jede Person richtet Tweakable DJ mit ihrer **eigenen Spotify-App** ein. Spotify lässt pro App im Entwicklermodus höchstens 5 Nutzer zu. Deshalb ist Tweakable DJ kein Dienst zum Anmelden, sondern ein Werkzeug, das du bei dir selbst einrichtest.

**Inhalt**

1. [Schnellstart](#1-schnellstart)
2. [Wie alles zusammenhängt](#2-wie-alles-zusammenhängt)
3. [Was ist was im Ordner](#3-was-ist-was-im-ordner)
4. [So entsteht eine Playlist](#4-so-entsteht-eine-playlist)
5. [Regeln und Einstellungen](#5-regeln-und-einstellungen)
6. [Bedienung](#6-bedienung)
7. [Einrichtung (einmalig)](#7-einrichtung-einmalig)
8. [Aktualisieren](#8-aktualisieren)
9. [Deinstallieren](#9-deinstallieren)
10. [Probleme und Lösungen](#10-probleme-und-lösungen)
11. [Grenzen](#11-grenzen)
12. [Datenquellen, Marken und Lizenz](#12-datenquellen-marken-und-lizenz)

---

## 1. Schnellstart

Zum ersten Mal hier? Dann Tweakable DJ herunterladen, Node.js installieren und starten, wie in der [Einrichtung](#7-einrichtung-einmalig) beschrieben. Beim ersten Start führt dich ein Assistent durch den Rest (ca. 10 Minuten). Danach geht es jedes Mal so:

1. Tweakable DJ starten: Doppelklick auf **`Tweakable DJ.cmd`** (Windows) bzw. **`Tweakable DJ.command`** (Mac), unter Linux im Terminal `./start.sh`. Im Browser öffnet sich die Oberfläche mit Reglern.
2. Eine **Voreinstellung** wählen (z. B. „Entdecken“) oder die Regler selbst einstellen, dann auf **Probelauf** klicken. Der DJ zeigt, welche Songs er auswählen würde, und ändert nichts.
3. Passt die Auswahl, auf **Playlist neu erstellen** klicken. Nach etwa einer Minute ist „Tweakable DJ“ in Spotify neu befüllt.
4. In Spotify „Tweakable DJ“ anhören, am besten ohne Zufallswiedergabe, weil der DJ die Reihenfolge schon gemischt hat.

Das Konsolen- bzw. Terminalfenster, das sich dabei öffnet, muss offen bleiben, solange du die Oberfläche benutzt.

---

## 2. Wie alles zusammenhängt

![Wie Spotify, Last.fm, Tweakable DJ, die Oberfläche und die Dateien zusammenhängen](overview.de.svg)

Die Nummern zeigen die Reihenfolge eines Laufs:
① Lieblingssongs von Spotify lesen → ② Hörverlauf und ähnliche Songs von Last.fm holen → ③ nach deinen Regeln auswählen → ④ Songs auf Spotify suchen und „Tweakable DJ“ befüllen.

- **Spotify** liefert deine Lieblingssongs und bekommt die fertige Playlist. Empfehlungen und verwandte Künstler gibt Spotify seit November 2024 nicht mehr an neu angelegte Apps heraus, und seit Februar 2026 bekommen Apps im Entwicklermodus auch die Top-Songs eines Künstlers nicht mehr. Deshalb kommen die Vorschläge von Last.fm.
- **Last.fm** liefert zu jedem Song ähnliche Songs und kennt deinen Hörverlauf. Dafür ist dein Spotify-Konto mit Last.fm verbunden („Scrobbling“), und jeder gespielte Song wird dort erfasst.
- **Tweakable DJ** läuft auf deinem PC, holt die Daten von beiden Diensten, wählt nach deinen Regeln aus und schreibt das Ergebnis in die Playlist.
- **Die Oberfläche** ist eine Webseite, die nur auf deinem PC läuft (<http://127.0.0.1:8899>). Sie führt durch die Einrichtung, ändert die Einstellungen und startet den DJ.

„Tweakable DJ“ ist immer **dieselbe Playlist mit demselben Link**. Jeder Lauf ersetzt nur ihren Inhalt.

---

## 3. Was ist was im Ordner

**Zum Benutzen**

| Datei | Wozu | Anfassen? |
|---|---|---|
| `Tweakable DJ.cmd` | Startet die Oberfläche per Doppelklick (Windows) | ja, zum Starten |
| `Tweakable DJ.command` | Startet die Oberfläche per Doppelklick (Mac) | ja, zum Starten |
| `start.sh` | Startet die Oberfläche unter Linux (im Terminal `./start.sh`). Der Mac benutzt sie mit. | ja, zum Starten |
| `config.jsonc` | Alle Einstellungen, jede mit einer Erklärung in derselben Zeile. Außerdem die Zugangsdaten. Wird bei der Einrichtung angelegt. | ja: über die Oberfläche oder direkt im Editor |
| `README.de.md` | Diese Anleitung | lesen |
| `README.md` | Diese Anleitung auf Englisch | lesen |

**Programm** (nur ändern, wenn du weißt, was du tust)

| Datei | Wozu |
|---|---|
| `dj.mjs` | Der DJ selbst: steuert einen Lauf von Anfang bis Ende (Schritte in Abschnitt 4) |
| `lineup.mjs` | Die Auswahl- und Reihenfolge-Regeln: Auslosung, „3 aus 20“, Abstand, Vergleich von Songtiteln |
| `spotify.mjs` | Verbindung zu Spotify: Anmeldung, Lieblingssongs lesen, Songs suchen, Playlist schreiben |
| `lastfm.mjs` | Verbindung zu Last.fm: ähnliche Songs und Künstler, dein Hörverlauf |
| `config.mjs` | Liest und schreibt die `config.jsonc`, ohne die Kommentare zu zerstören |
| `i18n.mjs` | Alle Meldungen von Programm und Server auf Deutsch und Englisch (die Texte der Oberfläche stehen in `ui.html`) |
| `ui.mjs` | Kleiner Webserver für die Oberfläche; startet den DJ auf Knopfdruck |
| `ui.html` | Die Oberfläche selbst (Einrichtungs-Assistent, Regler, Buttons, Ausgabe), mit allen Texten auf Deutsch und Englisch |
| `schedule.mjs` | Die Automatik: trägt Tweakable DJ in den Zeitplaner deines Systems ein (Windows-Aufgabenplanung, macOS launchd, Linux cron) und liest den Stand aus |
| `update.mjs` | Prüft höchstens einmal am Tag, ob es auf GitHub eine neue Version gibt (siehe [Prüfung auf neue Versionen](#prüfung-auf-neue-versionen)) |
| `install-update.mjs` | Installiert eine neue Version, wenn du auf *Jetzt aktualisieren* klickst (siehe [Aktualisieren](#8-aktualisieren)) |
| `manifest.json` | Liste aller Programmdateien dieser Version mit Prüfsummen. *Jetzt aktualisieren* ersetzt nur Dateien, die dort stehen. Nur in der ZIP-Datei, nicht im GitHub-Repository. |
| `package.json` | Kurzbefehle für Entwickler: `npm start` (Oberfläche) und `npm test` (Tests). Tweakable DJ braucht keine zusätzlichen Pakete. |
| `tests/` | Automatische Tests für die Regeln, die Einstellungen, die Übersetzungen, die Automatik, die Prüfung auf neue Versionen und *Jetzt aktualisieren*, die Oberfläche und einen Probelauf, bei dem Spotify, Last.fm und GitHub nur simuliert werden. Nur im GitHub-Repository, nicht in der ZIP-Datei. |
| `config.example.de.jsonc` | Leere Vorlage der Einstellungen mit deutschen Erklärungen. Daraus wird bei der Einrichtung auf Deutsch deine `config.jsonc`. |
| `config.example.jsonc` | Dieselbe Vorlage mit englischen Erklärungen (für die Einrichtung auf Englisch) |
| `overview.de.svg`, `overview.en.svg` | Die Grafik in Abschnitt 2, auf Deutsch und Englisch |
| `docs/` | Bildschirmfotos der Oberfläche für diese Anleitung, auf Deutsch und Englisch |
| `LICENSE` | Die Lizenz (MIT), siehe Abschnitt 12 |
| `.gitignore` | Sorgt dafür, dass `config.jsonc`, `tokens.json`, `state.json`, `lastfm-cache.json`, die Dateien der Automatik, das Ergebnis der Prüfung auf neue Versionen und `.update/` nie mit hochgeladen werden |
| `.gitattributes` | Einheitliche Zeilenenden für Windows, Mac und Linux; kennzeichnet Bilder als binär. Nur im GitHub-Repository, nicht in der ZIP-Datei. |
| `.github/` | Vorlagen für Fehlermeldungen und Ideen, automatische Abläufe auf GitHub (z. B. die ZIP-Datei für neue Versionen). Nur im GitHub-Repository, nicht in der ZIP-Datei. |

**Automatisch angelegt** (nicht bearbeiten)

| Datei | Wozu |
|---|---|
| `tokens.json` | Deine Spotify-Anmeldung und wann du dich angemeldet hast. **Nicht weitergeben**, damit hätte jemand Zugriff auf deine Playlists. |
| `state.json` | Gedächtnis des DJ: welche Songs in den letzten Läufen drin waren, und welche Spotify-Suchen schon erledigt sind. Löschen setzt beides zurück. Das schadet nicht, der nächste Lauf dauert dann nur etwas länger. |
| `lastfm-cache.json` | Zwischengespeicherte Antworten von Last.fm (ähnliche Songs und Künstler), jeweils 7 Tage gültig. Macht Läufe schneller. Löschen schadet nicht. |
| `automatik.json` | Ergebnis des letzten automatischen Laufs (Zeit, ✓ oder Fehlergrund). Die Oberfläche zeigt es unter *Automatisch neu erstellen* an. |
| `automatik.log` | Die komplette Ausgabe des letzten automatischen Laufs, für die Fehlersuche |
| `update-check.json` | Ergebnis der letzten [Prüfung auf neue Versionen](#prüfung-auf-neue-versionen) (Zeit und neueste Version). Löschen schadet nicht. |
| `.update/` | Legt *Jetzt aktualisieren* an: die Sicherung der Programmdateien der vorigen Version (`backup-<Version>`). Löschen schadet nicht. |

`config.jsonc` enthält deine Client ID und deinen Last.fm-Schlüssel. Beides ist nicht sehr heikel, sollte aber trotzdem nicht öffentlich geteilt werden.

---

## 4. So entsteht eine Playlist

Die Zahlen sind die Standardwerte. Deine eigenen stehen in `config.jsonc` bzw. in der Oberfläche. „Lieblingssongs“ steht für die Quelle deiner Favoriten: Hast du dort eine deiner Playlists gewählt, tritt sie an ihre Stelle.

```
Lieblingssongs ──┐
Last.fm-Top-Songs┼─► 20 Ausgangspunkte ─► ~150–200 Kandidaten ─► neue Songs + Favoriten ─► Reihenfolge ─► „Tweakable DJ“
Aktuell gehört ──┘        (Los)               (Last.fm)              (Los + Regeln)           (Regeln)
```

1. **Ausschlüsse festlegen:** Was du in den letzten 14 Tagen gehört hast, was in den letzten 3 Läufen schon drin war und alles von Künstlern auf deiner Sperrliste kommt nicht hinein.
2. **Ausgangspunkte ziehen:** Aus deinen Lieblingssongs, deinen Last.fm-Top-Songs und dem, was du gerade hörst, werden 20 Songs gezogen. Hast du einen Song oder dessen Künstler gerade gehört, hat er ein 3× größeres Los.
3. **Kandidaten sammeln:** Last.fm liefert zu jedem Ausgangspunkt die 30 ähnlichsten Songs. Manchmal macht der DJ zusätzlich einen Abstecher zu einem verwandten Künstler, der etwas weiter weg ist. Bekannte Lieblingssongs und ausgeschlossene Songs fliegen raus. Antworten von Last.fm merkt sich der DJ 7 Tage lang, dann geht der nächste Lauf schneller.
4. **Favoriten auswählen:** 15 % der Playlist kommen aus deinen Lieblingssongs. Künstler, die du gerade hörst, werden bevorzugt.
5. **Neue Songs auslosen:** Die Kandidaten kommen in eine Lostrommel. Wie stark ähnliche Songs bevorzugt werden, bestimmt „Abenteuer“, wie stark aktuelles Hören zählt, bestimmt der Faktor. Jeder gezogene Song muss durch die Künstler-Limits und wird auf Spotify gesucht. Nur wenn Titel und Interpret passen, kommt er hinein.
6. **Reihenfolge festlegen:** Der DJ probiert bis zu 200 Reihenfolgen durch und nimmt die, die die Regeln am besten einhält.
7. **Playlist befüllen:** Der Inhalt von „Tweakable DJ“ wird ersetzt, und die neuen Songs werden als „schon gespielt“ gemerkt.

Zufall spielt in den Schritten 2 bis 6 mit, deshalb sieht jeder Lauf anders aus.

Songs, die du aus „Tweakable DJ“ mit dem Herz speicherst, werden zu neuen Lieblingssongs und damit ab dem nächsten Lauf auch zu Ausgangspunkten.

---

## 5. Regeln und Einstellungen

Jede Regel lässt sich in `config.jsonc` oder in der Oberfläche ändern. Der Name der Einstellung steht in Klammern. „Standard“ ist der Wert, den der DJ ohne eigene Einstellung verwendet.

„Erlaubt“ ist, was `config.jsonc` annimmt; Anzahlen, Tage und Läufe sind ganze Zahlen. Die Regler der Oberfläche decken den üblichen Bereich ab. Einen größeren Wert aus `config.jsonc` zeigen sie trotzdem richtig an und lassen ihn, wie er ist. Liegt ein Wert außerhalb des erlaubten Bereichs, markiert ihn die Oberfläche rot, und ein Lauf bricht mit einer Meldung ab, z. B. „size in config.jsonc muss eine ganze Zahl von 1 bis 500 sein (derzeit 0).“

**Was in die Playlist kommt**

| Regel | Standard | Erlaubt |
|---|---|---|
| Name der Playlist (`playlistName`). Gibt es sie nicht, wird sie angelegt. | Tweakable DJ | beliebiger Name |
| Quelle deiner Favoriten (`seed`): deine Lieblingssongs (`"liked"`) oder eine eigene bzw. gemeinsame Playlist. Daraus kommen die Favoriten und die meisten Ausgangspunkte. | Lieblingssongs | `"liked"` oder Link zu einer Playlist |
| Länge der Playlist (`size`) | 50 Songs | 1–500 |
| Anteil Favoriten (`familiarShare`). Der Rest sind neue Songs, die nicht in der Quelle deiner Favoriten sind. | 15 % (≈ 8 Songs) | 0–1 (`0.15` = 15 %) |
| Abenteuer (`adventure`): 0 = ähnliche Songs bevorzugen, 0,5 = egal, 1 = entfernte Songs bevorzugen. Bestimmt auch, bei wie vielen Ausgangspunkten der DJ zu verwandten Künstlern abschweift. | 0,4 | 0–1 |
| Ausgangspunkte pro Lauf (`seedsPerRun`) | 20 | 1–200 |
| Last.fm-Top-Songs der letzten 3 Monate zusätzlich als Ausgangspunkte (`useLastfmTopTracks`) | an | `true` oder `false` |

**Was du gerade hörst, zählt mehr**

| Regel | Standard | Erlaubt |
|---|---|---|
| „Aktuell“ ist alles, was du laut Last.fm in diesem Zeitraum gehört hast (`currentDays`). 0 = aus. | 7 Tage | 0–365 |
| Faktor für aktuelles Hören (`currentFactor`), 1 = aus. Bei Faktor 3 gilt Folgendes: | 3 | 1–100 |
| – Ein Ausgangspunkt wird 3× so oft gezogen, wenn du den Song oder seinen Künstler gerade hörst. Die aktuell gehörten Songs selbst sind ebenfalls Ausgangspunkte. | | |
| – Ein neuer Song, der über so einen Ausgangspunkt gefunden wurde, hat bei der Auslosung ein 3× so großes Los. | | |
| – Favoriten von Künstlern, die du gerade hörst, werden 3× so oft gewählt. | | |

In der Ausgabe sind solche Songs mit „· aktuell“ markiert (auf Englisch „· current“).

**Was nicht in die Playlist kommt**

| Regel | Standard | Erlaubt |
|---|---|---|
| Kürzlich gehört (`excludeRecentDays`): alles, was du laut Last.fm in diesem Zeitraum gehört hast. 0 = aus. | 14 Tage | 0–365 |
| Vorige Läufe (`noRepeatRuns`): Songs aus den letzten N Läufen. 0 = aus. | 3 Läufe | 0–100 |
| Sperrliste (`blockedArtists`): Künstler, die nie vorkommen, weder als Song noch als Ausgangspunkt noch als Abstecher. Es zählen ganze Wörter: „Macloud“ sperrt auch „Miksu / Macloud“ und „feat. Macloud“, aber „Rin“ sperrt nicht „Karin“. | keine | Liste von Namen |
| Songs, die auf Spotify nicht eindeutig gefunden werden (Titel und Interpret müssen passen). Zusätze wie „Remastered“ oder „feat.“ werden beim Vergleich ignoriert. | immer | |

**Wie oft derselbe Künstler vorkommt**

| Regel | Standard | Erlaubt |
|---|---|---|
| Pro Interpret höchstens N Songs in der ganzen Playlist (`maxPerArtist`) | 2 | 1–500 |
| In jeweils 20 aufeinanderfolgenden Songs höchstens 3 Songs zum selben Künstler (`artistWindow`, `maxPerWindow`). Mitgezählt werden Songs *von* ihm und neue Songs, die *über* ihn gefunden wurden (z. B. „neu, über Künstler X“). Bei 50 Songs sind das höchstens 8 pro Künstler. | 3 aus 20 | je 1–100 |
| Abstand zwischen zwei Songs desselben Interpreten (`artistGap`). 0 = aus. | mind. 4 Songs dazwischen | 0–50 |

**Wenn nicht alles gleichzeitig geht**

- Findet der DJ zu wenige neue Songs, füllt er mit weiteren Favoriten auf. Dabei können auch Favoriten dazukommen, die du kürzlich gehört hast oder die in den letzten Läufen drin waren.
- Bei der Reihenfolge hat „3 aus 20“ Vorrang vor dem Mindestabstand.
- Wird eine Regel trotzdem verletzt, zeigt der DJ eine Warnung (⚠).

**Sprache**

| Einstellung | Standard |
|---|---|
| Sprache der Oberfläche und der Ausgabe (`language`): `"de"` = Deutsch, `"en"` = Englisch, `""` = noch nicht gewählt. Gilt auch für automatische Läufe und das Terminal. | `""`: die Sprache des Browsers (Oberfläche) bzw. des Systems (Terminal, Automatik) |

---

## 6. Bedienung

### Mit der Oberfläche

Doppelklick auf `Tweakable DJ.cmd` (Windows) bzw. `Tweakable DJ.command` (Mac), unter Linux im Terminal `./start.sh`. Überall geht auch `node ui.mjs` im Terminal. Der Browser öffnet <http://127.0.0.1:8899>.
Beim allerersten Start fragt das System eventuell nach, siehe [Einrichtung](#7-einrichtung-einmalig), Schritt 3. Ist Tweakable DJ noch nicht eingerichtet, erscheint statt der Regler der Einrichtungs-Assistent.

- **Sprache** (oben rechts, **DE | EN**): schaltet die ganze Oberfläche sofort um, auch im Assistenten. Die Wahl wird in `config.jsonc` gespeichert (`language`) und gilt dann auch für Probelauf, Neuerstellung, automatische Läufe und das Terminal. Solange du nichts wählst, richtet sich die Oberfläche nach der Sprache deines Browsers.
- **Voreinstellungen**: Vier Buttons setzen alle Regel-Regler auf einmal:
  - *Entdecken*: viel Neues, auch weiter weg von deinem Geschmack
  - *Vertraut*: mehr Favoriten und sehr ähnliche Songs
  - *Meine aktuelle Phase*: richtet sich stark nach dem, was du gerade hörst
  - *Standard*: die Grundeinstellungen

  Name, Quelle, Anzahl Songs und Sperrliste bleiben dabei, wie sie sind. Passt deine Einstellung genau zu einer Voreinstellung, ist diese markiert.
- **Regler**: Jede Einstellung hat einen Regler, eine Erklärung und einen grünen Hinweis, was der Wert gerade bewirkt. Weicht ein Wert vom Standard ab, bringt „Standard: …“ ihn per Klick zurück. Einen Wert aus `config.jsonc` außerhalb des erlaubten Bereichs markiert die Oberfläche rot ([Regeln und Einstellungen](#5-regeln-und-einstellungen)).
- **Quelle deiner Favoriten**: Auswahlliste mit deinen Lieblingssongs und deinen Playlists. Zur Auswahl stehen nur Playlists, die dir gehören oder bei denen du mitarbeitest, weil Spotify nur deren Inhalt herausgibt.
- **Sperrliste**: Künstlernamen eintragen und auf *Hinzufügen* klicken. Mit × wieder entfernen.
- **Speichern / Verwerfen**: Änderungen werden erst mit *Speichern* in `config.jsonc` geschrieben.
- **Probelauf**: Zeigt die Auswahl an, ohne die Playlist zu ändern.
- **Playlist neu erstellen**: Befüllt „Tweakable DJ“ neu und zeigt danach einen Link zu Spotify.
- **Zugangsdaten ändern** (oben rechts): Öffnet den Einrichtungs-Assistenten mit deinen bisherigen Angaben.
- **Mit Spotify anmelden**: Erscheint, wenn die Spotify-Anmeldung bald abläuft oder abgelaufen ist. Spotify verlangt alle 6 Monate eine neue Anmeldung.
- **Automatisch neu erstellen**: *Aus*, *Täglich* oder *Wöchentlich*, dazu Uhrzeit und gegebenenfalls Wochentag. Beim *Speichern* trägt sich Tweakable DJ in den Zeitplaner deines Systems ein und erstellt die Playlist dann von selbst neu, auch wenn die Oberfläche geschlossen ist. Darunter stehen der nächste Lauf und das Ergebnis des letzten automatischen Laufs (✓ mit Anzahl Songs oder ✗ mit Grund). Was passiert, wenn der Rechner zur eingestellten Zeit aus ist:
  - Windows: Der Lauf wird beim nächsten Einschalten nachgeholt.
  - Mac: Der Lauf wird nach dem Aufwachen aus dem Ruhezustand nachgeholt, nach dem Ausschalten nicht.
  - Linux: Der Lauf entfällt.
- **Neue Version**: Gibt es eine neuere Version von Tweakable DJ, erscheint oben ein Hinweis mit Link zum Download und der Schaltfläche **Jetzt aktualisieren** (siehe [Aktualisieren](#8-aktualisieren)). Mit × blendest du ihn aus; er kommt erst bei der nächsten Version wieder. Ganz unten auf der Seite steht, welche Version du hast (z. B. *v0.1.0*). Mehr unter [Prüfung auf neue Versionen](#prüfung-auf-neue-versionen).

Beide Lauf-Buttons speichern vorher automatisch. Die Oberfläche ist nur auf deinem PC erreichbar, andere Geräte im Netzwerk und fremde Webseiten haben keinen Zugriff.

<p align="center"><img src="docs/screenshot-run.de.png" width="640" alt="Ergebnis eines Probelaufs: Tweakable DJ mit 50 Songs, davon 40 neu und 31 über aktuelles Hören gefunden, 10 Favoriten, darunter die Schritte des Laufs und die Liste der ausgewählten Songs"></p>

### Im Terminal

Im Ordner `tweakable-dj` ([so öffnest du dort ein Terminal](#terminal-im-ordner-öffnen)):

```
node dj.mjs          # Playlist neu befüllen
node dj.mjs --dry    # Probelauf: nur anzeigen, Playlist nicht ändern
node dj.mjs login    # bei Spotify (neu) anmelden
node dj.mjs --auto   # wie ein automatischer Lauf: schreibt zusätzlich automatik.log und automatik.json
node ui.mjs          # Oberfläche starten (auch: npm start)
node ui.mjs --no-browser   # dasselbe, ohne den Browser zu öffnen
npm test             # automatische Tests; Spotify, Last.fm und GitHub werden dabei nur simuliert
```

Die Ausgabe kommt in der Sprache aus `config.jsonc` (`language`), sonst in der Sprache des Systems. Drei Umgebungsvariablen helfen in Sonderfällen:

| Variable | Wirkung |
|---|---|
| `TWEAKABLE_DJ_LANG` | `de` oder `en`: Sprache der Ausgabe für diesen Aufruf, geht vor `language` |
| `TWEAKABLE_DJ_PORT` | Anderer Port für die Oberfläche statt 8899, z. B. wenn 8899 schon belegt ist |
| `TWEAKABLE_DJ_NO_UPDATE_CHECK` | `1`: nicht nach neuen Versionen suchen (siehe [Prüfung auf neue Versionen](#prüfung-auf-neue-versionen)) |

Beispiel unter macOS und Linux: `TWEAKABLE_DJ_LANG=en node dj.mjs --dry`. In der Windows-Eingabeaufforderung: zuerst `set TWEAKABLE_DJ_LANG=en`, dann `node dj.mjs --dry`.

Die übrigen Variablen musst du nicht selbst setzen: Die Startdateien setzen `TWEAKABLE_DJ_LAUNCHER=1` (dann startet die Oberfläche nach *Jetzt aktualisieren* von selbst neu), und die Tests verwenden `TWEAKABLE_DJ_TASK_NAME` und `TWEAKABLE_DJ_TASK_ARGS`, damit sie den echten Eintrag im Zeitplaner nie anfassen.

### Prüfung auf neue Versionen

Wenn du die Oberfläche öffnest, schaut Tweakable DJ **höchstens einmal am Tag** nach, ob eine neue Version erschienen ist. Dafür geht eine einzige Anfrage an die GitHub-Releases-API (`api.github.com`), die nach dem neuesten Release von Tweakable DJ fragt. **Persönliche Daten werden nicht gesendet**: keine Einstellungen, Zugangsdaten, Songs oder Kennungen. Die Antwort wird in `update-check.json` gemerkt; klappt die Prüfung nicht (z. B. offline), versucht sie es frühestens eine Stunde später wieder. Nur die Oberfläche prüft, nicht die Läufe im Terminal und nicht die Automatik. Sie zeigt nur einen Hinweis an und lädt oder installiert nie von selbst etwas; aktualisiert wird nur, wenn du auf *Jetzt aktualisieren* klickst (siehe [Aktualisieren](#8-aktualisieren)).

Abschalten lässt sich die Prüfung mit der Umgebungsvariablen `TWEAKABLE_DJ_NO_UPDATE_CHECK=1` vor dem Start:

- macOS und Linux: `TWEAKABLE_DJ_NO_UPDATE_CHECK=1 node ui.mjs`, oder dauerhaft mit `export TWEAKABLE_DJ_NO_UPDATE_CHECK=1` im Profil deiner Shell (z. B. `~/.zshrc` oder `~/.profile`)
- Windows: dauerhaft mit `setx TWEAKABLE_DJ_NO_UPDATE_CHECK 1` in der Eingabeaufforderung (einmalig), danach Tweakable DJ neu starten

---

## 7. Einrichtung (einmalig)

Diese Schritte machst du einmal, bevor du Tweakable DJ zum ersten Mal benutzt, und wieder, wenn du auf einen neuen Rechner umziehst. Das dauert etwa 10 Minuten.

1. **Tweakable DJ herunterladen**: Auf der GitHub-Seite von Tweakable DJ rechts auf *Releases* klicken. Bei der neuesten Version unter *Assets* die Datei `tweakable-dj-v….zip` herunterladen und entpacken (Windows: Rechtsklick → *Alle extrahieren*, Mac: Doppelklick). Den Ordner `tweakable-dj` an einen festen Platz legen, z. B. in *Dokumente*. Nicht direkt aus der ZIP-Datei heraus starten, sonst gehen deine Einstellungen verloren. (Wer git benutzt, kann das Repository stattdessen auch klonen.)
2. **Node.js** installieren (<https://nodejs.org>, Version 18 oder neuer). Weitere Pakete braucht der DJ nicht.
3. **Tweakable DJ starten**, wie im [Schnellstart](#1-schnellstart) beschrieben. Beim allerersten Mal fragt das System meist nach, weil die Datei aus dem Internet kommt:
   - **Windows**: Erscheint „Der Computer wurde durch Windows geschützt“, auf *Weitere Informationen* → *Trotzdem ausführen* klicken. Bei „Der Herausgeber konnte nicht verifiziert werden“ auf *Ausführen* klicken.
   - **Mac**: `Tweakable DJ.command` mit **Rechtsklick → Öffnen** starten und im Hinweis noch einmal *Öffnen* wählen. Bietet der Hinweis kein *Öffnen* an (neuere macOS-Versionen), ihn schließen und unter *Systemeinstellungen → Datenschutz & Sicherheit* weiter unten auf *Dennoch öffnen* klicken. Danach reicht ein Doppelklick.
   - **Linux**: In einem [Terminal im Ordner](#terminal-im-ordner-öffnen) `tweakable-dj` den Befehl `./start.sh` eingeben.
   - **Mac und Linux, wenn „keine Berechtigung“ oder „Permission denied“ erscheint**: Die Startdatei hat ihr Ausführen-Recht verloren (passiert z. B., wenn der Ordner über Windows kopiert wurde). In einem [Terminal im Ordner](#terminal-im-ordner-öffnen) `tweakable-dj` einmal `chmod +x "Tweakable DJ.command" start.sh` eingeben. Unter Linux geht es auch ohne das mit `sh start.sh`.
4. **Den Einrichtungs-Assistenten durchgehen.** Er erscheint im Browser von selbst, erklärt jeden Schritt mit Links und prüft deine Eingaben sofort. Oben rechts kannst du jederzeit zwischen Deutsch und Englisch wechseln.
   1. **Spotify-App anlegen** im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Wichtig ist die Redirect URI `http://127.0.0.1:8888/callback`, genau so und nicht mit `localhost` (der Assistent hat dafür einen Kopier-Button). Die **Client ID** trägst du im Assistenten ein. Das Client Secret wird nicht gebraucht.
   2. **Last.fm**: einen [API-Key anlegen](https://www.last.fm/api/account/create) (Callback URL leer lassen) und zusammen mit deinem Last.fm-Namen eintragen. *Prüfen* zeigt, ob beides stimmt und wie viele Scrobbles Last.fm schon von dir kennt. Steht dort 0, verbinde Spotify unter [last.fm → Einstellungen → Anwendungen](https://www.last.fm/settings/applications) mit Last.fm.
   3. **Mit Spotify anmelden**: Es öffnet sich eine Spotify-Seite, dort zustimmen.
   4. **Quelle deiner Favoriten** wählen: deine Lieblingssongs oder eine deiner Playlists.
   5. **Fertig**: Die Regler erscheinen, und du kannst den ersten Probelauf starten.

   Dabei legt der Assistent die Datei `config.jsonc` selbst an, mit Erklärungen in der Sprache, die du gerade eingestellt hast. Später erreichst du ihn über *Zugangsdaten ändern* oben rechts.

   <p align="center"><img src="docs/screenshot-setup.de.png" width="560" alt="Schritt 1 des Einrichtungs-Assistenten: Spotify-App anlegen, mit der Redirect URI, einem Kopieren-Button und einem Feld für die Client ID; darunter die Schritte 2 bis 5"></p>

**Ohne Oberfläche einrichten** (für alle, die lieber im Terminal arbeiten):

1. `config.example.de.jsonc` (deutsche Erklärungen) oder `config.example.jsonc` (englische Erklärungen) als `config.jsonc` kopieren und eintragen:
   - `spotify.clientId`
   - `lastfm.apiKey`
   - `lastfm.user`: dein Last.fm-Name
   - `seed`: `"liked"` für die Lieblingssongs mit dem Herz, oder der Link zu einer eigenen Playlist
   - `language`: `"de"` oder `"en"` (leer lassen = Sprache des Systems)
2. `node dj.mjs login` ausführen und im Browser zustimmen.

<a id="terminal-im-ordner-öffnen"></a>**Terminal im Ordner öffnen**

- Windows: im Ordner `tweakable-dj` oben in die Adresszeile `cmd` tippen und Enter drücken
- Mac: das Programm *Terminal* öffnen, `cd ` (mit Leerzeichen) tippen, den Ordner `tweakable-dj` ins Fenster ziehen und Enter drücken
- Linux: im Dateimanager im Ordner Rechtsklick → *Im Terminal öffnen*

---

## 8. Aktualisieren

Gibt es eine neue Version, erscheint oben in der Oberfläche ein Hinweis. Bei beiden Wegen bleiben **deine persönlichen Dateien genau so, wie sie sind**: `config.jsonc` (Einstellungen, Client ID, Last.fm-Schlüssel und -Benutzername), `tokens.json` (Spotify-Anmeldung), `state.json` (Verlauf), `lastfm-cache.json` und die Dateien der Automatik. Sie sind nicht in der ZIP-Datei, und ein Update schreibt sie nie.

**Mit der Schaltfläche**

1. Im Hinweis auf **Jetzt aktualisieren** klicken. Tweakable DJ zeigt, welche Version du bekommst, mit Link zu den Versionshinweisen.
2. Auf **Aktualisieren** klicken. Tweakable DJ lädt die neue Version von GitHub, prüft jede Datei anhand ihrer Prüfsumme (SHA-256), sichert die Dateien, die es ersetzt, nach `.update/backup-<alte Version>` und kopiert dann die neuen hinein.
3. Tweakable DJ startet von selbst neu, und die Seite lädt sich mit der neuen Version neu. Hast du es mit `node ui.mjs` im Terminal statt mit einer Startdatei gestartet, starte es selbst noch einmal; die Seite lädt sich dann von selbst neu.

Das Update schreibt nur die Programmdateien, die im Release stehen (`manifest.json`), und löscht nichts außerhalb von `.update/` (dort behält es nur die Sicherung des letzten Updates). Passt eine Datei nicht zu ihrer Prüfsumme, ändert es gar nichts; geht beim Kopieren etwas schief, holt es automatisch die alte Version zurück. Während eines Probelaufs, einer Neuerstellung, eines automatischen Laufs oder einer Spotify-Anmeldung startet es nicht. Die Automatik läuft danach weiter, weil der Ordner derselbe bleibt.

**Von Hand**

1. Die ZIP-Datei `tweakable-dj-v….zip` der neuen Version unter *Releases* auf GitHub herunterladen (wie in der [Einrichtung](#7-einrichtung-einmalig), Schritt 1) und das Fenster von Tweakable DJ schließen.
2. Die ZIP-Datei **über deinen bisherigen Ordner `tweakable-dj`** entpacken und die Dateien ersetzen:
   - Windows: Rechtsklick auf die ZIP-Datei → *Alle extrahieren*, als Ziel den Ordner wählen, **in dem** dein Ordner `tweakable-dj` liegt (z. B. *Dokumente*), und *Dateien im Ziel ersetzen* bestätigen.
   - Mac und Linux: im Terminal `unzip -o ~/Downloads/tweakable-dj-v….zip -d <Ordner, in dem tweakable-dj liegt>`. Den neuen Ordner im Finder nicht auf den alten ziehen: Der Finder ersetzt dann den ganzen Ordner, samt deinen persönlichen Dateien.
3. Tweakable DJ wie gewohnt starten. (Mac: Beim ersten Start ist eventuell wieder Rechtsklick → *Öffnen* nötig.)

Deine persönlichen Dateien sind nicht in der ZIP-Datei und bleiben deshalb, wie sie sind; die Automatik läuft weiter, weil der Ordner derselbe bleibt. **Nicht in einen neuen Ordner entpacken** und dann diesen verwenden: Dort fehlen deine Einstellungen und die Anmeldung, und die Automatik zeigt weiter auf den alten Ordner. Willst du doch in einen neuen Ordner umziehen, kopiere `config.jsonc`, `tokens.json`, `state.json` und `lastfm-cache.json` aus dem alten in den neuen Ordner, starte Tweakable DJ von dort und klicke einmal *Automatik speichern*.

**Mit git**: Hast du das Repository geklont, im Ordner `git pull` ausführen. Deine persönlichen Dateien stehen in `.gitignore`, git fasst sie also nicht an. In einem git-Ordner bietet die Oberfläche *Jetzt aktualisieren* nicht an.

---

## 9. Deinstallieren

1. **Zuerst die Automatik ausschalten:** In der Oberfläche *Automatisch neu erstellen* auf *Aus* stellen und *Speichern* klicken. Damit verschwindet der Eintrag aus dem Zeitplaner deines Systems.
2. Das Fenster von Tweakable DJ schließen und den Ordner `tweakable-dj` löschen. Deine persönlichen Dateien (Einstellungen, Spotify-Anmeldung, Verlauf) sind damit auch weg.
3. Wenn du magst: die Playlist in Spotify löschen (standardmäßig „Tweakable DJ“) und deine Spotify-App im [Spotify-Dashboard](https://developer.spotify.com/dashboard).

**Löschst du den Ordner, während die Automatik noch an ist**, bleibt der Eintrag im Zeitplaner. Er startet weiter zur eingestellten Zeit, aber jeder Lauf scheitert unbemerkt, weil der Ordner fehlt, und die Playlist wird nicht mehr neu erstellt. Den Eintrag kannst du von Hand entfernen:

- **Windows:** die *Aufgabenplanung* öffnen, links *Aufgabenplanungsbibliothek* anklicken, Rechtsklick auf *Tweakable DJ* → *Löschen*. Oder in der Eingabeaufforderung: `schtasks /Delete /TN "Tweakable DJ" /F`
- **macOS:** im Terminal:
  ```sh
  launchctl bootout gui/$(id -u)/io.github.tweakable-dj.auto
  rm ~/Library/LaunchAgents/io.github.tweakable-dj.auto.plist
  ```
- **Linux:** im Terminal `crontab -e` ausführen und die Zeile mit `tweakable-dj-auto` löschen.

Es gibt immer nur einen Eintrag: Er hat stets denselben Namen, egal aus welchem Ordner er stammt. Installierst du Tweakable DJ später in einem anderen Ordner neu, zeigt die Oberfläche „Die Automatik zeigt noch auf einen anderen Ordner“, und Speichern ersetzt den Eintrag. Einen zweiten gibt es nie.

---

## 10. Probleme und Lösungen

| Meldung / Problem | Lösung |
|---|---|
| „Spotify-Anmeldung abgelaufen“ | Spotify verlangt alle 6 Monate eine neue Anmeldung: in der Oberfläche auf *Mit Spotify anmelden* klicken (oder `node dj.mjs login`). Die Oberfläche erinnert etwa 10 Tage vorher daran. |
| „Noch nicht bei Spotify angemeldet“ | `tokens.json` fehlt: in der Oberfläche auf *Mit Spotify anmelden* klicken (oder `node dj.mjs login`) |
| „Spotify verweigert den Zugriff (403)“ | Der Besitzer der Spotify-App braucht Premium (Pflicht im Entwicklermodus). Nutzt jemand anderes deine App, muss sein Konto im [Spotify-Dashboard](https://developer.spotify.com/dashboard) unter *User Management* eingetragen sein. |
| Spotify-Seite zeigt „INVALID_CLIENT: Invalid client“ | Die Client ID stimmt nicht: über *Zugangsdaten ändern* neu aus dem Dashboard kopieren |
| Spotify-Seite zeigt „INVALID_CLIENT: Invalid redirect URI“ | Im Dashboard unter *Settings* muss als Redirect URI genau `http://127.0.0.1:8888/callback` stehen (mit *Add* hinzufügen und speichern) |
| „Port 8888 ist belegt“ | Es läuft schon eine Anmeldung, z. B. in einem Terminal. Diese beenden und noch einmal versuchen. |
| „Der Last.fm-API-Key ist ungültig“ | Über *Zugangsdaten ändern* den Key neu von Last.fm kopieren: das Feld *API key*, nicht *Shared secret* |
| „Den Last.fm-Benutzer … gibt es nicht“ | Schreibweise des Last.fm-Namens über *Zugangsdaten ändern* prüfen |
| „Last.fm hat … keine Scrobbles“ | Spotify ist vermutlich nicht mit Last.fm verbunden: unter [last.fm → Einstellungen → Anwendungen](https://www.last.fm/settings/applications) verbinden. Bis dahin greifen die Regeln zum aktuellen Hören nicht. |
| „config.jsonc ist fehlerhaft“ | Meist fehlt ein Komma am Zeilenende oder es ist eines zu viel (nach dem letzten Eintrag darf keines stehen) |
| „… in config.jsonc muss eine ganze Zahl von … bis … sein“ | Ein Wert in `config.jsonc` wurde von Hand geändert und liegt außerhalb des erlaubten Bereichs ([Regeln und Einstellungen](#5-regeln-und-einstellungen)). Dort korrigieren oder in der Oberfläche den Regler einstellen und speichern. |
| „Die Quelle deiner Favoriten (Playlist) ist leer oder nicht lesbar“ | Spotify gibt nur Playlists heraus, die dir gehören oder bei denen du mitarbeitest. In der Oberfläche unter *Quelle deiner Favoriten* eine Playlist aus der Liste wählen, dort stehen nur lesbare. |
| „Es läuft bereits ein Durchgang“ | Warten, bis der laufende Probelauf oder die Neuerstellung fertig ist (ca. 1 Minute) |
| „Update fehlgeschlagen: …“ | Die Meldung sagt, ob nichts geändert oder die alte Version wiederhergestellt wurde. Später noch einmal versuchen oder von Hand aktualisieren ([Aktualisieren](#8-aktualisieren)). |
| Oberfläche öffnet sich nicht / Seite nicht erreichbar | Das Konsolen- bzw. Terminalfenster von Tweakable DJ wurde geschlossen: Tweakable DJ noch einmal starten |
| „Node.js wurde nicht gefunden“, „Node.js ist nicht installiert“ oder „Der Befehl "node" ist entweder falsch geschrieben oder konnte nicht gefunden werden“ | Node.js installieren ([Einrichtung](#7-einrichtung-einmalig), Schritt 2) und Tweakable DJ neu starten. Klappt es dann immer noch nicht, einmal ab- und wieder anmelden. |
| „Node.js ist zu alt“ oder „Tweakable DJ braucht Node.js 18 oder neuer“ | Die neueste Version von <https://nodejs.org> installieren |
| Mac: „… kann nicht geöffnet werden, da es von einem nicht verifizierten Entwickler stammt“ | Beim ersten Mal mit Rechtsklick → *Öffnen* starten ([Einrichtung](#7-einrichtung-einmalig), Schritt 3) |
| Mac/Linux: „keine Berechtigung“, „Permission denied“ oder „Zugriffsrechte fehlen“ | Einmal `chmod +x "Tweakable DJ.command" start.sh` im Ordner `tweakable-dj` ausführen ([Einrichtung](#7-einrichtung-einmalig), Schritt 3) |
| Warnung ⚠ „Regel … ließ sich nicht überall einhalten“ | Die Regeln sind zu streng für die gefundenen Songs, z. B. „1 aus 20“ bei 50 Songs. Eine Regel lockern. |
| Viele Songs über denselben Künstler | Last.fm liefert zu manchen Künstlern und Genres viel mehr ähnliche Songs als zu anderen. „Songs pro Künstler im Fenster“ verringern. |
| Aktuelles Hören wird kaum berücksichtigt | Prüfen, ob Last.fm dein Hören erfasst (last.fm → dein Profil). Faktor erhöhen. |
| Ein bestimmter Song wird nie gefunden | Findet Spotify einen Song nicht, merkt sich der DJ das in `state.json` (Suchfehler, z. B. ohne Internet, werden nicht gemerkt). `state.json` löschen, dann wird neu gesucht. |
| Ähnliche Songs sollen frisch von Last.fm kommen | `lastfm-cache.json` löschen. Sonst nutzt der DJ Antworten von Last.fm bis zu 7 Tage lang weiter. |
| Die Automatik ist nicht gelaufen | Unter *Automatisch neu erstellen* steht der Grund des letzten Laufs. Häufige Ursachen: Der Rechner war aus (siehe [Bedienung](#mit-der-oberfläche)), oder die Spotify-Anmeldung ist abgelaufen (dann auf *Mit Spotify anmelden* klicken). Details stehen in `automatik.log`. |
| „Die Automatik zeigt noch auf einen anderen Ordner“ | Der Ordner wurde verschoben oder kopiert. Einmal *Automatik speichern* klicken, dann zeigt der Eintrag im Zeitplaner wieder auf den richtigen Ordner. |
| „Im Zeitplaner steht noch ein Eintrag unter dem alten Namen …“ | Die Automatik wurde noch unter dem früheren Namen eingetragen. Einmal *Automatik speichern* (bzw. *Eintrag entfernen*, wenn die Automatik aus ist) klicken, dann ersetzt Tweakable DJ den alten Eintrag. |
| Oberfläche oder Ausgabe in der falschen Sprache | Oben rechts **DE** oder **EN** wählen. Das speichert `language` in `config.jsonc` und gilt ab dem nächsten Lauf auch für die Automatik und das Terminal. |
| Ordner löschen oder verschieben | Vorher die Automatik auf *Aus* stellen und speichern. Sonst bleibt ein Eintrag im Zeitplaner zurück, der ins Leere läuft ([Deinstallieren](#9-deinstallieren)). |

---

## 11. Grenzen

- **Kein Endlos-Modus:** Die Playlist hat eine feste Länge. Ist sie durchgespielt, übernimmt Spotifys Autoplay (falls eingeschaltet), das deine Regeln nicht kennt. Für neue Songs „Playlist neu erstellen“ klicken.
- **Die Automatik braucht deinen Rechner:** Tweakable DJ läuft auf deinem PC oder Mac, nicht im Internet. Zur eingestellten Zeit muss der Rechner an sein. Verpasste Läufe holt Windows beim nächsten Einschalten nach, der Mac nur nach dem Ruhezustand, Linux gar nicht. Auf einem echten Mac ist die Automatik noch nicht getestet.
- **Große Sammlungen:** Von deinen Lieblingssongs verwendet der DJ die 1.000, die du zuletzt gespeichert hast.
- **Hörverlauf:** Pro Lauf holt der DJ höchstens die 1.000 neuesten Scrobbles von Last.fm, und zwar aus dem längeren der beiden Zeiträume `excludeRecentDays` und `currentDays` (standardmäßig 14 Tage). Hörst du mehr, fehlen die ältesten Tage dieses Zeitraums: Songs aus diesen Tagen werden nicht als kürzlich gehört gesperrt und zählen nicht als aktuelles Hören. Mit den Standardeinstellungen betrifft das das Sperren von kürzlich Gehörtem (14 Tage) ab etwa 70 Songs am Tag, „aktuell“ (7 Tage) erst ab etwa 140 am Tag. Bei langen Zeiträumen (z. B. `excludeRecentDays` 90) ist die Grenze viel früher erreicht. Die Zeile „… Scrobbles, …“ in der Ausgabe zeigt, wie viele geholt wurden; bei 1.000 ist die Grenze erreicht.
- **Spotify-Vorgaben:** Die Spotify-App läuft im Entwicklermodus. Dafür braucht der Besitzer ein Premium-Konto, und höchstens 5 Personen dürfen die App nutzen.
- **Last.fm als Quelle:** Wie gut die Vorschläge sind, hängt davon ab, wie viele Daten Last.fm zu einem Song hat. Bei sehr neuen oder wenig bekannten Songs findet Last.fm oft nichts Ähnliches. Ähnliche Songs und Künstler speichert der DJ 7 Tage zwischen, so wie Last.fm es verlangt. Neue Daten von Last.fm kommen deshalb mit bis zu einer Woche Verzögerung an. Dein Hörverlauf wird dagegen immer frisch abgefragt.
- **Zwei Sprachen:** Oberfläche, Meldungen und Ausgabe gibt es auf Deutsch und Englisch. Namen von Songs, Künstlern und Playlists bleiben, wie sie bei Spotify und Last.fm heißen.

---

## 12. Datenquellen, Marken und Lizenz

**Spotify**

- **Tweakable DJ ist kein offizielles Spotify-Produkt.** Es ist ein unabhängiges Projekt. Es ist nicht mit Spotify verbunden und wird von Spotify weder unterstützt noch geprüft.
- Spotify ist eine Marke von Spotify AB. Der Name steht hier nur, um zu sagen, mit welchem Dienst Tweakable DJ zusammenarbeitet.
- Lieblingssongs, Songsuche und Playlist laufen über die [Spotify Web API](https://developer.spotify.com/documentation/web-api) und deine eigene Spotify-App. Dafür gelten die [Nutzungsbedingungen für Entwickler](https://developer.spotify.com/terms), denen du beim Anlegen der App zustimmst.

**Last.fm**

- **Ähnliche Songs, ähnliche Künstler und dein Hörverlauf stammen von [Last.fm](https://www.last.fm)** (powered by AudioScrobbler).
- Die [Last.fm-API](https://www.last.fm/api) darf laut ihren [Nutzungsbedingungen](https://www.last.fm/api/tos) **nur nicht kommerziell** genutzt werden. Jeder Nutzer verwendet seinen eigenen API-Key und ist selbst dafür verantwortlich, diese Bedingungen einzuhalten.
- Tweakable DJ ist ein unabhängiges Projekt und nicht mit Last.fm verbunden.

**Lizenz**

- Der Code steht unter der **MIT-Lizenz** (siehe [`LICENSE`](LICENSE)). Du darfst ihn frei verwenden, ändern und weitergeben. Die Lizenz gilt nur für den Code, nicht für die Daten von Last.fm oder Spotify.
