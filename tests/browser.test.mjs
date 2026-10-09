// Browser-Tests der Oberfläche (ui.html) mit Chrome, Chromium bzw. Edge im Hintergrund (tests/cdp.mjs): die Hauptabläufe so,
// wie man sie klickt – Playlist erstellen, überschreiben (auch per Doppelklick), Vorige Playlist wiederherstellen, Neuladen
// während eines Laufs, ein zweiter Tab, Speichern während man Regler verstellt, alle Sprachen, schmaler Bildschirm – ohne
// Fehler in der Konsole (auch keine Verstöße gegen die Content-Security-Policy). Server in einer Kopie des Programms auf einem
// freien Port, Spotify und Last.fm simuliert (tests/mock-apis.mjs). Gibt es keinen solchen Browser, werden die Tests
// übersprungen (auf den Test-Rechnern von GitHub ist Chrome installiert).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findBrowser, launch } from './cdp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK = pathToFileURL(path.join(ROOT, 'tests', 'mock-apis.mjs')).href;
const BROWSER = findBrowser();
const skip = !BROWSER && 'kein Chrome, Chromium oder Edge gefunden';
const CONFIG = {
  spotify: { clientId: 'test-client-id' },
  lastfm: { apiKey: 'test-lastfm-key', user: 'testhoerer' },
  seed: 'liked',
  playlistName: 'Test-DJ',
  size: 20,
  seedsPerRun: 12,
  artistWindow: 10,
  artistGap: 2,
  language: 'de',
  mode: 'pro',
};

let dir;
let server;
let base;
let browser;
let serverOut = '';

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  }).on('error', reject);
});

before(async () => {
  if (skip) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj browser ü-'));
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.mjs') || /^config\.example(\.de)?\.jsonc$/.test(f) || f === 'ui.html') fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(dir, 'assets', f));
  fs.mkdirSync(path.join(dir, 'desktop')); // Desktop für die Verknüpfung – nie der echte
  fs.writeFileSync(path.join(dir, 'config.jsonc'), `// Test-Einstellungen\n${JSON.stringify(CONFIG, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'abgelaufen', refresh_token: 'fake-refresh-token', expires_at: 0, authorized_at: Date.now() }));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env, TWEAKABLE_DJ_PORT: String(port), TWEAKABLE_DJ_LANG: 'de', NODE_OPTIONS: `--import=${MOCK}`, TWEAKABLE_DJ_NO_UPDATE_CHECK: '1',
    MOCK_LOG: path.join(dir, 'mock-anfragen.jsonl'), MOCK_SPOTIFY_STORE: path.join(dir, 'store.json'), TWEAKABLE_DJ_DESKTOP: path.join(dir, 'desktop'),
    // Läufe dauern etwas (jede Suche 40 ms), damit Neuladen und zweiter Tab sicher mitten hinein fallen
    MOCK_SEARCH_DELAY_MS: '40',
  };
  server = spawn(process.execPath, ['ui.mjs', '--no-browser'], { cwd: dir, env });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startet nicht: ${serverOut}`)), 15_000);
    server.stdout.on('data', chunk => {
      serverOut += chunk;
      if (serverOut.includes(base)) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on('data', chunk => (serverOut += chunk));
    server.on('exit', code => reject(new Error(`Server beendet (${code}): ${serverOut}`)));
  });
  browser = await launch(BROWSER);
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const store = () => JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8'));
// Anfragen an Spotify, die eine Playlist ersetzen (PUT …/items)
const replaces = () => (fs.existsSync(path.join(dir, 'mock-anfragen.jsonl'))
  ? fs.readFileSync(path.join(dir, 'mock-anfragen.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    .filter(e => e.verb === 'PUT' && /^\/v1\/playlists\/[^/]+\/items$/.test(e.path)).length
  : 0);
const api = async (route, init = {}) => (await fetch(base + route, { ...init, headers: { 'X-Tweakable-DJ': '1', 'Content-Type': 'application/json', ...init.headers } })).text();

// Neue Seite mit der Oberfläche, fertig geladen (Hauptansicht)
async function open(width = 1000) {
  const page = await browser.newPage({ width });
  await page.goto(`${base}/`);
  await page.waitFor("!document.getElementById('main-view').hidden && document.getElementById('status').textContent !== 'Lädt …'");
  return page;
}
const text = (page, id) => page.eval(`document.getElementById(${JSON.stringify(id)}).textContent`);

test('Playlist erstellen, „überschreiben“ per Doppelklick (nur einmal), Vorige Playlist wiederherstellen; keine Fehler in der Konsole', { skip }, async () => {
  // Vorher eine Playlist mit Archiv-Eintrag (dann gibt es nach dem Überschreiben einen vorigen Stand)
  const first = await api('/api/run?dry=1', { method: 'POST' });
  const trialId = JSON.parse(first.split('\n').find(l => l.startsWith('@@RESULT ')).slice(9)).trialId;
  await api('/api/apply', { method: 'POST', body: JSON.stringify({ id: trialId }) });
  const before = store().playlists.find(p => p.name === 'Test-DJ').uris;

  const page = await open();
  assert.equal(await text(page, 'status'), 'Gespeichert');
  await page.click('#create', 2); // Doppelklick: nur ein Lauf
  await page.waitFor("document.getElementById('summary').textContent.startsWith('Erstellt:')", 60_000);
  await page.waitFor("!document.getElementById('trial-apply').hidden && !document.getElementById('trial-apply').disabled");
  assert.match(await text(page, 'trial-apply'), /^„Test-DJ“ überschreiben$/);
  // × hinter jedem Song: Die Knöpfe kommen erst mit der Liste aus GET /api/trial?tracks=1, die die Seite nach dem Lauf lädt
  // (das kann kurz nach der Zusammenfassung sein) – deshalb warten statt sofort zählen.
  await page.waitFor("document.querySelectorAll('#log button.block').length === 20", 10_000);
  const writes = replaces();
  await page.click('#trial-apply', 2);
  await page.waitFor("document.getElementById('summary').textContent.startsWith('Fertig:')", 60_000);
  assert.equal(replaces() - writes, 1, 'genau einmal geschrieben');
  assert.notDeepEqual(store().playlists.find(p => p.name === 'Test-DJ').uris, before);
  assert.ok(await page.eval("document.getElementById('trial-apply').hidden"), 'erstellte Liste verbraucht');

  // Vorige Playlist wiederherstellen: Vorschau, dann schreiben
  await page.waitFor("!document.getElementById('undo').hidden");
  await page.click('#undo', 2);
  await page.waitFor("!document.getElementById('import-preview').hidden", 30_000);
  await page.click('#import-go');
  await page.waitFor("document.getElementById('files-msg').className.includes('ok')", 30_000);
  assert.deepEqual(store().playlists.find(p => p.name === 'Test-DJ').uris, before, 'vorige Playlist zurück');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('Neuladen während eines Laufs und zweiter Tab: „Läuft …“, Knöpfe gesperrt, danach Ergebnis mit den Knöpfen zum Schreiben', { skip }, async () => {
  const page = await open();
  await page.click('#create');
  await page.waitFor("document.getElementById('status').textContent === 'Läuft …' && document.getElementById('log').textContent.length > 20");
  const second = await open();
  // Zweiter Tab: erkennt den Lauf beim Laden
  await second.waitFor("document.getElementById('status').textContent === 'Läuft …'");
  assert.ok(await second.eval("document.getElementById('create').disabled && !document.getElementById('wait-msg').hidden"));
  await page.reload();
  await page.waitFor("document.getElementById('status').textContent === 'Läuft …' && document.getElementById('create').disabled");
  for (const p of [page, second]) {
    await p.waitFor("document.getElementById('summary').textContent.startsWith('Erstellt:')", 60_000);
    await p.waitFor("!document.getElementById('trial-apply').hidden && !document.getElementById('trial-apply').disabled");
    assert.equal(await text(p, 'status'), 'Gespeichert');
    assert.ok(await p.eval("!document.getElementById('create').disabled && document.getElementById('wait-msg').hidden"));
    assert.match(await text(p, 'log'), /^ {2}1\. /m, 'Songliste in der Ausgabe');
    assert.deepEqual(p.errors, []);
  }
  await second.close();
  await page.close();
});

test('Speichern, während man einen Regler verstellt: Nur das Gesendete gilt als gespeichert', { skip }, async () => {
  const page = await open();
  const result = await page.eval(`(async () => {
    // POST /api/config dauert hier 600 ms (wie mit Automatik, die den Zeitplaner einträgt)
    const realFetch = window.fetch;
    window.fetch = async (url, init) => {
      if (url === '/api/config' && init?.method === 'POST') await new Promise(r => setTimeout(r, 600));
      return realFetch(url, init);
    };
    set('size', 25);
    const saving = save();
    await new Promise(r => setTimeout(r, 200));
    set('size', 30);
    await saving;
    window.fetch = realFetch;
    return { saved: saved.size, current: current.size, status: document.getElementById('status').textContent, dirty: dirty() };
  })()`);
  assert.deepEqual(result, { saved: 25, current: 30, status: 'Ungespeicherte Änderungen', dirty: true });
  assert.match(fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8'), /"size": 25/);
  await page.click('#discard');
  assert.equal(await page.eval('current.size'), 25);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('Alle Sprachen in beiden Tabs vollständig; 375 px ohne seitliches Scrollen', { skip }, async () => {
  const page = await open(375);
  for (const lang of ['de', 'en', 'es', 'fr']) {
    await page.eval(`setLang(${JSON.stringify(lang)}, { save: false })`);
    for (const tab of ['playlist', 'settings']) {
      await page.eval(`showTab('${tab}')`);
      const body = await page.eval('document.body.innerText');
      assert.doesNotMatch(body, /undefined|NaN|\[object /, `${lang} ${tab}`);
      assert.equal(await page.eval('document.documentElement.lang'), lang);
      const width = await page.eval('document.documentElement.scrollWidth');
      assert.ok(width <= 375, `${lang} ${tab}: ${width} px breit`);
    }
  }
  await page.eval("showTab('playlist')");
  assert.deepEqual(page.errors, []);
  await page.close();
});
