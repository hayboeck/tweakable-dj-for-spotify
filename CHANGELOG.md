# Changelog

All notable changes to Tweakable DJ for Spotify, newest first. Each version has an English and a German section.
Alle wichtigen Änderungen an Tweakable DJ for Spotify, die neueste Version zuerst – jeweils auf Englisch und auf Deutsch.

## [Unreleased]

### English

**New**

- **No Node.js installation needed**: on the first start, Tweakable DJ downloads its own Node.js (version 24 LTS; about 40 MB on Windows, 55 MB on Mac, 30 MB on Linux) from nodejs.org into the subfolder `node`, checks it against the published SHA-256 checksum and uses it from then on – without admin rights and without changing anything on your system. Only if the download fails (e.g. offline) does it use an installed Node.js 18 or newer. Started from the shortcut, a window (Windows) or a notification (Mac, Linux) shows the one-time download.
- Automatic runs and the second shortcut use the same Node.js; a scheduler entry that still points to an installed Node.js is switched over at the next start. A later version can name a newer Node.js (`node-version.txt`); the next start then downloads it and removes the old one. *Update now* never touches the folder `node`, and deleting the Tweakable DJ folder removes it too.
- **Second shortcut reports back right away**: double-clicking *Tweakable DJ – Rebuild playlist* now shows a notification at once (*Rebuilding playlist “Tweakable DJ” …*), not only at the end. If Node.js has to be downloaded first, that is shown too.
- **README: Smart App Control**: a note at the top for Windows 11, where Smart App Control can block the start files, with how to turn it off and what that means.

### Deutsch

**Neu**

- **Keine Installation von Node.js mehr nötig**: Beim ersten Start lädt Tweakable DJ ein eigenes Node.js (Version 24 LTS; unter Windows ca. 40 MB, Mac ca. 55 MB, Linux ca. 30 MB) von nodejs.org in den Unterordner `node`, prüft es mit der veröffentlichten SHA-256-Prüfsumme und nimmt ab dann dieses – ohne Adminrechte und ohne etwas am System zu ändern. Nur wenn der Download nicht klappt (z. B. offline), nimmt es ein installiertes Node.js ab Version 18. Beim Start über die Verknüpfung zeigt ein Fenster (Windows) bzw. eine Benachrichtigung (Mac, Linux) den einmaligen Download.
- Automatik und zweite Verknüpfung nutzen dasselbe Node.js; ein Eintrag im Zeitplaner, der noch auf ein installiertes Node.js zeigt, wird beim nächsten Start umgestellt. Eine spätere Version kann ein neueres Node.js festlegen (`node-version.txt`); der nächste Start lädt es dann und räumt das alte weg. *Jetzt aktualisieren* fasst den Ordner `node` nie an, und wer den Ordner von Tweakable DJ löscht, entfernt es mit.
- **Zweite Verknüpfung meldet sich sofort**: Ein Doppelklick auf *Tweakable DJ – Playlist neu erstellen* zeigt jetzt gleich eine Benachrichtigung (*Playlist „Tweakable DJ“ wird neu erstellt …*), nicht erst am Ende. Muss vorher Node.js geladen werden, wird auch das angezeigt.
- **README: Smart App Control**: ein Hinweis ganz oben für Windows 11, wo Smart App Control die Startdateien blockieren kann – wie man sie abschaltet und was das bedeutet.

## [0.3.3] – 2026-10-08

### English

**Fixed**

- **Nothing is written twice**: a double click on *Overwrite …* or *Create new playlist*, or a click in a second tab at the same moment, could start two runs – the playlist was written twice or two new playlists were created. Now only one runs; the other click is ignored or waits.
- **The page knows when something is running**: after reloading the page during a run, or in a second tab, it used to show *Saved* with active buttons. Now it shows *Running …*, locks the buttons, shows the output as it comes and afterwards the result (with *Overwrite …* or *Restore previous playlist*). Creating, overwriting and importing also wait for a running automatic run.
- **History is kept when runs overlap**: a run (e.g. an automatic one next to one from the interface) no longer writes back the `state.json` it read at its start. The history for *Block previous runs*, the remembered playlist ID and the login reminder of the other run stay. Personal files are now written in one step (temporary file, then rename).

**Changed**

- **“New in” after skipping versions**: after an update over several versions (e.g. from 0.2.5), the notice shows *New since v0.2.5* with the main points of every version in between, newest first.
- **Second shortcut renamed**: it is now called *Tweakable DJ – Rebuild playlist* (German *Tweakable DJ – Playlist neu erstellen*), so it can’t be confused with *Create new playlist*. An existing one gets the new name at the next start.
- **Update removes outdated files**: *Update now* deletes program files of earlier versions that no longer exist (e.g. old screenshots) – only if they are exactly as published, backed up first. Files you changed, your own files and personal files stay.

**Also fixed**

- **Clear message without internet**: if Spotify or Last.fm can’t be reached, the output says so (*Spotify can’t be reached … Check your internet connection*) instead of *fetch failed*, and a hanging connection ends after 30 seconds instead of showing *Running …* for minutes. Without Last.fm, a run warns once and continues with your favorites.
- **Spotify login refreshed only once**: several requests at the same time (e.g. the searches of an import) no longer refresh the login each on their own; a refresh by another run is picked up.
- **Save playlist and archive find the playlist by its ID**, like writing already did; after an import, the playlist ID is remembered too.
- **config.jsonc saved as “UTF-8 with BOM”** (some editors, PowerShell 5.1) is no longer reported as invalid.
- Sliders moved while saving (with a schedule, saving takes a few seconds) no longer count as saved.
- An import preview is dropped when the playlist is renamed, and the import refuses to write into a playlist renamed in another tab.
- No Spotify login starts during a run.
- Error lines in the output are red in French too.
- The second shortcut is only checked at start when it is switched on (fewer background processes on Windows).
- Texts: no more *Saving as a new playlist* or *apply*; *Details for experts* named in full; Spanish *archivo de playlists* for the archive (*historial* is the listening history); French *paramètres* for settings; typographic quotes around names in all messages; the login lasts *180 days (about 6 months)* everywhere.
- The page is served with a Content-Security-Policy and without a referrer; a release is only published when the tests pass; new browser tests for the main flows.

### Deutsch

**Behoben**

- **Nichts wird doppelt geschrieben**: Ein Doppelklick auf *„…“ überschreiben* bzw. *Neue Playlist anlegen* oder ein Klick im zweiten Tab im selben Moment konnte zwei Läufe starten – die Playlist wurde doppelt geschrieben oder zwei neue angelegt. Jetzt läuft nur einer; der andere Klick wird übergangen bzw. wartet.
- **Die Seite weiß, wenn etwas läuft**: Nach dem Neuladen während eines Laufs oder in einem zweiten Tab stand bisher *Gespeichert* bei aktiven Knöpfen. Jetzt zeigt sie *Läuft …*, sperrt die Knöpfe, zeigt die Ausgabe mit und danach das Ergebnis (mit *„…“ überschreiben* bzw. *Vorige Playlist wiederherstellen*). Erstellen, Überschreiben und Import warten auch auf einen laufenden automatischen Lauf.
- **Der Verlauf bleibt, wenn sich Läufe überschneiden**: Ein Lauf (z. B. ein automatischer neben einem aus der Oberfläche) schreibt nicht mehr die `state.json` zurück, die er am Anfang gelesen hat. Verlauf für *Vorige Läufe sperren*, gemerkte Playlist-ID und Erinnerung des anderen Laufs bleiben. Persönliche Dateien werden jetzt in einem Schritt geschrieben (Zwischendatei, dann umbenennen).

**Geändert**

- **„Neu in“ nach übersprungenen Versionen**: Nach einem Update über mehrere Versionen (z. B. von 0.2.5) zeigt der Hinweis *Neu seit v0.2.5* mit den wichtigsten Punkten jeder Version dazwischen, die neueste zuerst.
- **Zweite Verknüpfung umbenannt**: Sie heißt jetzt *Tweakable DJ – Playlist neu erstellen* (englisch *Tweakable DJ – Rebuild playlist*) und lässt sich nicht mehr mit *Neue Playlist anlegen* verwechseln. Eine vorhandene bekommt beim nächsten Start den neuen Namen.
- **Update räumt überholte Dateien auf**: *Jetzt aktualisieren* löscht Programmdateien früherer Versionen, die es nicht mehr gibt (z. B. alte Screenshots) – nur, wenn sie genau so aussehen wie veröffentlicht, und vorher gesichert. Von dir geänderte, eigene und persönliche Dateien bleiben.

**Außerdem behoben**

- **Klare Meldung ohne Internet**: Ist Spotify oder Last.fm nicht erreichbar, steht das in der Ausgabe (*Spotify ist nicht erreichbar … Prüfe die Internetverbindung*) statt *fetch failed*, und eine hängende Verbindung endet nach 30 Sekunden, statt minutenlang *Läuft …* zu zeigen. Ohne Last.fm warnt ein Lauf einmal und macht mit deinen Favoriten weiter.
- **Spotify-Anmeldung wird nur einmal erneuert**: Mehrere Anfragen gleichzeitig (z. B. die Suchen eines Imports) erneuern die Anmeldung nicht mehr jede für sich; erneuert ein anderer Lauf, wird das übernommen.
- **Playlist speichern und das Archiv finden die Playlist über ihre ID**, wie es das Schreiben schon tat; nach einem Import wird die ID ebenfalls gemerkt.
- **config.jsonc als „UTF-8 mit BOM“ gespeichert** (manche Editoren, PowerShell 5.1) gilt nicht mehr als fehlerhaft.
- Regler, die man während des Speicherns verstellt (mit Automatik dauert es ein paar Sekunden), gelten nicht mehr als gespeichert.
- Die Vorschau eines Imports wird beim Umbenennen der Playlist verworfen, und der Import schreibt nicht in eine Playlist, die in einem anderen Tab umbenannt wurde.
- Während eines Laufs startet keine Spotify-Anmeldung.
- Fehlerzeilen in der Ausgabe sind auch auf Französisch rot.
- Die zweite Verknüpfung wird beim Start nur geprüft, wenn sie eingeschaltet ist (weniger Hintergrundprozesse unter Windows).
- Texte: kein *Übernehmen* bzw. *Durchgang* mehr (jetzt *überschreiben*, *Lauf*); *Details für Fortgeschrittene* ausgeschrieben; Spanisch *archivo de playlists* für das Archiv (*historial* ist der Hörverlauf); Französisch *paramètres* für die Einstellungen; typografische Anführungszeichen um Namen in allen Meldungen; die Anmeldung gilt überall *180 Tage (rund 6 Monate)*.
- Die Seite kommt mit einer Content-Security-Policy und ohne Referrer; ein Release wird nur veröffentlicht, wenn die Tests grün sind; neue Browser-Tests für die Hauptabläufe.

## [0.3.2] – 2026-10-08

### English

**New**

- **Legend below the output**: a small line below the list explains the colors – the accent color (named as chosen, e.g. *Green* or *Blue*) = matches what you’re listening to now (*· current*), others = favorites and other new songs, struck through = blocked (×), ♥ = in your Liked Songs.

**Changed**

- **Fewer controls under “Selection”**: *Starting points per run* and *Include Last.fm top songs* are now folded away under *Details for experts* (view *Pro*), like the details of *Artist variety*.

**Fixed**

- Songs that match your current listening are now green in Spanish and French too (*· actual*, *· actuel*); until now only in German and English.

### Deutsch

**Neu**

- **Legende unter der Ausgabe**: Eine kleine Zeile unter der Liste erklärt die Farben – die Akzentfarbe (mit ihrem Namen, z. B. *Grün* oder *Blau*) = passt zu dem, was du gerade hörst (*· aktuell*), sonst Favoriten und übrige neue Songs, durchgestrichen = gesperrt (×), ♥ = in deinen Lieblingssongs.

**Geändert**

- **Weniger Regler unter „Auswahl“**: *Ausgangspunkte pro Lauf* und *Last.fm-Top-Songs einbeziehen* stehen jetzt eingeklappt unter *Details für Fortgeschrittene* (Ansicht *Pro*), wie bei *Abwechslung bei Künstlern*.

**Behoben**

- Songs, die zu deinem aktuellen Hören passen, sind jetzt auch auf Spanisch und Französisch grün (*· actual*, *· actuel*); bisher nur auf Deutsch und Englisch.

## [0.3.1] – 2026-10-08

### English

**Fixed**

- **Brief Spotify outages no longer make a run fail**: if Spotify answers with a temporary error (500, 502, 503 or 504, e.g. *An unexpected error occurred. Please try again later.*), Tweakable DJ tries again after 2, 5 and 10 seconds. Before creating a playlist again, it first checks whether Spotify created it anyway, so it never appears twice.
- **The playlist is found by its ID**: Tweakable DJ remembers the ID of “Tweakable DJ” after each write (in `state.json`) and uses it directly next time, instead of searching the list of your playlists by name. During a Spotify outage that list can come back incomplete – an automatic run then tried to create a second “Tweakable DJ”. If the playlist was deleted or renamed, it searches by name as before.

**Changed**

- **Buttons below the output in two rows**: the first row, headed *Spotify*, has *Overwrite “Tweakable DJ”*, *Create new playlist* (until now *Save as new playlist*) and, after writing, *Restore previous playlist*; it only shows up when one of them is available. The second, smaller row *Text file* has *Save playlist* (until now *Save as text file*) and *Import …*.

### Deutsch

**Behoben**

- **Kurze Störungen bei Spotify lassen einen Lauf nicht mehr scheitern**: Antwortet Spotify mit einem vorübergehenden Fehler (500, 502, 503 oder 504, z. B. *An unexpected error occurred. Please try again later.*), versucht Tweakable DJ es nach 2, 5 und 10 Sekunden noch einmal. Bevor es eine Playlist noch einmal anlegt, sieht es nach, ob Spotify sie nicht doch angelegt hat – so entsteht sie nie doppelt.
- **Die Playlist wird über ihre ID gefunden**: Tweakable DJ merkt sich nach jedem Schreiben die ID von „Tweakable DJ“ (in `state.json`) und nimmt sie beim nächsten Mal direkt, statt die Liste deiner Playlists nach dem Namen zu durchsuchen. Bei einer Störung von Spotify kann diese Liste unvollständig sein – ein automatischer Lauf wollte dann ein zweites „Tweakable DJ“ anlegen. Wurde die Playlist gelöscht oder umbenannt, sucht es wie bisher nach dem Namen.

**Geändert**

- **Knöpfe unter der Ausgabe in zwei Zeilen**: Die erste Zeile mit der Überschrift *Spotify* hat *„Tweakable DJ“ überschreiben*, *Neue Playlist anlegen* (bisher *Neu in Spotify anlegen*) und nach dem Schreiben *Vorige Playlist wiederherstellen*; sie erscheint nur, wenn einer davon verfügbar ist. Die zweite, kleinere Zeile *Textdatei* hat *Playlist speichern* (bisher *Als Textdatei speichern*) und *Importieren …*.

## [0.3.0] – 2026-10-07

### English

**New**

- **Create playlist, then overwrite or save as new**: the button *Rebuild playlist* is gone. *Test run* is now called **Create playlist** (the main button at the bottom of the tab *Playlist*): it creates the list and shows it, with × and ♥ for every song, without changing anything in Spotify. Below the list, two buttons take it to Spotify: **Overwrite “Tweakable DJ”** (with the name from the settings; the main button, like *Use this list* before) replaces the contents of that playlist, and afterwards *Restore previous playlist* appears. **Save as new playlist** creates another playlist named after the playlist, the date and the time in the format of the interface, e.g. *Tweakable DJ · 10/07/2026 03:32 PM* (German: *Tweakable DJ · 07.10.2026 15:32*), leaves “Tweakable DJ” as it is and shows *Open in Spotify ↗*; it is archived like every written playlist (with its own name in the first line). Both count as a run and work for 24 hours as long as the settings stay the same. Automatic runs and the second shortcut still always overwrite the playlist from the settings. *Restore previous playlist* now only brings back an earlier state of the same playlist, so a list saved as a new playlist is skipped. `POST /api/apply` takes `target: "new"`, new terminal option `node dj.mjs --apply --new`; archive entries in `GET /api/archive` have `url`. The text file of a created list now ends in `-new.txt` (before: `-test-run.txt`).
- **Simple / Pro**: a switch at the top, left of the language. **Simple** shows only the four presets and *Number of songs* (with the play time) in the tab *Playlist*, plus the output with the list, ♥/×, the two buttons and the text file. **Pro** shows all controls as before (*Share of favorites* is now in the group *Selection*). Hidden controls keep working with their values; if they don’t match any preset, *Simple* says *Custom Pro settings active* and offers *Reset to “Default”*. The choice is saved right away (`mode`: `"simple"` or `"pro"` in `config.jsonc`) and doesn’t change the playlist. New users start with *Simple*; after the update, an existing `config.jsonc` without `mode` counts as *Pro*, so nothing changes unexpectedly. The tab *Settings* is the same in both.
- **No console window**: the desktop shortcut now starts Tweakable DJ without a console or terminal window (Windows: `conhost.exe --headless`, Mac: in the background via `nohup` without a Dock icon, Linux: `Terminal=false`). Output goes to the new personal file `ui.log` (about 1 MB at most, then `ui.old.log`); if the start fails, a system notification says why. If Node.js is missing or too old, a window with the message opens after all. Double-clicking `Tweakable DJ.cmd` or `Tweakable DJ.command` still starts with a window, for troubleshooting. An existing shortcut from an older version that points to this folder is renewed automatically on the next start. The update restart works without a window too.
- **Second shortcut: rebuild playlist now**: new switch in the tab *Settings*, section *Shortcut* (`runShortcut`, off by default). When saved, it puts *Tweakable DJ – New playlist* on the desktop (named in the language of the interface, e.g. *Tweakable DJ – Playlist neu* in German; renamed when the language changes; removed again when switched off, only its own). A double-click rebuilds the playlist with the saved settings, without the interface and without a window (Windows: `conhost.exe --headless`, Mac: app bundle in the background, Linux: `Terminal=false`), archives it like a normal run and reports back with a system notification – *Playlist “Tweakable DJ” rebuilt ✓ – 50 songs* or the reason it failed. If a run is already in progress (interface, automatic run or another double-click), it only says *already running*. New mode `node dj.mjs --now`; its result goes to the new personal files `jetzt.json` and `jetzt.log`, not to `automatik.json`, so the last automatic run shown in the interface stays correct. `GET /api/version` also returns `busy`.
- **Reminder before the Spotify login expires**: new switch *Remind me to log in again* under *Credentials* in the tab *Settings* (`remindLogin`, on by default). In the last 7 days before the Spotify login expires (it lasts 180 days), a system notification says e.g. *Your Spotify login expires in 5 days – open Tweakable DJ and log in again.* – when the interface starts and after automatic runs, at most once a day. The day of the last reminder is kept in `state.json` (`loginReminderAt`). Until now, only successful automatic runs reminded you, from 10 days before, and only with *Notify on failures* on; that switch is now only about failures.

**Changed**

- **Playlist name and source in the tab Settings**: *Playlist name* and *Source of your favorites* moved from the tab *Playlist* to a new first section *Playlist* in the tab *Settings* (in both views). The group in the tab *Playlist* that keeps *Number of songs* is now called *Length*.
- **Time of the last update check**: the section *Program* (formerly *Version*) now says when Tweakable DJ last checked GitHub successfully, e.g. *You’re up to date ✓ (checked Tue, Oct 7, 15:32)*. If that was more than 24 hours ago or isn’t known, it no longer claims ✓ but says *Last checked … – “Check for updates” checks now.* The time updates after clicking *Check for updates*. `GET /api/update` and `update-check.json` have the new field `okAt` (last successful check).
- **Only one instance**: if Tweakable DJ is already running, another start just opens the browser; if another program uses the port, the message says so (`GET /api/version` now also returns `app`).
- **Quit Tweakable DJ**: new button in the tab *Settings*, section *Program* (formerly *Version*), new endpoint `POST /api/quit` (not during a run, import, update or login). Automatic runs still take place. Without a window, Tweakable DJ also quits by itself after 10 minutes without an open page (the page sends a sign of life every 30 seconds; time asleep doesn’t count). A page left open then says that Tweakable DJ is no longer running.
- **Notice at the top can be closed**: the notice above the tabs (e.g. *Logged in ✓ The Spotify login is valid for another 6 months.* or a reminder to log in again) now has an × on the right. Until now, only reloading the page made *Logged in ✓* go away. A closed reminder comes back after reloading the page or when its reason changes.
- **Update notice without a window**: if Tweakable DJ takes long to restart after *Update now*, the notice no longer asks whether its window is still open, but says to wait a moment and otherwise start it again with the shortcut on the desktop.

### Deutsch

**Neu**

- **Playlist erstellen, dann überschreiben oder neu anlegen**: Der Knopf *Playlist neu erstellen* entfällt. Der *Probelauf* heißt jetzt **Playlist erstellen** (Primärknopf unten im Tab *Playlist*): Er erstellt die Liste und zeigt sie an, mit × und ♥ bei jedem Song, ohne in Spotify etwas zu ändern. Unter der Liste bringen sie zwei Knöpfe nach Spotify: **„Tweakable DJ“ überschreiben** (mit dem Namen aus den Einstellungen; der Primärknopf, wie bisher *Diese Liste übernehmen*) ersetzt den Inhalt dieser Playlist, danach erscheint *Vorige Playlist wiederherstellen*. **Neu in Spotify anlegen** legt eine weitere Playlist an, benannt nach der Playlist, dem Datum und der Uhrzeit im Format der Oberfläche, z. B. *Tweakable DJ · 07.10.2026 15:32* (englisch *Tweakable DJ · 10/07/2026 03:32 PM*), lässt „Tweakable DJ“, wie sie ist, und zeigt *In Spotify öffnen ↗*; ins Archiv kommt sie wie jede geschriebene Playlist (mit ihrem eigenen Namen in der ersten Zeile). Beides zählt als Lauf und geht 24 Stunden lang, solange die Einstellungen gleich bleiben. Die Automatik und die zweite Verknüpfung überschreiben weiterhin immer die Playlist aus den Einstellungen. *Vorige Playlist wiederherstellen* holt jetzt nur einen früheren Stand derselben Playlist zurück, eine neu angelegte Liste wird übersprungen. `POST /api/apply` versteht `target: "new"`, neuer Aufruf `node dj.mjs --apply --new`; Einträge in `GET /api/archive` haben `url`. Die Textdatei einer erstellten Liste endet jetzt auf `-neu.txt` (bisher `-probelauf.txt`).
- **Einfach / Pro**: ein Umschalter oben, links neben der Sprache. **Einfach** zeigt im Tab *Playlist* nur die vier Voreinstellungen und *Anzahl Songs* (mit Spieldauer), dazu die Ausgabe mit Liste, ♥/×, den zwei Knöpfen und der Textdatei. **Pro** zeigt alle Regler wie bisher (*Anteil Favoriten* steht jetzt in der Gruppe *Auswahl*). Ausgeblendete Regler wirken mit ihren Werten weiter; passen sie zu keiner Voreinstellung, sagt *Einfach* *Eigene Pro-Einstellungen aktiv* und bietet *Auf „Standard“ zurücksetzen* an. Die Wahl wird sofort gespeichert (`mode`: `"simple"` oder `"pro"` in der `config.jsonc`) und ändert die Playlist nicht. Neue Nutzer starten mit *Einfach*; nach dem Update zählt eine vorhandene `config.jsonc` ohne `mode` als *Pro*, damit sich nichts überraschend ändert. Der Tab *Einstellungen* ist in beiden gleich.
- **Ohne Konsolenfenster**: Die Verknüpfung auf dem Desktop startet Tweakable DJ jetzt ohne Konsolen- bzw. Terminalfenster (Windows: `conhost.exe --headless`, Mac: im Hintergrund per `nohup` ohne Symbol im Dock, Linux: `Terminal=false`). Die Ausgaben kommen in die neue persönliche Datei `ui.log` (höchstens etwa 1 MB, dann `ui.old.log`); scheitert der Start, sagt eine Systembenachrichtigung warum. Fehlt Node.js oder ist es zu alt, öffnet sich doch ein Fenster mit der Meldung. Ein Doppelklick auf `Tweakable DJ.cmd` bzw. `Tweakable DJ.command` startet weiterhin mit Fenster, zum Fehlersuchen. Eine vorhandene Verknüpfung einer älteren Version, die auf diesen Ordner zeigt, erneuert sich beim nächsten Start von selbst. Auch der Neustart nach einem Update klappt ohne Fenster.
- **Zweite Verknüpfung: Playlist jetzt neu erstellen**: neuer Schalter im Tab *Einstellungen*, Abschnitt *Verknüpfung* (`runShortcut`, standardmäßig aus). Beim Speichern kommt *Tweakable DJ – Playlist neu* auf den Desktop (benannt in der Sprache der Oberfläche, z. B. englisch *Tweakable DJ – New playlist*; bei einem Sprachwechsel umbenannt; ausgeschaltet wieder weg, nur die eigene). Ein Doppelklick erstellt die Playlist mit den gespeicherten Einstellungen neu, ohne Oberfläche und ohne Fenster (Windows: `conhost.exe --headless`, Mac: App-Paket im Hintergrund, Linux: `Terminal=false`), archiviert sie wie ein normaler Lauf und meldet sich mit einer Systembenachrichtigung – *Playlist „Tweakable DJ“ neu erstellt ✓ – 50 Songs* bzw. mit dem Grund, warum es nicht geklappt hat. Läuft schon ein Lauf (Oberfläche, Automatik oder ein anderer Doppelklick), meldet sie nur *läuft gerade*. Neuer Aufruf `node dj.mjs --now`; sein Ergebnis kommt in die neuen persönlichen Dateien `jetzt.json` und `jetzt.log`, nicht nach `automatik.json` – so bleibt der letzte automatische Lauf in der Oberfläche richtig. `GET /api/version` liefert zusätzlich `busy`.
- **Erinnerung vor Ablauf der Spotify-Anmeldung**: neuer Schalter *An neue Anmeldung erinnern* unter *Zugangsdaten* im Tab *Einstellungen* (`remindLogin`, standardmäßig an). In den letzten 7 Tagen bevor die Spotify-Anmeldung abläuft (sie gilt 180 Tage), meldet eine Systembenachrichtigung z. B. *Die Spotify-Anmeldung läuft in 5 Tagen ab – öffne Tweakable DJ und melde dich neu an.* – beim Start der Oberfläche und nach automatischen Läufen, höchstens einmal am Tag. Der Tag der letzten Erinnerung steht in `state.json` (`loginReminderAt`). Bisher erinnerten nur erfolgreiche automatische Läufe, ab 10 Tagen vorher und nur mit *Bei Fehlern benachrichtigen*; dieser Schalter gilt jetzt nur noch für Fehler.

**Geändert**

- **Name und Quelle der Playlist im Tab Einstellungen**: *Name der Playlist* und *Quelle deiner Favoriten* stehen nicht mehr im Tab *Playlist*, sondern in einem neuen ersten Abschnitt *Playlist* im Tab *Einstellungen* (in beiden Ansichten). Die Gruppe im Tab *Playlist* mit *Anzahl Songs* heißt jetzt *Länge*.
- **Zeitpunkt der letzten Update-Prüfung**: Im Abschnitt *Programm* (bisher *Version*) steht jetzt, wann Tweakable DJ zuletzt erfolgreich bei GitHub nachgesehen hat, z. B. *Du hast die neueste Version ✓ (geprüft am Di 07.10., 15:32)*. Ist das länger als 24 Stunden her oder unbekannt, behauptet es kein ✓ mehr, sondern sagt *Zuletzt geprüft am … – „Nach Updates suchen“ prüft jetzt.* Nach einem Klick auf *Nach Updates suchen* aktualisiert sich die Zeit. `GET /api/update` und `update-check.json` haben das neue Feld `okAt` (letzte erfolgreiche Prüfung).
- **Nur eine Instanz**: Läuft Tweakable DJ schon, öffnet ein weiterer Start nur den Browser; belegt ein anderes Programm den Port, sagt die Meldung das (`GET /api/version` liefert zusätzlich `app`).
- **Tweakable DJ beenden**: neuer Knopf im Tab *Einstellungen*, Abschnitt *Programm* (bisher *Version*), neuer Endpunkt `POST /api/quit` (nicht während eines Laufs, Imports, Updates oder einer Anmeldung). Automatische Läufe finden trotzdem statt. Ohne Fenster beendet sich Tweakable DJ außerdem nach 10 Minuten ohne offene Seite von selbst (die Seite meldet sich alle 30 Sekunden; der Ruhezustand zählt nicht mit). Eine offen gebliebene Seite sagt dann, dass Tweakable DJ nicht mehr läuft.
- **Hinweis oben lässt sich schließen**: Der Hinweis über den Tabs (z. B. *Angemeldet ✓ Die Spotify-Anmeldung gilt jetzt wieder 6 Monate.* oder eine Erinnerung, dich neu anzumelden) hat jetzt rechts ein ×. Bisher ging *Angemeldet ✓* nur durch Neuladen der Seite weg. Eine geschlossene Erinnerung kommt nach dem Neuladen oder bei einem anderen Grund wieder.
- **Update-Hinweis ohne Fenster**: Braucht Tweakable DJ nach *Jetzt aktualisieren* lange für den Neustart, fragt der Hinweis nicht mehr, ob sein Fenster noch offen ist, sondern bittet, kurz zu warten, und sonst, es über die Verknüpfung auf dem Desktop neu zu starten.

## [0.2.5] – 2026-10-07

### English

**New**

- **♥ in the test run**: next to the × for blocking, every song in the list of a test run has a ♥ that adds it to your Liked Songs in Spotify. A filled ♥ shows songs that already are; clicking it again removes the song. Uses the library endpoints Spotify introduced in February 2026 (`PUT`/`DELETE /me/library`, `GET /me/library/contains`, one request per 40 songs). It needs the new permission `user-library-modify`: logins from version 0.2.4 or older don’t have it, so the first click shows a notice to log in again once – nothing else changes. New endpoints `POST /api/library/contains` and `POST /api/library`.
- **Restore previous playlist**: after *Rebuild playlist*, *Use this list* or an import, a button below the output brings back the playlist as it was before – the second-newest entry in the archive – with the usual preview and confirmation. Afterwards the restored list is the newest entry and the button disappears. It only shows while the archive is on, the previous state is in it and nothing else has written the playlist in the meantime. `@@RESULT`, `automatik.json` and the answer of `POST /api/import` have the new field `archiveFile` (the archive file just written); `GET /api/archive?after=<file>` also returns `undo` (the entry before it or `null`).
- **New in v…**: after an update, the interface shows once at the top what’s new in this version – the points with a bold keyword from this changelog (at most 5; German in German, otherwise English) and a link *All changes* to the release on GitHub. × closes it until the next update; on the very first start nothing is shown. The last seen version is kept in the new personal file `seen-version.json` (in `.gitignore`, never in the ZIP file, never touched by an update), so it works in any browser. For the first update to a version that has this, the previous version comes from the backup that *Update now* leaves in `.update/`. New module `whatsnew.mjs`, new endpoints `GET` and `POST /api/whatsnew`.
- **Summary line after a run**: after a test run, a run and *Use this list*, the output has a line below the summary, e.g. *34 artists · release years 1978–2025 · 12 songs for the first time* – different main artists, the span of release years (left out if none is known) and the songs the DJ has never written to the playlist. For that, `state.json` now remembers every song the DJ writes (`played`, at most 20,000); until then it counts the runs kept for *Block previous runs* and the playlists in the archive. `@@RESULT` and `automatik.json` have the new fields `artists`, `yearFrom`, `yearTo` and `firstTime`; `probelauf.json` keeps `yearFrom` and `yearTo`.

**Changed**

- **No play time in the playlist description**: the description that Tweakable DJ sets in Spotify no longer ends with the play time (e.g. *· 2 h 58 min*) – Spotify shows the exact length of the playlist itself. The interface, `@@RESULT`, `automatik.json` and `probelauf.json` still show and contain it.

**Fixed**

- **Slow PowerShell no longer ends in “exit code -1”**: creating the desktop shortcut and setting up automatic runs now wait up to 90 seconds (before: 30) for PowerShell, the Task Scheduler, launchd or crontab – on a freshly started or slow PC, PowerShell sometimes needs longer. If it still takes too long, the message says so (*PowerShell didn’t respond in time … Please try again.*) instead of showing *exit code -1*.

### Deutsch

**Neu**

- **♥ im Probelauf**: Neben dem × zum Sperren hat jeder Song in der Liste eines Probelaufs ein ♥, das ihn in Spotify zu deinen Lieblingssongs hinzufügt. Ein gefülltes ♥ zeigt Songs, die es schon sind; ein weiterer Klick entfernt den Song wieder. Verwendet die Bibliotheks-Schnittstellen, die Spotify im Februar 2026 eingeführt hat (`PUT`/`DELETE /me/library`, `GET /me/library/contains`, eine Anfrage pro 40 Songs). Dafür braucht es die neue Berechtigung `user-library-modify`: Anmeldungen von Version 0.2.4 oder älter haben sie nicht, deshalb zeigt der erste Klick einen Hinweis, dich einmal neu anzumelden – sonst ändert sich nichts. Neue Schnittstellen `POST /api/library/contains` und `POST /api/library`.
- **Vorige Playlist wiederherstellen**: Nach *Playlist neu erstellen*, *Diese Liste übernehmen* oder einem Import holt ein Button unter der Ausgabe die Playlist zurück, wie sie davor war – den zweitneuesten Eintrag im Archiv –, mit der üblichen Vorschau und Rückfrage. Danach ist die wiederhergestellte Liste der neueste Eintrag, und der Button verschwindet. Er erscheint nur, solange das Archiv an ist, der vorige Stand darin liegt und inzwischen nichts anderes die Playlist geschrieben hat. `@@RESULT`, `automatik.json` und die Antwort von `POST /api/import` haben das neue Feld `archiveFile` (die gerade geschriebene Archivdatei); `GET /api/archive?after=<Datei>` liefert zusätzlich `undo` (den Eintrag davor oder `null`).
- **Neu in v…**: Nach einem Update zeigt die Oberfläche einmal oben, was in dieser Version neu ist – die Punkte mit fettem Stichwort aus diesem Changelog (höchstens 5; auf Deutsch, sonst Englisch) und einen Link *Alle Änderungen* zum Release auf GitHub. × schließt ihn bis zum nächsten Update; beim allerersten Start erscheint nichts. Die zuletzt gesehene Version steht in der neuen persönlichen Datei `seen-version.json` (in `.gitignore`, nie in der ZIP-Datei, von keinem Update angefasst), deshalb klappt das in jedem Browser. Beim ersten Update auf eine Version, die das kann, kommt die vorige Version aus der Sicherung, die *Jetzt aktualisieren* in `.update/` hinterlässt. Neues Modul `whatsnew.mjs`, neue Schnittstellen `GET` und `POST /api/whatsnew`.
- **Zeile nach dem Lauf**: Nach einem Probelauf, einem Lauf und *Diese Liste übernehmen* steht in der Ausgabe unter der Zusammenfassung eine Zeile wie *34 Künstler · Erscheinungsjahre 1978–2025 · 12 Songs zum ersten Mal dabei* – verschiedene Hauptkünstler, die Spanne der Erscheinungsjahre (fehlt, wenn keins bekannt ist) und die Songs, die der DJ noch nie in die Playlist geschrieben hat. Dafür merkt sich `state.json` jetzt jeden Song, den der DJ schreibt (`played`, höchstens 20 000); bis dahin zählen die Läufe für *Vorige Läufe sperren* und die Playlists im Archiv. `@@RESULT` und `automatik.json` haben die neuen Felder `artists`, `yearFrom`, `yearTo` und `firstTime`; `probelauf.json` merkt sich `yearFrom` und `yearTo`.

**Geändert**

- **Keine Spieldauer mehr in der Beschreibung der Playlist**: Die Beschreibung, die Tweakable DJ in Spotify setzt, endet nicht mehr mit der Spieldauer (z. B. *· 2:58 Std.*) – die genaue Länge zeigt Spotify bei der Playlist selbst an. In der Oberfläche, in `@@RESULT`, `automatik.json` und `probelauf.json` bleibt sie.

**Behoben**

- **Langsames PowerShell endet nicht mehr mit „Fehlercode -1“**: Das Anlegen der Verknüpfung auf dem Desktop und das Einrichten der Automatik warten jetzt bis zu 90 Sekunden (bisher 30) auf PowerShell, die Aufgabenplanung, launchd bzw. crontab – auf einem gerade gestarteten oder langsamen PC braucht PowerShell manchmal länger. Dauert es trotzdem zu lange, sagt die Meldung das (*PowerShell hat nicht rechtzeitig geantwortet … Bitte noch einmal versuchen.*) statt *Fehlercode -1*.

## [0.2.4] – 2026-10-07

### English

**New**

- **Archive status**: under *Archived playlists* (until now *Keep earlier playlists*) the tab *Settings* shows how many playlists are in the archive, e.g. *12/20 playlists in the archive*. If the slider is set below that number, a warning says how many of the oldest the next playlist deletes, e.g. *With the next playlist, the 5 oldest are deleted.*; at 0 it says that no new ones are added and the existing ones stay.
- After a run or an import, the output says when older playlists were removed from the archive, e.g. *Removed the 5 oldest playlists from the archive*.

### Deutsch

**Neu**

- **Stand des Archivs**: Unter *Archivierte Playlists* (bisher *Frühere Playlists aufheben*) zeigt der Tab *Einstellungen*, wie viele Playlists im Archiv sind, z. B. *12/20 Playlists im Archiv*. Steht der Regler darunter, sagt eine Warnung, wie viele der ältesten die nächste Playlist löscht, z. B. *Mit der nächsten Playlist werden die 5 ältesten gelöscht.*; bei 0, dass keine neuen dazukommen und die vorhandenen bleiben.
- Nach einem Lauf oder Import steht in der Ausgabe, wenn ältere Playlists aus dem Archiv entfernt wurden, z. B. *Die 5 ältesten Playlists aus dem Archiv entfernt*.

## [0.2.3] – 2026-10-07

### English

**New**

- **Space needed by the archive**: next to *Keep earlier playlists*, the interface shows roughly how much space the archive takes, e.g. *20 playlists (≈ 91 KB)* – estimated from the set *Number of songs* (about 90 bytes per song), like the play time next to *Number of songs*. The screenshot of the tab *Settings* shows it.

### Deutsch

**Neu**

- **Platzbedarf des Archivs**: Neben *Frühere Playlists aufheben* steht, wie viel Platz das Archiv ungefähr braucht, z. B. *20 Playlists (≈ 91 KB)* – geschätzt aus der eingestellten *Anzahl Songs* (rund 90 Byte pro Song), wie die Spieldauer neben *Anzahl Songs*. Der Screenshot des Tabs *Einstellungen* zeigt das.

## [0.2.2] – 2026-10-07

### English

**Fixed**

- **Sliders look the same with every accent color**: with the default green, the empty part of the sliders was dark in light mode, with all other colors light – the browser chose its color from the brightness of the accent color. Tweakable DJ now draws the sliders itself: the empty part is light gray in light mode and dark gray in dark mode, whatever color you choose. The screenshots in the README show the new sliders.

### Deutsch

**Behoben**

- **Schieberegler sehen bei jeder Akzentfarbe gleich aus**: Mit dem Standard-Grün war der leere Teil der Regler im hellen Modus dunkel, bei allen anderen Farben hell – der Browser hat die Farbe nach der Helligkeit der Akzentfarbe gewählt. Tweakable DJ zeichnet die Regler jetzt selbst: Der leere Teil ist im hellen Modus hellgrau, im dunklen Modus dunkelgrau, egal welche Farbe du wählst. Die Screenshots in der README zeigen die neuen Regler.

## [0.2.1] – 2026-10-07

### English

**Changed**

- **New screenshots**: the README shows two new pictures of the interface – the tab *Playlist* after a test run and the tab *Settings* – each in light and dark mode; GitHub shows the one that matches the setting of your device. Both READMEs show the English interface. The old pictures (main view, run, setup and block list, each in English and German) are gone, so the ZIP file is about 1.2 MB smaller.
- The release workflow checks that everything the READMEs point to is in the ZIP file; this now also covers `srcset="…"` (the dark versions of the pictures).

### Deutsch

**Geändert**

- **Neue Screenshots**: Die README zeigt zwei neue Bilder der Oberfläche – den Tab *Playlist* nach einem Probelauf und den Tab *Einstellungen* – jeweils im hellen und im dunklen Modus; GitHub zeigt die Fassung, die zur Einstellung deines Geräts passt. Beide READMEs zeigen die englische Oberfläche. Die alten Bilder (Hauptansicht, Lauf, Einrichtung und Sperrliste, je auf Deutsch und Englisch) sind weg, die ZIP-Datei ist dadurch rund 1,2 MB kleiner.
- Der Release-Ablauf prüft, ob alles, worauf die READMEs verweisen, in der ZIP-Datei ist; das erfasst jetzt auch `srcset="…"` (die dunklen Fassungen der Bilder).

## [0.2.0] – 2026-10-07

### English

**New**

- **Play time**: next to *Number of songs*, the interface shows an estimate that updates while you move the slider, e.g. *55 songs (≈ 3 h 13 min)* – based on the average song length of your last run, otherwise 3.5 minutes per song.
- After a run, the summary shows the real play time of the list, e.g. *50 songs · 2 h 58 min*; so do the last automatic run and the playlist description. If the length of some songs is unknown (songs remembered by an older version), the DJ estimates them from the others and marks the total with *≈*. It never searches again just for that; songs found from now on are remembered with their length.
- `@@RESULT`, `automatik.json` and `probelauf.json` have the new fields `durationMs` and `durationEstimated`.
- **Newer / older songs** (`preferNewer`, -1 to 1, default 0 = no preference): a new slider under *Selection* prefers songs by release year according to Spotify – newer ones above 0, older ones below 0. It only changes the odds in the draw (up to 4× for songs from this year or from 20 or more years ago), nothing is left out. The search cache now also remembers the release year; older entries count as neutral and are not searched again.
- **Playlist archive**: after each write to Spotify (rebuild, automatic run, *Use this list*, import), the written list is saved as a text file in the new folder `archiv` (e.g. `2026-10-06 18-30-05 Tweakable DJ.txt`, same format as *Save as text file*). *Import … → Earlier playlist …* brings one back with the usual preview. *Keep earlier playlists* in the tab *Settings* (`archiveCount`, default 20, 0 = off, at most 200) sets how many stay; only the archive’s own files are ever deleted. `archiv/` is personal: in `.gitignore`, not in the ZIP file, never touched by an update. New endpoints `GET /api/archive` and `GET /api/archive/entry`.
- **Appearance**: a new section in the tab *Settings* with the mode *System*, *Light* or *Dark* (`theme`, default `"system"` as before) and 8 accent colors as round swatches (`accent`: green, the default as before, blue, violet, pink, red, orange, gold, teal; with enough contrast in light and dark mode). Green is now the green of the Spotify logo (#1ED760) on buttons, tabs, sliders and switches, with black text on it as in Spotify; text and links in green are a darker shade of it in light mode, so they stay readable. Changes show right away as a preview; *Save* keeps them, *Discard* undoes them. Neither changes the playlist, so a test run can still be used.
- **Logo**: Tweakable DJ now has a logo – green sound wave bars in a dark circle with a green ring. It is at the top left of the interface, in the browser tab (a simplified version that stays clear at 16 pixels) and at the top of the README. It stays green whatever accent color you choose. The files are in the new folder `assets/` (`logo.png`, `logo-small.svg`, `logo.ico`, `logo.icns`); *Update now* adds it by itself.
- **Desktop shortcut**: the last step of the setup wizard offers *Create a shortcut on the desktop* (ticked by default); the new section *Shortcut* in the tab *Settings* shows whether it is there and offers *Create shortcut*, *Create again* (e.g. after moving the folder: the section then says *Points to a different folder*) and *Remove*. The shortcut is called *Tweakable DJ*, has the logo as its icon and starts Tweakable DJ with a double-click: on Windows a `.lnk` to `Tweakable DJ.cmd` (also with a desktop moved to OneDrive), on the Mac a small `Tweakable DJ.app` that opens `Tweakable DJ.command` in the Terminal, on Linux `tweakable-dj.desktop` (starts `start.sh` in a terminal; marked as trusted where `gio` exists). Only built-in tools are used. Tweakable DJ only ever replaces or removes its own shortcut; something else on the desktop with that name stays as it is. New endpoints `GET`, `POST` and `DELETE /api/shortcut`.

**Changed**

- **Shorter help texts**: the explanations under the controls and in the setup are now mostly one short sentence.
- **More compact footer**: the Spotify notice is on the same line as the Last.fm credit.
- **Tab *Settings***: the page now has two tabs. *Playlist* keeps the presets, controls, text file and test run; *Settings* holds *Rebuild automatically*, the *Block list*, *Credentials* (logged in to Spotify or not, your Last.fm username and *Change credentials*, which used to be at the top right) and *Version* with *Check for updates* (previously in the footer). The tab is part of the address (`#settings`), so reloading and the back button keep it. *Save* and *Discard* apply to both tabs; a dot on the other tab shows unsaved changes there.
- **Text file below the output**: the separate *Text file* section is gone. *Save as text file* and *Import …* (with *From file …*) are now a row of buttons right below the output; after a test run, *Save as text file* saves the list of the test run, so there is only one such button. The output is always visible, with a short placeholder before the first run.

### Deutsch

**Neu**

- **Spieldauer**: Neben *Anzahl Songs* zeigt die Oberfläche eine Schätzung, die beim Ziehen mitläuft, z. B. *55 Songs (≈ 3:13 Std.)* – aus der durchschnittlichen Songlänge des letzten Laufs, sonst mit 3,5 Minuten pro Song.
- Nach einem Lauf zeigt die Zusammenfassung die echte Spieldauer der Liste, z. B. *50 Songs · 2:58 Std.*; ebenso der letzte automatische Lauf und die Beschreibung der Playlist. Ist die Länge einzelner Songs unbekannt (Songs, die sich eine ältere Version gemerkt hat), schätzt der DJ sie aus den übrigen und markiert die Summe mit *≈*. Nur deswegen sucht er nie neu; ab jetzt gefundene Songs merkt er sich mit ihrer Länge.
- `@@RESULT`, `automatik.json` und `probelauf.json` haben die neuen Felder `durationMs` und `durationEstimated`.
- **Neuere / ältere Songs** (`preferNewer`, -1 bis 1, Standard 0 = egal): Ein neuer Regler unter *Auswahl* bevorzugt Songs nach dem Erscheinungsjahr laut Spotify – über 0 neuere, unter 0 ältere. Er ändert nur das Los (bis zu 4× für Songs von diesem Jahr bzw. von vor 20 und mehr Jahren), es fällt nichts weg. Der Such-Cache merkt sich jetzt auch das Erscheinungsjahr; ältere Einträge zählen neutral und werden nicht neu gesucht.
- **Playlist-Archiv**: Nach jedem Schreiben in Spotify (Neuerstellung, automatischer Lauf, *Diese Liste übernehmen*, Import) kommt die geschriebene Liste als Textdatei in den neuen Ordner `archiv` (z. B. `2026-10-06 18-30-05 Tweakable DJ.txt`, Format wie *Als Textdatei speichern*). *Importieren … → Frühere Playlist …* holt sie mit der gewohnten Vorschau zurück. *Frühere Playlists aufheben* im Tab *Einstellungen* (`archiveCount`, Standard 20, 0 = aus, höchstens 200) bestimmt, wie viele bleiben; gelöscht werden nur die eigenen Dateien des Archivs. `archiv/` ist persönlich: in `.gitignore`, nicht in der ZIP-Datei, von keinem Update angefasst. Neue Schnittstellen `GET /api/archive` und `GET /api/archive/entry`.
- **Aussehen**: Ein neuer Abschnitt im Tab *Einstellungen* mit dem Modus *System*, *Hell* oder *Dunkel* (`theme`, Standard `"system"` wie bisher) und 8 Akzentfarben als runde Farbfelder (`accent`: Grün, wie bisher der Standard, Blau, Violett, Pink, Rot, Orange, Gold, Türkis; mit genug Kontrast im hellen und im dunklen Modus). Grün ist jetzt das Grün des Spotify-Logos (#1ED760) auf Buttons, Tabs, Reglern und Schaltern, mit schwarzer Schrift darauf wie bei Spotify; grüner Text und Links sind im hellen Modus ein dunklerer Ton davon, damit sie gut lesbar bleiben. Änderungen wirken sofort als Vorschau; *Speichern* behält sie, *Verwerfen* nimmt sie zurück. Beides ändert die Playlist nicht, ein Probelauf bleibt also übernehmbar.
- **Logo**: Tweakable DJ hat jetzt ein Logo – grüne Schallwellen-Balken in einem dunklen Kreis mit grünem Ring. Es steht oben links in der Oberfläche, im Browser-Tab (vereinfacht, damit es auch mit 16 Pixeln deutlich bleibt) und oben in der README. Es bleibt grün, egal welche Akzentfarbe du wählst. Die Dateien liegen im neuen Ordner `assets/` (`logo.png`, `logo-small.svg`, `logo.ico`, `logo.icns`); *Jetzt aktualisieren* legt ihn selbst an.
- **Verknüpfung auf dem Desktop**: Der letzte Schritt des Einrichtungs-Assistenten bietet *Verknüpfung auf dem Desktop anlegen* an (schon angehakt); der neue Abschnitt *Verknüpfung* im Tab *Einstellungen* zeigt, ob es sie gibt, und bietet *Verknüpfung anlegen*, *Neu anlegen* (z. B. nach dem Verschieben des Ordners: Dann steht dort *Zeigt auf einen anderen Ordner*) und *Entfernen*. Die Verknüpfung heißt *Tweakable DJ*, hat das Logo als Symbol und startet Tweakable DJ per Doppelklick: unter Windows eine `.lnk` auf `Tweakable DJ.cmd` (auch bei einem nach OneDrive verschobenen Desktop), auf dem Mac ein kleines `Tweakable DJ.app`, das `Tweakable DJ.command` im Terminal öffnet, unter Linux `tweakable-dj.desktop` (startet `start.sh` in einem Terminal; wo es `gio` gibt, als vertrauenswürdig markiert). Dafür braucht es nur Bordmittel. Tweakable DJ ersetzt oder entfernt nur die eigene Verknüpfung; liegt auf dem Desktop etwas anderes unter diesem Namen, bleibt es, wie es ist. Neue Schnittstellen `GET`, `POST` und `DELETE /api/shortcut`.

**Geändert**

- **Kürzere Hilfetexte**: Die Erklärungen unter den Reglern und in der Einrichtung sind jetzt meist ein kurzer Satz.
- **Kompaktere Fußzeile**: Der Hinweis zu Spotify steht in derselben Zeile wie der zu Last.fm.
- **Tab *Einstellungen***: Die Seite hat jetzt zwei Tabs. *Playlist* behält Voreinstellungen, Regler, Textdatei und Probelauf; *Einstellungen* enthält *Automatisch neu erstellen*, die *Sperrliste*, *Zugangsdaten* (bei Spotify angemeldet oder nicht, dein Last.fm-Benutzername und *Zugangsdaten ändern*, bisher oben rechts) und *Version* mit *Nach Updates suchen* (bisher in der Fußzeile). Der Tab steht in der Adresse (`#settings`), Neuladen und der Zurück-Button behalten ihn. *Speichern* und *Verwerfen* gelten für beide Tabs; ein Punkt am anderen Tab zeigt dort ungespeicherte Änderungen.
- **Textdatei unter der Ausgabe**: Der eigene Abschnitt *Textdatei* ist weg. *Als Textdatei speichern* und *Importieren …* (mit *Aus Datei …*) stehen jetzt als Knopfreihe direkt unter der Ausgabe; nach einem Probelauf speichert *Als Textdatei speichern* dessen Liste, es gibt also nur noch einen solchen Button. Die Ausgabe ist immer sichtbar, vor dem ersten Lauf mit einem kurzen Platzhalter.

## [0.1.4] – 2026-10-06

### English

**New**

- **Spanish and French**: the interface, all messages, the output of runs, notifications, the Spotify login pages and the playlist description are now also available in Spanish (*Español*) and French (*Français*). They are machine translated; a small line at the bottom of the page says so and links to the [issues](https://github.com/hayboeck/tweakable-dj-for-spotify/issues) – corrections are very welcome. The `language` setting and `TWEAKABLE_DJ_LANG` accept `de`, `en`, `es` and `fr`; without a choice, Spanish and French browsers or systems get their language automatically. For Spanish and French, `config.jsonc` is created with English explanations.

**Changed**

- **Language selection field**: the DE | EN switch at the top right is now a small selection field (e.g. *EN ▾*) that lists the languages by their own names. It switches immediately, without reloading the page, works with the keyboard and screen readers, and shows the system’s own list on phones.
- Singular and plural follow the rules of each language (in French, 0 and 1 are singular).

### Deutsch

**Neu**

- **Spanisch und Französisch**: Oberfläche, alle Meldungen, die Ausgabe der Läufe, Benachrichtigungen, die Anmeldeseiten von Spotify und die Beschreibung der Playlist gibt es jetzt auch auf Spanisch (*Español*) und Französisch (*Français*). Sie sind maschinell übersetzt; eine kleine Zeile ganz unten auf der Seite weist darauf hin und verlinkt die [Issues](https://github.com/hayboeck/tweakable-dj-for-spotify/issues) – Korrekturen sind sehr willkommen. Die Einstellung `language` und `TWEAKABLE_DJ_LANG` nehmen `de`, `en`, `es` und `fr`; ohne Wahl bekommen spanisch- und französischsprachige Browser bzw. Systeme ihre Sprache von selbst. Bei Spanisch und Französisch wird `config.jsonc` mit englischen Erklärungen angelegt.

**Geändert**

- **Sprachwahl als Auswahlfeld**: Statt des Umschalters DE | EN steht oben rechts ein kleines Auswahlfeld (z. B. *DE ▾*), das die Sprachen in ihrer eigenen Schreibweise nennt. Es schaltet sofort um, ohne die Seite neu zu laden, lässt sich mit der Tastatur und mit Screenreadern bedienen und zeigt auf dem Handy die Auswahlliste des Systems.
- Einzahl und Mehrzahl richten sich nach den Regeln der jeweiligen Sprache (im Französischen sind 0 und 1 Einzahl).

## [0.1.3] – 2026-10-06

### English

**New**

- **Notify on failures**: if an automatic run fails – Spotify login expired, Last.fm key invalid or suspended, no internet, broken setup – your system shows a notification with the reason and what to do, e.g. “Your Spotify login has expired. Open Tweakable DJ and log in to Spotify again.” From 10 days before the Spotify login expires, a successful automatic run also reminds you, at most once a day. Runs from the interface or the terminal never notify. A switch in the *Rebuild automatically* group (`notifyOnFailure`, on by default).
- **Send test notification**: a button next to the switch shows a notification right away, so you can check that they get through, and otherwise says why not.
- Only built-in tools are used: Windows PowerShell (the notification comes from *Windows PowerShell*), `osascript` on the Mac and `notify-send` on Linux. If a notification can’t be shown, the run counts as usual and `automatik.log` contains a short note.

### Deutsch

**Neu**

- **Bei Fehlern benachrichtigen**: Schlägt ein automatischer Lauf fehl – Spotify-Anmeldung abgelaufen, Last.fm-Key ungültig oder gesperrt, kein Internet, Einrichtung kaputt –, zeigt dein System eine Benachrichtigung mit dem Grund und was zu tun ist, z. B. „Die Spotify-Anmeldung ist abgelaufen. Öffne Tweakable DJ und melde dich neu bei Spotify an.“ Ab 10 Tagen bevor die Spotify-Anmeldung abläuft, erinnert auch ein erfolgreicher automatischer Lauf daran, höchstens einmal am Tag. Läufe aus der Oberfläche oder dem Terminal melden sich nie. Ein Schalter in der Gruppe *Automatisch neu erstellen* (`notifyOnFailure`, standardmäßig an).
- **Testbenachrichtigung senden**: Ein Button neben dem Schalter zeigt sofort eine Benachrichtigung an, damit du siehst, ob sie ankommen – sonst sagt er, warum nicht.
- Nur Bordmittel: Windows PowerShell (die Benachrichtigung kommt von *Windows PowerShell*), `osascript` auf dem Mac und `notify-send` unter Linux. Lässt sich eine Benachrichtigung nicht anzeigen, zählt der Lauf wie sonst, und in `automatik.log` steht ein kurzer Hinweis.

## [0.1.2] – 2026-10-05

### English

**New**

- **Block songs**: after a test run, every song in the list has a small × that blocks it (↺ unblocks it). Blocked songs appear as chips in the *Block list* group and never come up again – neither as a favorite, nor as a new song, nor as a starting point – including other versions of the same song (remaster, live, a single with its own link). Like every setting, the change is saved with *Save*; *Use this list* is then disabled for that test run. New setting `blockedTracks` (at most 1,000 songs).
- **No explicit songs**: a switch in the *Block list* group (`excludeExplicit`, off by default). When it’s on, songs that Spotify marks as explicit stay out of favorites, new songs and the top-up. If Spotify has a clean version of a new song, the DJ takes that one.
- **Check for updates**: a link-style button at the bottom of the page, next to the version number. It asks GitHub right away instead of waiting for the daily check (at most once a minute) and then says *You’re up to date ✓*, shows the update notice again – even if you closed it – or says *GitHub not reachable*.

**Changed**

- The output of a run also shows how many blocked and explicit songs were left out.
- Import from a text file: the preview names songs from your block list and, with *No explicit songs*, explicit ones. They still go in – the file is your list.
- The Spotify search cache in `state.json` now also remembers whether a song is explicit (and its clean version, if there is one). Older entries stay valid; only with *No explicit songs* turned on are they looked up once more.

### Deutsch

**Neu**

- **Songs sperren**: Nach einem Probelauf steht hinter jedem Song der Liste ein kleines ×, das ihn sperrt (↺ hebt die Sperre auf). Gesperrte Songs stehen als Chips in der Gruppe *Sperrliste* und kommen nie wieder vor – weder als Favorit noch als neuer Song noch als Ausgangspunkt –, auch nicht in anderen Versionen (Remaster, Live, Single mit eigenem Link). Wie jede Einstellung wird die Änderung mit *Speichern* gespeichert; *Diese Liste übernehmen* ist für diesen Probelauf dann gesperrt. Neue Einstellung `blockedTracks` (höchstens 1 000 Songs).
- **Keine Songs mit expliziten Texten**: ein Schalter in der Gruppe *Sperrliste* (`excludeExplicit`, standardmäßig aus). Ist er an, kommen Songs, die Spotify als explizit kennzeichnet, weder als Favorit noch als neuer Song noch beim Auffüllen hinein. Hat Spotify von einem neuen Song eine nicht explizite Version, nimmt der DJ diese.
- **Nach Updates suchen**: ein dezenter Link ganz unten auf der Seite, neben der Versionsnummer. Er fragt sofort bei GitHub nach, statt auf die tägliche Prüfung zu warten (höchstens einmal pro Minute), und meldet dann *Du hast die neueste Version ✓*, zeigt den Hinweis auf die neue Version wieder an – auch wenn du ihn ausgeblendet hattest – oder sagt *GitHub nicht erreichbar*.

**Geändert**

- Die Ausgabe eines Laufs zeigt auch, wie viele gesperrte und explizite Songs ausgelassen wurden.
- Import aus einer Textdatei: Die Vorschau nennt Songs von deiner Sperrliste und, mit *Keine Songs mit expliziten Texten*, explizite. Sie kommen trotzdem hinein – die Datei ist deine Liste.
- Der Such-Cache von Spotify in `state.json` merkt sich jetzt auch, ob ein Song explizit ist (und seine nicht explizite Version, falls es eine gibt). Ältere Einträge bleiben gültig; nur mit eingeschaltetem *Keine Songs mit expliziten Texten* werden sie einmal neu gesucht.

## [0.1.1] – 2026-10-05

### English

**New**

- **Use this list**: after a test run, a button below the result writes exactly the songs shown, in this order, to the playlist – without drawing again. It counts like a run (the songs are remembered for *Block previous runs*). It is valid for 24 hours and only as long as the settings stay as they were; afterwards, after a rebuild or when the test run is gone, it is disabled and says why. In the terminal: `node dj.mjs --apply`.
- **Save as text file**: downloads the playlist as it currently is in Spotify – or a test run that hasn’t been applied yet – as a UTF-8 text file: one line per song, all artists, a tab and the Spotify link. In the terminal: `node dj.mjs export [file.txt]`.
- **Import text file**: fills the playlist with your own list (Spotify links or “artist – title”, up to 500 songs). A preview shows how many songs were found and which lines don’t match before anything is written. An import doesn’t count as a DJ run, so it doesn’t change the history. In the terminal: `node dj.mjs import <file.txt>` (`--dry` only shows the result).

**Changed**

- German numbers now look the same everywhere – console, interface and README: `1 000` (Austrian format with a non-breaking space). Some counts in the run output were printed without grouping before.
- New personal file `probelauf.json` (the last test run): ignored by git, never in the ZIP file, never written by *Update now*.
- A rebuild saves the Spotify search cache before writing the playlist, so it survives a failed write.
- The automated tests now also run on macOS.

### Deutsch

**Neu**

- **Diese Liste übernehmen**: Nach einem Probelauf schreibt ein Button unter dem Ergebnis genau die angezeigten Songs in dieser Reihenfolge in die Playlist, ohne neu zu losen. Das zählt wie ein Lauf (die Songs sind für *Vorige Läufe sperren* gemerkt). Der Button gilt 24 Stunden und nur, solange die Einstellungen gleich bleiben; danach, nach einer Neuerstellung oder ohne Probelauf ist er gesperrt und sagt, warum. Im Terminal: `node dj.mjs --apply`.
- **Als Textdatei speichern**: lädt die Playlist so herunter, wie sie gerade in Spotify ist – oder einen Probelauf, der noch nicht übernommen ist – als UTF-8-Textdatei: eine Zeile pro Song, alle Künstler, Tabulator, Link zu Spotify. Im Terminal: `node dj.mjs export [datei.txt]`.
- **Textdatei importieren**: füllt die Playlist mit einer eigenen Liste (Links zu Spotify oder „Künstler – Titel“, bis zu 500 Songs). Eine Vorschau zeigt vor dem Schreiben, wie viele Songs gefunden wurden und welche Zeilen nicht passen. Ein Import zählt nicht als Lauf des DJ und ändert den Verlauf nicht. Im Terminal: `node dj.mjs import <datei.txt>` (`--dry` zeigt nur an).

**Geändert**

- Zahlen sehen auf Deutsch jetzt überall gleich aus – Konsole, Oberfläche und README: `1 000` (österreichisches Format mit geschütztem Leerzeichen). Manche Zahlen in der Ausgabe eines Laufs standen bisher ohne Gliederung da.
- Neue persönliche Datei `probelauf.json` (der letzte Probelauf): von git ignoriert, nie in der ZIP-Datei, *Jetzt aktualisieren* schreibt sie nie.
- Eine Neuerstellung speichert den Such-Cache von Spotify, bevor sie die Playlist schreibt; er bleibt so auch erhalten, wenn das Schreiben scheitert.
- Die automatischen Tests laufen jetzt auch unter macOS.

## [0.1.0] – 2026-10-05

### English

First published version.

- Fills the Spotify playlist “Tweakable DJ” with a mix of your favorites and new, similar songs from Last.fm, weighted towards what you’re listening to right now.
- Local web interface in English and German: setup wizard, presets, a control for every setting, test run and rebuild.
- Rules for variety: artist variety in four steps, block list, followed artists, no repeats of recently played songs and of previous runs.
- Automatic runs via the system scheduler (Windows Task Scheduler, macOS launchd, Linux cron).
- Update check once a day and *Update now* with checksums and automatic restore.

### Deutsch

Erste veröffentlichte Version.

- Befüllt die Spotify-Playlist „Tweakable DJ“ mit einem Mix aus deinen Favoriten und neuen, ähnlichen Songs von Last.fm, am stärksten passend zu dem, was du gerade hörst.
- Lokale Weboberfläche auf Deutsch und Englisch: Einrichtungs-Assistent, Voreinstellungen, ein Regler für jede Einstellung, Probelauf und Neuerstellung.
- Regeln für Abwechslung: Abwechslung bei Künstlern in vier Stufen, Sperrliste, gefolgte Künstler, keine Wiederholung von kürzlich Gehörtem und von vorigen Läufen.
- Automatische Läufe über den Zeitplaner des Systems (Windows-Aufgabenplanung, macOS launchd, Linux cron).
- Prüfung auf neue Versionen einmal am Tag und *Jetzt aktualisieren* mit Prüfsummen und automatischer Rücksicherung.

[0.3.3]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.3.3
[0.3.2]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.3.2
[0.3.1]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.3.1
[0.3.0]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.3.0
[0.2.5]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.2.5
[0.2.4]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.2.4
[0.2.3]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.2.3
[0.2.2]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.2.2
[0.2.1]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.2.1
[0.2.0]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.2.0
[0.1.4]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.4
[0.1.3]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.3
[0.1.2]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.2
[0.1.1]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.1
[0.1.0]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.0
