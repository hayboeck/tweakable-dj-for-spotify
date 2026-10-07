# Changelog

All notable changes to Tweakable DJ for Spotify, newest first. Each version has an English and a German section.
Alle wichtigen Änderungen an Tweakable DJ for Spotify, die neueste Version zuerst – jeweils auf Englisch und auf Deutsch.

## [Unreleased]

### English

**New**

- **Reminder before the Spotify login expires**: new switch *Remind me to log in again* under *Credentials* in the tab *Settings* (`remindLogin`, on by default). In the last 7 days before the Spotify login expires (it lasts 180 days), a system notification says e.g. *Your Spotify login expires in 5 days – open Tweakable DJ and log in again.* – when the interface starts and after automatic runs, at most once a day. The day of the last reminder is kept in `state.json` (`loginReminderAt`). Until now, only successful automatic runs reminded you, from 10 days before, and only with *Notify on failures* on; that switch is now only about failures.

**Changed**

- **Notice at the top can be closed**: the notice above the tabs (e.g. *Logged in ✓ The Spotify login is valid for another 6 months.* or a reminder to log in again) now has an × on the right. Until now, only reloading the page made *Logged in ✓* go away. A closed reminder comes back after reloading the page or when its reason changes.

### Deutsch

**Neu**

- **Erinnerung vor Ablauf der Spotify-Anmeldung**: neuer Schalter *An neue Anmeldung erinnern* unter *Zugangsdaten* im Tab *Einstellungen* (`remindLogin`, standardmäßig an). In den letzten 7 Tagen bevor die Spotify-Anmeldung abläuft (sie gilt 180 Tage), meldet eine Systembenachrichtigung z. B. *Die Spotify-Anmeldung läuft in 5 Tagen ab – öffne Tweakable DJ und melde dich neu an.* – beim Start der Oberfläche und nach automatischen Läufen, höchstens einmal am Tag. Der Tag der letzten Erinnerung steht in `state.json` (`loginReminderAt`). Bisher erinnerten nur erfolgreiche automatische Läufe, ab 10 Tagen vorher und nur mit *Bei Fehlern benachrichtigen*; dieser Schalter gilt jetzt nur noch für Fehler.

**Geändert**

- **Hinweis oben lässt sich schließen**: Der Hinweis über den Tabs (z. B. *Angemeldet ✓ Die Spotify-Anmeldung gilt jetzt wieder 6 Monate.* oder eine Erinnerung, dich neu anzumelden) hat jetzt rechts ein ×. Bisher ging *Angemeldet ✓* nur durch Neuladen der Seite weg. Eine geschlossene Erinnerung kommt nach dem Neuladen oder bei einem anderen Grund wieder.

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
