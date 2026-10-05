# Changelog

All notable changes to Tweakable DJ for Spotify, newest first. Each version has an English and a German section.
Alle wichtigen Änderungen an Tweakable DJ for Spotify, die neueste Version zuerst – jeweils auf Englisch und auf Deutsch.

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

[0.1.2]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.2
[0.1.1]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.1
[0.1.0]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v0.1.0
