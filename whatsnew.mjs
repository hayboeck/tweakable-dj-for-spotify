// „Neu in v0.x.y“: Nach einem Update zeigt die Oberfläche einmal oben einen schließbaren Hinweis mit den wichtigsten
// Punkten aus CHANGELOG.md für die neue Version (deutscher Abschnitt für Deutsch, sonst der englische) und einem Link zum
// Release auf GitHub. Eingebunden in ui.mjs (GET und POST /api/whatsnew).
//
// Gemerkt wird die zuletzt gesehene Version in seen-version.json im Programmordner (persönlich wie state.json: nie im
// Repository, nie in der ZIP-Datei, ein Update fasst sie nie an). Serverseitig statt im Browser, weil das auch mit einem
// anderen Browser, im privaten Fenster und nach dem Löschen der Browserdaten stimmt.
//   - Keine Datei: Gab es ein Update auf diese Version („Jetzt aktualisieren“ hinterlässt .update/backup-<alt>/backup.json
//     mit from und to), gilt from als vorige Version – so sieht man den Hinweis auch beim ersten Update auf eine Version,
//     die sich die gesehene Version merkt. Sonst ist es der allererste Start: Version merken, nichts zeigen.
//   - Gemerkte Version älter als die laufende: Hinweis, bis man ihn schließt (POST /api/whatsnew merkt die laufende).
//   - Gleich oder neuer (z. B. zurück auf eine ältere Version): nichts.
// Fehler beim Lesen oder Schreiben sind egal: Dann gibt es eben keinen Hinweis.
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions, parseVersion, repoSlug } from './update.mjs';

export const SEEN_FILE = 'seen-version.json';
export const MAX_ITEMS = 5;
const MAX_LENGTH = 120;

// Markdown einer Zeile zu schlichtem Text: **fett**, *kursiv*, `Code` und [Link](Ziel) ohne Zeichen.
const plain = s => s
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?=[^\w*]|$)/g, '$1$2')
  .replace(/`([^`]*)`/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

// Kurzfassung eines Punkts: das fett gedruckte Stichwort am Anfang („**Archive status**: …“ → „Archive status“), sonst der
// erste Satz; höchstens MAX_LENGTH Zeichen.
export function shortItem(line) {
  const text = line.replace(/^\s*[-*]\s+/, '');
  const bold = /^\*\*([^*]+)\*\*/.exec(text);
  let out = bold ? plain(bold[1]) : firstSentence(plain(text));
  out = out.replace(/[.:;,]+$/, '');
  return out.length > MAX_LENGTH ? `${out.slice(0, MAX_LENGTH - 1).trimEnd()}…` : out;
}

// Abkürzungen, nach denen ein Punkt keinen Satz beendet (dazu jedes einzelne Zeichen wie in „z. B.“).
const ABBREVIATIONS = ['e.g', 'i.e', 'bzw', 'usw', 'etc', 'vs', 'ca', 'Nr', 'p. ej', 'p.ej', 'env', 'cf'];

// Erster Satz (bis . ! ? bzw. : mit Leerzeichen danach); Punkte nach Abkürzungen zählen nicht.
function firstSentence(text) {
  for (const m of text.matchAll(/([.!?:])(?=\s|$)/g)) {
    const before = text.slice(0, m.index);
    const word = /(\S+)$/.exec(before)?.[1] ?? '';
    if (m[1] === '.' && (word.length === 1 || ABBREVIATIONS.some(a => before.endsWith(a)))) continue;
    return before;
  }
  return text;
}

// Punkte zu version aus dem Text von CHANGELOG.md: Abschnitt „## [version] …“ bis zum nächsten „## “, darin „### Deutsch“
// (lang 'de') bzw. „### English“. Jede Zeile „- …“ ist ein Punkt (eingerückte Unterpunkte nicht).
// Ergebnis: { items: [Kurzfassungen, höchstens MAX_ITEMS], more: Anzahl weiterer } oder null (Version, Abschnitt oder
// Punkte fehlen).
export function parseChangelog(text, version, lang) {
  if (typeof text !== 'string' || !parseVersion(version)) return null;
  const lines = text.replace(/\r/g, '').split('\n');
  const want = version.replace(/^v/i, '');
  const start = lines.findIndex(l => {
    const m = /^##\s+\[?v?([^\]\s]+)\]?/.exec(l);
    return m && m[1] === want;
  });
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end);
  const heading = lang === 'de' ? 'Deutsch' : 'English';
  const from = section.findIndex(l => new RegExp(`^###\\s+${heading}\\s*$`).test(l));
  if (from < 0) return null;
  let to = section.findIndex((l, i) => i > from && /^###\s/.test(l));
  if (to < 0) to = section.length;
  const points = section.slice(from + 1, to).filter(l => /^[-*]\s+\S/.test(l));
  // Gibt es Punkte mit fettem Stichwort, nur diese (die übrigen ergänzen sie meist nur); sonst alle mit dem ersten Satz.
  const bold = points.filter(l => /^[-*]\s+\*\*[^*]+\*\*/.test(l));
  const items = (bold.length ? bold : points).map(shortItem).filter(Boolean);
  if (!items.length) return null;
  return { items: items.slice(0, MAX_ITEMS), more: Math.max(0, items.length - MAX_ITEMS) };
}

const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

// Zuletzt gesehene Version (Text) oder null.
export function seenVersion(dir) {
  const v = readJson(path.join(dir, SEEN_FILE))?.version;
  return typeof v === 'string' && parseVersion(v) ? v : null;
}

export function markSeen(dir, version) {
  if (!parseVersion(version)) return false;
  try {
    fs.writeFileSync(path.join(dir, SEEN_FILE), `${JSON.stringify({ version, seenAt: new Date().toISOString() }, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

// Vorige Version laut den Sicherungen von „Jetzt aktualisieren“ (.update/backup-*/backup.json mit to = current); die
// neueste davon, sonst null.
export function updatedFrom(dir, current) {
  let names;
  try {
    names = fs.readdirSync(path.join(dir, '.update'));
  } catch {
    return null;
  }
  let best = null;
  for (const name of names.filter(n => n.startsWith('backup-'))) {
    const b = readJson(path.join(dir, '.update', name, 'backup.json'));
    if (typeof b?.from !== 'string' || typeof b?.to !== 'string' || compareVersions(b.to, current) !== 0) continue;
    if (compareVersions(b.from, current) < 0 && (!best || compareVersions(b.from, best) > 0)) best = b.from;
  }
  return best;
}

// Was die Oberfläche zeigen soll: { version, previous, items, more, url } oder null (nichts zeigen).
// current = laufende Version; changelog = Text von CHANGELOG.md (null = Datei fehlt).
export function whatsNew({ dir, current, lang, changelog, slug = repoSlug() }) {
  if (!parseVersion(current)) return null;
  const seen = seenVersion(dir);
  const previous = seen ?? updatedFrom(dir, current);
  if (!previous) {
    markSeen(dir, current); // allererster Start: ab jetzt merken
    return null;
  }
  if (compareVersions(current, previous) <= 0) return null;
  const notes = parseChangelog(changelog, current, lang);
  if (!notes) {
    markSeen(dir, current); // keine Punkte zu dieser Version: nichts zu zeigen
    return null;
  }
  const url = slug ? `https://github.com/${slug}/releases/tag/v${current.replace(/^v/i, '')}` : null;
  return { version: current.replace(/^v/i, ''), previous, ...notes, url };
}
