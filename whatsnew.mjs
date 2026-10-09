// „Neu in v0.x.y“: Nach einem Update zeigt die Oberfläche einmal oben einen schließbaren Hinweis mit den wichtigsten
// Punkten aus CHANGELOG.md (deutscher Abschnitt für Deutsch, sonst der englische) und einem Link zum Release auf GitHub.
// Hat das Update Versionen übersprungen (z. B. 0.2.5 → 0.3.3), kommen die Punkte aller Versionen dazwischen dazu („Neu seit
// v0.2.5“), neueste zuerst und begrenzt (changesSince). Eingebunden in ui.mjs (GET und POST /api/whatsnew).
//
// Vorabversionen (z. B. 0.4.0-beta.1, zum Ausprobieren von Hand installiert) haben in CHANGELOG.md einen eigenen Abschnitt
// „## [0.4.0-beta.1] – Datum“ und zeigen ihn wie jede Version („Neu in v0.4.0-beta.1“). Die reguläre Version (0.4.0) bekommt
// beim Veröffentlichen ihren eigenen, vollständigen Abschnitt mit allem seit der vorigen regulären Version; die Abschnitte
// ihrer Vorabversionen zählen dann nicht mehr (sonst stünde alles doppelt da, und wer nur reguläre Versionen hat, sähe
// Überschriften von Versionen, die er nie hatte). Abschnitte von Vorabversionen zählen also nur für eine laufende
// Vorabversion derselben Nummer (0.4.0-beta.2 zeigt auch die Punkte von 0.4.0-beta.1). Ohne eigenen Abschnitt bleibt der
// Hinweis weg, wie bei jeder Version – der Release-Ablauf (.github/release-check.mjs) verlangt den Abschnitt aber.
// Die gemerkte Version darf eine Vorabversion sein; verglichen wird nach SemVer (0.3.3 < 0.4.0-beta.1 < 0.4.0).
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
import { compareVersions, isPrerelease, parseVersion, repoSlug } from './update.mjs';

export const SEEN_FILE = 'seen-version.json';
export const MAX_ITEMS = 5;
// Über mehrere Versionen: von jeder älteren Version höchstens OLDER_ITEMS Punkte, zusammen höchstens TOTAL_ITEMS.
export const OLDER_ITEMS = 2;
export const TOTAL_ITEMS = 12;
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
  const want = version.replace(/^v/i, '');
  const section = versionSections(text).find(v => v.version === want);
  const items = section ? sectionItems(section.lines, lang) : [];
  if (!items.length) return null;
  return { items: items.slice(0, MAX_ITEMS), more: Math.max(0, items.length - MAX_ITEMS) };
}

// Abschnitte „## [x.y.z] …“ in der Reihenfolge der Datei: [{ version, lines }] (ohne „Unreleased“ und Ähnliches).
function versionSections(text) {
  const out = [];
  let cur = null;
  for (const l of text.replace(/\r/g, '').split('\n')) {
    if (/^##\s/.test(l)) {
      const v = /^##\s+\[?v?([^\]\s]+)\]?/.exec(l)?.[1];
      cur = v && parseVersion(v) ? { version: v, lines: [] } : null;
      if (cur) out.push(cur);
    } else if (cur) {
      cur.lines.push(l);
    }
  }
  return out;
}

// Kurzfassungen aller Punkte eines Abschnitts in der Sprache lang (siehe parseChangelog); [] = keine.
function sectionItems(section, lang) {
  const heading = lang === 'de' ? 'Deutsch' : 'English';
  const from = section.findIndex(l => new RegExp(`^###\\s+${heading}\\s*$`).test(l));
  if (from < 0) return [];
  let to = section.findIndex((l, i) => i > from && /^###\s/.test(l));
  if (to < 0) to = section.length;
  const points = section.slice(from + 1, to).filter(l => /^[-*]\s+\S/.test(l));
  // Gibt es Punkte mit fettem Stichwort, nur diese (die übrigen ergänzen sie meist nur); sonst alle mit dem ersten Satz.
  const bold = points.filter(l => /^[-*]\s+\*\*[^*]+\*\*/.test(l));
  return (bold.length ? bold : points).map(shortItem).filter(Boolean);
}

// Zählt der Abschnitt der Version v, wenn current läuft? Reguläre Versionen immer, Vorabversionen nur für eine laufende
// Vorabversion derselben Nummer (siehe oben).
const sameCore = (a, b) => parseVersion(a).core.join('.') === parseVersion(b).core.join('.');
const counts = (v, current) => !isPrerelease(v) || (isPrerelease(current) && sameCore(v, current));

// Punkte aller Versionen nach previous bis einschließlich current, neueste zuerst: { sections: [{ version, items }], items
// (alle gezeigten der Reihe nach), more (nicht gezeigte) } oder null (keine Punkte bzw. kein Abschnitt zu current). Von current höchstens MAX_ITEMS, von jeder
// älteren Version höchstens OLDER_ITEMS, zusammen höchstens TOTAL_ITEMS – die wichtigsten stehen in CHANGELOG.md zuerst.
export function changesSince(text, previous, current, lang) {
  if (typeof text !== 'string' || !parseVersion(current)) return null;
  const versions = versionSections(text)
    .filter(v => counts(v.version, current))
    .filter(v => compareVersions(v.version, current) <= 0 && (!parseVersion(previous) || compareVersions(v.version, previous) > 0))
    .sort((a, b) => compareVersions(b.version, a.version));
  // Ohne Abschnitt zur laufenden Version nichts (sonst stünden alte Punkte unter „Neu in“ der neuen).
  if (compareVersions(versions[0]?.version, current) !== 0) return null;
  const sections = [];
  let shown = 0;
  let more = 0;
  for (const [i, v] of versions.entries()) {
    const all = sectionItems(v.lines, lang);
    const take = Math.max(0, Math.min(all.length, i === 0 ? MAX_ITEMS : OLDER_ITEMS, TOTAL_ITEMS - shown));
    if (take) sections.push({ version: v.version, items: all.slice(0, take) });
    shown += take;
    more += all.length - take;
  }
  if (!shown) return null;
  return { sections, items: sections.flatMap(x => x.items), more };
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

// Was die Oberfläche zeigen soll: { version, previous, items, more, sections, url } oder null (nichts zeigen); sections wie bei
// changesSince (eine je Version; bei einem Update über mehrere Versionen mehrere).
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
  const notes = changesSince(changelog, previous, current, lang);
  if (!notes) {
    markSeen(dir, current); // keine Punkte zu dieser Version: nichts zu zeigen
    return null;
  }
  const url = slug ? `https://github.com/${slug}/releases/tag/v${current.replace(/^v/i, '')}` : null;
  return { version: current.replace(/^v/i, ''), previous, ...notes, url };
}
