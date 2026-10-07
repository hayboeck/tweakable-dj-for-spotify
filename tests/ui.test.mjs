// End-to-End für ui.mjs: Server in einer Kopie des Programms auf einem freien Port, Spotify und Last.fm simuliert
// (tests/mock-apis.mjs über NODE_OPTIONS, gilt damit auch für die gestarteten Läufe). Sprache je Anfrage per X-Lang.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from '../config.mjs';
import { FILE_NAMES } from '../shortcut.mjs';

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
let desktop;                  // Desktop-Ordner für die Verknüpfung (TWEAKABLE_DJ_DESKTOP) – nie der echte
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
  // Logo-Dateien einzeln kopieren (fs.cpSync stürzt unter Windows mit manchen Node-Versionen bei Umlauten im Pfad ab)
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(dir, 'assets', f));
  desktop = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj desktop ö-'));
  fs.writeFileSync(path.join(dir, 'config.jsonc'), `// Test-Einstellungen\n${JSON.stringify(CONFIG, null, 2)}\n`);
  writeTokens('fake-refresh-token');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env, TWEAKABLE_DJ_PORT: String(port), TWEAKABLE_DJ_LANG: 'de', NODE_OPTIONS: `--import=${MOCK}`,
    MOCK_LOG: path.join(dir, 'mock-anfragen.jsonl'), MOCK_GITHUB: path.join(dir, 'github-antwort.json'),
    MOCK_SPOTIFY_STORE: path.join(dir, 'store.json'), // Playlists des Testbenutzers: Übernehmen und Import dürfen schreiben
    TWEAKABLE_DJ_DESKTOP: desktop,
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
  fs.rmSync(desktop, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
  assert.deepEqual((await api('/api/gibtsnicht', { lang: 'es' })).data, { error: 'No encontrado' });
  assert.deepEqual((await api('/api/gibtsnicht', { lang: 'fr' })).data, { error: 'Introuvable' });
  assert.deepEqual((await api('/api/config', { lang: 'fr', headers: { 'X-Tweakable-DJ': '0' } })).data, { error: 'Non autorisé' });
  assert.deepEqual((await api('/api/gibtsnicht', { lang: 'it' })).data, { error: 'Nicht gefunden' }, 'ungültig = Systemsprache');
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
    assert.deepEqual((await api('/api/config')).data.setup.missingScopes, ['user-follow-read', 'user-library-modify']);
    tokens(`${all} user-follow-read`);
    assert.deepEqual((await api('/api/config')).data.setup.missingScopes, ['user-library-modify']);
    tokens(`${all} user-follow-read user-library-modify`);
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

test('GET /api/playlists: "Lieblingssongs", "Liked Songs", "Tus me gusta" bzw. "Titres likés"', async () => {
  const de = await api('/api/playlists', { lang: 'de' });
  assert.equal(de.status, 200, de.text);
  assert.deepEqual(de.data.options[0], { value: 'liked', name: 'Lieblingssongs', tracks: 12 });
  assert.equal((await api('/api/playlists', { lang: 'en' })).data.options[0].name, 'Liked Songs');
  assert.equal((await api('/api/playlists', { lang: 'es' })).data.options[0].name, 'Tus me gusta');
  assert.equal((await api('/api/playlists', { lang: 'fr' })).data.options[0].name, 'Titres likés');
});

test('POST /api/run: Ausgabe und @@RESULT in der Sprache der Anfrage', async () => {
  const de = await api('/api/run?dry=1', { lang: 'de', method: 'POST' });
  assert.equal(de.status, 200);
  assert.match(de.text, /^Lade deine Favoriten …$/m);
  assert.match(de.text, /^Test-DJ: 20 Songs · [^(]+ \(/m);
  assert.deepEqual(Object.entries(resultLine(de.text)).filter(([k]) => ['ok', 'dry', 'songs', 'errorCode'].includes(k)),
    [['ok', true], ['dry', true], ['songs', 20], ['errorCode', null]]);
  const en = await api('/api/run?dry=1', { lang: 'en', method: 'POST' });
  assert.match(en.text, /^Loading your favorites …$/m);
  assert.match(en.text, /^Test-DJ: 20 songs · [^(]+ \(/m);
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
  const bad = await api('/api/config', { lang: 'en', method: 'POST', body: { language: 'it' } });
  assert.deepEqual([bad.status, bad.data.error], [400, 'language: expected "de", "en", "es", "fr" or ""']);
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

  // Spanisch bzw. Französisch: nur der Wert ändert sich (Vorlage bleibt die englische); Ausgabe der Läufe in dieser Sprache
  for (const [language, notFound, loading] of [['es', 'No encontrado', /^Cargando tus favoritas …$/m], ['fr', 'Introuvable', /^Chargement de tes favoris …$/m]]) {
    assert.deepEqual((await api('/api/config', { lang: language, method: 'POST', body: { language } })).data, { ok: true });
    assert.equal(fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8'), text.replace('"language": "en"', `"language": "${language}"`));
    assert.equal((await api('/api/config')).data.values.language, language);
    assert.deepEqual((await api('/api/gibtsnicht')).data, { error: notFound }, 'ohne X-Lang: cfg.language');
    assert.match((await api('/api/run?dry=1', { method: 'POST' })).text, loading);
  }

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
    ['POST', '/api/import/preview'], ['POST', '/api/import'], ['GET', '/api/archive'], ['GET', '/api/archive/entry?id=x'],
    ['POST', '/api/library/contains'], ['POST', '/api/library'], ['GET', '/api/whatsnew'], ['POST', '/api/whatsnew']];
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

// Die Testkopie hat kein package.json (keine eigene Version): kein Hinweis, nichts gemerkt. Die Logik prüft whatsnew.test.mjs.
test('GET /api/whatsnew: ohne Version kein Hinweis; POST merkt nichts', async () => {
  assert.deepEqual((await api('/api/whatsnew', { lang: 'de' })).data, { version: null });
  assert.deepEqual((await api('/api/whatsnew', { method: 'POST', body: {} })).data, { ok: false });
  assert.equal(fs.existsSync(path.join(dir, 'seen-version.json')), false);
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
  assert.deepEqual(written.data, { ok: true, songs: 21, playlistName: 'Test-DJ', playlistUrl: `https://open.spotify.com/playlist/${before.id}`, created: false, archiveRemoved: 0, archiveFile: written.data.archiveFile });
  assert.match(written.data.archiveFile, /^\d{4}-\d\d-\d\d \d\d-\d\d-\d\d Tweakable DJ( \d+)?\.txt$/);
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

// Alle Texttabellen in ui.html haben dieselben Schlüssel (auch verschachtelt) und Funktionen mit gleich vielen Parametern,
// damit beim Umschalten nichts fehlt.
test('ui.html: TEXT.de, TEXT.en, TEXT.es und TEXT.fr haben dieselben Schlüssel', async () => {
  const vm = await import('node:vm');
  const html = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  const start = html.indexOf('const LASTFM_APPS');
  const end = html.indexOf('\n};\n', html.indexOf('const TEXT = {'));
  assert.ok(start > 0 && end > start, 'TEXT nicht gefunden');
  const TEXT = vm.runInNewContext(`${html.slice(start, end + 3)}\nTEXT`);
  const shape = v => (typeof v === 'function' ? `function(${v.length})`
    : Array.isArray(v) ? v.map(shape)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, shape(v[k])]))
    : typeof v);
  assert.deepEqual(Object.keys(TEXT), ['de', 'en', 'es', 'fr']);
  for (const lang of ['en', 'es', 'fr']) assert.deepEqual(shape(TEXT[lang]), shape(TEXT.de), lang);
  assert.equal(typeof TEXT.de.update.text('0.2.0', '0.1.0'), 'string');
  // Die Sprachwahl bietet genau diese Sprachen an, jeweils mit ihrem eigenen Namen
  const options = [...html.matchAll(/<option value="(\w+)" lang="(\w+)">([^<]+)<\/option>/g)].map(m => [m[1], m[2], m[3]]);
  assert.deepEqual(options, [['de', 'de', 'Deutsch'], ['en', 'en', 'English'], ['es', 'es', 'Español'], ['fr', 'fr', 'Français']]);
  assert.doesNotMatch(html, /data-lang=|\.lang button/, 'kein Umschalter DE | EN mehr');
});

// Alle Texte aus TEXT ausrechnen (Funktionen mit Beispielwerten): keine Ausnahme, kein undefined, Französisch mit
// schmalem geschütztem Leerzeichen vor : ; ! ? und in « », Spanisch mit ¿…? und ¡…!; Hinweis auf die Übersetzung nur es/fr.
test('ui.html: alle Texte ausrechenbar, Typografie für es und fr, Übersetzungshinweis nur bei es und fr', async () => {
  const vm = await import('node:vm');
  const html = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  const start = html.indexOf('const LASTFM_APPS');
  const end = html.indexOf('\n};\n', html.indexOf('const TEXT = {'));
  const helpers = `
    let T;
    const two = n => String(n).padStart(2, '0');
    const num = v => Number(v).toLocaleString(T.locale, { maximumFractionDigits: 2 });
    const pct = v => T.pct(v);
    const isOne = n => new Intl.PluralRules(T.locale).select(Number(n)) === 'one';
    const plural = (n, one, many) => \`\${num(n)} \${isOne(n) ? one : many}\`;
    const windowHint = (v, c, text) => text(Math.ceil(c.size * v / c.artistWindow));
    const adventureHint = () => '';
    const followedLabel = () => '';
    const followedHint = () => '';
    const newerLabel = () => '';
    const newerHint = () => '';`;
  const ctx = vm.createContext({});
  vm.runInContext(`${helpers}\n${html.slice(start, end + 3)}\nthis.TEXT = TEXT; this.setT = l => { T = TEXT[l]; };`, ctx);
  const c = { size: 50, artistWindow: 20, maxPerArtist: 2, maxPerWindow: 3, artistGap: 4, schedule: 'weekly', scheduleDay: 'WED',
    playlistName: 'Mix', songs: 1, fresh: 0, freshCurrent: 0, familiar: 2 };
  // Funktionen mit besonderen Parametern (Pfad ohne Sprache) → Aufrufe; alle anderen: (2, c), (0, c ohne Abstand), (1, c)
  const CALLS = {
    when: [[new Date(2026, 9, 6, 7, 5)]],
    'auto.legacy': [[['Alt'], true], [['Alt', 'Älter'], false]],
    'setup.open': [[[1, 2]], [[4]]],
    'run.ok': [[c, true], [{ ...c, songs: 0, familiar: 1, playlistName: '' }, false]],
    'auto.ok': [[3, true], [null, false], [1, false]],
    'variety.hint': [[c], [{ ...c, artistGap: 0, maxPerArtist: 1 }]],
    'trial.help': [['Mix', '07:05']],
    'items.scheduleTime.fmt': [['07:05']],
    'items.scheduleTime.hint': [['07:05', c], ['07:05', { ...c, schedule: 'daily' }]],
    'files.saved': [['mix.txt', 3], ['mix.txt', 1]],
    'files.done': [['Mix', 3], ['Mix', 0]],
    'files.found': [[2, 3], [0, 1]],
    'archive.entry': [['Mo 06.10., 18:30', 50], ['Mo 06.10., 18:30', 1]],
    'update.text': [['0.2.0', '0.1.0'], ['0.2.0', null]],
    'update.confirm': [['0.1.0', '0.2.0']],
  };
  const texts = {};
  const collect = (lang, v, key) => {
    if (typeof v === 'function') {
      const calls = CALLS[key.slice(lang.length + 1)] ?? [[2, c], [0, { ...c, schedule: 'daily', artistGap: 0 }], [1, c]];
      for (const a of calls) {
        const out = v(...a);
        assert.equal(typeof out, 'string', `${key}`);
        assert.doesNotMatch(out, /undefined|NaN|\[object/, `${key}: ${out}`);
        texts[lang].push([key, out]);
      }
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) collect(lang, x, `${key}.${k}`);
    } else if (typeof v === 'string') texts[lang].push([key, v]);
  };
  for (const lang of Object.keys(ctx.TEXT)) {
    ctx.setT(lang);
    texts[lang] = [];
    collect(lang, ctx.TEXT[lang], lang);
  }
  const visible = text => text.replace(/<[^>]*>/g, '');
  for (const [key, text] of texts.fr) {
    if (key === 'fr.locale') continue;
    assert.doesNotMatch(visible(text), /[ \u00a0][:;!?%]/, `fr ${key}: Leerzeichen vor : ; ! ? % muss U+202F sein: ${text}`);
    assert.doesNotMatch(visible(text), /«(?!\u202f)|(?<!\u202f)»/, `fr ${key}: « » ohne U+202F`);
    assert.doesNotMatch(visible(text), /[„“”]/, `fr ${key}: deutsche bzw. englische Anführungszeichen`);
  }
  for (const [key, text] of texts.es) {
    assert.equal((text.match(/\?/g) ?? []).length, (text.match(/¿/g) ?? []).length, `es ${key}: ¿…?`);
    assert.equal((visible(text).match(/!/g) ?? []).length, (text.match(/¡/g) ?? []).length, `es ${key}: ¡…!`);
    assert.doesNotMatch(visible(text), /[„“”]/, `es ${key}: deutsche bzw. englische Anführungszeichen`);
  }
  // Einzahl/Mehrzahl in der Oberfläche: fr 0 = Einzahl, es 0 = Mehrzahl
  ctx.setT('fr');
  assert.equal(ctx.TEXT.fr.items.size.fmt(0), '0 titre');
  assert.equal(ctx.TEXT.fr.items.size.fmt(2), '2 titres');
  assert.equal(ctx.TEXT.fr.files.missingHead(1), 'Cette ligne n’entrera pas dans la playlist\u202f:');
  ctx.setT('es');
  assert.equal(ctx.TEXT.es.items.size.fmt(0), '0 canciones');
  assert.equal(ctx.TEXT.es.items.size.fmt(1), '1 canción');
  ctx.setT('de');
  assert.equal(ctx.TEXT.de.items.size.fmt(1), '1 Song');
  assert.equal(ctx.TEXT.de.items.size.fmt(0), '0 Songs');
  // Hinweis auf die maschinelle Übersetzung: nur es und fr, mit Link zu den Issues in neuem Tab
  assert.equal(ctx.TEXT.de.page.mtNote, '');
  assert.equal(ctx.TEXT.en.page.mtNote, '');
  const issues = '<a href="https://github.com/hayboeck/tweakable-dj-for-spotify/issues" target="_blank" rel="noopener">';
  assert.equal(ctx.TEXT.es.page.mtNote, `Traducción automática – ${issues}las correcciones son bienvenidas</a>`);
  assert.equal(ctx.TEXT.fr.page.mtNote, `Traduction automatique – ${issues}les corrections sont les bienvenues</a>`);
  assert.match(html, /<p class="mt-note" id="mt-note" data-html="mtNote"><\/p>/);
});

// Aussehen: Listen wie in config.mjs; je Akzentfarbe und Modus Text, Fläche, Schrift auf der Fläche und Soft-Fläche
// (CSS-Variablen in ui.html), Kontrast nach WCAG mindestens 4,5:1.
test('ui.html: Akzentfarben und Modi wie in config.mjs, jede Farbe mit genug Kontrast im hellen und dunklen Modus', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  const { ACCENTS, THEMES } = await import('../config.mjs');
  const list = name => JSON.parse(html.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`))[1].replace(/'/g, '"'));
  assert.deepEqual(list('ACCENT_NAMES'), ACCENTS);
  assert.deepEqual(list('THEME_NAMES'), THEMES);
  const vars = sel => Object.fromEntries([...html.match(new RegExp(`\\n {2}${sel} \\{([^}]*)\\}`))[1].matchAll(/--([\w-]+):\s*([^;]+);/g)]
    .map(m => [m[1], m[2].trim()]));
  const light = vars(':root');
  const dark = { ...light, ...vars(':root\\[data-mode="dark"\\]') };
  const resolve = (mode, name) => {
    let v = mode[name];
    while (v?.startsWith('var(--')) v = mode[v.slice(6, -1)];
    assert.match(v ?? '', /^#([0-9a-f]{3}|[0-9a-f]{6})$/i, name);
    return v.length === 4 ? `#${[...v.slice(1)].map(c => c + c).join('')}` : v;
  };
  const lum = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [modeName, mode] of [['hell', light], ['dunkel', dark]]) {
    for (const a of ACCENTS) {
      const [text, fill, on, soft] = ['', '-fill', '-on', '-soft'].map(s => resolve(mode, `a-${a}${s}`));
      for (const [what, fg, bg] of [['Text/Hintergrund', text, resolve(mode, 'bg')], ['Text/Karte', text, resolve(mode, 'card')],
        ['Text/Soft-Fläche', text, soft], ['Schrift/Fläche', on, fill]]) {
        assert.ok(ratio(fg, bg) >= 4.5, `${a} ${modeName} ${what}: ${fg} auf ${bg} = ${ratio(fg, bg).toFixed(2)}:1`);
      }
    }
    assert.equal(resolve(mode, 'a-green-fill'), '#1ed760', 'Grün des Spotify-Logos als Fläche');
  }
  // Grün ist der Standard (ohne data-accent), jede andere Farbe setzt alle vier Werte
  assert.deepEqual(['accent', 'accent-fill', 'on-accent', 'accent-soft'].map(k => light[k]), ['var(--a-green)', 'var(--a-green-fill)', 'var(--a-green-on)', 'var(--a-green-soft)']);
  for (const a of ACCENTS.filter(x => x !== 'green')) {
    assert.ok(html.includes(`:root[data-accent="${a}"] { --accent: var(--a-${a}); --accent-fill: var(--a-${a}-fill); --on-accent: var(--a-${a}-on); --accent-soft: var(--a-${a}-soft); }`), a);
  }
});

// Spieldauer in der Oberfläche: dieselben Formen wie formatDuration() in i18n.mjs (Schätzung bei „Anzahl Songs“, echte Dauer
// nach einem Lauf und beim letzten automatischen Lauf), dazu die Fußzeile mit Last.fm und Spotify in einer Zeile.
test('ui.html: Spieldauer wie in i18n.mjs, in der Zusammenfassung und beim letzten automatischen Lauf; Fußzeile', async () => {
  const vm = await import('node:vm');
  const { formatDuration } = await import('../i18n.mjs');
  const html = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  const start = html.indexOf('const LASTFM_APPS');
  const end = html.indexOf('\n};\n', html.indexOf('const TEXT = {'));
  const ctx = vm.createContext({});
  vm.runInContext(`let T;
    const two = n => String(n).padStart(2, '0');
    const num = v => Number(v).toLocaleString(T.locale, { maximumFractionDigits: 2 });
    const isOne = n => new Intl.PluralRules(T.locale).select(Number(n)) === 'one';
    const plural = (n, one, many) => \`\${num(n)} \${isOne(n) ? one : many}\`;
    ${html.slice(start, end + 3)}
    this.TEXT = TEXT; this.setT = l => { T = TEXT[l]; }; this.durationText = durationText;`, ctx);
  const NBSP = String.fromCharCode(0xa0);
  const plain = s => s.replaceAll(NBSP, ' ');
  const H = 3_600_000;
  const M = 60_000;
  for (const lang of ['de', 'en', 'es', 'fr']) {
    ctx.setT(lang);
    for (const ms of [0, 29_999, 30_000, 45 * M, 59 * M + 30_000, H, 2 * H + 5 * M, 2 * H + 58 * M + 29_999, 3 * H + 15 * M, 58 * H + 20 * M]) {
      for (const approx of [false, true]) assert.equal(ctx.TEXT[lang].duration(ms, approx), formatDuration(lang, ms, approx), `${lang} ${ms} ${approx}`);
    }
  }
  // Schätzung bei „Anzahl Songs“: 55 × 3,5 Minuten
  assert.equal(plain(ctx.TEXT.de.duration(55 * 210_000, true)), '≈ 3:13 Std.');
  assert.equal(plain(ctx.TEXT.en.duration(55 * 210_000, true)), '≈ 3 h 13 min');
  assert.equal(plain(ctx.TEXT.es.duration(13 * 210_000, true)), '≈ 46 min');
  assert.equal(plain(ctx.TEXT.fr.duration(55 * 210_000, true)), '≈ 3 h 13');
  // Nach einem Lauf: echte Dauer, mit ≈, wenn sie für einzelne Songs geschätzt ist; ohne Dauer (ältere Version) nichts
  const r = { playlistName: 'Mix', songs: 50, fresh: 40, freshCurrent: 5, familiar: 10, durationMs: 2 * H + 58 * M };
  ctx.setT('de');
  assert.equal(plain(ctx.TEXT.de.run.ok(r, false)), 'Fertig: Mix: 50 Songs · 2:58 Std. (40 neu, davon 5 über aktuelles Hören; 10 Favoriten)');
  assert.equal(plain(ctx.TEXT.de.run.ok({ ...r, durationEstimated: true }, true)), 'Probelauf: Mix: 50 Songs · ≈ 2:58 Std. (40 neu, davon 5 über aktuelles Hören; 10 Favoriten)');
  assert.equal(ctx.TEXT.de.run.ok({ ...r, durationMs: null }, false), 'Fertig: Mix: 50 Songs (40 neu, davon 5 über aktuelles Hören; 10 Favoriten)');
  assert.equal(plain(ctx.TEXT.de.auto.ok(50, true, ctx.durationText(r))), '✓ 50 Songs · 2:58 Std. (Probelauf)');
  assert.equal(ctx.TEXT.de.auto.ok(50, false, ctx.durationText({ durationMs: null })), '✓ 50 Songs');
  ctx.setT('en');
  assert.equal(plain(ctx.TEXT.en.run.ok(r, false)), 'Done: Mix: 50 songs · 2 h 58 min (40 new, 5 of them via current listening; 10 favorites)');
  ctx.setT('es');
  assert.equal(plain(ctx.TEXT.es.auto.ok(50, false, ctx.durationText({ ...r, durationEstimated: true }))), '✓ 50 canciones · ≈ 2 h 58 min');
  ctx.setT('fr');
  assert.match(plain(ctx.TEXT.fr.run.ok(r, false)), /^Terminé\u202f: Mix\u202f: 50 titres · 2 h 58 \(40 nouveaux,/);
  // Fußzeile: Last.fm und Spotify in einer Zeile, Übersetzungshinweis wie bisher in eigener Zeile (die Version steht im Tab „Einstellungen“)
  assert.match(html, /<p><span data-html="creditLastfm"><\/span> · <span data-t="creditSpotify"><\/span><\/p>/);
  assert.doesNotMatch(html, /<p data-t="creditSpotify">/);
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

test('♥: Lieblingssongs abfragen (zu je 40), hinzufügen und wieder entfernen; ohne Berechtigung 409 mit missingScope', async () => {
  const uris = Array.from({ length: 45 }, (_, i) => `spotify:track:herz${String(i).padStart(18, '0')}`);
  const contains = async list => (await api('/api/library/contains', { method: 'POST', body: { uris: list } })).data.saved;
  const libraryCalls = () => spotifyRequests().filter(r => r.path.startsWith('/v1/me/library'));
  const before = libraryCalls().length;
  assert.deepEqual(await contains(uris), uris.map(() => false));
  assert.equal(libraryCalls().length - before, 2, '45 Songs = 2 Anfragen');
  // Ein Lieblingssong des Testbenutzers ist schon gespeichert
  const likedUri = (await api('/api/run?dry=1', { method: 'POST' }), JSON.parse(fs.readFileSync(path.join(dir, 'probelauf.json'), 'utf8')))
    .tracks.find(t => t.kind.startsWith('Favorit'))?.uri;
  if (likedUri) assert.deepEqual(await contains([likedUri]), [true]);

  const set = (uri, saved, lang = 'de') => api('/api/library', { lang, method: 'POST', body: { uri, saved } });
  assert.deepEqual((await set(uris[3], true)).data, { ok: true, saved: true });
  assert.deepEqual(await contains(uris.slice(0, 5)), [false, false, false, true, false]);
  assert.match(libraryCalls().at(-2).path, /^\/v1\/me\/library\?uris=spotify%3Atrack%3Aherz0+3$/);
  assert.equal(libraryCalls().at(-2).verb, 'PUT');
  assert.deepEqual((await set(uris[3], false)).data, { ok: true, saved: false });
  assert.equal(libraryCalls().at(-1).verb, 'DELETE');
  assert.deepEqual(await contains([uris[3]]), [false]);

  // Ungültig: kein Song, kein true/false, zu viele
  for (const body of [{ uri: 'x', saved: true }, { uri: uris[0] }, { uri: uris[0], saved: 'ja' }]) {
    assert.equal((await api('/api/library', { method: 'POST', body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await api('/api/library/contains', { method: 'POST', body: { uris: Array(501).fill(uris[0]) } })).status, 400);

  // Anmeldung ohne user-library-modify (von 0.2.4 oder älter): Hinweis statt Fehler, Spotify wird nicht gefragt
  const all = 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-follow-read';
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'abgelaufen', refresh_token: 'fake-refresh-token', expires_at: 0, authorized_at: Date.now(), scope: all }));
  try {
    const n = libraryCalls().length;
    const de = await set(uris[0], true);
    assert.deepEqual([de.status, de.data], [409, { error: 'Für ♥ (Lieblingssongs) bitte einmal neu bei Spotify anmelden – die Anmeldung erlaubt das noch nicht.', missingScope: 'user-library-modify' }]);
    assert.equal((await set(uris[0], false, 'en')).data.error, 'For ♥ (Liked Songs), please log in to Spotify again once – your login doesn’t allow this yet.');
    assert.equal(libraryCalls().length, n);
    assert.deepEqual(await contains([uris[0]]), [false], 'Abfragen geht weiter (user-library-read)');
  } finally {
    writeTokens('fake-refresh-token');
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

test('Playlist-Archiv: Übernehmen und Import legen die Liste ab; Liste und Eintrag über die API, fremde Namen 404', async () => {
  const { entries, keep } = (await api('/api/archive')).data;
  assert.equal(keep, 20);
  assert.ok(entries.length >= 2, 'mindestens Übernehmen und Import');
  assert.ok(entries.every(e => /^\d{4}-\d\d-\d\d \d\d-\d\d-\d\d Tweakable DJ( \d+)?\.txt$/.test(e.id)), JSON.stringify(entries));
  const newest = (await api(`/api/archive/entry?id=${encodeURIComponent(entries[0].id)}`)).data;
  assert.match(newest.text, /^# Test-DJ – /);
  assert.ok(fs.existsSync(path.join(dir, 'archiv', entries[0].id)));
  // Pfade aller Art (auch kodiert, mit Backslash, absolut, in einem Unterordner, mit Nullbyte) und fremde Namen: nie gelesen
  fs.mkdirSync(path.join(dir, 'archiv', 'alt'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'archiv', 'alt', entries[0].id), 'im Unterordner');
  fs.writeFileSync(path.join(dir, 'archiv', 'notiz.txt'), 'fremd');
  const id = encodeURIComponent(entries[0].id);
  for (const bad of ['../config.jsonc', 'config.jsonc', `..%2F${entries[0].id}`, '', '%2e%2e%2fconfig.jsonc', '%2E%2E%5Ctokens.json',
    '..%5Cconfig.jsonc', 'C%3A%5CWindows%5Cwin.ini', '%2Fetc%2Fpasswd', `alt%2F${id}`, `alt%5C${id}`, `..%2Farchiv%2F${id}`, `${id}%00`,
    `.%2F${id}`, 'notiz.txt', encodeURIComponent('2026-01-01 00-00-00 Tweakable DJ.txt')]) {
    const r = await api(`/api/archive/entry?id=${bad}`, { lang: 'en' });
    assert.deepEqual([r.status, r.data.error], [404, 'This entry isn’t in the archive (anymore).'], bad);
  }
  assert.ok(fs.existsSync(path.join(dir, 'archiv', 'notiz.txt')) && fs.existsSync(path.join(dir, 'archiv', 'alt', entries[0].id)), 'fremde Dateien bleiben');
  assert.ok(!(await api('/api/archive')).data.entries.some(e => /notiz|alt/.test(e.id)), 'fremde Dateien nicht in der Liste');
});

test('Vorige Playlist wiederherstellen: archiveFile nach Lauf und Import, undo = Eintrag davor, über den Import-Weg zurück', async () => {
  const run = resultLine((await api('/api/run', { lang: 'de', method: 'POST' })).text);
  assert.equal(run.ok, true);
  assert.match(run.archiveFile, /^\d{4}-\d\d-\d\d \d\d-\d\d-\d\d Tweakable DJ( \d+)?\.txt$/);
  const { entries, undo } = (await api(`/api/archive?after=${encodeURIComponent(run.archiveFile)}`)).data;
  assert.equal(entries[0].id, run.archiveFile, 'der Lauf ist der neueste Eintrag');
  assert.deepEqual(undo, entries[1], 'Ziel = Stand davor');
  assert.equal((await api('/api/archive')).data.undo, undefined, 'ohne after kein undo');
  assert.equal((await api(`/api/archive?after=${encodeURIComponent(entries[1].id)}`)).data.undo, null, 'nicht der neueste: nichts');

  // Zurück über den vorhandenen Weg: Eintrag lesen → Vorschau → schreiben (wie „Frühere Playlist …“)
  const history = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).history;
  const { text } = (await api(`/api/archive/entry?id=${encodeURIComponent(undo.id)}`)).data;
  const pre = resultLine((await preview(text)).text);
  assert.equal(pre.found, undo.songs);
  const written = (await api('/api/import', { lang: 'de', method: 'POST', body: { uris: pre.uris } })).data;
  assert.equal(written.ok, true);
  assert.notEqual(written.archiveFile, run.archiveFile);
  const after = (await api(`/api/archive?after=${encodeURIComponent(written.archiveFile)}`)).data;
  assert.equal(after.entries[0].id, written.archiveFile, 'wiederhergestellt = jetzt der neueste');
  assert.equal(after.undo.id, run.archiveFile, 'davor: die Liste des Laufs');
  assert.equal((await api(`/api/archive?after=${encodeURIComponent(run.archiveFile)}`)).data.undo, null, 'alter Knopf zeigt nichts mehr');
  const songs = t => t.split('\n').filter(l => l.includes('\t'));
  assert.deepEqual(songs((await api(`/api/archive/entry?id=${encodeURIComponent(written.archiveFile)}`)).data.text), songs(text), 'gleiche Songs wie der vorige Stand');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).history, history, 'Import zählt nicht als Lauf');
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

  for (const [lang, title] of [['de', 'Tweakable DJ: Testbenachrichtigung'], ['en', 'Tweakable DJ: test notification'],
    ['es', 'Tweakable DJ: notificación de prueba'], ['fr', 'Tweakable DJ\u202f: notification de test']]) {
    const r = await api('/api/notify/test', { lang, method: 'POST', body: {} });
    assert.deepEqual([r.status, r.data], [200, { ok: true }]);
    const sent = notifications().at(-1);
    assert.ok(JSON.stringify(sent).includes(title), JSON.stringify(sent));
  }
  assert.equal(notifications().length, before + 4);
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

// Rohe Anfrage (ohne Normalisierung der Adresse durch fetch): erste Zeile der Antwort.
const rawRequest = (method, target, { host, headers = '' } = {}) => new Promise((resolve, reject) => {
  const port = Number(new URL(base).port);
  const s = net.connect(port, '127.0.0.1', () => s.write(`${method} ${target} HTTP/1.1\r\nHost: ${host ?? `127.0.0.1:${port}`}\r\n${headers}`
    + 'Content-Length: 0\r\nConnection: close\r\n\r\n'));
  let reply = '';
  s.on('data', chunk => (reply += chunk));
  s.on('close', () => resolve(reply.split('\r\n')[0]));
  s.on('error', reject);
});

test('Logo und Symbol: genau assets/logo.png und assets/logo-small.svg, sonst keine Datei aus dem Ordner', async () => {
  for (const [route, type, file] of [['/assets/logo.png', 'image/png', 'logo.png'], ['/assets/logo-small.svg', 'image/svg+xml', 'logo-small.svg']]) {
    const res = await fetch(base + route);
    assert.equal(res.status, 200, route);
    assert.equal(res.headers.get('content-type'), type);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('cache-control'), /max-age=\d+/);
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(fs.readFileSync(path.join(ROOT, 'assets', file))), route);
  }
  // Die Seite verwendet genau diese beiden (Kopf, Abschnitt „Verknüpfung“ und Browser-Tab), sonst nichts vom eigenen Server
  const html = await (await fetch(`${base}/`)).text();
  const own = [...html.matchAll(/\b(?:src|href)="([^"#:$]+)"/g)].map(m => m[1]);
  assert.deepEqual([...new Set(own)].sort(), ['assets/logo-small.svg', 'assets/logo.png']);
  assert.doesNotMatch(html, /data:image\/svg/, 'kein eingebettetes Notensymbol mehr');

  fs.writeFileSync(path.join(dir, 'assets', 'geheim.txt'), 'x');
  try {
    const blocked = ['/assets/logo.ico', '/assets/logo.icns', '/assets/geheim.txt', '/assets/', '/assets', '/ASSETS/logo.png', '/assets/LOGO.PNG',
      '/assets/logo.png.bak', '/config.jsonc', '/tokens.json', '/state.json', '/ui.mjs', '/ui.html', '/package.json', '/favicon.ico',
      '/logo.png', '/assets/logo.png/', '/assets/logo.png%00', '/assets%2flogo.png'];
    for (const route of blocked) {
      const res = await fetch(base + route);
      assert.equal(res.status, 404, route);
      await res.text();
    }
    for (const target of ['/assets/../config.jsonc', '/assets/%2e%2e/tokens.json', '/assets/..%2fconfig.jsonc', '/assets/..\\config.jsonc',
      '//assets/logo.png', '/./assets/../tokens.json']) {
      assert.equal(await rawRequest('GET', target), 'HTTP/1.1 404 Not Found', target);
    }
    assert.equal(await rawRequest('POST', '/assets/logo.png'), 'HTTP/1.1 404 Not Found');
    assert.equal(await rawRequest('GET', '/assets/logo.png', { host: 'localhost' }), 'HTTP/1.1 403 Forbidden', 'fremder Host');
  } finally {
    fs.rmSync(path.join(dir, 'assets', 'geheim.txt'));
  }
});

// Fremde Datei mit dem Namen der Verknüpfung auf dem (Test-)Desktop anlegen; print() = Abdruck zum Vergleichen.
function foreignShortcut() {
  const file = path.join(desktop, FILE_NAMES[process.platform]);
  if (process.platform === 'win32') {
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = "$ProgressPreference = 'SilentlyContinue'; $l = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); $l.TargetPath = $env:SystemRoot + '\\notepad.exe'; $l.Save()";
    execFileSync(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { env: { ...process.env, LNK: file }, stdio: ['ignore', 'pipe', 'pipe'] });
  } else if (process.platform === 'darwin') {
    fs.mkdirSync(path.join(file, 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(file, 'Contents', 'Info.plist'), '<plist><dict><key>CFBundleIdentifier</key><string>com.example.other</string></dict></plist>');
  } else {
    fs.writeFileSync(file, '[Desktop Entry]\nType=Application\nName=Etwas anderes\nExec=/usr/bin/true\n');
  }
  const print = () => (fs.statSync(file).isDirectory() ? fs.readFileSync(path.join(file, 'Contents', 'Info.plist')) : fs.readFileSync(file)).toString('base64');
  return { file, print, before: print() };
}

test('Verknüpfung: nur mit X-Tweakable-DJ; Stand, anlegen, ersetzen, entfernen – im Test-Desktop; fremde Datei bleibt', { skip: !FILE_NAMES[process.platform] }, async () => {
  const file = path.join(desktop, FILE_NAMES[process.platform]);
  for (const method of ['GET', 'POST', 'DELETE']) {
    const r = await api('/api/shortcut', { lang: 'en', method, headers: { 'X-Tweakable-DJ': '0' } });
    assert.deepEqual([r.status, r.data], [403, { error: 'Not allowed' }], method);
    const plain = await fetch(`${base}/api/shortcut`, { method, headers: { 'X-Lang': 'de' } });
    assert.deepEqual([plain.status, await plain.json()], [403, { error: 'Nicht erlaubt' }], `${method} ohne Header`);
  }
  assert.equal(await rawRequest('POST', '/api/shortcut', { host: 'localhost', headers: 'X-Tweakable-DJ: 1\r\n' }), 'HTTP/1.1 403 Forbidden', 'fremder Host');
  assert.deepEqual(fs.readdirSync(desktop), [], 'ohne Header nichts angelegt');

  let r = await api('/api/shortcut');
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.supported, r.data.state, r.data.installed, r.data.matches, r.data.file], [true, 'missing', false, false, file]);
  r = await api('/api/shortcut', { method: 'POST', lang: 'en' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.data.state, r.data.matches], ['ok', true]);
  assert.ok(fs.existsSync(file));
  assert.equal((await api('/api/shortcut')).data.state, 'ok');
  assert.equal((await api('/api/shortcut', { method: 'POST' })).data.state, 'ok', 'erneut anlegen ersetzt sie');
  assert.deepEqual(fs.readdirSync(desktop), [FILE_NAMES[process.platform]], 'genau eine Verknüpfung');
  r = await api('/api/shortcut', { method: 'DELETE' });
  assert.deepEqual([r.status, r.data.state, fs.existsSync(file)], [200, 'missing', false]);
  assert.equal((await api('/api/shortcut', { method: 'DELETE' })).status, 200, 'nichts da: nichts zu tun');

  const foreign = foreignShortcut();
  try {
    assert.equal((await api('/api/shortcut')).data.state, 'foreign');
    for (const [lang, text] of [['de', 'nicht von Tweakable DJ'], ['en', 'isn’t from Tweakable DJ'], ['es', 'no es de Tweakable DJ'], ['fr', 'ne vient pas de Tweakable DJ']]) {
      const post = await api('/api/shortcut', { method: 'POST', lang });
      assert.equal(post.status, 400);
      assert.ok(post.data.error.includes(text), post.data.error);
    }
    assert.equal((await api('/api/shortcut', { method: 'DELETE', lang: 'en' })).status, 400);
    assert.equal(foreign.print(), foreign.before, 'fremde Datei unverändert');
  } finally {
    fs.rmSync(foreign.file, { recursive: true, force: true });
  }
});

// Weitere Starts im selben Ordner (eigener Port bzw. derselbe wie der Server oben): Ausgang abwarten, höchstens timeout ms.
function startUi(args, env, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['ui.mjs', ...args], {
      cwd: dir,
      env: { ...process.env, TWEAKABLE_DJ_LANG: 'de', NODE_OPTIONS: `--import=${MOCK}`, TWEAKABLE_DJ_DESKTOP: desktop, ...env },
    });
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`läuft noch: ${out}`));
    }, timeout);
    child.on('exit', code => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

test('Nur eine Instanz, fremdes Programm auf dem Port, ohne Fenster: ui.log, Beenden und Beenden ohne offene Seite', async () => {
  const browser = path.join(dir, 'browser.txt');
  // Zweiter Start auf demselben Port: öffnet nur den Browser (hier: TWEAKABLE_DJ_BROWSER) und endet mit 0
  const second = await startUi([], { TWEAKABLE_DJ_PORT: new URL(base).port, TWEAKABLE_DJ_BROWSER: browser });
  assert.equal(second.code, 0, second.out);
  assert.match(second.out, /Die Oberfläche läuft bereits/);
  assert.equal(fs.readFileSync(browser, 'utf8'), `${base}\n`);

  // Fremdes Programm auf dem Port: mit Fenster Fehlercode 1, ohne Fenster Systembenachrichtigung, ui.log und 0
  const foreign = http.createServer((req, res) => res.writeHead(404).end('nein'));
  await new Promise(r => foreign.listen(0, '127.0.0.1', r));
  const port = String(foreign.address().port);
  const log = path.join(dir, 'ui.log');
  const mockLog = path.join(dir, 'mock-ui.jsonl');
  try {
    const visible = await startUi(['--no-browser'], { TWEAKABLE_DJ_PORT: port });
    assert.equal(visible.code, 1, visible.out);
    assert.match(visible.out, new RegExp(`Port ${port} ist von einem anderen Programm belegt`));
    const hidden = await startUi(['--hidden', '--no-browser'], { TWEAKABLE_DJ_PORT: port, MOCK_LOG: mockLog });
    assert.deepEqual([hidden.code, hidden.out], [0, ''], 'ohne Fenster nichts in der Konsole');
    assert.match(fs.readFileSync(log, 'utf8'), new RegExp(`=== .* · --hidden --no-browser\nPort ${port} ist von einem anderen Programm belegt`));
    const toast = JSON.parse(fs.readFileSync(mockLog, 'utf8').trim().split('\n').at(-1)).notify;
    assert.ok(toast, 'Benachrichtigung');
  } finally {
    foreign.close();
  }

  // Ohne Fenster, eigener Port: POST /api/quit beendet (Exit 0); ohne Lebenszeichen beendet er sich von selbst
  for (const how of ['quit', 'idle']) {
    const freeP = String(await freePort());
    const run = startUi(['--hidden', '--no-browser'], { TWEAKABLE_DJ_PORT: freeP, TWEAKABLE_DJ_IDLE_MS: how === 'idle' ? '1500' : '600000' });
    const url = `http://127.0.0.1:${freeP}`;
    let up = false;
    for (let i = 0; i < 100 && !up; i++) {
      up = await fetch(`${url}/api/version`, { headers: { 'X-Tweakable-DJ': '1' } }).then(r => r.ok, () => false);
      if (!up) await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(up, 'Server läuft');
    if (how === 'quit') {
      assert.equal((await fetch(`${url}/api/quit`, { method: 'POST' })).status, 403, 'nur mit X-Tweakable-DJ');
      const res = await fetch(`${url}/api/quit`, { method: 'POST', headers: { 'X-Tweakable-DJ': '1' } });
      assert.deepEqual(await res.json(), { ok: true });
    }
    const ended = await run;
    assert.equal(ended.code, 0, ended.out);
    assert.match(fs.readFileSync(log, 'utf8'), how === 'quit' ? /Tweakable DJ wurde beendet\.\n$/ : /keine Seite von Tweakable DJ mehr offen – beendet\.\n$/);
  }
});
