// Probelauf übernehmen: trial.mjs (Fingerabdruck der Einstellungen, wann ein Probelauf noch gilt) und End-to-End
// "node dj.mjs --dry" → "node dj.mjs --apply" mit simulierten APIs (tests/mock-apis.mjs, Playlists in MOCK_SPOTIFY_STORE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULTS } from '../config.mjs';
import { trackKey } from '../lineup.mjs';
import { readTrial, saveTrial, settingsHash, TRIAL_FILE, TRIAL_KEYS, TRIAL_MAX_AGE, trialInfo, trialProblem } from '../trial.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK = pathToFileURL(path.join(ROOT, 'tests', 'mock-apis.mjs')).href;
const CONFIG = {
  spotify: { clientId: 'test-client-id' },
  lastfm: { apiKey: 'test-lastfm-key', user: 'testhoerer' },
  seed: 'liked',
  playlistName: 'Test-DJ',
  size: 20,
  seedsPerRun: 12,
  artistWindow: 10,
  artistGap: 2,
  noRepeatRuns: 2,
  blockedArtists: ['Macloud', 'Rin'],
};
const cfg = (extra = {}) => ({ ...DEFAULTS, ...CONFIG, ...extra });

// --- trial.mjs ---

test('settingsHash: nur Einstellungen, die die Auswahl bestimmen, dazu Spotify-App und Last.fm-Benutzer', () => {
  const base = settingsHash(cfg());
  assert.match(base, /^[0-9a-f]{16}$/);
  assert.equal(settingsHash(cfg()), base, 'gleich bei gleichen Werten');
  // Automatik und Sprache ändern nichts an der Auswahl
  for (const extra of [{ schedule: 'daily' }, { scheduleTime: '05:30' }, { scheduleDay: 'FRI' }, { language: 'en' }]) {
    assert.equal(settingsHash(cfg(extra)), base, JSON.stringify(extra));
  }
  assert.deepEqual(TRIAL_KEYS.filter(k => ['schedule', 'scheduleTime', 'scheduleDay', 'language'].includes(k)), []);
  // Jede andere Einstellung zählt
  const changed = { seed: 'https://open.spotify.com/playlist/x', playlistName: 'Anders', size: 21, familiarShare: 0.5, adventure: 0.9,
    maxPerArtist: 3, artistWindow: 11, maxPerWindow: 4, artistGap: 3, excludeRecentDays: 1, noRepeatRuns: 5, seedsPerRun: 13,
    useLastfmTopTracks: false, followedArtists: 0.5, currentDays: 3, currentFactor: 2, blockedArtists: ['Macloud'], excludeExplicit: true,
    blockedTracks: [{ artist: 'Nordlicht', name: 'Eisblau' }] };
  assert.deepEqual(Object.keys(changed).sort(), [...TRIAL_KEYS].sort(), 'jede relevante Einstellung geprüft');
  for (const [k, v] of Object.entries(changed)) assert.notEqual(settingsHash(cfg({ [k]: v })), base, k);
  assert.notEqual(settingsHash(cfg({ spotify: { clientId: 'andere-app' } })), base, 'andere Spotify-App');
  assert.notEqual(settingsHash(cfg({ lastfm: { ...CONFIG.lastfm, user: 'jemand' } })), base, 'anderer Last.fm-Benutzer');
  assert.equal(settingsHash(cfg({ lastfm: { ...CONFIG.lastfm, apiKey: 'anderer-key' } })), base, 'der API-Key ändert die Auswahl nicht');
});

const TRACKS = [
  { uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', artist: 'Nordlicht', artists: ['Nordlicht', 'Gast'], name: 'Polarnacht', kind: 'Favorit' },
  { uri: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb', artist: 'Elbsand', name: 'Beton Echo 8', kind: 'neu, über Stadtkind' },
];
const COUNTS = { songs: 2, fresh: 1, freshCurrent: 0, familiar: 1 };

function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

test('saveTrial/readTrial/trialProblem: gilt 24 Stunden, mit denselben Einstellungen, nur für die eigene Kennung', () => withDir(dir => {
  assert.equal(readTrial(dir), null);
  assert.equal(trialProblem(readTrial(dir), { cfg: cfg() }), 'missing');
  const now = new Date('2026-10-05T12:00:00Z');
  const trial = saveTrial(dir, { cfg: cfg(), lang: 'de', tracks: TRACKS, counts: COUNTS, summary: 'Test-DJ: 2 Songs', description: 'Beschreibung', now });
  assert.match(trial.id, /^[0-9a-f]{12}$/);
  const saved = readTrial(dir);
  assert.deepEqual(saved, trial);
  assert.deepEqual(saved.tracks.map(t => t.artists), [['Nordlicht', 'Gast'], ['Elbsand']], 'ohne Liste von Spotify: der Künstler allein');
  assert.deepEqual([saved.playlistName, saved.description, saved.createdAt], ['Test-DJ', 'Beschreibung', now.toISOString()]);
  assert.deepEqual(trialInfo(saved), { id: trial.id, createdAt: now.toISOString(), expiresAt: '2026-10-06T12:00:00.000Z', songs: 2, playlistName: 'Test-DJ' });

  const at = ms => ({ cfg: cfg(), now: now.getTime() + ms });
  assert.equal(trialProblem(saved, at(0)), null);
  assert.equal(trialProblem(saved, { ...at(60_000), id: trial.id }), null);
  assert.equal(trialProblem(saved, { ...at(60_000), id: '0123456789ab' }), 'replaced');
  assert.equal(trialProblem(saved, at(TRIAL_MAX_AGE)), null, 'genau 24 Stunden geht noch');
  assert.equal(trialProblem(saved, at(TRIAL_MAX_AGE + 1)), 'old');
  assert.equal(trialProblem(saved, at(-10 * 60_000)), 'old', 'aus der Zukunft (Uhr verstellt)');
  assert.equal(trialProblem(saved, { ...at(0), cfg: cfg({ size: 30 }) }), 'settings');
  assert.equal(trialProblem(saved, { ...at(0), cfg: cfg({ schedule: 'daily', language: 'en' }) }), null, 'Automatik und Sprache egal');

  // Kaputt oder von Hand verändert: lieber nicht übernehmen
  const file = path.join(dir, TRIAL_FILE);
  for (const broken of ['{ kaputt', JSON.stringify({ ...trial, format: 2 }), JSON.stringify({ ...trial, tracks: [] }),
    JSON.stringify({ ...trial, songs: 3 }), JSON.stringify({ ...trial, tracks: [{ ...TRACKS[0], uri: 'spotify:album:x' }, TRACKS[1]] }),
    JSON.stringify({ ...trial, createdAt: 'gestern' }), JSON.stringify({ ...trial, id: '../x' })]) {
    fs.writeFileSync(file, broken);
    assert.deepEqual(readTrial(dir), { invalid: true }, broken.slice(0, 40));
    assert.equal(trialProblem(readTrial(dir), at(0)), 'invalid');
    assert.equal(trialInfo(readTrial(dir)), null);
  }
}));

// --- End-to-End: dj.mjs --dry, dann --apply ---

function setup(config = CONFIG) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.mjs') || /^config\.example(\.de)?\.jsonc$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  writeConfig(dir, config);
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'abgelaufen', refresh_token: 'fake-refresh-token', expires_at: 0 }));
  return dir;
}
const writeConfig = (dir, config) => fs.writeFileSync(path.join(dir, 'config.jsonc'), `// Test-Einstellungen\n${JSON.stringify(config, null, 2)}\n`);
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
const store = dir => JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8'));
const state = dir => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));

// dj.mjs mit args (ohne automatisches --dry), Deutsch; Schreiben auf Spotify geht in store.json.
function dj(dir, args = [], env = {}) {
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

const lineupLines = out => out.split(/\r?\n/).filter(l => /^\s*\d+\. .+ – .+ {2}\(.+\)$/.test(l));
const writes = requests => requests.filter(r => r.host === 'api.spotify.com' && r.verb !== 'GET');

test('Übernehmen: genau die Liste des Probelaufs, in derselben Reihenfolge, ohne neu zu losen; Verlauf wie nach einem Lauf', () => {
  const dir = setup();
  try {
    const dry = dj(dir, ['--dry']);
    assert.equal(dry.code, 0, dry.all);
    assert.deepEqual(writes(dry.requests), [], 'Probelauf schreibt nichts');
    assert.match(dry.out, /^Genau diese Liste lässt sich 24 Stunden lang übernehmen: „Diese Liste übernehmen“ in der Oberfläche bzw\. "node dj\.mjs --apply"\.$/m);
    const trial = readTrial(dir);
    assert.equal(dry.result.trialId, trial.id);
    assert.deepEqual([trial.songs, trial.fresh, trial.familiar], [dry.result.songs, dry.result.fresh, dry.result.familiar]);
    // probelauf.json = die angezeigte Liste
    const shown = lineupLines(dry.out);
    assert.equal(shown.length, 20);
    assert.deepEqual(trial.tracks.map((t, i) => `${String(i + 1).padStart(3)}. ${t.artist} – ${t.name}  (${t.kind})`), shown);
    assert.ok(trial.tracks.every(t => /^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri)));
    assert.match(trial.description, /^Tweakable DJ · \d+\.\d+\.\d{4}, \d\d:\d\d Uhr · \d+ neue Songs?, \d+ Favorit(en)? · (\d+:\d\d\u00a0Std\.|\d+\u00a0Min\.)$/);
    const historyBefore = state(dir).history;

    const applied = dj(dir, ['--apply']);
    assert.equal(applied.code, 0, applied.all);
    assert.match(applied.out, /^Übernehme den Probelauf vom \d+\.\d+\.\d{4}, \d\d:\d\d Uhr \(20 Songs\), ohne neu zu losen …$/m);
    assert.deepEqual(lineupLines(applied.out), shown, 'dieselbe Liste in derselben Reihenfolge');
    // Nichts neu gelost: weder Last.fm noch die Spotify-Suche gefragt
    assert.deepEqual(applied.requests.filter(r => r.host === 'ws.audioscrobbler.com' || r.path?.startsWith('/v1/search')), []);
    const r = applied.result;
    assert.deepEqual([r.ok, r.dry, r.songs, r.fresh, r.freshCurrent, r.familiar, r.errorCode, r.trialId],
      [true, false, 20, trial.fresh, trial.freshCurrent, trial.familiar, null, null]);
    const [playlist] = store(dir).playlists;
    assert.equal(r.playlistUrl, `https://open.spotify.com/playlist/${playlist.id}`);
    assert.deepEqual([playlist.name, playlist.uris, playlist.description], ['Test-DJ', trial.tracks.map(t => t.uri), trial.description]);
    assert.match(applied.out, /^Playlist "Test-DJ" angelegt\.$/m);
    // Verlauf: ein Eintrag wie nach einem echten Lauf (für „Vorige Läufe sperren“)
    const history = state(dir).history;
    assert.deepEqual(history, [...historyBefore, trial.tracks.map(t => trackKey(t.artist, t.name))]);
    assert.equal(fs.existsSync(path.join(dir, TRIAL_FILE)), false, 'übernommen: probelauf.json ist weg');

    // Noch einmal: geht nicht mehr
    const again = dj(dir, ['--apply']);
    assert.equal(again.code, 1);
    assert.deepEqual([again.result.ok, again.result.errorCode], [false, 'trial_expired']);
    assert.match(again.err, /^Fehler: Es gibt keinen Probelauf zum Übernehmen: Noch keiner gelaufen, oder die Playlist wurde seitdem neu erstellt\./m);
    assert.deepEqual(writes(again.requests), []);
    assert.match(dj(dir, ['--apply'], { TWEAKABLE_DJ_LANG: 'en' }).err, /^Error: There’s no test run to apply: none has run yet/m);

    // Nächster Probelauf sperrt die übernommenen Songs (noRepeatRuns 2), der Verlauf bleibt auf 2 Läufe begrenzt
    const next = dj(dir, ['--dry']);
    const nextNames = readTrial(dir).tracks.filter(t => t.kind.startsWith('neu')).map(t => trackKey(t.artist, t.name));
    assert.ok(nextNames.every(k => !history.at(-1).includes(k)), 'neue Songs aus dem übernommenen Lauf kommen nicht wieder');
    assert.equal(next.code, 0);
    dj(dir, ['--apply']);
    dj(dir, ['--dry']);
    dj(dir, ['--apply']);
    assert.equal(state(dir).history.length, 2);
  } finally {
    cleanup(dir);
  }
});

test('Übernehmen geht nicht mehr: Einstellungen geändert, älter als 24 Stunden, neuer Lauf, andere Kennung, Datei fehlt', () => {
  const dir = setup();
  const expired = (res, re) => {
    assert.equal(res.code, 1, res.all);
    assert.deepEqual([res.result.ok, res.result.errorCode], [false, 'trial_expired']);
    assert.match(res.err, re);
    assert.deepEqual(writes(res.requests), [], 'nichts geschrieben');
  };
  try {
    // Einstellungen geändert (auch nur gespeichert, ohne neuen Probelauf) – zurückgestellt gilt er wieder
    dj(dir, ['--dry']);
    writeConfig(dir, { ...CONFIG, size: 25 });
    expired(dj(dir, ['--apply']), /^Fehler: Die Einstellungen haben sich seit dem Probelauf geändert\. Starte einen neuen Probelauf\.$/m);
    expired(dj(dir, ['--apply'], { TWEAKABLE_DJ_LANG: 'en' }), /^Error: The settings have changed since the test run\. Start a new test run\.$/m);
    writeConfig(dir, { ...CONFIG, schedule: 'daily', language: 'de' });
    assert.equal(dj(dir, ['--apply', '--dry']).result.ok, true, 'Automatik und Sprache zählen nicht');

    // Älter als 24 Stunden
    const file = path.join(dir, TRIAL_FILE);
    const trial = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...trial, createdAt: new Date(Date.now() - TRIAL_MAX_AGE - 60_000).toISOString() }));
    expired(dj(dir, ['--apply']), /^Fehler: Der Probelauf ist älter als 24 Stunden\./m);
    expired(dj(dir, ['--apply'], { TWEAKABLE_DJ_LANG: 'en' }), /^Error: The test run is more than 24 hours old\./m);

    // Andere Kennung (die Oberfläche zeigt einen anderen Probelauf als den gespeicherten)
    fs.writeFileSync(file, JSON.stringify(trial));
    expired(dj(dir, ['--apply', '--trial=0123456789ab']), /^Fehler: Seitdem gab es einen neueren Probelauf/m);
    assert.equal(dj(dir, ['--apply', '--dry', `--trial=${trial.id}`]).result.ok, true);

    // Beschädigt
    fs.writeFileSync(file, '{ "format": 1 }');
    expired(dj(dir, ['--apply']), /^Fehler: probelauf\.json ist beschädigt/m);

    // Neuer Lauf (Playlist neu erstellt): probelauf.json ist weg
    assert.equal(dj(dir, ['--dry']).code, 0);
    const run = dj(dir);
    assert.equal(run.code, 0, run.all);
    assert.equal(fs.existsSync(file), false);
    expired(dj(dir, ['--apply']), /^Fehler: Es gibt keinen Probelauf zum Übernehmen/m);
  } finally {
    cleanup(dir);
  }
});

test('--apply --dry: prüft und zeigt die Liste, schreibt nichts, der Probelauf gilt weiter', () => {
  const dir = setup();
  try {
    const dry = dj(dir, ['--dry']);
    const before = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
    const check = dj(dir, ['--apply', '--dry']);
    assert.equal(check.code, 0, check.all);
    assert.deepEqual(lineupLines(check.out), lineupLines(dry.out));
    assert.match(check.out, /^--dry: Playlist nicht verändert\.$/m);
    assert.deepEqual([check.result.dry, check.result.playlistUrl, check.result.trialId], [true, null, dry.result.trialId]);
    assert.deepEqual(check.requests.filter(r => r.host === 'api.spotify.com' && r.path !== '/v1/me'), []);
    assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), before, 'Verlauf unverändert');
    assert.equal(readTrial(dir).id, dry.result.trialId);
  } finally {
    cleanup(dir);
  }
});
