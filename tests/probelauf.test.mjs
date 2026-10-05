// End-to-End: "node dj.mjs --dry" mit simulierten APIs (tests/mock-apis.mjs) in einer Kopie des Programms,
// auf Deutsch und Englisch, mit der Ergebniszeile "@@RESULT {…}" und den Fehlerarten (errorCode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { norm, trackKey, windowViolations } from '../lineup.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK = pathToFileURL(path.join(ROOT, 'tests', 'mock-apis.mjs')).href;
const RESULT_KEYS = ['ok', 'dry', 'songs', 'fresh', 'freshCurrent', 'familiar', 'playlistName', 'playlistUrl', 'errorCode', 'error', 'missingScope', 'trialId'];

const CONFIG = {
  spotify: { clientId: 'test-client-id' },
  lastfm: { apiKey: 'test-lastfm-key', user: 'testhoerer' },
  seed: 'liked',
  playlistName: 'Test-DJ',
  size: 20,
  familiarShare: 0.2,
  adventure: 0.4,
  seedsPerRun: 12, // mehr als es Ausgangspunkte gibt: alle werden gezogen
  useLastfmTopTracks: true,
  currentDays: 7,
  currentFactor: 3,
  maxPerArtist: 2,
  artistWindow: 10,
  maxPerWindow: 3,
  artistGap: 2,
  excludeRecentDays: 14,
  noRepeatRuns: 3,
  blockedArtists: ['Macloud', 'Rin'],
};

// Kopie des Programms in einem Ordner mit Leerzeichen und Umlaut, dazu Test-Config und abgelaufener Token.
// config = null: ohne config.jsonc.
function setup(overrides = {}, config = { ...CONFIG, ...overrides, lastfm: { ...CONFIG.lastfm, ...overrides.lastfm } }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.mjs') || /^config\.example(\.de)?\.jsonc$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  if (config) fs.writeFileSync(path.join(dir, 'config.jsonc'), `// Test-Einstellungen\n${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'abgelaufen', refresh_token: 'fake-refresh-token', expires_at: 0 }));
  return dir;
}

const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });

// Läuft standardmäßig auf Deutsch (TWEAKABLE_DJ_LANG=de); env-Werte undefined entfernen die Variable.
function run(dir, env = {}, args = []) {
  const logFile = path.join(dir, 'mock-log.jsonl');
  fs.rmSync(logFile, { force: true });
  const fullEnv = { ...process.env, MOCK_LOG: logFile, TWEAKABLE_DJ_LANG: 'de', ...env };
  for (const [k, v] of Object.entries(fullEnv)) if (v === undefined) delete fullEnv[k];
  const res = spawnSync(process.execPath, ['--import', MOCK, 'dj.mjs', '--dry', ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
    env: fullEnv,
  });
  const requests = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    : [];
  const unknown = requests.filter(r => r.unknown);
  assert.deepEqual(unknown, [], 'unerwartete Adressen');
  return { code: res.status, out: res.stdout, err: res.stderr, all: res.stdout + res.stderr, requests, result: resultOf(res.stdout) };
}

// Letzte Zeile auf stdout: "@@RESULT {…}" mit genau den vereinbarten Feldern in dieser Reihenfolge.
function resultOf(out) {
  const lines = out.split(/\r?\n/).filter(Boolean);
  const last = lines.at(-1) ?? '';
  assert.ok(last.startsWith('@@RESULT {'), `letzte Zeile ist nicht @@RESULT: ${last}`);
  assert.equal(lines.filter(l => l.startsWith('@@')).length, 1, 'genau eine @@-Zeile');
  const result = JSON.parse(last.slice('@@RESULT '.length));
  assert.deepEqual(Object.keys(result), RESULT_KEYS);
  return result;
}

// "  3. Künstler – Titel  (neu, über X · aktuell)" bzw. "(new, via X · current)" → { artist, name, kind, tags }
function parseLineup(out) {
  return out.split(/\r?\n/)
    .map(line => line.match(/^\s*\d+\. (.+?) – (.+?)  \((.+)\)$/))
    .filter(Boolean)
    .map(([, artist, name, kind]) => {
      const via = kind.match(/^(?:neu, über|new, via) (.+?)(?: · aktuell| · current)?$/)?.[1];
      return { artist, name, kind, tags: [...new Set([norm(artist), ...(via ? [norm(via)] : [])])] };
    });
}

const lastfmCalls = (requests, method) => requests.filter(r => r.method === method).length;

test('Probelauf: Auswahl, Regeln, Sperrliste, Token-Refresh und Last.fm-Cache', () => {
  const dir = setup();
  try {
    const first = run(dir);
    assert.equal(first.code, 0, first.all);
    assert.doesNotMatch(first.all, /Fehler:/);

    // Anzahl Songs
    assert.match(first.out, /^Test-DJ: 20 Songs \(/m);
    const lineup = parseLineup(first.out);
    assert.equal(lineup.length, 20);
    assert.equal(lineup.filter(t => t.kind.startsWith('Favorit')).length >= 4, true);
    assert.ok(lineup.some(t => t.kind.endsWith(' · aktuell')), 'aktuelles Hören markiert');

    // Ergebnis für die Oberfläche passt zur Ausgabe
    const r = first.result;
    assert.deepEqual([r.ok, r.dry, r.songs, r.playlistName, r.playlistUrl, r.errorCode, r.error], [true, true, 20, 'Test-DJ', null, null, null]);
    assert.equal(r.fresh + r.familiar, 20);
    assert.equal(r.fresh, lineup.filter(t => t.kind.startsWith('neu')).length);
    assert.equal(r.freshCurrent, lineup.filter(t => t.kind.startsWith('neu') && t.kind.endsWith(' · aktuell')).length);
    assert.ok(first.out.includes(`Test-DJ: 20 Songs (${r.fresh} neu, davon ${r.freshCurrent} über aktuelles Hören; ${r.familiar} Favoriten)`));

    // Fensterregel "max. 3 aus 10" und max. 2 pro Interpret
    assert.equal(windowViolations(lineup, 10, 3), 0);
    assert.doesNotMatch(first.all, /ließ sich nicht überall einhalten/);
    const perArtist = new Map();
    for (const t of lineup) perArtist.set(norm(t.artist), (perArtist.get(norm(t.artist)) ?? 0) + 1);
    assert.ok(Math.max(...perArtist.values()) <= 2, 'höchstens 2 Songs pro Interpret');

    // Sperrliste: Macloud und Rin nie, Karin darf vorkommen. 6 = 2 Lieblingssongs, 1 Top-Song, 1 aktuell, 2 Kandidaten.
    assert.ok(!lineup.some(t => /Macloud|^Rin$/.test(t.artist)), 'gesperrter Künstler in der Playlist');
    assert.match(first.out, /^ {2}6 Songs wegen der Sperrliste aussortiert$/m);

    // Kürzlich gehört, nicht auf Spotify, lokale Dateien und bekannte Lieblingssongs kommen nicht als neu hinein
    assert.ok(!lineup.some(t => t.name === 'Talfahrt' || t.name.startsWith('Nicht auf Spotify') || t.artist === 'Lokal'));
    assert.ok(!lineup.some(t => t.kind.startsWith('neu') && t.name === 'Polarnacht'));
    assert.match(first.out, /^ {2}11 Songs$/m, 'Lieblingssongs über zwei Seiten, ohne lokale Datei');
    assert.match(first.out, /^ {2}6 Scrobbles, davon 4 in den letzten 7 Tagen/m, 'Hörverlauf über zwei Seiten');

    // Abfragen: Paging, 429 mit Wiederholung, Last.fm-Fehler 6, keine Schreibzugriffe
    const paths = first.requests.map(r => r.path ?? '');
    assert.ok(paths.includes('/v1/me/tracks?offset=6&limit=50'));
    assert.ok(paths.some(p => p.includes('method=user.getRecentTracks') && p.includes('page=2')));
    assert.equal(first.requests.filter(r => r.status === 429).length, 1);
    assert.ok(first.requests.some(r => r.method === 'track.getSimilar' && r.path.includes('Gibt+es+nicht')));
    assert.equal(lastfmCalls(first.requests, 'track.getSimilar'), 11);

    // Token wurde erneuert, Refresh-Token bleibt erhalten
    const tokens = JSON.parse(fs.readFileSync(path.join(dir, 'tokens.json'), 'utf8'));
    assert.equal(tokens.access_token, 'mock-access-neu');
    assert.equal(tokens.refresh_token, 'fake-refresh-token');
    assert.ok(tokens.expires_at > Date.now());

    // Cache-Datei: nur nicht nutzerbezogene Abfragen, auch "nicht gefunden"
    const cacheFile = path.join(dir, 'lastfm-cache.json');
    assert.ok(fs.existsSync(cacheFile), 'lastfm-cache.json fehlt');
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const keys = Object.keys(cache);
    assert.equal(keys.filter(k => k.startsWith('track.getSimilar ')).length, 11);
    assert.ok(keys.every(k => /^(track\.getSimilar|artist\.getSimilar|artist\.getTopTracks) /.test(k)));
    const notFound = keys.find(k => k.includes('Gibt+es+nicht'));
    assert.deepEqual(cache[notFound].value, []);
    assert.ok(fs.existsSync(path.join(dir, 'state.json')));
    // Ohne --auto: keine Dateien der Automatik
    assert.ok(!fs.existsSync(path.join(dir, 'automatik.json')) && !fs.existsSync(path.join(dir, 'automatik.log')));

    // Zweiter Lauf: ähnliche Songs kommen komplett aus dem Cache
    const second = run(dir);
    assert.equal(second.code, 0, second.all);
    assert.match(second.out, /^Test-DJ: 20 Songs \(/m);
    assert.equal(lastfmCalls(second.requests, 'track.getSimilar'), 0);
    assert.ok(lastfmCalls(second.requests, 'user.getRecentTracks') > 0, 'Hörverlauf darf nicht aus dem Cache kommen');
    const [, hits, total] = second.out.match(/(\d+) von (\d+) Last\.fm-Abfragen aus dem Cache/).map(Number);
    assert.ok(hits >= 11 && hits <= total, `${hits} von ${total}`);
  } finally {
    cleanup(dir);
  }
});

test('Probelauf auf Englisch: TWEAKABLE_DJ_LANG=en schlägt "language" in config.jsonc', () => {
  const dir = setup({ language: 'de' });
  try {
    const { code, out, all, result } = run(dir, { TWEAKABLE_DJ_LANG: 'en' });
    assert.equal(code, 0, all);
    for (const line of ['Loading your favorites …', '  11 songs', 'Loading listening history from Last.fm …', 'Finding similar songs …',
      'Looking up the songs on Spotify …', '  6 songs left out because of the block list', '--dry: playlist not changed.']) {
      assert.ok(out.split(/\r?\n/).includes(line), `fehlt: ${line}`);
    }
    assert.match(out, /^ {2}6 scrobbles, 4 of them in the last 7 days \(\d+ artists\)$/m);
    assert.match(out, /^ {2}\d+ of \d+ starting points from your current listening \(factor 3\)$/m);
    assert.match(out, /^ {2}\d+ candidates \(\d+ of \d+ Last\.fm requests from the cache\)$/m);
    const lineup = parseLineup(out);
    assert.equal(lineup.length, 20);
    assert.ok(lineup.every(t => /^(favorite|new, via .+?)( · current)?$/.test(t.kind)), lineup.map(t => t.kind).join(' | '));
    assert.ok(lineup.some(t => t.kind.endsWith(' · current')));
    assert.deepEqual([result.ok, result.dry, result.songs, result.errorCode, result.error], [true, true, 20, null, null]);
    assert.ok(out.includes(`Test-DJ: 20 songs (${result.fresh} new, ${result.freshCurrent} of them via current listening; ${result.familiar} favorites)`));
    // Kein deutscher Text (Künstler und Titel aus den Testdaten ausgenommen)
    const texts = out.split(/\r?\n/).filter(l => !/^\s*\d+\. /.test(l) && !l.startsWith('@@'));
    assert.doesNotMatch(texts.join('\n'), /Lade|Suche|Kandidaten|Ausgangspunkt|davon|Favorit\b|aktuell|neu, über|Sperrliste|Fehler|nicht verändert/);
  } finally {
    cleanup(dir);
  }
});

test('Sprache aus config.jsonc, wenn TWEAKABLE_DJ_LANG fehlt; sonst Systemsprache', () => {
  const dir = setup({ language: 'en' });
  try {
    const en = run(dir, { TWEAKABLE_DJ_LANG: undefined, LANG: 'de_AT.UTF-8' });
    assert.equal(en.code, 0, en.all);
    assert.match(en.out, /^Loading your favorites …$/m);
    // Ohne language in config.jsonc: Systemsprache (hier über LANG)
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify(CONFIG));
    const de = run(dir, { TWEAKABLE_DJ_LANG: undefined, LC_ALL: undefined, LC_MESSAGES: undefined, LANG: 'de_AT.UTF-8' });
    assert.match(de.out, /^Lade deine Favoriten …$/m);
    const sys = run(dir, { TWEAKABLE_DJ_LANG: undefined, LC_ALL: undefined, LC_MESSAGES: undefined, LANG: 'en_US.UTF-8' });
    assert.match(sys.out, /^Loading your favorites …$/m);
  } finally {
    cleanup(dir);
  }
});

test('Automatischer Lauf (--auto --dry): automatik.json und automatik.log, auch bei abgelaufener Anmeldung', () => {
  const dir = setup();
  const result = () => JSON.parse(fs.readFileSync(path.join(dir, 'automatik.json'), 'utf8'));
  const log = () => fs.readFileSync(path.join(dir, 'automatik.log'), 'utf8');
  try {
    const ok = run(dir, {}, ['--auto']);
    assert.equal(ok.code, 0, ok.all);
    const r = result();
    assert.deepEqual(Object.keys(r), ['startedAt', 'finishedAt', ...RESULT_KEYS, 'summary']);
    assert.equal(r.ok, true);
    assert.equal(r.dry, true);
    assert.equal(r.error, null);
    assert.equal(r.errorCode, null);
    assert.equal(r.playlistUrl, null, 'Probelauf: keine Playlist');
    assert.equal(r.songs, 20);
    assert.equal(r.playlistName, 'Test-DJ');
    // Dieselben Felder wie in der @@RESULT-Zeile
    for (const k of RESULT_KEYS) assert.deepEqual(r[k], ok.result[k], k);
    assert.match(r.summary, /^Test-DJ: 20 Songs \(\d+ neu, davon \d+ über aktuelles Hören; \d+ Favoriten\)$/);
    assert.ok(ok.out.includes(r.summary));
    assert.ok(Date.parse(r.startedAt) <= Date.parse(r.finishedAt));
    // Protokoll = komplette Ausgabe (stdout; stderr siehe Fehlerfall unten)
    assert.equal(log(), ok.out);
    assert.match(log(), /^Lade deine Favoriten …$/m);
    assert.match(log(), /--dry: Playlist nicht verändert\./);

    // Spotify-Anmeldung abgelaufen: Fehler steht in automatik.json, das Protokoll wird überschrieben
    fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'alt', refresh_token: 'widerrufen', expires_at: 0 }));
    const failed = run(dir, {}, ['--auto']);
    assert.equal(failed.code, 1, failed.all);
    const f = result();
    assert.equal(f.ok, false);
    assert.equal(f.errorCode, 'login_expired');
    assert.match(f.error, /^Spotify-Anmeldung abgelaufen \(Invalid refresh token\)/);
    assert.equal(f.summary, null);
    assert.equal(f.songs, null);
    assert.deepEqual([failed.result.ok, failed.result.errorCode, failed.result.error], [false, 'login_expired', f.error]);
    assert.ok(Date.parse(f.startedAt) >= Date.parse(r.finishedAt));
    assert.match(log(), /Fehler: Spotify-Anmeldung abgelaufen/, 'stderr fehlt im Protokoll');
    assert.doesNotMatch(log(), /Test-DJ: 20 Songs|--dry: Playlist nicht verändert/, 'altes Protokoll nicht überschrieben');

    // Automatischer Lauf ohne TWEAKABLE_DJ_LANG (wie im Zeitplaner): Sprache aus config.jsonc
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, language: 'en' }));
    const english = run(dir, { TWEAKABLE_DJ_LANG: undefined }, ['--auto']);
    assert.equal(english.code, 1);
    assert.match(result().error, /^Spotify login expired \(Invalid refresh token\)/);
    assert.match(log(), /^Error: Spotify login expired/m);
  } finally {
    cleanup(dir);
  }
});

test('Seed-Playlist per Link; Last.fm-Benutzer ohne Scrobbles', () => {
  const dir = setup({ seed: 'https://open.spotify.com/playlist/TestListe42?si=abc', lastfm: { user: 'stillerhoerer' } });
  try {
    const { code, out, all, requests } = run(dir);
    assert.equal(code, 0, all);
    assert.ok(requests.some(r => r.path?.startsWith('/v1/playlists/TestListe42/items')));
    assert.match(out, /^ {2}11 Songs$/m);
    assert.match(all, /keine Scrobbles von "stillerhoerer".*https:\/\/www\.last\.fm\/settings\/applications/);
    assert.match(out, /^Test-DJ: 20 Songs \(/m);
  } finally {
    cleanup(dir);
  }
});

test('Unbekannter Last.fm-Benutzer: Warnung, Lauf geht ohne Hörverlauf weiter', () => {
  const dir = setup({ lastfm: { user: 'gibtsnicht' } });
  try {
    const { code, all, requests } = run(dir);
    assert.equal(code, 0, all);
    assert.match(all, /^ {2}⚠ Den Last\.fm-Benutzer "gibtsnicht" gibt es nicht/m);
    assert.equal(lastfmCalls(requests, 'user.getRecentTracks'), 0);
    const en = run(dir, { TWEAKABLE_DJ_LANG: 'en' });
    assert.match(en.all, /^ {2}⚠ The Last\.fm user "gibtsnicht" doesn’t exist/m);
  } finally {
    cleanup(dir);
  }
});

test('Keine Lieblingssongs: mit Hörverlauf neue Songs, ohne Abbruch statt leerer Playlist', () => {
  const dir = setup();
  try {
    const withHistory = run(dir, { MOCK_NO_LIKED: '1' });
    assert.equal(withHistory.code, 0, withHistory.all);
    assert.ok(withHistory.result.songs > 0 && withHistory.result.familiar === 0, JSON.stringify(withHistory.result));
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, lastfm: { ...CONFIG.lastfm, user: '' } }));
    const de = run(dir, { MOCK_NO_LIKED: '1' });
    assert.equal(de.code, 1, de.all);
    assert.match(de.err, /^Fehler: Kein einziger Song gefunden – die Playlist bleibt, wie sie ist\./m);
    assert.deepEqual([de.result.ok, de.result.songs, de.result.errorCode], [false, null, 'other']);
    const en = run(dir, { MOCK_NO_LIKED: '1', TWEAKABLE_DJ_LANG: 'en' });
    assert.match(en.err, /^Error: Not a single song found – the playlist stays as it is\./m);
  } finally {
    cleanup(dir);
  }
});

test('Ungültiger Last.fm-API-Key: Abbruch mit klarer Meldung (errorCode lastfm_key)', () => {
  // Ohne Benutzer ist track.getSimilar die erste Last.fm-Abfrage (dort werden andere Fehler nur gemeldet).
  const dir = setup({ lastfm: { apiKey: 'falscher-key', user: '' } });
  try {
    const de = run(dir);
    assert.equal(de.code, 1, de.all);
    assert.match(de.err, /^Fehler: Der Last\.fm-API-Key ist ungültig/m);
    assert.doesNotMatch(de.all, /⚠/);
    assert.deepEqual([de.result.ok, de.result.errorCode], [false, 'lastfm_key']);
    assert.match(de.result.error, /^Der Last\.fm-API-Key ist ungültig/);
    const en = run(dir, { TWEAKABLE_DJ_LANG: 'en' });
    assert.match(en.err, /^Error: The Last\.fm API key is invalid/m);
    assert.deepEqual([en.result.errorCode, en.result.playlistName], ['lastfm_key', 'Test-DJ']);
  } finally {
    cleanup(dir);
  }
});

test('Spotify 403: Hinweis auf Premium und User Management (errorCode forbidden)', () => {
  const dir = setup();
  try {
    const { code, err, result } = run(dir, { MOCK_SPOTIFY_403: '1' });
    assert.equal(code, 1, err);
    assert.match(err, /Fehler: Spotify GET \/me\/tracks\?limit=50: 403/);
    assert.match(err, /Premium/);
    assert.match(err, /User Management/);
    assert.deepEqual([result.ok, result.errorCode], [false, 'forbidden']);
    const en = run(dir, { MOCK_SPOTIFY_403: '1', TWEAKABLE_DJ_LANG: 'en' });
    assert.match(en.err, /^Error: Spotify GET \/me\/tracks\?limit=50: 403/m);
    assert.match(en.err, /^Spotify denies access \(403\)\. Common causes:$/m);
    assert.equal(en.result.errorCode, 'forbidden');
  } finally {
    cleanup(dir);
  }
});

test('Fehlerarten: nicht angemeldet, Einrichtung unvollständig, sonstige Fehler', () => {
  const dir = setup();
  try {
    // Ohne tokens.json
    fs.rmSync(path.join(dir, 'tokens.json'));
    const notLoggedIn = run(dir, { TWEAKABLE_DJ_LANG: 'en' });
    assert.equal(notLoggedIn.code, 1);
    assert.deepEqual([notLoggedIn.result.errorCode, notLoggedIn.result.error],
      ['not_logged_in', 'Not logged in to Spotify yet. Log in to Spotify again in the interface, or run "node dj.mjs login".']);
    assert.match(notLoggedIn.err, /^Error: Not logged in to Spotify yet\./m);
    assert.equal(run(dir).result.errorCode, 'not_logged_in');

    // Platzhalter statt Client ID
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, spotify: { clientId: 'ENTER_CLIENT_ID_HERE' } }));
    const incomplete = run(dir);
    assert.deepEqual([incomplete.result.errorCode, incomplete.result.playlistName], ['setup_incomplete', null]);
    assert.match(incomplete.result.error, /^Einrichtung nicht abgeschlossen .*: spotify\.clientId$/);

    // Seed-Playlist, die es nicht gibt (Spotify 404) und kaputte config.jsonc: other
    fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'x', refresh_token: 'fake-refresh-token', expires_at: 0 }));
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, seed: 'spotify:playlist:GibtEsNicht' }));
    const other = run(dir, { TWEAKABLE_DJ_LANG: 'en' });
    assert.deepEqual([other.result.ok, other.result.errorCode], [false, 'other']);
    assert.match(other.result.error, /^Spotify GET \/playlists\/GibtEsNicht\/items\?limit=50: 404/);
    fs.writeFileSync(path.join(dir, 'config.jsonc'), '{ "size": 20, }');
    const broken = run(dir);
    assert.equal(broken.result.errorCode, 'other');
    assert.match(broken.err, /^Fehler: config\.jsonc ist fehlerhaft/m);
  } finally {
    cleanup(dir);
  }
});

test('Ohne config.jsonc: Vorlage der Laufsprache wird angelegt (errorCode setup_incomplete)', () => {
  for (const [lang, start] of [['en', '// Settings for Tweakable DJ.'], ['de', '// Einstellungen für Tweakable DJ.']]) {
    const dir = setup({}, null);
    try {
      const { code, err, result } = run(dir, { TWEAKABLE_DJ_LANG: lang });
      assert.equal(code, 1);
      assert.equal(result.errorCode, 'setup_incomplete');
      assert.match(err, lang === 'en' ? /^Error: config\.jsonc has been created/m : /^Fehler: config\.jsonc wurde angelegt/m);
      assert.ok(fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8').startsWith(start));
    } finally {
      cleanup(dir);
    }
  }
});

test('Zu alte Node-Version: klare Meldung (errorCode node_version)', () => {
  const dir = setup();
  try {
    const { code, err, requests, result } = run(dir, { MOCK_NODE_VERSION: '16.20.2' }, ['--auto']);
    assert.equal(code, 1, err);
    assert.match(err, /Tweakable DJ braucht Node\.js 18 oder neuer, installiert ist 16\.20\.2/);
    assert.equal(requests.length, 0);
    assert.deepEqual([result.ok, result.errorCode], [false, 'node_version']);
    // Auch dann gibt es ein Ergebnis für die Oberfläche
    const auto = JSON.parse(fs.readFileSync(path.join(dir, 'automatik.json'), 'utf8'));
    assert.deepEqual([auto.ok, auto.errorCode], [false, 'node_version']);
    assert.match(fs.readFileSync(path.join(dir, 'automatik.log'), 'utf8'), /Tweakable DJ braucht Node\.js 18/);
    const en = run(dir, { MOCK_NODE_VERSION: '16.20.2', TWEAKABLE_DJ_LANG: 'en' });
    assert.match(en.err, /^Tweakable DJ needs Node\.js 18 or newer, but 16\.20\.2 is installed\./m);
  } finally {
    cleanup(dir);
  }
});

test('Ungültige Zahlen in config.jsonc: Abbruch vor der ersten Anfrage mit klarer Meldung', () => {
  const dir = setup({ size: 0, maxPerWindow: 0 });
  try {
    const de = run(dir);
    assert.equal(de.code, 1, de.all);
    assert.equal(de.requests.length, 0);
    assert.match(de.err, /^Fehler: size in config\.jsonc muss eine ganze Zahl von 1 bis 500 sein \(derzeit 0\)\. maxPerWindow in config\.jsonc muss eine ganze Zahl von 1 bis 100 sein \(derzeit 0\)\.$/m);
    assert.doesNotMatch(de.all, /Kein einziger Song/);
    assert.deepEqual([de.result.ok, de.result.errorCode, de.result.playlistName], [false, 'other', null]);
    const en = run(dir, { TWEAKABLE_DJ_LANG: 'en' });
    assert.match(en.err, /^Error: size in config\.jsonc must be a whole number from 1 to 500 \(currently 0\)\. maxPerWindow in /m);
  } finally {
    cleanup(dir);
  }
});

test('0 = aus: excludeRecentDays und currentDays 0 sperren bzw. markieren nichts, auch nicht den Song, der gerade läuft', () => {
  const dir = setup({ excludeRecentDays: 0, currentDays: 0 });
  try {
    const { code, out, all, result } = run(dir);
    assert.equal(code, 0, all);
    assert.match(out, /^ {2}6 Scrobbles, davon 0 in den letzten 0 Tagen \(0 Künstler\)$/m);
    assert.match(out, /^ {2}0 von \d+ Ausgangspunkten aus deinem aktuellen Hören/m);
    const lineup = parseLineup(out);
    assert.equal(lineup.length, 20);
    assert.ok(!lineup.some(t => t.kind.endsWith(' · aktuell')), lineup.map(t => t.kind).join(' | '));
    assert.equal(result.freshCurrent, 0);
  } finally {
    cleanup(dir);
  }
});

// Gefolgte Künstler im Mock: Nordlicht, Aurora Nord, Chromwerk und "THE STADTKIND" (= Stadtkind über norm()).
const FOLLOWED = new Set(['nordlicht', 'aurora nord', 'chromwerk', 'stadtkind']);
const followedIn = lineup => lineup.filter(t => FOLLOWED.has(norm(t.artist))).length;
const followingRequests = requests => requests.filter(r => r.path?.startsWith('/v1/me/following'));

test('Gefolgte Künstler: 0 = Liste nicht abfragen, −1 = keine, +1 = stark bevorzugt; Cursor-Paging', () => {
  const dir = setup();
  const runWith = (followedArtists, env) => {
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, followedArtists }));
    fs.rmSync(path.join(dir, 'state.json'), { force: true }); // sonst sperren die vorigen Läufe Songs
    return run(dir, env);
  };
  try {
    // 0 (Standard): keine Abfrage, keine Zeile
    const neutral = runWith(0);
    assert.equal(neutral.code, 0, neutral.all);
    assert.deepEqual(followingRequests(neutral.requests), []);
    assert.doesNotMatch(neutral.all, /gefolgt/);
    assert.equal(neutral.result.missingScope, null);

    // −1: harter Filter wie die Sperrliste (auch "THE STADTKIND" = Stadtkind), zwei Seiten über "next"
    const none = runWith(-1);
    assert.equal(none.code, 0, none.all);
    assert.match(none.out, /^ {2}4 gefolgte Künstler$/m);
    assert.match(none.out, /^ {2}\d+ Songs von gefolgten Künstlern ausgelassen$/m);
    const pages = followingRequests(none.requests).map(r => r.path);
    assert.equal(pages.length, 2, pages.join(' '));
    assert.ok(pages[0].includes('type=artist') && pages[0].includes('limit=50') && pages[1].includes('after='), pages.join(' '));
    const lineup = parseLineup(none.out);
    assert.ok(lineup.length >= 10, `nur ${lineup.length} Songs`);
    assert.equal(followedIn(lineup), 0, lineup.map(t => t.artist).join(', '));
    assert.ok(lineup.some(t => t.kind.startsWith('Favorit')), 'Favoriten nicht gefolgter Künstler bleiben');

    // +1: deutlich bevorzugt, aber nicht ausschließlich
    const strong = runWith(1, { TWEAKABLE_DJ_LANG: 'en' });
    assert.equal(strong.code, 0, strong.all);
    assert.match(strong.out, /^ {2}4 followed artists$/m);
    assert.doesNotMatch(strong.out, /by followed artists left out/);
    const preferred = parseLineup(strong.out);
    assert.equal(preferred.length, 20);
    assert.ok(followedIn(preferred) >= 5, `nur ${followedIn(preferred)} von gefolgten Künstlern`);
    assert.ok(followedIn(preferred) < preferred.length, 'nicht nur gefolgte Künstler');
  } finally {
    cleanup(dir);
  }
});

test('Gefolgte Künstler ohne Berechtigung (ältere Anmeldung): Warnung, Lauf geht weiter wie mit 0, missingScope', () => {
  const dir = setup({ followedArtists: 1 });
  try {
    const de = run(dir, { MOCK_NO_FOLLOW_SCOPE: '1' });
    assert.equal(de.code, 0, de.all);
    assert.match(de.all, /^ {2}⚠ Für "Gefolgte Künstler" bitte einmal neu bei Spotify anmelden/m);
    assert.doesNotMatch(de.all, /Fehler:/);
    assert.equal(followingRequests(de.requests).length, 1);
    assert.deepEqual([de.result.ok, de.result.songs, de.result.missingScope], [true, 20, 'user-follow-read']);
    assert.match(de.out, /^Test-DJ: 20 Songs \(/m);
    // Das erneuerte Token merkt sich die erteilten Berechtigungen (ohne user-follow-read)
    const tokens = JSON.parse(fs.readFileSync(path.join(dir, 'tokens.json'), 'utf8'));
    assert.ok(tokens.scope.includes('user-library-read') && !tokens.scope.includes('user-follow-read'), tokens.scope);

    const en = run(dir, { MOCK_NO_FOLLOW_SCOPE: '1', TWEAKABLE_DJ_LANG: 'en' }, ['--auto']);
    assert.equal(en.code, 0, en.all);
    assert.match(en.all, /^ {2}⚠ For "Followed artists", please log in to Spotify again once/m);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'automatik.json'), 'utf8')).missingScope, 'user-follow-read');

    // Mit Berechtigung: kein Hinweis
    const ok = run(dir);
    assert.equal(ok.result.missingScope, null);
    assert.doesNotMatch(ok.all, /neu bei Spotify anmelden/);
  } finally {
    cleanup(dir);
  }
});

// --- Gesperrte Songs (blockedTracks) und „Keine Songs mit expliziten Texten“ (excludeExplicit) ---

// URI eines Songs im Mock (gleiche Formel wie spotifyTrack() in tests/mock-apis.mjs)
const mockUri = (artist, name, variant = '') => {
  const h = [...`${artist}|${name}${variant ? `|${variant}` : ''}`].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
  return `spotify:track:${`mock${h.toString(36)}`.padEnd(22, '0')}`;
};
// Groß genug, dass jeder Kandidat auf Spotify gesucht wird und keine Regel etwas aussortiert; ohne Anteil Favoriten kommen
// Favoriten nur übers Auffüllen hinein.
const ALL = { size: 500, familiarShare: 0, maxPerArtist: 500, artistWindow: 100, maxPerWindow: 100, artistGap: 0, noRepeatRuns: 0 };
const trialTracks = dir => JSON.parse(fs.readFileSync(path.join(dir, 'probelauf.json'), 'utf8')).tracks;

test('Gesperrte Songs: über die URI und als andere Version (trackKey), bei Favoriten, Auffüllen, Ausgangspunkten und neuen Songs', () => {
  const dir = setup({
    ...ALL,
    blockedTracks: [
      { uri: mockUri('Nordlicht', 'Eisblau'), artist: 'Nordlicht', name: 'Eisblau' }, // Favorit
      { artist: 'Fernweh', name: 'Horizont (Live)' }, // andere Version eines Favoriten, der auch gerade läuft
      { uri: mockUri('Leuchtturm', 'Leuchtfeuer'), artist: 'Leuchtturm', name: 'Anderer Name' }, // neuer Song, nur über die URI
    ],
  });
  try {
    const de = run(dir);
    assert.equal(de.code, 0, de.all);
    const lineup = parseLineup(de.out);
    assert.ok(lineup.some(t => t.kind.startsWith('Favorit')), 'aufgefüllt mit Favoriten');
    assert.ok(lineup.some(t => t.kind.startsWith('neu')));
    for (const name of ['Eisblau', 'Horizont', 'Leuchtfeuer']) assert.ok(!lineup.some(t => t.name === name), name);
    assert.ok(!trialTracks(dir).some(t => t.uri === mockUri('Leuchtturm', 'Leuchtfeuer')));
    assert.match(de.out, /^ {2}3 gesperrte Songs ausgelassen$/m);
    // Kein Ausgangspunkt: Last.fm wird zu gesperrten Songs nicht gefragt
    assert.ok(!de.requests.some(r => r.method === 'track.getSimilar' && /Eisblau|Horizont/.test(r.path)));
    assert.ok(lastfmCalls(de.requests, 'track.getSimilar') > 0);
    const en = run(dir, { TWEAKABLE_DJ_LANG: 'en' });
    assert.match(en.out, /^ {2}3 blocked songs left out$/m);

    // Ein einziger Song: Einzahl; ohne Sperre keine Zeile
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, ...ALL, blockedTracks: [{ artist: 'Nordlicht', name: 'Eisblau' }] }));
    assert.match(run(dir).out, /^ {2}1 gesperrter Song ausgelassen$/m);
    assert.match(run(dir, { TWEAKABLE_DJ_LANG: 'en' }).out, /^ {2}1 blocked song left out$/m);
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, ...ALL }));
    const none = run(dir);
    assert.doesNotMatch(none.out, /gesperrte? Songs? ausgelassen/);
    assert.ok(parseLineup(none.out).some(t => t.name === 'Eisblau'), 'ohne Sperre wieder dabei');
  } finally {
    cleanup(dir);
  }
});

test('Explizite Songs: Favoriten, neue Songs und Auffüllen ohne explizite; nicht explizite Version, wenn es eine gibt', () => {
  const dir = setup({ ...ALL, excludeExplicit: true });
  try {
    const de = run(dir);
    assert.equal(de.code, 0, de.all);
    const lineup = parseLineup(de.out);
    assert.ok(lineup.some(t => t.kind.startsWith('Favorit')), 'aufgefüllt mit Favoriten');
    // Im Mock explizit: der Favorit "Brandung" und alle Titel auf "Echo 4" bzw. "Echo 6"
    assert.ok(!lineup.some(t => t.name === 'Brandung' || / Echo 4$/.test(t.name)), lineup.map(t => t.name).join(', '));
    const [, n] = de.out.match(/^ {2}(\d+) explizite Songs ausgelassen$/m) ?? [];
    assert.ok(Number(n) >= 2, de.out);
    // "Echo 6": statt der expliziten die nicht explizite Version aus derselben Suche
    const echo6 = trialTracks(dir).filter(t => / Echo 6$/.test(t.name));
    assert.ok(echo6.length > 0, 'Echo 6 dabei');
    for (const t of echo6) assert.equal(t.uri, mockUri(t.artist, t.name, 'clean'), t.name);
    // Ausgangspunkte bleiben: zu "Brandung" fragt der DJ Last.fm trotzdem
    assert.ok(de.requests.some(r => r.method === 'track.getSimilar' && r.path.includes('Brandung')));
    assert.match(run(dir, { TWEAKABLE_DJ_LANG: 'en' }).out, /^ {2}\d+ explicit songs left out$/m);

    // Ohne Filter: alles wie bisher, auch die explizite Version
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, ...ALL }));
    const off = run(dir);
    assert.doesNotMatch(off.out, /explizite/);
    const names = parseLineup(off.out).map(t => t.name);
    assert.ok(names.includes('Brandung') && names.some(x => / Echo 4$/.test(x)), names.join(', '));
    for (const t of trialTracks(dir).filter(s => / Echo 6$/.test(s.name))) assert.equal(t.uri, mockUri(t.artist, t.name));
  } finally {
    cleanup(dir);
  }
});

test('Such-Cache von 0.1.1 (nur URIs): bleibt ohne Filter unverändert, mit Filter einmal neu gesucht und ersetzt', () => {
  const dir = setup(ALL);
  const stateFile = path.join(dir, 'state.json');
  // Gesuchte Songs (trackKey aus der genauen Suche track:"…" artist:"…"); neue Kandidaten aus zufälligen Abstechern kommen dazu.
  const searched = requests => new Set(requests.filter(r => r.path?.startsWith('/v1/search')).map(r => {
    const m = new URLSearchParams(r.path.split('?')[1]).get('q').match(/^track:"(.*)" artist:"(.*)"$/);
    return m ? trackKey(m[2], m[1]) : null;
  }).filter(Boolean));
  const cachedIn = (requests, cache) => [...searched(requests)].filter(k => cache[k] != null);
  try {
    assert.equal(run(dir).code, 0);
    // Neues Format: { uri, explicit[, clean] } bzw. null
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const entries = Object.values(state.cache);
    assert.ok(entries.length > 20 && entries.every(v => v === null || (typeof v.uri === 'string' && typeof v.explicit === 'boolean')));
    assert.ok(entries.some(v => v?.explicit === true && v.clean), 'Echo 6 mit nicht expliziter Version');
    // So stand er in 0.1.1 da: nur die URI
    const old = Object.fromEntries(Object.entries(state.cache).map(([k, v]) => [k, v?.uri ?? null]));
    fs.writeFileSync(stateFile, JSON.stringify({ ...state, cache: old }, null, 2));

    // Ohne Filter: alte Einträge gelten, keine neue Suche, nichts umgeschrieben
    const plain = run(dir);
    assert.equal(plain.code, 0, plain.all);
    assert.deepEqual(cachedIn(plain.requests, old), [], 'Einträge aus dem Cache nicht neu gesucht');
    const kept = JSON.parse(fs.readFileSync(stateFile, 'utf8')).cache;
    for (const [k, v] of Object.entries(old)) assert.equal(kept[k], v, k);
    assert.ok(parseLineup(plain.out).length > 20);

    // Mit Filter: explicit unbekannt → neu suchen; danach im neuen Format, beim nächsten Lauf wieder aus dem Cache
    fs.writeFileSync(path.join(dir, 'config.jsonc'), JSON.stringify({ ...CONFIG, ...ALL, excludeExplicit: true }));
    const filtered = run(dir);
    assert.equal(filtered.code, 0, filtered.all);
    assert.ok(cachedIn(filtered.requests, old).length > 0, 'alte Einträge neu gesucht');
    const migrated = JSON.parse(fs.readFileSync(stateFile, 'utf8')).cache;
    for (const k of cachedIn(filtered.requests, old)) assert.equal(typeof migrated[k].explicit, 'boolean', k);
    assert.ok(!parseLineup(filtered.out).some(t => / Echo 4$/.test(t.name)));
    assert.ok(trialTracks(dir).filter(t => / Echo 6$/.test(t.name)).every(t => t.uri === mockUri(t.artist, t.name, 'clean')));
    const again = run(dir);
    const known = Object.fromEntries(Object.entries(migrated).filter(([, v]) => v && typeof v === 'object'));
    assert.deepEqual(cachedIn(again.requests, known), [], 'jetzt wieder aus dem Cache');
  } finally {
    cleanup(dir);
  }
});
