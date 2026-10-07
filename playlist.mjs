// Die Playlist des DJ in Spotify schreiben und lesen, dazu das Textformat für „Als Textdatei speichern“ und den Import.
//
// Textdatei (UTF-8, eine Zeile pro Song, Zeilen mit # am Anfang sind Kommentare):
//   # Tweakable DJ – exportiert am 5.10.2026, 14:03 · https://open.spotify.com/playlist/…
//   # 50 Songs · eine Zeile pro Song: Künstler – Titel, Tabulator, Link zu Spotify
//   Hauptkünstler, Gast – Titel<Tab>https://open.spotify.com/track/…
// Künstler wie bei Spotify: alle Beteiligten, der Hauptkünstler zuerst, mit ", " getrennt.
// Tabulator statt zwei Leerzeichen vor dem Link: Er kommt in Namen und Titeln nicht vor (zwei Leerzeichen schon), und
// Tabellenprogramme teilen die Zeile daran in zwei Spalten. Der Import sucht den Link ohnehin irgendwo in der Zeile, verträgt
// also auch einen Editor, der den Tabulator in Leerzeichen umwandelt.
//
// Import (parseImport, resolveImport): leere Zeilen und Kommentare zählen nicht. Ein Link bzw. eine URI zu einem Song
// (open.spotify.com/track/ID, auch mit /intl-de/ oder ?si=…, bzw. spotify:track:ID) gilt direkt, sonst wird
// "Künstler – Titel" (Trenner –, — oder " - ") auf Spotify gesucht. Eine exportierte Datei ergibt so wieder genau dieselbe
// Liste. Ein Import schreibt nur die Playlist, nicht den Verlauf des DJ (state.json): Es ist deine Liste, kein Lauf des DJ.
// Aus demselben Grund filtert er weder die Sperrliste der Songs noch explizite Songs heraus, sondern nennt sie nur
// (importHints): Wer sie in die Datei schreibt, will sie wohl hören – und der Import zeigt vorher, was er schreibt.
import { LIMITS } from './config.mjs';
import { locale, t, tError } from './i18n.mjs';
import { trackBlocker } from './lineup.mjs';

export const IMPORT_MAX_SONGS = LIMITS.size.max; // so viele Songs wie die größte Playlist eines Laufs
export const IMPORT_MAX_BYTES = 1_000_000;

export const playlistUrl = id => `https://open.spotify.com/playlist/${id}`;
const trackUrl = uri => `https://open.spotify.com/track/${uri.slice('spotify:track:'.length)}`;

// Höchstens limit Aufgaben gleichzeitig, Reihenfolge der Ergebnisse egal (fn schreibt selbst).
export async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

// Datum und Uhrzeit im Format der Sprache, z. B. "5.10.2026" und "14:03" bzw. "10/5/2026" und "02:03 PM".
export function dateTime(lang, d) {
  return {
    date: d.toLocaleDateString(locale(lang)),
    time: d.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' }),
  };
}

// --- Spotify ---

// Schreibt uris (in dieser Reihenfolge) in die eigene Playlist name und setzt die Beschreibung; legt sie bei Bedarf an.
// create: immer eine neue Playlist anlegen, auch wenn es schon eine mit diesem Namen gibt („Als neue Playlist anlegen“).
// Eine Beschreibung, die sich nicht setzen lässt, ist nur eine Warnung (warn). Ergebnis: { id, url, created }.
export async function writePlaylist(spotify, { name, uris, description, lang, warn = () => {}, create = false }) {
  let id = create ? null : await spotify.findPlaylist(name, (await spotify.me()).id);
  const created = !id;
  if (created) id = await spotify.createPlaylist(name, t(lang, 'run.newPlaylist'));
  await spotify.replacePlaylist(id, uris);
  await spotify.setDescription(id, description).catch(e => warn(t(lang, 'run.descriptionFailed', { message: e.message })));
  return { id, url: playlistUrl(id), created };
}

// Name einer neuen Playlist („Als neue Playlist anlegen“ in der Oberfläche, dj.mjs --new): „<Name> · <Datum> <Uhrzeit>“
// im Format der Sprache, z. B. "Tweakable DJ · 07.10.2026 15:32" bzw. "Tweakable DJ · 10/07/2026 03:32 PM". Nur gewöhnliche
// Leerzeichen (manche Sprachen setzen geschützte, z. B. vor „PM“) und keine Steuerzeichen.
export function newPlaylistName(name, lang, now = new Date()) {
  const date = now.toLocaleDateString(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
  return clean(`${clean(name)} · ${date} ${time}`.replace(/[   ]/g, ' '));
}

// Inhalt der eigenen Playlist name: { id, url, tracks } bzw. null, wenn es sie (noch) nicht gibt.
export async function readPlaylist(spotify, name) {
  const me = await spotify.me();
  const id = await spotify.findPlaylist(name, me.id);
  if (!id) return null;
  return { id, url: playlistUrl(id), tracks: await spotify.playlistTracks(id) };
}

// --- Als Textdatei speichern ---

// Steuerzeichen (auch Tabulator und Zeilenumbruch) aus Namen entfernen, damit jede Zeile genau ein Song bleibt.
const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim();
export const artistText = track => (track.artists?.length ? track.artists : [track.artist]).map(clean).filter(Boolean).join(', ');

// Text der Datei. url: Link zur Playlist (fehlt beim Probelauf), trialAt: Zeitpunkt des Probelaufs, der noch nicht in der
// Playlist steht.
export function formatExport({ name, url = null, tracks, lang, now = new Date(), trialAt = null }) {
  const lines = [`# ${t(lang, 'export.header', { name: clean(name), ...dateTime(lang, now) })}${url ? ` · ${url}` : ''}`];
  if (trialAt) lines.push(`# ${t(lang, 'export.trial', dateTime(lang, trialAt))}`);
  lines.push(`# ${t(lang, 'export.format', { count: tracks.length })}`);
  for (const track of tracks) lines.push(`${artistText(track)} – ${clean(track.name)}\t${trackUrl(track.uri)}`);
  return `${lines.join('\n')}\n`;
}

// Dateiname mit dem Datum (Ortszeit): tweakable-dj-2026-10-05.txt, für einen Probelauf tweakable-dj-2026-10-05-probelauf.txt.
export function exportFileName(lang, now = new Date(), trial = false) {
  const two = n => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  return `tweakable-dj-${day}${trial ? `-${t(lang, 'export.trialSuffix')}` : ''}.txt`;
}

// --- Textdatei importieren ---

// Song-ID: 22 Zeichen aus A–Z, a–z, 0–9. Davor die Adresse (auch mit Sprachteil wie /intl-de/) bzw. "spotify:track:".
const TRACK = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:[-_][a-z]{2})?\/)?track\/|spotify:track:)([A-Za-z0-9]{22})(?![A-Za-z0-9])/i;
// Link bzw. URI zu etwas anderem (Album, Playlist, Folge …): lässt sich nicht als Song übernehmen.
const OTHER_LINK = /open\.spotify\.com\/|spotify\.link\/|spotify:[a-z]+:/i;
// Erster Trenner zwischen Künstler und Titel: – oder — (mit oder ohne Leerzeichen) bzw. " - " (Bindestrich nur mit
// Leerzeichen, wegen Namen wie "Jay-Z" oder "Blink-182").
const SEPARATOR = /^(.+?)(?:\s*[–—]\s*|\s+-\s+)(.+)$/;
const URI = /^spotify:track:[A-Za-z0-9]{22}$/;

// Kommentar = Zeile mit # am Anfang. Ausnahme, damit Künstler wie "#1 Dads" heil zurückkommen: # direkt vor einem Namen
// in einer Zeile mit Link zu einem Song (so schreibt sie der Export). "# …" mit Leerzeichen bleibt immer ein Kommentar.
const isComment = line => line.startsWith('#') && (/^#(\s|$)/.test(line) || !TRACK.test(line));

// Zeile mit Link: dazu Künstler und Titel davor, falls sie dort stehen (so schreibt sie der Export) – für die Hinweise auf
// gesperrte Songs. Der Link allein bestimmt den Song.
function parseLine(line) {
  const link = line.match(TRACK);
  if (link) {
    const before = line.slice(0, link.index).replace(/\S+$/, '').trim().match(SEPARATOR);
    return { uri: `spotify:track:${link[1]}`, ...(before && { artist: before[1].trim(), title: before[2].trim() }) };
  }
  if (OTHER_LINK.test(line)) return { problem: 'link' };
  const m = line.match(SEPARATOR);
  // Rest hinter einem Tabulator (z. B. eine zweite Spalte aus einer Tabelle) gehört nicht zum Titel.
  const title = m?.[2].split('\t')[0].trim();
  if (!m || !title) return { problem: 'format' };
  return { artist: m[1].trim(), title };
}

// Text der Datei → Einträge { line (Zeilennummer ab 1), text, uri } bzw. { line, text, artist, title } bzw.
// { line, text, problem: 'link' | 'format' }. Wirft bei leerer Datei, zu vielen Songs oder zu großem Text.
export function parseImport(text, lang) {
  const raw = String(text ?? '');
  if (Buffer.byteLength(raw, 'utf8') > IMPORT_MAX_BYTES) throw tError(lang, 'import.tooLarge');
  const entries = [];
  raw.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).forEach((value, i) => {
    const line = value.trim();
    if (!line || isComment(line)) return;
    entries.push({ line: i + 1, text: line.length > 200 ? `${line.slice(0, 199)}…` : line, ...parseLine(line) });
  });
  if (!entries.length) throw tError(lang, 'import.empty');
  if (entries.length > IMPORT_MAX_SONGS) throw tError(lang, 'import.tooMany', { count: entries.length, max: IMPORT_MAX_SONGS });
  return entries;
}

// Sucht einen Song aus der Datei ({ uri, artist, name, explicit } wie spotify.findTrack, null = nicht gefunden).
// Mehrere Künstler ("A, B") findet Spotify nicht immer: dann noch einmal nur mit dem ersten.
async function searchImported(spotify, artist, title) {
  const hit = await spotify.findTrack(artist, title);
  const first = artist.split(', ')[0];
  return hit ?? (first !== artist ? spotify.findTrack(first, title) : null);
}

// Fehler, bei denen weitere Suchen nichts bringen (Anmeldung, 403, Rate-Limit über 2 Minuten): ganzen Import abbrechen.
const fatal = e => Boolean(e.errorCode) || [401, 403].includes(e.status) || e.rateLimit;

// Einträge aus parseImport → { uris (Reihenfolge der Datei), notFound: [{ line, text, reason }], tracks } mit reason 'link',
// 'format', 'notFound' (auf Spotify nicht gefunden) oder 'error' (Suche fehlgeschlagen, z. B. ohne Internet).
// tracks: zu jeder URI in uris { line, text, uri, artist, name, explicit } – bei Links Künstler (Hauptkünstler) und Titel aus
// der Zeile, sofern sie dort stehen, und explicit null (unbekannt, dafür bräuchte es eine Anfrage pro Song).
// onProgress(fertig, gesamt) nach jeder Suche; signal bricht ab (z. B. Seite geschlossen).
export async function resolveImport(spotify, entries, { onProgress = () => {}, signal = null, concurrency = 3 } = {}) {
  const found = new Map();
  const failed = new Map();
  const search = entries.filter(e => !e.uri && !e.problem);
  let done = 0;
  await mapLimit(search, concurrency, async e => {
    if (signal?.aborted) throw new Error('aborted');
    try {
      const hit = await searchImported(spotify, e.artist, e.title);
      if (hit) found.set(e, hit);
      else failed.set(e, 'notFound');
    } catch (err) {
      if (fatal(err)) throw err;
      failed.set(e, 'error');
    }
    onProgress(++done, search.length);
  });
  const uris = [];
  const notFound = [];
  const tracks = [];
  for (const e of entries) {
    const hit = found.get(e);
    const uri = e.uri ?? hit?.uri;
    if (!uri) {
      notFound.push({ line: e.line, text: e.text, reason: e.problem ?? failed.get(e) ?? 'notFound' });
      continue;
    }
    uris.push(uri);
    tracks.push(hit
      ? { line: e.line, text: e.text, uri, artist: hit.artist ?? null, name: hit.name ?? null, explicit: typeof hit.explicit === 'boolean' ? hit.explicit : null }
      : { line: e.line, text: e.text, uri, artist: e.artist?.split(', ')[0] ?? null, name: e.title ?? null, explicit: null });
  }
  return { uris, notFound, tracks };
}

// Hinweise für die Vorschau eines Imports (tracks aus resolveImport, cfg mit blockedTracks und excludeExplicit):
// { blocked, explicit } – je [{ line, text }] der Songs, die ein Lauf des DJ auslassen würde. Explizite nur mit
// excludeExplicit und nur, wo Spotify es bei der Suche gesagt hat.
export function importHints(tracks, cfg = {}) {
  const isBlocked = trackBlocker(cfg.blockedTracks);
  const lines = list => list.map(s => ({ line: s.line, text: s.text }));
  return {
    blocked: lines(tracks.filter(isBlocked)),
    explicit: cfg.excludeExplicit === true ? lines(tracks.filter(s => s.explicit === true)) : [],
  };
}

// Liste aus der Oberfläche (POST /api/import) prüfen: 1 bis IMPORT_MAX_SONGS Song-URIs.
export const validUris = uris => Array.isArray(uris) && uris.length > 0 && uris.length <= IMPORT_MAX_SONGS
  && uris.every(u => typeof u === 'string' && URI.test(u));

// Beschreibung der Playlist nach einem Import.
export const importDescription = (lang, now, count) => t(lang, 'import.description', { ...dateTime(lang, now), count });
