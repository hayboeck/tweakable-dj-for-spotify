// Lesen und Schreiben der config.jsonc (gemeinsam für dj.mjs und ui.mjs).
// Funktionen mit Meldungen bekommen die Sprache (lang: 'de' | 'en') als letzten Parameter; ohne kommen sie auf Englisch.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS, resolveLang, t, tError } from './i18n.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG = path.join(HERE, 'config.jsonc');

// Vorlage je Sprache: Englisch ist der Standard, Deutsch liegt daneben.
const EXAMPLES = { en: 'config.example.jsonc', de: 'config.example.de.jsonc' };
export function exampleFile(lang) {
  const file = path.join(HERE, EXAMPLES[resolveLang(lang)]);
  return fs.existsSync(file) ? file : path.join(HERE, EXAMPLES.en);
}

// Einstellbare Werte und ihre Standards. Nur diese darf die Oberfläche ändern.
export const DEFAULTS = {
  seed: 'liked',
  playlistName: 'Tweakable DJ',
  size: 50,
  familiarShare: 0.15,
  adventure: 0.4,
  maxPerArtist: 2,
  artistWindow: 20,
  maxPerWindow: 3,
  artistGap: 4,
  excludeRecentDays: 14,
  noRepeatRuns: 3,
  seedsPerRun: 20,
  useLastfmTopTracks: true,
  currentDays: 7,
  currentFactor: 3,
  blockedArtists: [],
  schedule: 'off',
  scheduleTime: '07:00',
  scheduleDay: 'MON',
  language: '', // '' = noch nicht gewählt, dann gilt die Systemsprache
};

// Automatik: wie oft, um wie viel Uhr (24 h) und an welchem Wochentag (nur bei 'weekly').
export const SCHEDULES = ['off', 'daily', 'weekly'];
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// "liked" oder eine Spotify-Playlist (Link, URI oder ID) – so versteht es dj.mjs.
const SEED = /^(liked|https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+(\?\S*)?|spotify:playlist:[A-Za-z0-9]+|[A-Za-z0-9]{22})$/;

// Zugangsdaten aus dem Einrichtungs-Assistenten: Feld → Stelle in der config.jsonc, Formatprüfung und Meldung.
const CREDENTIALS = {
  clientId: { path: 'spotify.clientId', ok: v => /^[0-9a-f]{32}$/i.test(v), error: 'config.badClientId' },
  apiKey: { path: 'lastfm.apiKey', ok: v => /^[0-9a-f]{32}$/i.test(v), error: 'config.badApiKey' },
  user: { path: 'lastfm.user', ok: v => v === '' || /^[\w.-]{2,30}$/.test(v), error: 'config.badUser' },
  seed: { path: 'seed', ok: v => SEED.test(v), error: 'config.badSeed' },
};

// Entfernt //-Kommentare außerhalb von Strings, damit JSON.parse die config.jsonc lesen kann.
export function stripComments(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else {
      out += c;
    }
  }
  return out;
}

function parse(text, lang) {
  try {
    return JSON.parse(stripComments(text));
  } catch (e) {
    throw tError(lang, 'config.invalid', { detail: e.message });
  }
}

// Legt config.jsonc aus der Vorlage der Sprache an, falls sie fehlt. true = gerade angelegt.
export function ensureConfig(lang) {
  if (fs.existsSync(CONFIG)) return false;
  fs.copyFileSync(exampleFile(lang), CONFIG, fs.constants.COPYFILE_EXCL);
  return true;
}

// Gewählte Sprache aus der config.jsonc, ohne sie anzulegen oder zu prüfen ('' = keine oder nicht lesbar).
export function configLanguage() {
  try {
    const value = JSON.parse(stripComments(fs.readFileSync(CONFIG, 'utf8'))).language;
    return LANGS.includes(value) ? value : '';
  } catch {
    return '';
  }
}

// Liest die Config ohne Prüfung der Zugangsdaten.
export function readConfig(lang) {
  if (ensureConfig(lang)) {
    throw tError(lang, 'config.created', { file: CONFIG }, { errorCode: 'setup_incomplete' });
  }
  return { ...DEFAULTS, ...parse(fs.readFileSync(CONFIG, 'utf8'), lang) };
}

// Platzhalter aus den Vorlagen: "HIER_…" (deutsch) bzw. "ENTER_…" (englisch).
const PLACEHOLDER = /^(HIER|ENTER_)/;
export const isPlaceholder = v => typeof v !== 'string' || !v.trim() || PLACEHOLDER.test(v);

// Welche Zugangsdaten fehlen noch? Leere Liste = vollständig.
export function missingCredentials(cfg) {
  const missing = [];
  if (isPlaceholder(cfg.spotify?.clientId)) missing.push('spotify.clientId');
  if (isPlaceholder(cfg.lastfm?.apiKey)) missing.push('lastfm.apiKey');
  if (typeof cfg.seed !== 'string' || !cfg.seed || /HIER|ENTER_/.test(cfg.seed)) missing.push('seed');
  if (typeof cfg.lastfm?.user === 'string' && PLACEHOLDER.test(cfg.lastfm.user)) missing.push('lastfm.user');
  return missing;
}

export function loadConfig(lang) {
  const cfg = readConfig(lang);
  const missing = missingCredentials(cfg).map(k => (k === 'lastfm.user' ? t(lang, 'config.userOrEmpty') : k));
  if (missing.length) {
    throw tError(lang, 'config.incomplete', { missing: missing.join(', ') }, { errorCode: 'setup_incomplete' });
  }
  return cfg;
}

// Prüft Einstellungen aus der Oberfläche und gibt sie gesäubert zurück; wirft bei ungültigen Werten.
export function checkValues(values, lang) {
  const clean = {};
  for (const [key, value] of Object.entries(values)) {
    // hasOwn statt in: "__proto__", "constructor" usw. sind keine Einstellungen
    if (!Object.hasOwn(DEFAULTS, key)) throw tError(lang, 'config.unknownSetting', { key });
    clean[key] = checkValue(key, value, lang);
  }
  return clean;
}

// Ändert einzelne Einstellungen aus der Oberfläche; Kommentare und Reihenfolge bleiben erhalten.
// Fehlt config.jsonc, wird sie vorher aus der Vorlage angelegt (z. B. Sprachwahl vor der Einrichtung).
export function updateConfig(values, lang) {
  const clean = checkValues(values, lang);
  ensureConfig(lang);
  writeValues(clean, lang);
}

export function checkValue(key, value, lang) {
  const standard = DEFAULTS[key];
  if (key === 'language') {
    if (!['', ...LANGS].includes(value)) throw tError(lang, 'config.badLanguage');
    return value;
  }
  if (Array.isArray(standard)) {
    if (!Array.isArray(value) || value.length > 500 || !value.every(v => typeof v === 'string')) {
      throw tError(lang, 'config.listExpected', { key });
    }
    // Leerzeichen säubern, Leere und Doppelte (Groß/Klein egal) weglassen.
    const seen = new Set();
    const out = [];
    for (const raw of value) {
      const v = raw.trim().replace(/\s+/g, ' ');
      if (v.length > 200) throw tError(lang, 'config.entryTooLong', { key });
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      out.push(v);
    }
    return out;
  }
  const expected = typeof standard;
  if (typeof value !== expected) throw tError(lang, 'config.typeExpected', { key, type: expected });
  if (expected === 'number' && !(Number.isFinite(value) && value >= 0)) throw tError(lang, 'config.badNumber', { key });
  if (expected === 'string' && !(value.trim() && value.length <= 200)) throw tError(lang, 'config.badText', { key });
  if (key === 'seed' && !SEED.test(value)) throw tError(lang, CREDENTIALS.seed.error);
  if (key === 'schedule' && !SCHEDULES.includes(value)) throw tError(lang, 'config.badSchedule');
  if (key === 'scheduleTime' && !TIME.test(value)) throw tError(lang, 'config.badTime');
  if (key === 'scheduleDay' && !WEEKDAYS.includes(value)) throw tError(lang, 'config.badDay', { days: WEEKDAYS.join(', ') });
  return value;
}

// Speichert Zugangsdaten und Quelle aus dem Einrichtungs-Assistenten (clientId, apiKey, user, seed – jeweils optional).
// Fehlt config.jsonc, wird sie vorher aus der Vorlage angelegt.
export function saveCredentials(values, lang) {
  const entries = {};
  for (const [name, raw] of Object.entries(values)) {
    const field = Object.hasOwn(CREDENTIALS, name) ? CREDENTIALS[name] : null;
    if (!field) throw tError(lang, 'config.unknownField', { name });
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (typeof value !== 'string' || !field.ok(value)) throw tError(lang, field.error);
    entries[field.path] = value;
  }
  ensureConfig(lang);
  writeValues(entries, lang);
}

// --- Werte direkt im Text ändern ---

const getPath = (obj, keyPath) => keyPath.split('.').reduce((o, k) => o?.[k], obj);

function setPath(obj, keyPath, value) {
  const keys = keyPath.split('.');
  const last = keys.pop();
  let o = obj;
  for (const k of keys) o = o[k] = o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? o[k] : {};
  o[last] = value;
}

// JSON mit sortierten Schlüsseln, damit die Reihenfolge beim Vergleich keine Rolle spielt.
const canon = v => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
  : x));

// Schreibt Werte (Pfad wie "lastfm.user" → Wert) in die config.jsonc: Kommentare, Reihenfolge und Ausrichtung bleiben.
// Fehlende Schlüssel kommen samt Erklärung aus der Vorlage der Sprache lang dazu.
function writeValues(entries, lang) {
  if (!fs.existsSync(CONFIG)) throw tError(lang, 'config.missing');
  const original = fs.readFileSync(CONFIG, 'utf8');
  const before = parse(original, lang);
  const expected = structuredClone(before);
  const nodes = scan(original, lang);
  const home = usualColumn(original);
  let text = original;
  for (const [keyPath, value] of Object.entries(entries)) {
    setPath(expected, keyPath, value);
    // Unverändert = Text nicht anfassen (so bleiben z. B. Kommentare innerhalb einer Liste erhalten).
    if (canon(getPath(before, keyPath)) === canon(value)) continue;
    const node = nodes.get(keyPath);
    text = setValue(text, keyPath, value, { home, col: node ? commentColumn(original, node) : null, lang });
  }
  // Sicherheitsnetz: nur schreiben, wenn die Datei danach gültig ist und sich genau diese Werte geändert haben.
  let after;
  try {
    after = JSON.parse(stripComments(text));
  } catch {
    after = undefined;
  }
  if (canon(after) !== canon(expected)) throw tError(lang, 'config.unsafe');
  if (text !== original) fs.writeFileSync(CONFIG, text);
}

// Zerlegt gültiges JSONC und merkt sich, wo jeder Wert steht: Pfad ("lastfm.user") → { start, end, members }.
function scan(text, lang) {
  const nodes = new Map();
  let i = 0;
  const skip = () => {
    for (;;) {
      if (/\s/.test(text[i] ?? '')) i++;
      else if (text.startsWith('//', i)) while (i < text.length && text[i] !== '\n') i++;
      else return;
    }
  };
  const fail = () => {
    throw tError(lang, 'config.unexpectedChar', { pos: i });
  };
  const string = () => {
    if (text[i] !== '"') fail();
    const start = i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    return JSON.parse(text.slice(start, ++i));
  };
  const value = keyPath => {
    skip();
    const node = { start: i };
    if (text[i] === '{') {
      node.members = [];
      for (i++, skip(); i < text.length && text[i] !== '}'; skip()) {
        const keyStart = i;
        const name = string();
        skip();
        if (text[i++] !== ':') fail();
        const member = { name, keyStart, node: value(keyPath ? `${keyPath}.${name}` : name) };
        skip();
        if (text[i] === ',') member.comma = i++;
        node.members.push(member);
      }
      i++;
    } else if (text[i] === '[') {
      for (i++, skip(); i < text.length && text[i] !== ']'; skip()) {
        value(`${keyPath}[]`);
        skip();
        if (text[i] === ',') i++;
      }
      i++;
    } else if (text[i] === '"') {
      string();
    } else {
      const n = /^[\w.+-]*/.exec(text.slice(i))[0].length;
      if (!n) fail();
      i += n;
    }
    node.end = i;
    nodes.set(keyPath, node);
    return node;
  };
  value('');
  return nodes;
}

// So stehen Werte in der config.jsonc: ["A", "B"] bzw. { "user": "x" }.
function literal(value) {
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${literal(v)}`);
    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

const lineEnd = (text, from) => {
  const eol = text.indexOf('\n', from);
  return eol < 0 ? text.length : eol;
};

// Kommentar hinter einem Wert in derselben Zeile: [Text dazwischen, Leerzeichen, Kommentar]
const trailing = rest => /^([^/\n]*?)( {2,})(\/\/.*)$/.exec(rest);

// Spalte, in der die meisten Kommentare hinter Werten beginnen (in den Vorlagen 38).
function usualColumn(text) {
  const count = new Map();
  for (const line of text.split('\n')) {
    const m = /^(\s*"[^\n]*?)( {2,})\/\//.exec(line);
    if (m) count.set(m[0].length - 2, (count.get(m[0].length - 2) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 38;
}

// Spalte des Kommentars in der Zeile, in der ein Wert endet (null = kein Kommentar).
function commentColumn(text, node) {
  const lineStart = text.lastIndexOf('\n', node.start - 1) + 1;
  const m = trailing(text.slice(node.end, lineEnd(text, node.end)));
  return m ? node.end - lineStart + m[1].length + m[2].length : null;
}

// Ersetzt text[start, end) und hält einen Kommentar in derselben Zeile in seiner Spalte (col = Spalte vor dem Speichern).
// Wurde er nur weggeschoben (2 Leerzeichen) und passt es wieder, rückt er zurück in die übliche Spalte.
function replaceValue(text, start, end, value, { col, home } = {}) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const eol = lineEnd(text, end);
  let rest = text.slice(end, eol);
  const m = trailing(rest);
  if (m && !value.includes('\n')) {
    const prefix = start - lineStart + value.length + m[1].length;
    let target = col ?? end - lineStart + m[1].length + m[2].length;
    if (home && target > home && m[2].length === 2 && prefix + 2 <= home) target = home;
    rest = m[1] + ' '.repeat(Math.max(2, target - prefix)) + m[3];
  }
  return text.slice(0, start) + value + rest + text.slice(eol);
}

function setValue(text, keyPath, value, layout = {}) {
  const nodes = scan(text, layout.lang);
  const node = nodes.get(keyPath);
  if (node) return replaceValue(text, node.start, node.end, literal(value), layout);

  const dot = keyPath.lastIndexOf('.');
  const parentPath = dot < 0 ? '' : keyPath.slice(0, dot);
  const name = keyPath.slice(dot + 1);
  const parent = nodes.get(parentPath);
  if (!parent?.members) {
    if (!parentPath) throw tError(layout.lang, 'config.notObject');
    return setValue(text, parentPath, { [name]: value }, layout); // Elternobjekt fehlt → mit anlegen
  }
  if (parentPath) {
    // Verschachtelt: in derselben Zeile anhängen, z. B. "lastfm": { "apiKey": "…", "user": "…" }
    const last = parent.members.at(-1);
    const at = last ? last.node.end : parent.start + 1;
    const add = `${last ? ',' : ''} ${JSON.stringify(name)}: ${literal(value)}${last ? '' : ' '}`;
    return text.slice(0, at) + add + text.slice(at);
  }
  return insertMember(text, parent, name, literal(value), layout.home ?? 38, layout.lang);
}

// Holt Erklärung und Gruppenüberschrift eines Schlüssels aus der Vorlage der Sprache lang.
function template(name, lang) {
  let tpl;
  try {
    tpl = fs.readFileSync(exampleFile(lang), 'utf8');
    JSON.parse(stripComments(tpl));
  } catch {
    return null;
  }
  const members = scan(tpl, lang).get('').members ?? [];
  const idx = members.findIndex(m => m.name === name);
  if (idx < 0) return null;
  const m = members[idx];
  const rest = tpl.slice(m.comma != null ? m.comma + 1 : m.node.end, lineEnd(tpl, m.node.end));
  const comment = /^\s*(\/\/.*?)\s*$/.exec(rest)?.[1] ?? '';
  // Kommentarzeilen direkt darüber, z. B. "// --- Sperrliste ---"
  const above = tpl.slice(0, m.keyStart).split('\n');
  const own = !above.pop().trim(); // Schlüssel steht am Zeilenanfang?
  const header = [];
  while (own && above.length && above.at(-1).trim().startsWith('//')) header.unshift(above.pop());
  const blankBefore = header.length > 0 && above.length > 0 && !above.at(-1).trim();
  return { comment, header, blankBefore, before: members.slice(0, idx).map(x => x.name).reverse() };
}

// Fügt einen fehlenden Schlüssel samt Erklärung aus der Vorlage ein: hinter dem Schlüssel,
// der ihm in der Vorlage vorausgeht (sonst ans Ende); Kommas werden passend gesetzt.
function insertMember(text, root, name, valueText, home, lang) {
  const tpl = template(name, lang);
  const members = root.members;
  let idx = tpl ? members.findIndex(m => m.name === tpl.before.find(b => members.some(x => x.name === b))) : members.length - 1;
  const header = tpl ? tpl.header.filter(line => !text.includes(line.trim())) : [];
  const line = hasNext => {
    const s = `  ${JSON.stringify(name)}: ${valueText}${hasNext ? ',' : ''}`;
    return tpl?.comment ? s.padEnd(Math.max(home, s.length + 2)) + tpl.comment : s;
  };
  // Neuen Text bei "from" einfügen: ans Zeilenende, wenn dort nur noch ein Kommentar steht, sonst in eine eigene Zeile.
  const place = (src, from, limit, lines) => {
    const eol = src.indexOf('\n', from);
    return eol >= 0 && eol < limit
      ? `${src.slice(0, eol)}\n${lines.join('\n')}${src.slice(eol)}`
      : `${src.slice(0, from)}\n${lines.join('\n')}\n${src.slice(from)}`;
  };

  if (idx < 0) {
    // Ganz vorne (erster Schlüssel der Vorlage oder leeres Objekt)
    const first = members[0];
    return place(text, root.start + 1, first ? first.keyStart : root.end - 1, [...header, line(Boolean(first))]);
  }
  // Anker = letzter Schlüssel in seiner Zeile, damit die neue Zeile dahinter passt.
  while (idx + 1 < members.length && !text.slice(members[idx].node.end, members[idx + 1].keyStart).includes('\n')) idx++;
  const anchor = members[idx];
  const next = members[idx + 1];
  let src = text;
  let from = anchor.comma;
  if (!next) {
    // Bisher letzter Schlüssel bekommt ein Komma; dafür ein Leerzeichen weg, damit sein Kommentar in der Spalte bleibt.
    const eat = text.startsWith('  ', anchor.node.end) ? 1 : 0;
    src = `${text.slice(0, anchor.node.end)},${text.slice(anchor.node.end + eat)}`;
    from = anchor.node.end;
  }
  const limit = next ? next.keyStart : scan(src, lang).get('').end - 1;
  const lines = [...(header.length && tpl.blankBefore ? [''] : []), ...header, line(Boolean(next))];
  return place(src, from + 1, limit, lines);
}
