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

// Anfrage wie von ui.html: X-Tweakable-DJ: 1 und (falls angegeben) X-Lang.
async function api(route, { lang, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: { 'X-Tweakable-DJ': '1', 'Content-Type': 'application/json', ...(lang && { 'X-Lang': lang }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
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
