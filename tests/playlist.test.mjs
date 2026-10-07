// Textdatei: Format von „Als Textdatei speichern“ (formatExport), Import (parseImport, resolveImport) und End-to-End
// "node dj.mjs export" bzw. "node dj.mjs import" mit simulierten APIs (tests/mock-apis.mjs, Playlists in MOCK_SPOTIFY_STORE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  artistText, exportFileName, formatExport, IMPORT_MAX_BYTES, IMPORT_MAX_SONGS, importHints, parseImport, resolveImport, validUris,
} from '../playlist.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK = pathToFileURL(path.join(ROOT, 'tests', 'mock-apis.mjs')).href;
const id = c => c.repeat(22);
const TRACKS = [
  { uri: `spotify:track:${id('a')}`, name: 'Polarnacht', artist: 'Nordlicht', artists: ['Nordlicht', 'Gaststar', 'Dritte'] },
  { uri: `spotify:track:${id('b')}`, name: 'Song – Live - 2011 Remaster', artist: 'Jay-Z', artists: ['Jay-Z'] },
  { uri: `spotify:track:${id('c')}`, name: 'Tab\tim\nTitel', artist: '#1 Dads', artists: ['#1 Dads'] },
  { uri: `spotify:track:${id('d')}`, name: 'Nur Künstler', artist: 'Stadtkind' },
  { uri: 'spotify:track:0123456789ABCDEFabcdef', name: 'Ünïcödé — ok', artist: 'Björk', artists: ['Björk'] },
];
const NOW = new Date(2026, 9, 5, 14, 3);

// --- Als Textdatei speichern ---

test('formatExport: Kopfzeilen mit #, eine Zeile pro Song mit allen Künstlern, Tabulator, Link', () => {
  const text = formatExport({ name: 'Tweakable DJ', url: 'https://open.spotify.com/playlist/xyz', tracks: TRACKS, lang: 'de', now: NOW });
  assert.ok(text.endsWith('\n') && !text.includes('\r'));
  const lines = text.split('\n').slice(0, -1);
  assert.deepEqual(lines, [
    '# Tweakable DJ – exportiert am 5.10.2026, 14:03 · https://open.spotify.com/playlist/xyz',
    '# 5 Songs · eine Zeile pro Song: Künstler – Titel, Tabulator, Link zu Spotify',
    `Nordlicht, Gaststar, Dritte – Polarnacht\thttps://open.spotify.com/track/${id('a')}`,
    `Jay-Z – Song – Live - 2011 Remaster\thttps://open.spotify.com/track/${id('b')}`,
    `#1 Dads – Tab im Titel\thttps://open.spotify.com/track/${id('c')}`,
    `Stadtkind – Nur Künstler\thttps://open.spotify.com/track/${id('d')}`,
    'Björk – Ünïcödé — ok\thttps://open.spotify.com/track/0123456789ABCDEFabcdef',
  ]);
  assert.ok(lines.slice(2).every(l => l.split('\t').length === 2), 'genau ein Tabulator pro Song');
  // Je nach ICU-Version steht vor AM/PM ein schmales geschütztes Leerzeichen (U+202F) statt eines normalen
  const en = formatExport({ name: 'DJ', tracks: [], lang: 'en', now: NOW, trialAt: new Date(2026, 9, 5, 13, 50) })
    .replace(/\s(?=[AP]M)/g, ' ').split('\n');
  assert.deepEqual(en, ['# DJ – exported on 10/5/2026, 02:03 PM', '# Test run from 10/5/2026, 01:50 PM – not in the playlist yet',
    '# 0 songs · one line per song: artist – title, tab, Spotify link', '']);
  assert.equal(formatExport({ name: 'DJ', tracks: [], lang: 'de', now: NOW, trialAt: NOW }).split('\n')[1], '# Probelauf vom 5.10.2026, 14:03 – noch nicht in der Playlist');
  assert.equal(artistText({ artist: 'A', artists: [] }), 'A');
  assert.equal(exportFileName('de', NOW), 'tweakable-dj-2026-10-05.txt');
  assert.equal(exportFileName('de', NOW, true), 'tweakable-dj-2026-10-05-probelauf.txt');
  assert.equal(exportFileName('en', new Date(2026, 0, 9), true), 'tweakable-dj-2026-01-09-test-run.txt');
});

test('Export → Import: dieselben Songs in derselben Reihenfolge, auch mit # am Anfang, Tabulatoren und Strichen im Titel', () => {
  for (const lang of ['de', 'en']) {
    const text = formatExport({ name: 'DJ', url: 'https://open.spotify.com/playlist/xyz', tracks: [...TRACKS, TRACKS[0]], lang, now: NOW });
    const entries = parseImport(text, lang);
    assert.deepEqual(entries.map(e => e.uri), [...TRACKS, TRACKS[0]].map(t => t.uri), lang);
    assert.deepEqual(entries.map(e => e.line), [3, 4, 5, 6, 7, 8], 'Zeilennummern der Datei');
    // Auch mit Windows-Zeilenenden, BOM und Leerzeichen statt Tabulator
    const windows = `\uFEFF${text.replace(/\t/g, '    ').replace(/\n/g, '\r\n')}`;
    assert.deepEqual(parseImport(windows, lang).map(e => e.uri), entries.map(e => e.uri));
  }
});

// --- Import: Zeilen lesen ---

test('parseImport: Links, URIs (auch mit ?si= und /intl-de/), Trenner –, — und " - ", Kommentare, Fehler je Zeile', () => {
  const text = [
    '# Meine Liste',
    '   ',
    `https://open.spotify.com/track/${id('a')}?si=abc123`,
    `open.spotify.com/intl-de/track/${id('b')}`,
    `spotify:track:${id('c')}`,
    `Irgendwas – Titel <https://open.spotify.com/track/${id('d')}?si=x&utm=y>`,
    'Nordlicht – Polarnacht',
    'Nordlicht—Eisblau',
    'Jay-Z - Empire State of Mind',
    'Blink-182 – All the Small Things\tSpalte 2',
    'AC/DC - Back In Black - 2003 Remaster',
    '#Kommentar ohne Link – zählt nicht',
    `# auskommentiert – mit Link\thttps://open.spotify.com/track/${id('e')}`,
    'https://open.spotify.com/album/1234567890123456789012',
    'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
    'Nur ein Wort',
    'Bindestrich-ohne-Leerzeichen',
    'Künstler –',
    `https://open.spotify.com/track/kurz`,
  ].join('\n');
  const entries = parseImport(text, 'de');
  const view = entries.map(e => [e.line, e.uri ?? (e.problem ? `!${e.problem}` : `${e.artist} | ${e.title}`)]);
  assert.deepEqual(view, [
    [3, `spotify:track:${id('a')}`],
    [4, `spotify:track:${id('b')}`],
    [5, `spotify:track:${id('c')}`],
    [6, `spotify:track:${id('d')}`],
    [7, 'Nordlicht | Polarnacht'],
    [8, 'Nordlicht | Eisblau'],
    [9, 'Jay-Z | Empire State of Mind'],
    [10, 'Blink-182 | All the Small Things'],
    [11, 'AC/DC | Back In Black - 2003 Remaster'],
    [14, '!link'],
    [15, '!link'],
    [16, '!format'],
    [17, '!format'],
    [18, '!format'],
    [19, '!link'],
  ]);
  assert.equal(entries[0].text, `https://open.spotify.com/track/${id('a')}?si=abc123`, 'Text der Zeile für die Liste „nicht gefunden“');
  assert.equal(parseImport(`A – ${'x'.repeat(300)}`, 'de')[0].text.length, 200, 'lange Zeilen gekürzt');
});

test('parseImport: leere Datei, nur Kommentare, zu viele Songs, zu groß', () => {
  for (const text of ['', '\n\n  \n', '# nur\n# Kommentare\n', '\uFEFF']) {
    assert.throws(() => parseImport(text, 'de'), /^Error: Die Datei enthält keine Songs\. Leere Zeilen und Kommentarzeilen zählen nicht\.$/);
    assert.throws(() => parseImport(text, 'en'), /^Error: The file contains no songs\./);
  }
  const lines = n => Array.from({ length: n }, (_, i) => `Künstler ${i} – Titel ${i}`).join('\n');
  assert.equal(IMPORT_MAX_SONGS, 500);
  assert.equal(parseImport(`# Kopf\n# Zweite Kopfzeile\n${lines(500)}\n\n`, 'de').length, 500, '500 Songs plus Kopfzeilen gehen');
  assert.throws(() => parseImport(lines(501), 'de'), /^Error: Die Datei enthält 501 Songs, in die Playlist passen höchstens 500\.$/);
  assert.throws(() => parseImport(lines(1234), 'en'), /^Error: The file contains 1,234 songs; the playlist holds at most 500\.$/);
  assert.throws(() => parseImport('ü'.repeat(IMPORT_MAX_BYTES / 2 + 1), 'de'), /^Error: Die Datei ist zu groß \(höchstens 1 MB\)\.$/, 'Bytes, nicht Zeichen');
});

test('validUris: nur 1 bis 500 Song-URIs', () => {
  assert.ok(validUris([`spotify:track:${id('a')}`]));
  assert.ok(validUris(Array(500).fill(`spotify:track:${id('a')}`)));
  for (const bad of [[], Array(501).fill(`spotify:track:${id('a')}`), ['spotify:album:aaaaaaaaaaaaaaaaaaaaaa'], [`spotify:track:${id('a')}x`],
    [`https://open.spotify.com/track/${id('a')}`], [42], 'spotify:track:x', null, { 0: 'x' }]) {
    assert.equal(validUris(bad), false, JSON.stringify(bad)?.slice(0, 60));
  }
});

// --- Import: Songs suchen ---

// Spotify mit vorgegebenen Antworten: "Künstler|Titel" → URI bzw. { uri, explicit, … } (wie findTrack), null = nicht
// gefunden, Error = Fehler.
function fakeSpotify(answers) {
  const calls = [];
  return {
    calls,
    async findTrack(artist, title) {
      calls.push(`${artist}|${title}`);
      await new Promise(r => setTimeout(r, 1));
      const a = answers[`${artist}|${title}`];
      if (a instanceof Error) throw a;
      if (!a) return null;
      return { artist, name: title, explicit: false, ...(typeof a === 'string' ? { uri: a } : a) };
    },
  };
}

test('resolveImport: Links direkt, sonst Suche (bei mehreren Künstlern auch nur mit dem ersten), Reihenfolge der Datei', async () => {
  const spotify = fakeSpotify({
    'Nordlicht|Polarnacht': `spotify:track:${id('n')}`,
    'Bergfunk|Duett': `spotify:track:${id('g')}`, // nur mit dem ersten Künstler
    'Netz|Weg': Object.assign(new TypeError('fetch failed'), {}),
  });
  const entries = parseImport([
    'Nordlicht – Polarnacht', `spotify:track:${id('a')}`, 'Bergfunk, Gaststar – Duett', 'Gibt – Es nicht', 'Netz – Weg', 'kaputt',
    `https://open.spotify.com/track/${id('a')}`,
  ].join('\n'), 'de');
  const progress = [];
  const { uris, notFound } = await resolveImport(spotify, entries, { onProgress: (done, total) => progress.push(`${done}/${total}`) });
  assert.deepEqual(uris, [`spotify:track:${id('n')}`, `spotify:track:${id('a')}`, `spotify:track:${id('g')}`, `spotify:track:${id('a')}`]);
  assert.deepEqual(notFound, [
    { line: 4, text: 'Gibt – Es nicht', reason: 'notFound' },
    { line: 5, text: 'Netz – Weg', reason: 'error' },
    { line: 6, text: 'kaputt', reason: 'format' },
  ]);
  assert.deepEqual(progress, ['1/4', '2/4', '3/4', '4/4'], 'nur Suchen zählen, Links nicht');
  assert.ok(spotify.calls.includes('Bergfunk, Gaststar|Duett') && spotify.calls.includes('Bergfunk|Duett'));
  assert.ok(!spotify.calls.some(c => c.startsWith('kaputt')));
});

test('resolveImport + importHints: gesperrte und explizite Songs nur als Hinweis, nicht herausgefiltert', async () => {
  const spotify = fakeSpotify({
    'Nordlicht|Polarnacht': { uri: `spotify:track:${id('n')}`, explicit: true },
    'Bergfunk|Gipfelglück (Live)': `spotify:track:${id('g')}`,
    'Stadtkind|Asphalt': `spotify:track:${id('s')}`,
  });
  const entries = parseImport([
    'Nordlicht – Polarnacht', 'Bergfunk – Gipfelglück (Live)', 'Stadtkind – Asphalt',
    `Fernweh, Gast – Horizont\thttps://open.spotify.com/track/${id('f')}`, `spotify:track:${id('x')}`,
  ].join('\n'), 'de');
  const { uris, tracks } = await resolveImport(spotify, entries);
  assert.equal(uris.length, 5, 'nichts herausgefiltert');
  assert.deepEqual(tracks.map(s => [s.line, s.uri === uris[s.line - 1], s.artist, s.name, s.explicit]), [
    [1, true, 'Nordlicht', 'Polarnacht', true],
    [2, true, 'Bergfunk', 'Gipfelglück (Live)', false],
    [3, true, 'Stadtkind', 'Asphalt', false],
    [4, true, 'Fernweh', 'Horizont', null], // Link: Künstler und Titel aus der Zeile, explicit unbekannt
    [5, true, null, null, null],
  ]);
  const cfg = {
    excludeExplicit: true,
    // andere Version (über Künstler und Titel), Link mit Text davor, reine URI
    blockedTracks: [{ artist: 'Bergfunk', name: 'Gipfelglück' }, { artist: 'Fernweh', name: 'Horizont' }, { uri: `spotify:track:${id('x')}`, artist: 'X', name: 'Y' }],
  };
  assert.deepEqual(importHints(tracks, cfg), {
    blocked: [{ line: 2, text: 'Bergfunk – Gipfelglück (Live)' }, { line: 4, text: entries[3].text }, { line: 5, text: `spotify:track:${id('x')}` }],
    explicit: [{ line: 1, text: 'Nordlicht – Polarnacht' }],
  });
  assert.deepEqual(importHints(tracks, { ...cfg, excludeExplicit: false }).explicit, [], 'explizit nur mit excludeExplicit');
  assert.deepEqual(importHints(tracks, {}), { blocked: [], explicit: [] });
});

test('resolveImport: abgelaufene Anmeldung, 403 und langes Rate-Limit brechen ab; Abbruch per signal', async () => {
  for (const error of [Object.assign(new Error('abgelaufen'), { errorCode: 'login_expired' }), Object.assign(new Error('403'), { status: 403 }),
    Object.assign(new Error('Limit'), { rateLimit: true })]) {
    const entries = parseImport('A – B\nC – D', 'de');
    await assert.rejects(resolveImport(fakeSpotify({ 'A|B': error, 'C|D': error }), entries), e => e === error);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(resolveImport(fakeSpotify({}), parseImport('A – B', 'de'), { signal: controller.signal }), /aborted/);
});

// --- End-to-End: node dj.mjs export / import ---

const CONFIG = {
  spotify: { clientId: 'test-client-id' }, lastfm: { apiKey: 'test-lastfm-key', user: 'testhoerer' }, seed: 'liked', playlistName: 'Test-DJ',
  size: 20, seedsPerRun: 12, artistWindow: 10, artistGap: 2, blockedArtists: ['Macloud', 'Rin'],
};

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.mjs') || /^config\.example(\.de)?\.jsonc$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify(CONFIG, null, 2));
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'abgelaufen', refresh_token: 'fake-refresh-token', expires_at: 0 }));
  return dir;
}

function dj(dir, args, env = {}) {
  const logFile = path.join(dir, 'mock-log.jsonl');
  fs.rmSync(logFile, { force: true });
  const res = spawnSync(process.execPath, ['--import', MOCK, 'dj.mjs', ...args], {
    cwd: dir, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, MOCK_LOG: logFile, MOCK_SPOTIFY_STORE: path.join(dir, 'store.json'), TWEAKABLE_DJ_LANG: 'de', ...env },
  });
  const requests = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  assert.deepEqual(requests.filter(r => r.unknown), [], 'unerwartete Adressen');
  const last = res.stdout.split(/\r?\n/).filter(Boolean).at(-1) ?? '';
  assert.ok(last.startsWith('@@RESULT {'), `letzte Zeile ist nicht @@RESULT: ${last}\n${res.stderr}`);
  return { code: res.status, out: res.stdout, err: res.stderr, all: res.stdout + res.stderr, requests, result: JSON.parse(last.slice(9)) };
}
const store = dir => JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8'));
const writes = requests => requests.filter(r => r.host === 'api.spotify.com' && r.verb !== 'GET');

test('export: Playlist aus Spotify als Textdatei; import derselben Datei ergibt dieselbe Playlist, ohne Verlauf', () => {
  const dir = setup();
  try {
    // Ohne Playlist: klare Meldung, keine Datei
    const none = dj(dir, ['export', 'liste.txt']);
    assert.equal(none.code, 1);
    assert.match(none.err, /^Fehler: Die Playlist "Test-DJ" gibt es in deinem Spotify noch nicht\./m);
    assert.equal(fs.existsSync(path.join(dir, 'liste.txt')), false);
    assert.match(dj(dir, ['export'], { TWEAKABLE_DJ_LANG: 'en' }).err, /^Error: The playlist "Test-DJ" doesn’t exist in your Spotify yet\./m);

    // Playlist anlegen (Probelauf übernehmen), dann speichern
    assert.equal(dj(dir, ['--dry']).code, 0);
    assert.equal(dj(dir, ['--apply']).code, 0);
    const [playlist] = store(dir).playlists;
    const exported = dj(dir, ['export', 'liste.txt']);
    assert.equal(exported.code, 0, exported.all);
    assert.deepEqual(writes(exported.requests), []);
    const file = path.join(dir, 'liste.txt');
    // Pfad wie ihn das Programm sieht (unter macOS z. B. /private/var/… statt /var/…)
    const printed = exported.out.match(/^Gespeichert: (.+) \(20 Songs\)$/m)?.[1];
    assert.ok(printed && fs.realpathSync(printed) === fs.realpathSync(file), exported.out);
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    assert.match(lines[0], new RegExp(`^# Test-DJ – exportiert am \\d+\\.\\d+\\.\\d{4}, \\d\\d:\\d\\d · https://open\\.spotify\\.com/playlist/${playlist.id}$`));
    assert.equal(lines[1], '# 20 Songs · eine Zeile pro Song: Künstler – Titel, Tabulator, Link zu Spotify');
    assert.deepEqual(lines.slice(2, -1).map(l => `spotify:track:${l.split('/track/')[1]}`), playlist.uris);
    assert.ok(lines.slice(2, -1).every(l => /^.+ – .+\thttps:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]{22}$/.test(l)), lines.join('\n'));
    // Ohne Dateiname: tweakable-dj-<heute>.txt; nur .txt, damit nie eine andere Datei überschrieben wird
    assert.equal(dj(dir, ['export']).code, 0);
    assert.ok(fs.readdirSync(dir).some(f => /^tweakable-dj-\d{4}-\d\d-\d\d\.txt$/.test(f)));
    const config = fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8');
    assert.match(dj(dir, ['export', 'config.jsonc']).err, /^Fehler: Der Dateiname muss auf \.txt enden: /m);
    assert.equal(fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8'), config);

    // Playlist mit anderen Songs füllen, dann die Datei importieren: wieder genau die exportierte Liste
    const s = store(dir);
    s.playlists[0].uris = s.playlists[0].uris.slice(0, 3).reverse();
    fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify(s));
    const stateBefore = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
    const imported = dj(dir, ['import', 'liste.txt']);
    assert.equal(imported.code, 0, imported.all);
    assert.match(imported.out, /^Suche 20 Songs aus der Datei …$/m);
    assert.match(imported.out, /^20 von 20 Songs gefunden$/m);
    assert.match(imported.out, new RegExp(`^"Test-DJ" enthält jetzt 20 Songs aus der Datei ✓ {2}https://open\\.spotify\\.com/playlist/${playlist.id}$`, 'm'));
    assert.deepEqual(imported.requests.filter(r => r.path?.startsWith('/v1/search')), [], 'Links brauchen keine Suche');
    const after = store(dir).playlists[0];
    assert.deepEqual(after.uris, playlist.uris);
    assert.match(after.description, /^Tweakable DJ · aus einer Textdatei, \d+\.\d+\.\d{4}, \d\d:\d\d Uhr · 20 Songs$/);
    // Kein Lauf des DJ: Verlauf (und Such-Cache) bleiben unverändert
    assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), stateBefore);
    assert.deepEqual([imported.result.ok, imported.result.songs, imported.result.playlistUrl], [true, 20, `https://open.spotify.com/playlist/${playlist.id}`]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('import: Suche nach "Künstler – Titel", nicht gefundene Zeilen, --dry, Datei fehlt, leere Datei; kein Probelauf nötig', () => {
  const dir = setup();
  try {
    fs.writeFileSync(path.join(dir, 'liste.txt'), [
      '# Eigene Liste',
      'Nordlicht – Polarnacht',
      'Bergfunk, Gaststar – Duett 1',
      'Fernweh - Horizont',
      'Hafenlicht – Nicht auf Spotify 7',
      'https://open.spotify.com/album/1234567890123456789012',
      'irgendwas',
      '',
    ].join('\n'));
    const dry = dj(dir, ['import', 'liste.txt', '--dry']);
    assert.equal(dry.code, 0, dry.all);
    assert.match(dry.out, /^3 von 6 Songs gefunden$/m);
    assert.match(dry.out, /^Nicht übernommen:\n {2}Zeile 5: Hafenlicht – Nicht auf Spotify 7 \(auf Spotify nicht gefunden\)\n {2}Zeile 6: https:\/\/open\.spotify\.com\/album\/1234567890123456789012 \(Link zu keinem Song\)\n {2}Zeile 7: irgendwas \(weder Link noch „Künstler – Titel“\)$/m);
    assert.match(dry.out, /^--dry: Playlist nicht verändert\.$/m);
    assert.deepEqual(writes(dry.requests), []);
    assert.equal(fs.existsSync(path.join(dir, 'store.json')) ? store(dir).playlists.length : 0, 0);
    assert.equal(fs.existsSync(path.join(dir, 'state.json')), false, 'ein Import legt keinen Verlauf an');

    const en = dj(dir, ['import', 'liste.txt'], { TWEAKABLE_DJ_LANG: 'en' });
    assert.equal(en.code, 0, en.all);
    assert.match(en.out, /^3 of 6 songs found$/m);
    assert.match(en.out, /^ {2}Line 5: Hafenlicht – Nicht auf Spotify 7 \(not found on Spotify\)$/m);
    assert.match(en.out, /^Created playlist "Test-DJ"\.$/m);
    const [playlist] = store(dir).playlists;
    assert.equal(playlist.uris.length, 3);
    assert.equal(store(dir).tracks[playlist.uris[1]].artists.join(', '), 'Bergfunk, Gaststar', 'Duett mit Gast über die Suche nach dem Hauptkünstler');
    assert.match(playlist.description, /^Tweakable DJ · from a text file, \d+\/\d+\/\d{4}, \d\d:\d\d\s(AM|PM) · 3 songs$/);
    assert.equal(fs.existsSync(path.join(dir, 'state.json')), false, 'auch nach dem Schreiben kein Verlauf');

    const missing = dj(dir, ['import', 'gibtsnicht.txt']);
    assert.equal(missing.code, 1);
    assert.match(missing.err, /^Fehler: Datei nicht gefunden: .*gibtsnicht\.txt$/m);
    assert.match(dj(dir, ['import']).err, /^Fehler: Aufruf: node dj\.mjs import <Datei\.txt>/m);
    fs.writeFileSync(path.join(dir, 'leer.txt'), '# nichts\n\n');
    assert.match(dj(dir, ['import', 'leer.txt']).err, /^Fehler: Die Datei enthält keine Songs\./m);
    fs.writeFileSync(path.join(dir, 'nichts.txt'), 'A – Nicht auf Spotify 1\nkaputt\n');
    const nothing = dj(dir, ['import', 'nichts.txt']);
    assert.match(nothing.err, /^Fehler: Kein einziger Song gefunden – die Playlist bleibt, wie sie ist\.$/m);
    assert.equal(store(dir).playlists[0].uris.length, 3, 'Playlist unverändert');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

// Playlist-Archiv (archive.mjs): Dateiname mit Datum und Uhrzeit, nur die neuesten archiveCount bleiben, fremde Dateien bleiben
// unberührt, 0 = aus; Lesen nur eigener Namen ohne Pfad.
test('Archiv: ablegen, aufräumen, auflisten und lesen', async () => {
  const { ARCHIVE_DIR, archiveName, listArchive, pruneArchive, readArchive, saveArchive } = await import('../archive.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archiv-'));
  try {
    assert.equal(archiveName(NOW), '2026-10-05 14-03-00 Tweakable DJ.txt');
    assert.equal(saveArchive(dir, { name: 'Mix', tracks: TRACKS, lang: 'de', keep: 0, now: NOW }), null, '0 = aus');
    assert.equal(fs.existsSync(path.join(dir, ARCHIVE_DIR)), false);
    const first = saveArchive(dir, { name: 'Mix', tracks: TRACKS, lang: 'de', keep: 2, now: NOW });
    assert.equal(first.file, `${ARCHIVE_DIR}/2026-10-05 14-03-00 Tweakable DJ.txt`);
    assert.equal(fs.readFileSync(path.join(dir, first.file), 'utf8'), formatExport({ name: 'Mix', tracks: TRACKS, lang: 'de', now: NOW }));
    const same = saveArchive(dir, { name: 'Mix', tracks: TRACKS, lang: 'de', keep: 2, now: NOW });
    assert.equal(same.file, `${ARCHIVE_DIR}/2026-10-05 14-03-00 Tweakable DJ 2.txt`, 'gleiche Sekunde: nicht überschreiben');
    fs.writeFileSync(path.join(dir, ARCHIVE_DIR, 'eigene Notiz.txt'), 'bleibt');
    const later = saveArchive(dir, { name: 'Mix', tracks: TRACKS.slice(0, 2), lang: 'de', keep: 2, now: new Date(2026, 9, 6, 8, 0, 5) });
    assert.deepEqual(later.removed, ['2026-10-05 14-03-00 Tweakable DJ.txt'], 'älteste eigene weg');
    assert.deepEqual(listArchive(dir).map(e => [e.id, e.songs]), [['2026-10-06 08-00-05 Tweakable DJ.txt', 2], ['2026-10-05 14-03-00 Tweakable DJ 2.txt', 5]]);
    assert.ok(fs.existsSync(path.join(dir, ARCHIVE_DIR, 'eigene Notiz.txt')), 'fremde Datei bleibt');
    assert.deepEqual(pruneArchive(dir, 0), [], '0: nichts löschen');
    assert.match(readArchive(dir, '2026-10-06 08-00-05 Tweakable DJ.txt'), /^# Mix – exportiert am /);
    for (const bad of ['eigene Notiz.txt', '../2026-10-06 08-00-05 Tweakable DJ.txt', '2026-10-01 00-00-00 Tweakable DJ.txt', null]) {
      assert.equal(readArchive(dir, bad), null, String(bad));
    }
    // Pfade in jeder Form, Unterordner und Namen, die dem Muster nur ähneln: nie gelesen, nie gelöscht
    const sub = path.join(dir, ARCHIVE_DIR, 'alt');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, '2026-01-01 00-00-00 Tweakable DJ.txt'), 'im Unterordner');
    const lookalikes = ['2026-01-01 00-00-00 Tweakable DJ (Kopie).txt', '2026-01-01 00-00-00 Tweakable DJ 1.txt', '2026-01-01 00-00-00 tweakable dj.txt',
      '2026-01-01 00-00-00 Tweakable DJ.txt.bak'];
    for (const f of lookalikes) fs.writeFileSync(path.join(dir, ARCHIVE_DIR, f), 'fremd');
    for (const bad of ['alt/2026-01-01 00-00-00 Tweakable DJ.txt', 'alt\\2026-01-01 00-00-00 Tweakable DJ.txt', '..\\2026-10-06 08-00-05 Tweakable DJ.txt',
      path.join(dir, ARCHIVE_DIR, '2026-10-06 08-00-05 Tweakable DJ.txt'), './2026-10-06 08-00-05 Tweakable DJ.txt', '2026-10-06 08-00-05 Tweakable DJ.txt\0',
      ...lookalikes, 42, { id: 'x' }]) {
      assert.equal(readArchive(dir, bad), null, String(bad));
    }
    // ungültige Anzahl = aus: nichts ablegen, nichts löschen
    for (const keep of [-1, 2.5, '5', NaN, null, undefined]) {
      assert.equal(saveArchive(dir, { name: 'Mix', tracks: TRACKS, lang: 'de', keep, now: new Date(2026, 9, 7) }), null, String(keep));
      assert.deepEqual(pruneArchive(dir, keep), [], String(keep));
    }
    // Weniger aufheben: beim nächsten Ablegen bleibt nur die neueste eigene Datei, alles Fremde bleibt
    const last = saveArchive(dir, { name: 'Mix', tracks: TRACKS, lang: 'de', keep: 1, now: new Date(2026, 9, 7, 9, 0, 0) });
    assert.deepEqual(last.removed, ['2026-10-06 08-00-05 Tweakable DJ.txt', '2026-10-05 14-03-00 Tweakable DJ 2.txt']);
    assert.deepEqual(fs.readdirSync(path.join(dir, ARCHIVE_DIR)).sort(),
      ['2026-10-07 09-00-00 Tweakable DJ.txt', ...lookalikes, 'alt', 'eigene Notiz.txt'].sort());
    assert.ok(fs.existsSync(path.join(sub, '2026-01-01 00-00-00 Tweakable DJ.txt')), 'Unterordner bleibt');
    assert.deepEqual(listArchive(dir).map(e => e.id), ['2026-10-07 09-00-00 Tweakable DJ.txt']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

// „Vorige Playlist wiederherstellen“: Ziel ist der Eintrag vor der Datei des letzten Schreibens – nur, solange diese noch
// die neueste ist.
test('undoTarget: Eintrag vor dem letzten Schreiben, sonst null', async () => {
  const { undoTarget } = await import('../archive.mjs');
  const entries = [{ id: 'c.txt', at: '2026-10-07T09:00:00.000Z', songs: 50 }, { id: 'b.txt', at: '2026-10-06T09:00:00.000Z', songs: 48 },
    { id: 'a.txt', at: '2026-10-05T09:00:00.000Z', songs: 50 }];
  assert.deepEqual(undoTarget(entries, 'c.txt'), entries[1]);
  assert.equal(undoTarget(entries, 'b.txt'), null, 'inzwischen etwas Neueres geschrieben (z. B. automatischer Lauf)');
  assert.equal(undoTarget(entries.slice(0, 1), 'c.txt'), null, 'kein voriger Stand');
  assert.equal(undoTarget([], 'c.txt'), null);
  for (const bad of [null, undefined, '', 42]) assert.equal(undoTarget(entries, bad), null, String(bad));
  assert.equal(undoTarget(null, 'c.txt'), null);
});
