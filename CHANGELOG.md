# Changelog

All notable changes to Tweakable DJ for Spotify, newest first. Each version has an English and a German section.
Alle wichtigen Änderungen an Tweakable DJ for Spotify, die neueste Version zuerst – jeweils auf Englisch und auf Deutsch.

## [Unreleased]

### English

**New**

- **Play time**: next to *Number of songs*, the interface shows an estimate that updates while you move the slider, e.g. *55 songs (≈ 3 h 13 min)* – based on the average song length of your last run, otherwise 3.5 minutes per song.
- After a run, the summary shows the real play time of the list, e.g. *50 songs · 2 h 58 min*; so do the last automatic run and the playlist description. If the length of some songs is unknown (songs remembered by an older version), the DJ estimates them from the others and marks the total with *≈*. It never searches again just for that; songs found from now on are remembered with their length.
- `@@RESULT`, `automatik.json` and `probelauf.json` have the new fields `durationMs` and `durationEstimated`.
- **Newer / older songs** (`preferNewer`, -1 to 1, default 0 = no preference): a new slider under *Selection* prefers songs by release year according to Spotify – newer ones above 0, older ones below 0. It only changes the odds in the draw (up to 4× for songs from this year or from 20 or more years ago), nothing is left out. The search cache now also remembers the release year; older entries count as neutral and are not searched again.
- **Playlist archive**: after each write to Spotify (rebuild, automatic run, *Use this list*, import), the written list is saved as a text file in the new folder `archiv` (e.g. `2026-10-06 18-30-05 Tweakable DJ.txt`, same format as *Save as text file*). *Import … → Earlier playlist …* brings one back with the usual preview. *Keep earlier playlists* in the tab *Settings* (`archiveCount`, default 20, 0 = off, at most 200) sets how many stay; only the archive’s own files are ever deleted. `archiv/` is personal: in `.gitignore`, not in the ZIP file, never touched by an update. New endpoints `GET /api/archive` and `GET /api/archive/entry`.
- **Appearance**: a new section in the tab *Settings* with the mode *System*, *Light* or *Dark* (`theme`, default `"system"` as before) and 8 accent colors as round swatches (`accent`: green as before, blue, violet, pink, red, orange, gold, teal; with enough contrast in light and dark mode). Changes show right away as a preview; *Save* keeps them, *Discard* undoes them. Neither changes the playlist, so a test run can still be used.

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
- **Aussehen**: Ein neuer Abschnitt im Tab *Einstellungen* mit dem Modus *System*, *Hell* oder *Dunkel* (`theme`, Standard `"system"` wie bisher) und 8 Akzentfarben als runde Farbfelder (`accent`: Grün wie bisher, Blau, Violett, Pink, Rot, Orange, Gold, Türkis; mit genug Kontrast im hellen und im dunklen Modus). Änderungen wirken sofort als Vorschau; *Speichern* behält sie, *Verwerfen* nimmt sie zurück. Beides ändert die Playlist nicht, ein Probelauf bleibt also übernehmbar.

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

[0.1.4]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.4
[0.1.3]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.3
[0.1.2]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.2
[0.1.1]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.1
[0.1.0]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.0
