// End-to-End für ui.mjs: Server in einer Kopie des Programms auf einem freien Port, Spotify und Last.fm simuliert
// (tests/mock-apis.mjs über NODE_OPTIONS, gilt damit auch für die gestarteten Läufe). Sprache je Anfrage per X-Lang.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from '../config.mjs';

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
  blockedArtists: ['Macloud', 'Rin'],
};

let dir;
let server;
let base;

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  }).on('error', reject);
});

const writeTokens = refresh => fs.writeFileSync(path.join(dir, 'tokens.json'),
  JSON.stringify({ access_token: 'abgelaufen', refresh_token: refresh, expires_at: 0, authorized_at: Date.now() }));

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.mjs') || /^config\.example(\.de)?\.jsonc$/.test(f) || f === 'ui.html') fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, 'config.jsonc'), `// Test-Einstellungen\n${JSON.stringify(CONFIG, null, 2)}\n`);
  writeTokens('fake-refresh-token');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env, TWEAKABLE_DJ_PORT: String(port), TWEAKABLE_DJ_LANG: 'de', NODE_OPTIONS: `--import=${MOCK}`,
    MOCK_LOG: path.join(dir, 'mock-anfragen.jsonl'), MOCK_GITHUB: path.join(dir, 'github-antwort.json'),
    MOCK_SPOTIFY_STORE: path.join(dir, 'store.json'), // Playlists des Testbenutzers: Übernehmen und Import dürfen schreiben
  };
  delete env.TWEAKABLE_DJ_NO_UPDATE_CHECK; // die Prüfung auf neue Versionen soll hier laufen (gegen den simulierten GitHub)
  server = spawn(process.execPath, ['ui.mjs', '--no-browser'], { cwd: dir, env });
  let out = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startet nicht: ${out}`)), 15_000);
    server.stdout.on('data', chunk => {
      out += chunk;
      if (out.includes(`Tweakable DJ – Oberfläche läuft auf ${base}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on('data', chunk => (out += chunk));
    server.on('exit', code => reject(new Error(`Server beendet (${code}): ${out}`)));
  });
});

// Server beenden und warten, bis er weg ist (sonst ist sein Ordner unter Windows noch belegt).
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

// Anfrage wie von ui.html: X-Tweakable-DJ: 1 und (falls angegeben) X-Lang; body als JSON, raw als Text.
async function api(route, { lang, method = 'GET', body, raw, headers = {} } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: { 'X-Tweakable-DJ': '1', 'Content-Type': 'application/json', ...(lang && { 'X-Lang': lang }), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // Text (z. B. Ausgabe eines Laufs)
  }
  return { status: res.status, data, text };
}

const resultLine = text => JSON.parse(text.split('\n').find(l => l.startsWith('@@RESULT ')).slice('@@RESULT '.length));

test('Schutz: nur mit X-Tweakable-DJ, Meldung in der Sprache der Anfrage', async () => {
  assert.deepEqual((await api('/api/config', { lang: 'en', headers: { 'X-Tweakable-DJ': '0' } })).data, { error: 'Not allowed' });
  assert.deepEqual((await api('/api/config', { lang: 'de', headers: { 'X-Tweakable-DJ': '0' } })).data, { error: 'Nicht erlaubt' });
  // Der Header der früheren Oberfläche (X-Mein-DJ) gilt nicht mehr.
  const old = await fetch(`${base}/api/config`, { headers: { 'X-Mein-DJ': '1', 'X-Lang': 'en' } });
  assert.deepEqual([old.status, await old.json()], [403, { error: 'Not allowed' }]);
  assert.deepEqual((await api('/api/gibtsnicht', { lang: 'en' })).data, { error: 'Not found' });
  assert.deepEqual((await api('/api/gibtsnicht', { lang: 'de' })).data, { error: 'Nicht gefunden' });
  assert.deepEqual((await api('/api/gibtsnicht', { lang: 'fr' })).data, { error: 'Nicht gefunden' }, 'ungültig = Systemsprache');
});

test('Schutz: Seite nicht einbettbar; kaputte Adresse beendet den Server nicht', async () => {
  const page = await fetch(`${base}/`);
  await page.text();
  assert.deepEqual([page.status, page.headers.get('x-frame-options')], [200, 'DENY']);
  // Anfrage mit ungültiger absoluter Adresse, wie sie nur ein Programm (kein Browser) schicken kann
  const port = Number(new URL(base).port);
  const firstLine = await new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`GET http://a:99999/ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
    let reply = '';
    s.on('data', chunk => (reply += chunk));
    s.on('close', () => resolve(reply.split('\r\n')[0]));
    s.on('error', reject);
  });
  assert.equal(firstLine, 'HTTP/1.1 404 Not Found');
  assert.equal((await api('/api/config')).status, 200, 'Server läuft weiter');
});

test('GET /api/config: language, lang und systemLang', async () => {
  const { status, data } = await api('/api/config', { lang: 'en' });
  assert.equal(status, 200);
  assert.equal(data.values.language, '');
  assert.equal(data.defaults.language, '');
  assert.equal(data.defaults.playlistName, 'Tweakable DJ');
  assert.equal(data.values.playlistName, 'Test-DJ');
  assert.equal(data.lang, 'en');
  assert.equal(data.systemLang, 'de');
  assert.equal((await api('/api/config')).data.lang, 'de');
});

test('GET /api/config: Stufen für „Abwechslung bei Künstlern“, gefolgte Künstler und fehlende Berechtigungen', async () => {
  const { data } = await api('/api/config', { lang: 'en' });
  assert.deepEqual(data.variety.keys, ['maxPerArtist', 'artistWindow', 'maxPerWindow', 'artistGap']);
  assert.deepEqual(data.variety.levels.map(l => l.id), ['low', 'medium', 'high', 'veryHigh']);
  assert.deepEqual(data.variety.levels[1].values, Object.fromEntries(data.variety.keys.map(k => [k, data.defaults[k]])));
  assert.deepEqual([data.defaults.followedArtists, data.limits.followedArtists.min, data.limits.followedArtists.max], [0, -1, 1]);
  // tokens.json ohne scope (ältere Version): unbekannt
  assert.equal(data.setup.missingScopes, null);
  const all = 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read';
  const tokens = scope => fs.writeFileSync(path.join(dir, 'tokens.json'),
    JSON.stringify({ access_token: 'abgelaufen', refresh_token: 'fake-refresh-token', expires_at: 0, authorized_at: Date.now(), scope }));
  try {
    tokens(all);
    assert.deepEqual((await api('/api/config')).data.setup.missingScopes, ['user-follow-read']);
    tokens(`${all} user-follow-read`);
    assert.deepEqual((await api('/api/config')).data.setup.missingScopes, []);
  } finally {
    writeTokens('fake-refresh-token');
  }
});

test('POST /api/lastfm und /api/setup: Meldungen in der Sprache der Anfrage', async () => {
  const check = async lang => (await api('/api/lastfm', { lang, method: 'POST', body: { apiKey: 'zu-kurz' } })).data;
  assert.deepEqual(await check('en'), { ok: false, kind: 'key', message: 'An API key has exactly 32 characters from 0–9 and a–f.' });
  assert.deepEqual(await check('de'), { ok: false, kind: 'key', message: 'Ein API-Key hat genau 32 Zeichen aus 0–9 und a–f.' });
  const setup = await api('/api/setup', { lang: 'en', method: 'POST', body: { clientId: 'nein' } });
  assert.deepEqual([setup.status, setup.data.error], [400, 'The Client ID has exactly 32 characters from 0–9 and a–f.']);
});

test('GET /api/playlists: "Lieblingssongs" bzw. "Liked Songs"', async () => {
  const de = await api('/api/playlists', { lang: 'de' });
  assert.equal(de.status, 200, de.text);
  assert.deepEqual(de.data.options[0], { value: 'liked', name: 'Lieblingssongs', tracks: 12 });
  assert.equal((await api('/api/playlists', { lang: 'en' })).data.options[0].name, 'Liked Songs');
});

test('POST /api/run: Ausgabe und @@RESULT in der Sprache der Anfrage', async () => {
  const de = await api('/api/run?dry=1', { lang: 'de', method: 'POST' });
  assert.equal(de.status, 200);
  assert.match(de.text, /^Lade deine Favoriten …$/m);
  assert.match(de.text, /^Test-DJ: 20 Songs \(/m);
  assert.deepEqual(Object.entries(resultLine(de.text)).filter(([k]) => ['ok', 'dry', 'songs', 'errorCode'].includes(k)),
    [['ok', true], ['dry', true], ['songs', 20], ['errorCode', null]]);
  const en = await api('/api/run?dry=1', { lang: 'en', method: 'POST' });
  assert.match(en.text, /^Loading your favorites …$/m);
  assert.match(en.text, /^Test-DJ: 20 songs \(/m);
  assert.match(en.text, / · current\)$/m);
  assert.equal(resultLine(en.text).ok, true);
});

test('POST /api/run: abgelaufene Anmeldung → errorCode login_expired, Fehlerzeile in der Laufsprache', async () => {
  writeTokens('widerrufen');
  try {
    const en = await api('/api/run?dry=1', { lang: 'en', method: 'POST' });
    const r = resultLine(en.text);
    assert.deepEqual([r.ok, r.errorCode], [false, 'login_expired']);
    assert.match(r.error, /^Spotify login expired \(Invalid refresh token\)/);
    assert.match(en.text, /^Error: Spotify login expired/m);
    assert.match(en.text, /\n\(exited with error code 1\)$/);
    const de = await api('/api/run?dry=1', { lang: 'de', method: 'POST' });
    assert.match(de.text, /^Fehler: Spotify-Anmeldung abgelaufen/m);
    assert.match(de.text, /\n\(beendet mit Fehlercode 1\)$/);
    // Auch die API meldet die abgelaufene Anmeldung mit errorCode
    const lists = await api('/api/playlists', { lang: 'en' });
    assert.deepEqual([lists.status, lists.data.errorCode, lists.data.login], [400, 'login_expired', true]);
  } finally {
    writeTokens('fake-refresh-token');
  }
});

test('POST /api/config: language speichern; danach gilt sie für Anfragen ohne X-Lang', async () => {
  const bad = await api('/api/config', { lang: 'en', method: 'POST', body: { language: 'fr' } });
  assert.deepEqual([bad.status, bad.data.error], [400, 'language: expected "de", "en" or ""']);
  const unknown = await api('/api/config', { lang: 'de', method: 'POST', body: { sprache: 'en' } });
  assert.equal(unknown.data.error, 'Unbekannte Einstellung: sprache');

  // Gesendet auf Deutsch, gewählt Englisch: Erklärung aus der englischen Vorlage
  assert.deepEqual((await api('/api/config', { lang: 'de', method: 'POST', body: { language: 'en' } })).data, { ok: true });
  const text = fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8');
  assert.match(text, /\n\n {2}\/\/ --- Language ---\n {2}"language": "en" +\/\/ Language of the interface/);
  assert.equal((await api('/api/config')).data.values.language, 'en');
  assert.deepEqual((await api('/api/gibtsnicht')).data, { error: 'Not found' }, 'ohne X-Lang: cfg.language');
  assert.deepEqual((await api('/api/gibtsnicht', { lang: 'de' })).data, { error: 'Nicht gefunden' }, 'X-Lang geht vor');
  // Lauf ohne X-Lang: Sprache aus config.jsonc
  assert.match((await api('/api/run?dry=1', { method: 'POST' })).text, /^Loading your favorites …$/m);

  assert.deepEqual((await api('/api/config', { lang: 'en', method: 'POST', body: { language: '' } })).data, { ok: true });
  assert.equal((await api('/api/config')).data.values.language, '');
  assert.deepEqual((await api('/api/gibtsnicht')).data, { error: 'Nicht gefunden' }, 'wieder Systemsprache');
});

test('GET /api/config: limits für die Regler; ungültige Zahlen aus der config.jsonc als problems, nichts abgeschnitten', async () => {
  const { data } = await api('/api/config', { lang: 'en' });
  assert.deepEqual(data.limits.size, { min: 1, max: 500, int: true, slider: [10, 100], step: 5 });
  assert.deepEqual(Object.keys(data.limits).sort(), Object.keys(data.defaults).filter(k => typeof data.defaults[k] === 'number').sort());
  assert.deepEqual(data.problems, {});
  // Von Hand geändert: size 0 (ungültig), artistGap 30 (größer als der Regler, aber erlaubt)
  const file = path.join(dir, 'config.jsonc');
  const before = fs.readFileSync(file, 'utf8');
  try {
    fs.writeFileSync(file, JSON.stringify({ ...CONFIG, size: 0, artistGap: 30 }, null, 2));
    const en = (await api('/api/config', { lang: 'en' })).data;
    assert.deepEqual([en.values.size, en.values.artistGap], [0, 30]);
    assert.deepEqual(en.problems, { size: 'size in config.jsonc must be a whole number from 1 to 500 (currently 0).' });
    assert.deepEqual((await api('/api/config', { lang: 'de' })).data.problems,
      { size: 'size in config.jsonc muss eine ganze Zahl von 1 bis 500 sein (derzeit 0).' });
    // Speichern einer anderen Einstellung lässt beide Werte, wie sie sind
    assert.deepEqual((await api('/api/config', { lang: 'en', method: 'POST', body: { adventure: 0.5 } })).data, { ok: true });
    const after = JSON.parse(stripComments(fs.readFileSync(file, 'utf8')));
    assert.deepEqual([after.size, after.artistGap, after.adventure], [0, 30, 0.5]);
    // Ungültiger Wert über die API: abgelehnt, mit Schlüssel, Bereich und Datei
    const bad = await api('/api/config', { lang: 'en', method: 'POST', body: { maxPerWindow: 0 } });
    assert.deepEqual([bad.status, bad.data.error], [400, 'maxPerWindow in config.jsonc must be a whole number from 1 to 100 (currently 0).']);
    // Probelauf: Abbruch mit derselben Meldung statt „Kein einziger Song gefunden“
    const run = await api('/api/run?dry=1', { lang: 'en', method: 'POST' });
    assert.match(run.text, /^Error: size in config\.jsonc must be a whole number from 1 to 500 \(currently 0\)\.$/m);
    assert.deepEqual([resultLine(run.text).ok, resultLine(run.text).errorCode], [false, 'other']);
  } finally {
    fs.writeFileSync(file, before);
  }
});

// --- Hinweis auf neue Versionen (GET /api/update gegen den simulierten GitHub aus tests/mock-apis.mjs) ---

const RELEASE = tag => ({ status: 200, body: { tag_name: tag, html_url: `https://github.com/beispiel/tweakable-dj-for-spotify/releases/tag/${tag}` } });

// package.json der Kopie (owner = Besitzer im Repository-Link) und Antwort von GitHub (null = keine Datei, also
// nicht erreichbar); der Tages-Cache der vorigen Fälle wird gelöscht.
function updateCase(owner, reply) {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'tweakable-dj', version: '0.1.0',
    repository: { type: 'git', url: `git+https://github.com/${owner}/tweakable-dj-for-spotify.git` },
  }));
  const file = path.join(dir, 'github-antwort.json');
  if (reply) fs.writeFileSync(file, JSON.stringify(reply));
  else fs.rmSync(file, { force: true });
  fs.rmSync(path.join(dir, 'update-check.json'), { force: true });
}

// Anfragen an GitHub laut Protokoll des Mocks
const githubRequests = () => {
  const file = path.join(dir, 'mock-anfragen.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.host === 'api.github.com');
};

test('GET /api/update: nur mit X-Tweakable-DJ, Meldung in der Sprache der Anfrage', async () => {
  updateCase('beispiel', RELEASE('v0.2.0'));
  const before = githubRequests().length;
  assert.deepEqual(await api('/api/update', { lang: 'en', headers: { 'X-Tweakable-DJ': '0' } }), {
    status: 403, data: { error: 'Not allowed' }, text: JSON.stringify({ error: 'Not allowed' }),
  });
  assert.deepEqual((await api('/api/update', { lang: 'de', headers: { 'X-Tweakable-DJ': '0' } })).data, { error: 'Nicht erlaubt' });
  assert.equal(githubRequests().length, before, 'ohne Header keine Abfrage');
});

test('GET /api/update: neuere Version → updateAvailable, Link aufs Release; zweite Anfrage aus dem Cache', async () => {
  updateCase('beispiel', RELEASE('v0.2.0'));
  const before = githubRequests().length;
  const { status, data } = await api('/api/update', { lang: 'en' });
  assert.equal(status, 200);
  assert.deepEqual({ ...data, checkedAt: typeof data.checkedAt }, {
    enabled: true, current: '0.1.0', latest: '0.2.0', updateAvailable: true,
    url: 'https://github.com/beispiel/tweakable-dj-for-spotify/releases/tag/v0.2.0', checkedAt: 'string', error: null, installable: true,
  });
  assert.deepEqual(githubRequests().slice(before).map(e => e.path), ['/repos/beispiel/tweakable-dj-for-spotify/releases/latest']);
  assert.deepEqual((await api('/api/update', { lang: 'en' })).data, data);
  assert.equal(githubRequests().length, before + 1, 'höchstens einmal am Tag');

  updateCase('beispiel', RELEASE('v0.1.0'));
  const same = (await api('/api/update', { lang: 'en' })).data;
  assert.deepEqual([same.enabled, same.latest, same.updateAvailable, same.error], [true, '0.1.0', false, null], 'gleiche Version: kein Hinweis');
});

test('GET /api/update: GitHub nicht erreichbar → trotzdem 200, mit error und ohne Update', async () => {
  for (const reply of [{ offline: true }, null, { status: 500, body: {} }]) {
    updateCase('beispiel', reply);
    const { status, data } = await api('/api/update', { lang: 'de' });
    assert.equal(status, 200, JSON.stringify(reply));
    assert.deepEqual([data.enabled, data.current, data.latest, data.updateAvailable], [true, '0.1.0', null, false]);
    assert.equal(data.error, reply?.status ? 'GitHub: HTTP 500' : 'GitHub: ENOTFOUND');
  }
  fs.rmSync(path.join(dir, 'update-check.json'), { force: true });
});

// --- „Jetzt aktualisieren“ (POST /api/update/install): hier nur die Fälle, in denen das Update nicht läuft – ein
// erfolgreiches beendet den Server (ganzer Ablauf in tests/install-update.test.mjs) ---

const install = (lang, headers) => api('/api/update/install', { lang, method: 'POST', body: { version: '0.2.0' }, headers });

test('POST /api/update/install: ohne X-Tweakable-DJ bzw. mit fremdem Host 403, nichts gefragt', async () => {
  updateCase('beispiel', RELEASE('v0.2.0'));
  const before = githubRequests().length;
  assert.deepEqual(await install('en', { 'X-Tweakable-DJ': '0' }), {
    status: 403, data: { error: 'Not allowed' }, text: JSON.stringify({ error: 'Not allowed' }),
  });
  assert.deepEqual((await install('de', { 'X-Tweakable-DJ': '0' })).data, { error: 'Nicht erlaubt' });
  const res = await fetch(`${base}/api/update/install`, { method: 'POST', headers: { 'X-Lang': 'en', 'Content-Type': 'application/json' } });
  assert.deepEqual([res.status, await res.json()], [403, { error: 'Not allowed' }]);
  // Host-Prüfung: Anfrage an localhost statt 127.0.0.1 (z. B. von einer fremden Seite per DNS-Rebinding)
  const port = Number(new URL(base).port);
  const status = await new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`POST /api/update/install HTTP/1.1\r\nHost: localhost:${port}\r\n`
      + 'X-Tweakable-DJ: 1\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}'));
    let reply = '';
    s.on('data', chunk => (reply += chunk));
    s.on('close', () => resolve(reply.split('\r\n')[0]));
    s.on('error', reject);
  });
  assert.equal(status, 'HTTP/1.1 403 Forbidden');
  assert.equal(githubRequests().length, before, 'keine Anfrage an GitHub');
});

test('POST /api/update/install: gleiche oder ältere Version → abgelehnt, nichts geändert', async () => {
  for (const tag of ['v0.1.0', 'v0.0.9']) {
    updateCase('beispiel', RELEASE(tag));
    const files = Object.fromEntries(fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile())
      .map(f => [f, fs.readFileSync(path.join(dir, f), 'base64')]));
    const de = await install('de');
    assert.equal(de.status, 200);
    const r = resultLine(de.text);
    assert.deepEqual([r.ok, r.outcome], [false, 'unchanged']);
    assert.equal(r.error, `Update fehlgeschlagen: Version ${tag.slice(1)} ist nicht neuer als deine (0.1.0). Es wurde nichts geändert.`);
    assert.match(de.text, /^Frage GitHub nach der neuesten Version …$/m);
    const after = Object.fromEntries(fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile())
      .map(f => [f, fs.readFileSync(path.join(dir, f), 'base64')]));
    delete after['mock-anfragen.jsonl'];
    delete files['mock-anfragen.jsonl'];
    assert.deepEqual(after, files);
    assert.equal(fs.existsSync(path.join(dir, '.update')), false, 'nicht einmal .update angelegt');
  }
  updateCase('beispiel', RELEASE('v0.1.0'));
  assert.match(resultLine((await install('en')).text).error, /^Update failed: Version 0\.1\.0 isn’t newer than yours \(0\.1\.0\)\. Nothing was changed\.$/);
});

test('POST /api/update/install: nicht während eines Laufs oder eines automatischen Laufs (409)', async () => {
  updateCase('beispiel', RELEASE('v0.2.0'));
  // Lauf aus der Oberfläche: erst die erste Ausgabe abwarten, dann ist er sicher gestartet.
  const run = await fetch(`${base}/api/run?dry=1`, { method: 'POST', headers: { 'X-Tweakable-DJ': '1', 'X-Lang': 'de' } });
  const reader = run.body.getReader();
  await reader.read();
  try {
    assert.deepEqual(await install('de'), {
      status: 409, data: { error: 'Gerade läuft ein Durchgang. Warte, bis er fertig ist, und aktualisiere dann.' },
      text: JSON.stringify({ error: 'Gerade läuft ein Durchgang. Warte, bis er fertig ist, und aktualisiere dann.' }),
    });
    assert.equal((await install('en')).data.error, 'A run is in progress. Wait until it’s finished, then update.');
  } finally {
    while (!(await reader.read()).done) {
      // Lauf zu Ende lesen
    }
  }
  // Automatischer Lauf: automatik.json mit startedAt (vor 5 Minuten) und ohne finishedAt
  const auto = path.join(dir, 'automatik.json');
  fs.writeFileSync(auto, JSON.stringify({ startedAt: new Date(Date.now() - 5 * 60_000).toISOString(), finishedAt: null, ok: null }));
  try {
    const de = await install('de');
    assert.equal(de.status, 409);
    assert.match(de.data.error, /^Gerade läuft ein automatischer Lauf \(seit \d\d:\d\d Uhr\)\. Warte, bis er fertig ist, und aktualisiere dann\.$/);
    assert.match((await install('en')).data.error, /^An automatic run is in progress \(since .+\)\. Wait until it’s finished, then update\.$/);
    // Abgestürzter Lauf (älter als 30 Minuten) hält das Update nicht auf: dann kommt es bis zur Versionsprüfung.
    fs.writeFileSync(auto, JSON.stringify({ startedAt: new Date(Date.now() - 31 * 60_000).toISOString(), finishedAt: null, ok: null }));
    updateCase('beispiel', RELEASE('v0.1.0'));
    assert.equal(resultLine((await install('en')).text).outcome, 'unchanged');
  } finally {
    fs.rmSync(auto, { force: true });
    fs.rmSync(path.join(dir, 'update-check.json'), { force: true });
  }
});

// --- Probelauf übernehmen, Textdatei speichern und importieren (Playlists in MOCK_SPOTIFY_STORE = store.json) ---

const store = () => JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8'));
const spotifyRequests = () => {
  const file = path.join(dir, 'mock-anfragen.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.host === 'api.spotify.com') : [];
};
// Inhalt einer Textdatei an POST /api/import/preview (wie ui.html: als Text, nicht als JSON)
const preview = (text, { lang = 'de', headers = {} } = {}) => api('/api/import/preview', {
  lang, method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers }, raw: text,
});

test('Neue Schnittstellen: ohne X-Tweakable-DJ bzw. mit fremdem Host 403, nichts gefragt', async () => {
  const before = spotifyRequests().length;
  const routes = [['GET', '/api/trial'], ['POST', '/api/apply'], ['GET', '/api/export'], ['GET', '/api/export?trial=0123456789ab'],
    ['POST', '/api/import/preview'], ['POST', '/api/import']];
  for (const [method, route] of routes) {
    const r = await api(route, { lang: 'en', method, headers: { 'X-Tweakable-DJ': '0' }, body: method === 'POST' ? {} : undefined });
    assert.deepEqual([r.status, r.data], [403, { error: 'Not allowed' }], `${method} ${route}`);
    const plain = await fetch(base + route, { method, headers: { 'X-Lang': 'de' } });
    assert.deepEqual([plain.status, await plain.json()], [403, { error: 'Nicht erlaubt' }], `${method} ${route} ohne Header`);
  }
  const port = Number(new URL(base).port);
  const status = await new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`POST /api/import HTTP/1.1\r\nHost: localhost:${port}\r\n`
      + 'X-Tweakable-DJ: 1\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}'));
    let reply = '';
    s.on('data', chunk => (reply += chunk));
    s.on('close', () => resolve(reply.split('\r\n')[0]));
    s.on('error', reject);
  });
  assert.equal(status, 'HTTP/1.1 403 Forbidden');
  assert.equal(spotifyRequests().length, before, 'keine Anfrage an Spotify');
});

test('„Diese Liste übernehmen“: Playlist = Liste des Probelaufs; abgelaufen nach Änderung der Einstellungen bzw. nach dem Übernehmen', async () => {
  const dry = await api('/api/run?dry=1', { lang: 'de', method: 'POST' });
  const { trialId } = resultLine(dry.text);
  assert.match(trialId, /^[0-9a-f]{12}$/);
  const trial = JSON.parse(fs.readFileSync(path.join(dir, 'probelauf.json'), 'utf8'));
  assert.equal(trial.id, trialId);
  const ok = (await api(`/api/trial?id=${trialId}`, { lang: 'de' })).data;
  assert.deepEqual([ok.ok, ok.reason, ok.message, ok.trial.id, ok.trial.songs, ok.trial.playlistName], [true, null, '', trialId, 20, 'Test-DJ']);
  assert.equal(Date.parse(ok.trial.expiresAt) - Date.parse(ok.trial.createdAt), 24 * 3600_000);

  // Falsche oder fremde Kennung
  assert.deepEqual(await api('/api/apply', { lang: 'en', method: 'POST', body: { id: '../x' } }),
    { status: 400, data: { error: 'Invalid request' }, text: JSON.stringify({ error: 'Invalid request' }) });
  const other = await api('/api/apply', { lang: 'de', method: 'POST', body: { id: '0123456789ab' } });
  assert.deepEqual([other.status, other.data.reason], [409, 'replaced']);
  assert.match(other.data.error, /^Seitdem gab es einen neueren Probelauf/);
  // Einstellung geändert und gespeichert: abgelaufen; zurückgestellt gilt er wieder
  assert.equal((await api('/api/config', { method: 'POST', body: { size: 25 } })).status, 200);
  const changed = (await api(`/api/trial?id=${trialId}`, { lang: 'en' })).data;
  assert.deepEqual([changed.ok, changed.reason, changed.message], [false, 'settings', 'The settings have changed since the test run. Start a new test run.']);
  const refused = await api('/api/apply', { lang: 'de', method: 'POST', body: { id: trialId } });
  assert.deepEqual([refused.status, refused.data], [409, { error: 'Die Einstellungen haben sich seit dem Probelauf geändert. Starte einen neuen Probelauf.', reason: 'settings' }]);
  // (Die Automatik zählt nicht – hier nicht geprüft, weil das den Zeitplaner des Systems fragen würde; siehe tests/trial.test.mjs.)
  assert.equal((await api('/api/config', { method: 'POST', body: { size: 20 } })).status, 200);
  assert.equal((await api(`/api/trial?id=${trialId}`)).data.ok, true, 'zurückgestellt: gilt wieder');

  // Noch nicht übernommen: als Textdatei speichern
  const text = (await api(`/api/export?trial=${trialId}`, { lang: 'de' })).data;
  assert.match(text.filename, /^tweakable-dj-\d{4}-\d\d-\d\d-probelauf\.txt$/);
  const lines = text.text.split('\n');
  assert.match(lines[0], /^# Test-DJ – exportiert am /);
  assert.match(lines[1], /^# Probelauf vom .+ – noch nicht in der Playlist$/);
  assert.deepEqual(lines.slice(3, -1).map(l => `spotify:track:${l.split('/track/')[1]}`), trial.tracks.map(t => t.uri));
  assert.equal(text.songs, 20);
  assert.equal((await api('/api/export?trial=0123456789ab', { lang: 'en' })).data.reason, 'replaced');

  // Übernehmen: Ausgabe wie ein Lauf, die Playlist enthält genau die Songs des Probelaufs
  const applied = await api('/api/apply', { lang: 'de', method: 'POST', body: { id: trialId } });
  assert.equal(applied.status, 200);
  assert.match(applied.text, /^Übernehme den Probelauf vom .+ \(20 Songs\), ohne neu zu losen …$/m);
  const r = resultLine(applied.text);
  assert.deepEqual([r.ok, r.dry, r.songs, r.errorCode], [true, false, 20, null]);
  const playlist = store().playlists.find(p => p.name === 'Test-DJ');
  assert.deepEqual(playlist.uris, trial.tracks.map(t => t.uri));
  assert.equal(r.playlistUrl, `https://open.spotify.com/playlist/${playlist.id}`);
  assert.equal(playlist.description, trial.description);
  const history = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).history;
  assert.equal(history.at(-1).length, 20, 'als Lauf gemerkt');
  const gone = (await api(`/api/trial?id=${trialId}`, { lang: 'en' })).data;
  assert.deepEqual([gone.ok, gone.reason, gone.trial], [false, 'missing', null]);
  assert.equal((await api('/api/apply', { method: 'POST', body: { id: trialId } })).status, 409);

  // Playlist, wie sie jetzt in Spotify ist, als Textdatei
  const exported = await api('/api/export', { lang: 'en' });
  assert.equal(exported.status, 200, exported.text);
  assert.match(exported.data.filename, /^tweakable-dj-\d{4}-\d\d-\d\d\.txt$/);
  const exportedLines = exported.data.text.split('\n');
  assert.match(exportedLines[0], new RegExp(`^# Test-DJ – exported on .+ · https://open\\.spotify\\.com/playlist/${playlist.id}$`));
  assert.equal(exportedLines[1], '# 20 songs · one line per song: artist – title, tab, Spotify link');
  assert.deepEqual(exportedLines.slice(2, -1).map(l => `spotify:track:${l.split('/track/')[1]}`), playlist.uris);
  assert.deepEqual([exported.data.songs, exported.data.playlistUrl], [20, r.playlistUrl]);
});

test('Textdatei importieren: Vorschau mit Fortschritt und nicht gefundenen Zeilen, Schreiben ohne Verlauf; Grenzen', async () => {
  const before = store().playlists.find(p => p.name === 'Test-DJ');
  const exported = (await api('/api/export', { lang: 'de' })).data.text;
  const text = `${exported}\n# eigene Zeilen\nNordlicht – Polarnacht\nHafenlicht – Nicht auf Spotify 3\nhttps://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M\n`;
  const stateBefore = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
  const de = await preview(text);
  assert.equal(de.status, 200, de.text);
  assert.match(de.text, /^Suche 23 Songs aus der Datei …$/m);
  assert.match(de.text, /^ {2}2 von 2 Suchen auf Spotify …$/m);
  assert.match(de.text, /^21 von 23 Songs gefunden$/m);
  const r = resultLine(de.text);
  assert.deepEqual([r.ok, r.total, r.found, r.playlistName], [true, 23, 21, 'Test-DJ']);
  assert.deepEqual(r.uris.slice(0, 20), before.uris, 'exportierte Zeilen 1:1');
  assert.deepEqual(r.notFound, [
    { line: 26, text: 'Hafenlicht – Nicht auf Spotify 3', reason: 'notFound' },
    { line: 27, text: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', reason: 'link' },
  ]);
  assert.deepEqual(store().playlists.find(p => p.name === 'Test-DJ').uris, before.uris, 'Vorschau schreibt nichts');
  const en = await preview(text, { lang: 'en' });
  assert.match(en.text, /^21 of 23 songs found$/m);

  // Schreiben nach der Rückfrage
  const written = await api('/api/import', { lang: 'de', method: 'POST', body: { uris: r.uris } });
  assert.deepEqual(written.data, { ok: true, songs: 21, playlistName: 'Test-DJ', playlistUrl: `https://open.spotify.com/playlist/${before.id}`, created: false });
  const after = store().playlists.find(p => p.name === 'Test-DJ');
  assert.deepEqual(after.uris, r.uris);
  assert.match(after.description, /^Tweakable DJ · aus einer Textdatei, .+ · 21 Songs$/);
  assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), stateBefore, 'kein Eintrag im Verlauf');

  // Grenzen: leere Datei, zu viele Songs, mehr als 1 MB, ungültige Liste
  const status = async (res, code, error) => assert.deepEqual([(await res).status, (await res).data.error], [code, error]);
  await status(preview('# nur ein Kommentar\n\n'), 400, 'Die Datei enthält keine Songs. Leere Zeilen und Kommentarzeilen zählen nicht.');
  await status(preview(Array.from({ length: 501 }, (_, i) => `A – T${i}`).join('\n'), { lang: 'en' }), 400,
    'The file contains 501 songs; the playlist holds at most 500.');
  await status(preview('x'.repeat(1_000_001)), 400, 'Die Datei ist zu groß (höchstens 1 MB).');
  await status(api('/api/import', { lang: 'en', method: 'POST', body: { uris: ['spotify:album:aaaaaaaaaaaaaaaaaaaaaa'] } }), 400,
    'Invalid list: expected 1 to 500 Spotify songs (spotify:track:…).');
  await status(api('/api/import', { lang: 'de', method: 'POST', body: {} }), 400, 'Ungültige Liste: erwartet sind 1 bis 500 Spotify-Songs (spotify:track:…).');
  assert.deepEqual(store().playlists.find(p => p.name === 'Test-DJ').uris, r.uris, 'nichts verändert');
});

test('Sperre: kein Import während eines Laufs; kein Lauf, Übernehmen, Anmelden, Update oder zweiter Import während eines Imports', async () => {
  // Lauf läuft: erst die erste Ausgabe abwarten, dann ist er sicher gestartet.
  const run = await fetch(`${base}/api/run?dry=1`, { method: 'POST', headers: { 'X-Tweakable-DJ': '1', 'X-Lang': 'de' } });
  const runReader = run.body.getReader();
  await runReader.read();
  try {
    const p = await preview('A – B');
    assert.deepEqual([p.status, p.data.error], [409, 'Es läuft bereits ein Durchgang.']);
    const w = await api('/api/import', { lang: 'en', method: 'POST', body: { uris: ['spotify:track:aaaaaaaaaaaaaaaaaaaaaa'] } });
    assert.deepEqual([w.status, w.data.error], [409, 'A run is already in progress.']);
  } finally {
    while (!(await runReader.read()).done) {
      // Lauf zu Ende lesen
    }
  }
  // Import läuft (jede Suche nach "Langsam …" dauert 700 ms)
  const slow = Array.from({ length: 9 }, (_, i) => `Bergfunk – Langsam ${i + 1}`).join('\n');
  const imp = await fetch(`${base}/api/import/preview`, { method: 'POST', headers: { 'X-Tweakable-DJ': '1', 'X-Lang': 'de', 'Content-Type': 'text/plain' }, body: slow });
  const reader = imp.body.getReader();
  await reader.read();
  let rest = '';
  try {
    const busy = 'Gerade läuft ein Import aus einer Textdatei. Warte, bis er fertig ist.';
    assert.deepEqual([(await api('/api/run?dry=1', { lang: 'de', method: 'POST' })).status, (await api('/api/run', { lang: 'de', method: 'POST' })).data.error], [409, busy]);
    assert.deepEqual((await api('/api/apply', { lang: 'de', method: 'POST', body: { id: '0123456789ab' } })).data, { error: busy });
    assert.deepEqual((await api('/api/login', { lang: 'en', method: 'POST' })).data, { error: 'An import from a text file is in progress. Wait until it’s finished.' });
    assert.deepEqual((await preview('A – B')).data, { error: busy });
    assert.equal((await api('/api/import', { lang: 'de', method: 'POST', body: { uris: ['spotify:track:aaaaaaaaaaaaaaaaaaaaaa'] } })).status, 409);
    assert.equal((await api('/api/config')).data.importing, true);
    updateCase('beispiel', RELEASE('v0.2.0'));
    assert.deepEqual(await install('de'), {
      status: 409, data: { error: 'Gerade läuft ein Import aus einer Textdatei. Warte, bis er fertig ist, und aktualisiere dann.' },
      text: JSON.stringify({ error: 'Gerade läuft ein Import aus einer Textdatei. Warte, bis er fertig ist, und aktualisiere dann.' }),
    });
  } finally {
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
    }
    fs.rmSync(path.join(dir, 'update-check.json'), { force: true });
  }
  assert.deepEqual([resultLine(rest).ok, resultLine(rest).found], [true, 9]);
  assert.equal((await api('/api/config')).data.importing, false, 'danach wieder frei');
  assert.equal((await preview('Nordlicht – Polarnacht')).status, 200);
});

// Beide Texttabellen in ui.html haben dieselben Schlüssel (auch verschachtelt), damit beim Umschalten nichts fehlt.
test('ui.html: TEXT.de und TEXT.en haben dieselben Schlüssel', async () => {
  const vm = await import('node:vm');
  const html = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  const start = html.indexOf('const LASTFM_APPS');
  const end = html.indexOf('\n};\n', html.indexOf('const TEXT = {'));
  assert.ok(start > 0 && end > start, 'TEXT nicht gefunden');
  const TEXT = vm.runInNewContext(`${html.slice(start, end + 3)}\nTEXT`);
  const shape = v => (typeof v === 'function' ? 'function'
    : Array.isArray(v) ? v.map(shape)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, shape(v[k])]))
    : typeof v);
  assert.deepEqual(Object.keys(TEXT), ['de', 'en']);
  assert.deepEqual(shape(TEXT.en), shape(TEXT.de));
  assert.equal(typeof TEXT.de.update.text('0.2.0', '0.1.0'), 'string');
});

// --- „Nach Updates suchen“ (GET /api/update?force=1): am Tages-Cache vorbei, höchstens einmal pro Minute ---

test('GET /api/update?force=1: fragt sofort, zweiter Klick innerhalb einer Minute aus dem Cache; ohne Header 403', async () => {
  updateCase('beispiel', RELEASE('v0.1.0'));
  const before = githubRequests().length;
  const first = (await api('/api/update', { lang: 'de' })).data;
  assert.deepEqual([first.latest, first.updateAvailable], ['0.1.0', false], 'gleiche Version');
  // Neues Release, aber der Tages-Cache gilt noch: ohne force kein Hinweis …
  fs.writeFileSync(path.join(dir, 'github-antwort.json'), JSON.stringify(RELEASE('v0.3.0')));
  assert.equal((await api('/api/update', { lang: 'de' })).data.latest, '0.1.0');
  assert.equal(githubRequests().length, before + 1);
  // … ohne Header nicht einmal mit force
  assert.deepEqual(await api('/api/update?force=1', { lang: 'en', headers: { 'X-Tweakable-DJ': '0' } }), {
    status: 403, data: { error: 'Not allowed' }, text: JSON.stringify({ error: 'Not allowed' }),
  });
  const plain = await fetch(`${base}/api/update?force=1`, { headers: { 'X-Lang': 'de' } });
  assert.deepEqual([plain.status, await plain.json()], [403, { error: 'Nicht erlaubt' }]);
  assert.equal(githubRequests().length, before + 1, 'ohne Header keine Abfrage');
  // … mit force sofort
  const forced = (await api('/api/update?force=1', { lang: 'de' })).data;
  assert.deepEqual([forced.status, forced.latest, forced.updateAvailable, forced.error, forced.installable], [undefined, '0.3.0', true, null, true]);
  assert.equal(githubRequests().length, before + 2);
  // Zweimal kurz hintereinander (auch gleichzeitig): keine weitere Abfrage, Ergebnis aus dem Cache
  fs.writeFileSync(path.join(dir, 'github-antwort.json'), JSON.stringify({ offline: true }));
  const again = await Promise.all([api('/api/update?force=1', { lang: 'de' }), api('/api/update?force=1', { lang: 'en' })]);
  for (const r of again) assert.deepEqual([r.status, r.data.latest, r.data.updateAvailable, r.data.checkedAt], [200, '0.3.0', true, forced.checkedAt]);
  assert.equal(githubRequests().length, before + 2, 'höchstens einmal pro Minute');
  fs.rmSync(path.join(dir, 'update-check.json'), { force: true });
});

// --- Probelauf: Liste für „sperren“, gesperrter Song macht „Diese Liste übernehmen“ ungültig; Import mit Hinweisen ---

test('GET /api/trial?tracks=1: Songs des Probelaufs; einen davon sperren → nicht mehr übernehmbar, nächster Probelauf ohne ihn', async () => {
  const dry = await api('/api/run?dry=1', { lang: 'de', method: 'POST' });
  const { trialId } = resultLine(dry.text);
  const trial = JSON.parse(fs.readFileSync(path.join(dir, 'probelauf.json'), 'utf8'));
  const short = (await api(`/api/trial?id=${trialId}`)).data;
  assert.equal(short.trial.tracks, undefined, 'ohne tracks=1 nur die Eckdaten');
  const full = (await api(`/api/trial?id=${trialId}&tracks=1`)).data;
  assert.deepEqual(full.trial.tracks, trial.tracks.map(t => ({ uri: t.uri, artist: t.artist, name: t.name })));
  assert.equal(full.trial.tracks.length, 20);

  const song = full.trial.tracks.find(t => !/Echo/.test(t.name)) ?? full.trial.tracks[0];
  try {
    const saved = await api('/api/config', { lang: 'en', method: 'POST', body: { blockedTracks: [{ ...song, kind: 'egal' }] } });
    assert.deepEqual(saved.data, { ok: true });
    assert.deepEqual((await api('/api/config')).data.values.blockedTracks, [song], 'gesäubert gespeichert');
    const after = (await api(`/api/trial?id=${trialId}`, { lang: 'de' })).data;
    assert.deepEqual([after.ok, after.reason], [false, 'settings']);
    assert.equal((await api('/api/apply', { lang: 'de', method: 'POST', body: { id: trialId } })).status, 409);
    assert.equal(resultLine((await api('/api/run?dry=1', { lang: 'de', method: 'POST' })).text).ok, true);
    assert.ok(!JSON.parse(fs.readFileSync(path.join(dir, 'probelauf.json'), 'utf8')).tracks.some(t => t.uri === song.uri), 'nicht mehr dabei');
    // Ungültige Liste: abgelehnt
    const bad = await api('/api/config', { lang: 'de', method: 'POST', body: { blockedTracks: [{ uri: 'x', artist: 'A', name: 'B' }] } });
    assert.deepEqual([bad.status, bad.data.error], [400, 'blockedTracks: Jeder Song braucht "artist" und "name" (Text); "uri" fehlt oder ist eine Spotify-URI (spotify:track:…).']);
  } finally {
    assert.equal((await api('/api/config', { method: 'POST', body: { blockedTracks: [] } })).status, 200);
  }
});

test('Import-Vorschau: gesperrte und explizite Songs als Hinweis, trotzdem in der Liste', async () => {
  const blocked = { uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', artist: 'Irgendwer', name: 'Egal' };
  try {
    assert.equal((await api('/api/config', { method: 'POST', body: { excludeExplicit: true, blockedTracks: [blocked, { artist: 'Nordlicht', name: 'Polarnacht' }] } })).status, 200);
    const text = 'Nordlicht – Polarnacht (Remastered)\nElbsand – Polarnacht Echo 4\nStadtkind – Asphalt\nspotify:track:aaaaaaaaaaaaaaaaaaaaaa\n';
    const r = resultLine((await preview(text)).text);
    assert.deepEqual([r.ok, r.found, r.uris.length], [true, 4, 4], 'nichts herausgefiltert');
    assert.deepEqual(r.hints, {
      blocked: [{ line: 1, text: 'Nordlicht – Polarnacht (Remastered)' }, { line: 4, text: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa' }],
      explicit: [{ line: 2, text: 'Elbsand – Polarnacht Echo 4' }],
    });
    assert.equal((await api('/api/config', { method: 'POST', body: { excludeExplicit: false } })).status, 200);
    assert.deepEqual(resultLine((await preview(text)).text).hints.explicit, [], 'ohne Filter kein Hinweis');
  } finally {
    assert.equal((await api('/api/config', { method: 'POST', body: { excludeExplicit: false, blockedTracks: [] } })).status, 200);
  }
});

// --- Systembenachrichtigungen: „Bei Fehlern benachrichtigen“ und „Testbenachrichtigung senden“ ---

const notifications = () => {
  const file = path.join(dir, 'mock-anfragen.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.notify).map(e => e.notify) : [];
};

test('POST /api/notify/test: sendet sofort (hier nur simuliert), Text in der Sprache der Anfrage; ohne X-Tweakable-DJ 403', async () => {
  const before = notifications().length;
  const plain = await fetch(`${base}/api/notify/test`, { method: 'POST', headers: { 'X-Lang': 'de' } });
  assert.deepEqual([plain.status, await plain.json()], [403, { error: 'Nicht erlaubt' }]);
  const foreign = await api('/api/notify/test', { lang: 'en', method: 'POST', headers: { 'X-Tweakable-DJ': '0' }, body: {} });
  assert.deepEqual([foreign.status, foreign.data], [403, { error: 'Not allowed' }]);
  assert.equal(notifications().length, before, 'ohne Header nichts gesendet');

  for (const [lang, title] of [['de', 'Tweakable DJ: Testbenachrichtigung'], ['en', 'Tweakable DJ: test notification']]) {
    const r = await api('/api/notify/test', { lang, method: 'POST', body: {} });
    assert.deepEqual([r.status, r.data], [200, { ok: true }]);
    const sent = notifications().at(-1);
    assert.ok(JSON.stringify(sent).includes(title), JSON.stringify(sent));
  }
  assert.equal(notifications().length, before + 2);
});

test('notifyOnFailure: Standard an, speichern ohne Zeitplaner, kein Einfluss auf den Probelauf; ungültig → 400', async () => {
  const get = async () => (await api('/api/config')).data;
  const cfg = await get();
  assert.deepEqual([cfg.defaults.notifyOnFailure, cfg.values.notifyOnFailure], [true, true]);
  try {
    const saved = await api('/api/config', { method: 'POST', body: { notifyOnFailure: false } });
    assert.deepEqual([saved.status, saved.data], [200, { ok: true }], 'ohne schedule: Zeitplaner nicht angefasst');
    assert.equal((await get()).values.notifyOnFailure, false);
    assert.match(fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8'), /"notifyOnFailure": false/);
    const bad = await api('/api/config', { lang: 'en', method: 'POST', body: { notifyOnFailure: 'ja' } });
    assert.deepEqual([bad.status, bad.data.error], [400, 'notifyOnFailure: expected boolean']);
  } finally {
    assert.equal((await api('/api/config', { method: 'POST', body: { notifyOnFailure: true } })).status, 200);
  }
});
