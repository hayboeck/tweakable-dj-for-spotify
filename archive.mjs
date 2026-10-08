// Playlist-Archiv: Nach jedem Schreiben der Playlist in Spotify (Lauf aus der Oberfläche oder dem Terminal, automatischer
// Lauf, übernommener Probelauf, Import) legt Tweakable DJ die geschriebene Liste als Textdatei im Ordner archiv/ ab – im
// selben Format wie „Als Textdatei speichern“ (formatExport in playlist.mjs). „Importieren … → Frühere Playlist …“ in der
// Oberfläche holt sie zurück (Vorschau und Rückfrage wie beim Import einer Datei).
//
// Dateiname mit Datum und Uhrzeit (Ortszeit), alphabetisch = zeitlich sortiert: "2026-10-06 18-30-05 Tweakable DJ.txt";
// gibt es den schon (zwei Listen in derselben Sekunde), "… Tweakable DJ 2.txt" usw. Einstellung archiveCount: so viele der
// neuesten Dateien bleiben, ältere eigene Dateien löscht das Speichern. 0 = aus: nichts speichern, nichts löschen.
// Angefasst werden nur Dateien, deren Name genau diesem Muster folgt; alles andere im Ordner bleibt, wie es ist.
// archiv/ ist persönlich wie state.json: nie im Repository, nie in der ZIP-Datei, ein Update fasst es nie an.
import fs from 'node:fs';
import path from 'node:path';
import { formatExport, IMPORT_MAX_BYTES, parseImport, readPlaylist } from './playlist.mjs';

export const ARCHIVE_DIR = 'archiv';
// Datum, Uhrzeit und (ab der zweiten Datei derselben Sekunde) eine Nummer
export const ARCHIVE_NAME = /^(\d{4})-(\d\d)-(\d\d) (\d\d)-(\d\d)-(\d\d) Tweakable DJ(?: ([2-9]|[1-9]\d{1,2}))?\.txt$/;

const two = n => String(n).padStart(2, '0');

// Dateiname für den Zeitpunkt now, n = Nummer (1 = ohne).
export function archiveName(now = new Date(), n = 1) {
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const time = `${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`;
  return `${day} ${time} Tweakable DJ${n > 1 ? ` ${n}` : ''}.txt`;
}

// Zeitpunkt (Ortszeit) und Nummer aus einem eigenen Dateinamen; null = kein eigener Name.
function parseName(name) {
  const m = ARCHIVE_NAME.exec(name);
  if (!m) return null;
  const at = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(at.getTime()) ? { at, n: Number(m[7] ?? 1) } : null;
}

// Eigene Archivdateien im Ordner (nur normale Dateien, keine Links), neueste zuerst: [{ name, at, n }]. Fehlt der Ordner: [].
function ownFiles(dir) {
  const folder = path.join(dir, ARCHIVE_DIR);
  let names;
  try {
    names = fs.readdirSync(folder);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return [];
    throw e;
  }
  const out = [];
  for (const name of names) {
    const parsed = parseName(name);
    if (!parsed) continue;
    try {
      if (fs.lstatSync(path.join(folder, name)).isFile()) out.push({ name, ...parsed });
    } catch {
      // inzwischen weg: zählt nicht
    }
  }
  return out.sort((a, b) => b.at - a.at || b.n - a.n);
}

// Löscht eigene Archivdateien über die neuesten keep hinaus; Ergebnis: Namen der gelöschten. keep 0 (oder keine ganze Zahl
// über 0) = nichts löschen (aus), wie bei saveArchive.
export function pruneArchive(dir, keep) {
  if (!(Number.isInteger(keep) && keep > 0)) return [];
  const removed = [];
  for (const f of ownFiles(dir).slice(keep)) {
    fs.rmSync(path.join(dir, ARCHIVE_DIR, f.name), { force: true });
    removed.push(f.name);
  }
  return removed;
}

// Legt die Liste ab (name: Name der Playlist, url: Link zu ihr, tracks: [{ uri, artist, artists?, name }] in ihrer Reihenfolge)
// und räumt auf. keep = archiveCount; 0 (oder ungültig) = aus. Ergebnis: { file (Pfad relativ zu dir), removed } bzw. null.
// Wirft bei Problemen mit dem Ordner – der Aufrufer meldet das nur als Warnung, der Lauf zählt trotzdem.
export function saveArchive(dir, { name, url = null, tracks, lang, keep, now = new Date() }) {
  if (!(Number.isInteger(keep) && keep > 0) || !tracks?.length) return null;
  const folder = path.join(dir, ARCHIVE_DIR);
  fs.mkdirSync(folder, { recursive: true });
  const text = formatExport({ name, url, tracks, lang, now });
  for (let n = 1; n < 1000; n++) {
    const file = archiveName(now, n);
    try {
      fs.writeFileSync(path.join(folder, file), text, { flag: 'wx' }); // nie eine vorhandene Datei überschreiben
      return { file: `${ARCHIVE_DIR}/${file}`, removed: pruneArchive(dir, keep) };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  throw new Error(`${ARCHIVE_DIR}: ${archiveName(now)} …`);
}

// Nach einem Import: die Playlist so ablegen, wie Spotify sie jetzt hat – mit allen Namen, auch zu Zeilen der Datei, die nur
// einen Link enthielten. id: die gerade geschriebene Playlist (writePlaylist), dann ohne Suche nach dem Namen. Fragt Spotify
// nur, wenn das Archiv an ist (keep > 0). Ergebnis wie saveArchive.
export async function archivePlaylist(dir, spotify, { name, lang, keep, id = null }) {
  if (!(Number.isInteger(keep) && keep > 0)) return null;
  const list = await readPlaylist(spotify, name, { id });
  return list ? saveArchive(dir, { name, url: list.url, tracks: list.tracks, lang, keep }) : null;
}

// Songs in einer Archivdatei: Zeilen, die weder leer noch Kommentar ("# …") sind.
const songCount = text => text.split(/\r?\n/).filter(l => l.trim() && !/^#(\s|$)/.test(l.trim())).length;

// Alle Songs aus den eigenen Archivdateien als [{ artist (Hauptkünstler), name }] – für „zum ersten Mal dabei“, wenn sich der
// DJ die gespielten Songs noch nicht merkt (state.played fehlt, z. B. nach dem Update von 0.2.x). Unlesbares fehlt einfach.
export function archivedTracks(dir) {
  const out = [];
  let files;
  try {
    files = ownFiles(dir);
  } catch {
    return out;
  }
  for (const f of files) {
    const text = readArchive(dir, f.name);
    if (text === null) continue;
    try {
      for (const e of parseImport(text, 'en')) {
        if (e.artist && e.title) out.push({ artist: e.artist.split(/,\s+/)[0], name: e.title });
      }
    } catch {
      // leer oder kaputt: zählt nicht
    }
  }
  return out;
}

// Anzahl der eigenen Dateien im Archiv (dieselben, die pruneArchive zählt); null, wenn der Ordner nicht lesbar ist.
export function archiveFileCount(dir) {
  try {
    return ownFiles(dir).length;
  } catch {
    return null;
  }
}

// Link zur Playlist aus der ersten Zeile einer Archivdatei ("# … · https://open.spotify.com/playlist/…"), sonst null.
const playlistLink = text => /^#.*?(https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+)\s*$/.exec(text.split(/\r?\n/, 1)[0])?.[1] ?? null;

// Für „Frühere Playlist …“: [{ id (Dateiname), at (ISO-Zeit), songs, url (Link zur Playlist oder null) }], neueste zuerst.
// Unlesbare Dateien fehlen einfach.
export function listArchive(dir) {
  const out = [];
  for (const f of ownFiles(dir)) {
    try {
      const file = path.join(dir, ARCHIVE_DIR, f.name);
      if (fs.statSync(file).size > IMPORT_MAX_BYTES) continue;
      const text = fs.readFileSync(file, 'utf8');
      out.push({ id: f.name, at: f.at.toISOString(), songs: songCount(text), url: playlistLink(text) });
    } catch {
      // nicht lesbar: nicht anbieten
    }
  }
  return out;
}

// „Vorige Playlist wiederherstellen“ nach einem Lauf bzw. Import, der die Archivdatei after angelegt hat: der Eintrag davor
// (= Stand der Playlist vor diesem Lauf). Nur, solange after noch der neueste Eintrag ist – sonst hat inzwischen etwas
// anderes die Playlist geschrieben (z. B. ein automatischer Lauf), und „zurück“ wäre nicht mehr eindeutig. entries wie
// listArchive (neueste zuerst). Ergebnis: Eintrag { id, at, songs, url } oder null.
// Nur ein Stand derselben Playlist (gleicher Link): Listen, die als neue Playlist angelegt wurden („Neu in Spotify anlegen“),
// liegen auch im Archiv, waren aber nie der Inhalt dieser Playlist. Ohne Link (unbekannt) zählt jeder Eintrag.
export function undoTarget(entries, after) {
  if (typeof after !== 'string' || !Array.isArray(entries) || entries[0]?.id !== after) return null;
  const url = entries[0].url;
  return entries.slice(1).find(e => !url || !e?.url || e.url === url) ?? null;
}

// Inhalt eines Eintrags (id = Dateiname aus listArchive). Nur eigene Namen (kein Pfad, kein ..), nur normale Dateien bis
// IMPORT_MAX_BYTES; sonst null (= gibt es nicht).
export function readArchive(dir, id) {
  if (typeof id !== 'string' || !parseName(id) || path.basename(id) !== id) return null;
  const file = path.join(dir, ARCHIVE_DIR, id);
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > IMPORT_MAX_BYTES) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
