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

test('Einfach: ausgeblendete Regler außerhalb der Voreinstellungen → Hinweis mit Name und Wert; Zurücksetzen behält eine passende Voreinstellung; Leiste bei 375 px', { skip }, async () => {
  await api('/api/config', { method: 'POST', body: JSON.stringify({ mode: 'simple', followedArtists: 0.5, useLastfmLovedTracks: false }) });
  const page = await open();
  try {
    assert.match(await text(page, 'preset-state'), /^Eigene Pro-Einstellungen aktiv \(Gefolgte Künstler: mehr, Last\.fm-Lieblingssongs einbeziehen: aus\) – /);
    assert.equal(await page.eval("document.getElementById('preset-reset').hidden"), false);
    // Voreinstellung „Entdecken“ passt, nur die Extras weichen ab: Zurücksetzen behält „Entdecken“
    await page.eval("usePreset(PRESETS.find(p => p.id === 'discover'))");
    assert.equal(await text(page, 'preset-reset'), 'Ausgeblendete Regler zurücksetzen');
    await page.click('#preset-reset');
    assert.equal(await page.eval("document.getElementById('preset-reset').hidden"), true);
    assert.match(await text(page, 'preset-state'), /^Passt gerade genau: Entdecken$/);
    assert.deepEqual(await page.eval('[current.followedArtists, current.useLastfmLovedTracks]'), [0, true]);
    // Ohne passende Voreinstellung: alles auf „Standard“
    await page.eval("set('familiarShare', 0.55); set('preferNewer', 0.5)");
    assert.equal(await text(page, 'preset-reset'), 'Auf „Standard“ zurücksetzen');
    await page.click('#preset-reset');
    assert.match(await text(page, 'preset-state'), /^Passt gerade genau: Standard$/);
    assert.equal(await text(page, 'status'), 'Ungespeicherte Änderungen');
    // Untere Leiste bei 375 px: Verwerfen und Speichern nebeneinander, „Playlist erstellen“ darunter über die ganze Breite
    await page.viewport(375, 800);
    const bar = await page.eval(`(() => { const r = id => document.getElementById(id).getBoundingClientRect().toJSON();
      return { d: r('discard'), s: r('save'), c: r('create'), w: document.documentElement.scrollWidth }; })()`);
    assert.equal(Math.round(bar.d.top), Math.round(bar.s.top));
    assert.ok(bar.c.top > bar.d.bottom && Math.round(bar.c.width) === Math.round(bar.s.right - bar.d.left), JSON.stringify(bar));
    assert.ok(bar.w <= 375, 'kein seitliches Scrollen');
    await page.click('#discard');
  } finally {
    await page.close();
    await api('/api/config', { method: 'POST', body: JSON.stringify({ mode: 'pro', followedArtists: 0, useLastfmLovedTracks: true }) });
  }
});

test('Einstellungen laden: Vorschau mit Version und übersprungenen Werten; nach der Vorschau verstellte Regler → noch einmal nachfragen', { skip }, async () => {
  const before = fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8');
  const page = await open();
  try {
    await page.eval("showTab('settings')");
    const file = JSON.stringify({ app: 'tweakable-dj', kind: 'settings', format: 1, version: '0.4.0', exportedAt: '2026-10-13T10:00:00.000Z',
      settings: { size: 31, adventure: 7 } });
    await page.eval(`backupPreview(new File([${JSON.stringify(file)}], 'sicherung.json'))`);
    await page.waitFor("!document.getElementById('backup-preview').hidden");
    const preview = await text(page, 'backup-preview-text');
    assert.match(preview, /Sicherung von Tweakable DJ 0\.4\.0 vom 13\. Oktober 2026\./);
    assert.match(preview, /Ändert 1 Einstellung: Anzahl Songs\./);
    assert.match(preview, /Übersprungen, weil ungültig: Abenteuer\./);
    assert.doesNotMatch(preview, /Ungespeicherte Änderungen/);
    assert.equal(await text(page, 'backup-go'), 'Laden');
    // Erst jetzt einen Regler verstellen: Der erste Klick fragt nach, der zweite lädt
    await page.eval("set('artistGap', 3)");
    await page.click('#backup-go');
    assert.match(await text(page, 'backup-msg'), /^Du hast inzwischen Regler geändert/);
    assert.equal(await page.eval("document.getElementById('backup-preview').hidden"), false);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8'), /"size": 31/, 'noch nichts geladen');
    await page.click('#backup-go');
    await page.waitFor("document.getElementById('backup-msg').textContent === '1 Einstellung geladen.'");
    assert.deepEqual(await page.eval('[current.size, current.artistGap]'), [31, 2], 'ungespeicherte Änderung verworfen');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
    fs.writeFileSync(path.join(dir, 'config.jsonc'), before);
  }
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
