// Tests für „Jetzt aktualisieren“ (install-update.mjs, POST /api/update/install in ui.mjs) und die Neustart-Schleife der
// Startdateien. GitHub ist simuliert (tests/mock-apis.mjs mit Releases aus tests/mock-release.mjs), alles läuft in
// temporären Ordnern – nie im Projektordner, ohne Netzwerk.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkManifest, cleanObsolete, installBlocker, installUpdate, isPersonal, PERSONAL_DIRS, PERSONAL_FILES, pathProblem, readZip } from '../install-update.mjs';
import { buildManifest } from '../.github/release-manifest.mjs';
import { currentVersion } from '../update.mjs';
import { OWNER_REPO, buildZip, makeRelease, programFiles } from './mock-release.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK = pathToFileURL(path.join(ROOT, 'tests', 'mock-apis.mjs')).href;
const realFetch = globalThis.fetch; // für die Anfragen an den gestarteten Server
await import(MOCK); // ersetzt fetch: GitHub laut MOCK_GITHUB, alles andere wirft

let tmp;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-update-'));
  process.env.MOCK_LOG = path.join(tmp, 'mock-anfragen.jsonl');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const sha = data => crypto.createHash('sha256').update(data).digest('hex');
let caseNo = 0;

// Persönliche Dateien mit Beispielinhalt (Umlaute, CRLF), dazu eine unbekannte Datei und ein eigenes Bild in docs/.
const PERSONAL = {
  'config.jsonc': '// Meine Einstellungen – äöü\r\n{ "spotify": { "clientId": "0123456789abcdef0123456789abcdef" },\r\n'
    + '  "lastfm": { "apiKey": "fedcba9876543210fedcba9876543210", "user": "testhoerer" } }\r\n',
  'tokens.json': '{"access_token":"a","refresh_token":"geheim","expires_at":0,"authorized_at":1759300000000}',
  'state.json': `${JSON.stringify({ history: [['spotify:track:1', 'spotify:track:2']], searches: { 'a|b': null } }, null, 2)}\n`,
  'lastfm-cache.json': '{"similar|a|b":{"t":1759300000000,"v":[]}}',
  'probelauf.json': '{"format":1,"id":"0123456789ab","tracks":[]}\n',
  'automatik.json': JSON.stringify({ startedAt: '2026-10-01T05:00:00.000Z', finishedAt: '2026-10-01T05:01:00.000Z', ok: true }),
  'automatik.log': 'Lade Lieblingssongs …\n',
  'update-check.json': '{"repo":"x"}\n',
  'eigene-notizen.txt': 'Bitte nicht anfassen.\n',
  'docs/mein-bild.png': Buffer.from([1, 2, 3, 4]),
  // Playlist-Archiv: eigene Dateien (auch mit BOM und CRLF), eine fremde Datei und ein Unterordner
  'archiv/2026-10-01 05-00-00 Tweakable DJ.txt': '# Tweakable DJ – exportiert\nNordlicht – Polarnacht\n',
  'archiv/2026-10-02 05-00-00 Tweakable DJ 2.txt': Buffer.from('\ufeff# zweite\r\nStadtkind – Asphalt\r\n'),
  'archiv/meine-liste.txt': 'fremd\n',
  'archiv/alt/2026-01-01 00-00-00 Tweakable DJ.txt': 'im Unterordner\n',
};

// Programmordner der Version 0.1.0 mit persönlichen Dateien; Ergebnis: { dir, release (Ordner für Releases) }.
function project(files = programFiles('0.1.0')) {
  const base = path.join(tmp, `fall-${++caseNo}`);
  const dir = path.join(base, 'tweakable-dj');
  for (const [p, data] of Object.entries({ ...files, ...PERSONAL })) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), data);
  }
  // Alte Zeitstempel: So sieht man, ob eine Datei neu geschrieben wurde.
  const old = new Date('2026-01-01T00:00:00Z');
  for (const p of Object.keys(files)) fs.utimesSync(path.join(dir, p), old, old);
  return { dir, release: path.join(base, 'release') };
}

// Alle Dateien des Ordners (ohne .update) mit SHA-256; Ordner mit "/" am Ende.
function snapshot(dir) {
  const out = {};
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (p === '.update') continue;
      if (e.isSymbolicLink()) out[p] = `link → ${fs.readlinkSync(path.join(dir, p))}`;
      else if (e.isDirectory()) {
        out[`${p}/`] = 'dir';
        walk(p);
      } else out[p] = sha(fs.readFileSync(path.join(dir, p)));
    }
  };
  walk('');
  return out;
}

const personalUnchanged = dir => {
  for (const [p, data] of Object.entries(PERSONAL)) assert.ok(fs.readFileSync(path.join(dir, p)).equals(Buffer.from(data)), `${p} verändert`);
};

// Release anlegen und für den simulierten GitHub bereitstellen.
function publish(release, opts) {
  const r = makeRelease(release, opts);
  process.env.MOCK_GITHUB = r.github;
  return r;
}

// installUpdate in dir; liefert Ergebnis oder den Fehler.
async function run(dir, opts = {}) {
  const steps = [];
  try {
    const result = await installUpdate({ dir, lang: 'de', env: {}, onStep: s => steps.push(s), ...opts });
    return { result, steps };
  } catch (error) {
    return { error, steps };
  }
}

const mockRequests = () => (fs.existsSync(process.env.MOCK_LOG)
  ? fs.readFileSync(process.env.MOCK_LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []);

// --- Erlaubnisliste und Pfade ---

test('pathProblem: persönliche Dateien, Pfade außerhalb, Backslash, Laufwerk, unzulässige Namen', () => {
  for (const p of ['ui.mjs', 'docs/screenshot-main.de.png', 'Tweakable DJ.cmd', '.gitignore', 'README.de.md', 'a/b/c.txt',
    'assets/logo.png', 'assets/logo-small.svg', 'assets/logo.ico', 'assets/logo.icns', 'shortcut.mjs']) {
    assert.equal(pathProblem(p), null, p);
  }
  for (const p of ['config.jsonc', 'Config.JSONC', 'tokens.json', 'state.json', 'lastfm-cache.json', 'probelauf.json', 'Probelauf.JSON',
    'docs/probelauf.json', 'automatik.json', 'automatik.log', 'automatik.irgendwas', 'update-check.json', 'fehler.log', 'docs/config.jsonc',
    'state.json/x']) {
    assert.equal(pathProblem(p), 'update.reasonPersonal', p);
  }
  for (const p of ['../x', 'docs/../../x', './ui.mjs', '/etc/passwd', 'C:/Windows/x', 'c:x', '..\\x', 'docs\\..\\..\\x',
    'C:\\x', '\\\\server\\share\\x', 'a\0b', 'x:y']) {
    assert.equal(pathProblem(p), 'update.reasonOutside', JSON.stringify(p));
  }
  for (const p of ['', 'a//b', 'docs/', 'a/b:c', 'a/b.', 'a ', 'CON', 'nul.txt', 'lpt1', 'a|b', 'a*b', '.update/x', '.git/config',
    'manifest.json', 'MANIFEST.JSON', 'ü.txt', 'a\nb', 'x'.repeat(201), 'a/b/c/d/e/f/g/h/i', 42, null]) {
    assert.equal(pathProblem(p), 'update.reasonName', JSON.stringify(p));
  }
  assert.ok(isPersonal('AUTOMATIK.LOG') && isPersonal('x.log') && !isPersonal('ui.mjs'));
  // Playlist-Archiv: der ganze Ordner ist persönlich
  for (const p of ['archiv/2026-10-06 18-30-05 Tweakable DJ.txt', 'Archiv/x.txt', 'archiv']) assert.equal(pathProblem(p), 'update.reasonPersonal', p);
  // Eigenes Node.js (get-node.cmd bzw. get-node.sh): das Update schreibt und löscht dort nie etwas, auch nicht über obsolete
  for (const p of ['node/current/node.exe', 'node/current/bin/node', 'Node/new/x', 'node']) assert.equal(pathProblem(p), 'update.reasonPersonal', p);
  assert.equal(pathProblem('node-version.txt'), null);
  assert.equal(pathProblem('get-node.cmd'), null);
});

// probelauf.json (Ergebnis des letzten Probelaufs) und die anderen persönlichen Dateien: nie im Repository (.gitignore),
// nie in der ZIP-Datei (Sicherheitsnetz in release.yml und release-manifest.mjs), nie von einem Update geschrieben.
test('Persönliche Dateien: .gitignore, Sicherheitsnetz in release.yml, release-manifest.mjs und Update lehnen sie ab', () => {
  assert.ok(PERSONAL_FILES.includes('probelauf.json'));
  // .gitignore: jede Datei steht dort (oder ein Muster wie *.log)
  const ignored = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  const glob = p => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  for (const f of PERSONAL_FILES) assert.ok(ignored.some(p => glob(p).test(f)), `${f} fehlt in .gitignore`);
  for (const d of PERSONAL_DIRS) assert.ok(ignored.includes(`${d}/`), `${d}/ fehlt in .gitignore`);

  // release.yml: Das find-Kommando des Sicherheitsnetzes erfasst jede persönliche Datei (-name mit Platzhaltern wie bei find)
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  const findCmd = yml.match(/find \. (\\\([\s\S]*?\\\)) -print/)?.[1].replace(/\\\n\s*/g, ' ');
  assert.ok(findCmd, 'find-Kommando in release.yml nicht gefunden');
  const names = [...findCmd.matchAll(/-name '?([^'\s]+)'?/g)].map(m => m[1]);
  for (const f of [...PERSONAL_FILES, 'docs/probelauf.json']) {
    assert.ok(names.some(n => glob(n).test(path.posix.basename(f))), `${f} fehlt im Sicherheitsnetz von release.yml`);
  }
  // … und zwar wirklich: dasselbe Kommando auf einen Ordner mit probelauf.json (wo es eine sh mit find gibt)
  const dir = path.join(tmp, `netz-${++caseNo}`);
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  for (const f of ['ui.mjs', 'probelauf.json', 'docs/probelauf.json', 'README.md']) fs.writeFileSync(path.join(dir, f), 'x');
  const sh = spawnSync('sh', ['-c', `find . ${findCmd} -print`], { cwd: dir, encoding: 'utf8' });
  if (!sh.error && sh.status === 0) assert.deepEqual(sh.stdout.split('\n').filter(Boolean).sort(), ['./docs/probelauf.json', './probelauf.json']);

  // release-manifest.mjs bricht ab, statt ein Release mit probelauf.json zu bauen
  fs.writeFileSync(path.join(dir, 'package.json'), '{"version":"0.2.0"}');
  assert.throws(() => buildManifest(dir, '0.2.0'), /“(docs\/)?probelauf\.json” \(personal file\)/);
  // Das Update schreibt sie nie
  const file = (p, extra) => ({ path: p, size: 1, sha256: 'a'.repeat(64), ...extra });
  assert.throws(() => checkManifest({ version: '0.2.0', files: [file('package.json'), file('probelauf.json')] }, '0.2.0', 'en'),
    /^Error: manifest\.json lists “probelauf\.json” \(personal file\)\. An update never writes such a file\.$/);
  assert.equal(pathProblem('probelauf.json'), 'update.reasonPersonal');
});

test('checkManifest: Version, Pflichtdateien, doppelte Pfade (auch in anderer Schreibweise), Größe, SHA-256', () => {
  const file = (p, extra) => ({ path: p, size: 1, sha256: 'a'.repeat(64), ...extra });
  const ok = { version: '0.2.0', files: [file('package.json'), file('ui.mjs'), file('start.sh', { executable: true })] };
  assert.deepEqual(checkManifest(ok, '0.2.0', 'en').files.map(f => f.executable), [false, false, true]);
  assert.equal(checkManifest({ ...ok, version: 'v0.2.0' }, '0.2.0').version, '0.2.0');
  const bad = (m, re) => assert.throws(() => checkManifest(m, '0.2.0', 'en'), re);
  bad({ ...ok, version: '0.3.0' }, /^Error: manifest\.json is invalid \(version 0\.3\.0 ≠ 0\.2\.0\)\.$/);
  bad({ version: '0.2.0', files: [file('ui.mjs')] }, /package\.json missing/);
  bad({ version: '0.2.0', files: [...ok.files, file('UI.mjs')] }, /UI\.mjs twice/);
  bad({ version: '0.2.0', files: [...ok.files, file('x', { size: -1 })] }, /x: size/);
  bad({ version: '0.2.0', files: [...ok.files, file('x', { sha256: 'A'.repeat(64) })] }, /x: sha256/);
  bad({ version: '0.2.0', files: [...ok.files, file('x', { executable: 'ja' })] }, /x: executable/);
  bad({ version: '0.2.0', files: [...ok.files, file('config.jsonc')] },
    /^Error: manifest\.json lists “config\.jsonc” \(personal file\)\. An update never writes such a file\.$/);
  bad({ version: '0.2.0', files: [...ok.files, file('../x')] }, /“\.\.\/x” \(outside the folder\)/);
  bad(null, /invalid \(files\)/);
});

// --- Erfolgreiches Update ---

test('Update: ersetzt die Programmdateien, Version danach neu; persönliche und unbekannte Dateien bleiben byteweise gleich', async () => {
  const { dir, release } = project();
  const files = { ...programFiles('0.2.0', ' – neu'), 'neu/hilfe.txt': 'Neue Datei in neuem Ordner\n' };
  const r = publish(release, { version: '0.2.0', files });
  const before = snapshot(dir);
  const { result, error, steps } = await run(dir, { expected: '0.2.0' });
  assert.equal(error, undefined, error?.message);

  assert.equal(currentVersion(path.join(dir, 'package.json')), '0.2.0');
  for (const [p, data] of Object.entries(files)) assert.ok(fs.readFileSync(path.join(dir, p)).equals(Buffer.from(data)), p);
  assert.ok(fs.readFileSync(path.join(dir, 'manifest.json')).equals(fs.readFileSync(r.manifestFile)), 'manifest.json wie im Release');
  assert.ok(fs.readFileSync(path.join(dir, 'Tweakable DJ.cmd'), 'latin1').includes('\r\n'), '.cmd behält CRLF');
  personalUnchanged(dir);
  const after = snapshot(dir);
  for (const p of Object.keys(PERSONAL)) assert.equal(after[p], before[p], p);

  // Unveränderte Dateien wurden nicht angefasst (alter Zeitstempel), geänderte in der richtigen Reihenfolge ersetzt.
  assert.deepEqual(result, {
    from: '0.1.0', to: '0.2.0', same: 3, backup: '.update/backup-0.1.0', removed: [],
    changed: ['README.md', 'dj.mjs', 'neu/hilfe.txt', 'start.sh', 'ui.mjs', 'package.json', 'manifest.json'],
  });
  for (const p of ['Tweakable DJ.cmd', 'Tweakable DJ.command', 'docs/bild.png']) {
    assert.equal(fs.statSync(path.join(dir, p)).mtime.toISOString(), '2026-01-01T00:00:00.000Z', `${p} neu geschrieben`);
  }
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(dir, 'start.sh')).mode & 0o111, 0o111, 'start.sh ausführbar');
  }

  // Sicherung: nur die ersetzten Programmdateien der alten Version; Zwischenablage aufgeräumt.
  const backup = path.join(dir, '.update', 'backup-0.1.0');
  assert.deepEqual(fs.readdirSync(path.join(dir, '.update')), ['backup-0.1.0']);
  const old = programFiles('0.1.0');
  for (const p of ['README.md', 'dj.mjs', 'start.sh', 'ui.mjs', 'package.json']) {
    assert.ok(fs.readFileSync(path.join(backup, p)).equals(Buffer.from(old[p])), `Sicherung ${p}`);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup, 'backup.json'), 'utf8')).added, ['neu/hilfe.txt', 'manifest.json']);
  assert.equal(fs.existsSync(path.join(backup, 'config.jsonc')), false);

  assert.deepEqual(steps, [
    'Frage GitHub nach der neuesten Version …',
    `Lade manifest.json (${Math.round(fs.statSync(r.manifestFile).size / 1000) || 1} KB) …`,
    `Lade tweakable-dj-v0.2.0.zip (${Math.round(fs.statSync(r.zipFile).size / 1000) || 1} KB) …`,
    'Prüfe 9 Dateien (Größe und SHA-256) …',
    'Sichere 5 Programmdateien nach .update/backup-0.1.0 …',
    'Ersetze 7 Dateien (3 sind unverändert) …',
  ]);
  // Nur GitHub-Adressen, die Dateien über die Weiterleitung zum Release-Speicher
  const hosts = mockRequests().map(e => e.host ?? e.unknown);
  assert.ok(hosts.every(h => ['api.github.com', 'github.com', 'release-assets.githubusercontent.com'].includes(h)), hosts.join());

  // Danach: gleiche Version noch einmal → abgelehnt, nichts geändert
  const again = snapshot(dir);
  const second = await run(dir);
  assert.equal(second.error.outcome, 'unchanged');
  assert.match(second.error.message, /Version 0\.2\.0 ist nicht neuer als deine \(0\.2\.0\)/);
  assert.deepEqual(snapshot(dir), again);
});

// --- Abbruch, bevor etwas geändert ist ---

async function expectUnchanged(setup, message, opts = {}) {
  const { dir, release } = project();
  setup(release, dir);
  const before = snapshot(dir);
  const { error, result } = await run(dir, opts);
  assert.equal(result, undefined, 'Update hätte abbrechen müssen');
  assert.equal(error.outcome, 'unchanged', error.stack);
  assert.match(error.message, message);
  assert.match(error.message, /Es wurde nichts geändert\.$/);
  assert.deepEqual(snapshot(dir), before); // alle Dateien byteweise gleich, auch die persönlichen
  assert.equal(fs.existsSync(path.join(dir, '.update', 'backup-0.1.0')), false, 'keine Sicherung angelegt');
  return error;
}

test('SHA-256 bzw. Größe stimmt nicht → nichts geändert', async () => {
  await expectUnchanged(rel => publish(rel, { version: '0.2.0', zipFiles: { 'ui.mjs': '// manipuliert\n' } }),
    /^Update fehlgeschlagen: ui\.mjs stimmt nicht mit manifest\.json überein \(Größe oder SHA-256\)\./);
  await expectUnchanged(rel => publish(rel, {
    version: '0.2.0', manifest: m => { m.files.find(f => f.path === 'dj.mjs').sha256 = '0'.repeat(64); },
  }), /dj\.mjs stimmt nicht/);
  await expectUnchanged(rel => publish(rel, { version: '0.2.0', zipFiles: { 'Tweakable DJ.cmd': '@echo off\n(\n  node ui.mjs\n)\n' } }),
    /Tweakable DJ\.cmd stimmt nicht/); // nur die Zeilenenden anders
  await expectUnchanged(rel => publish(rel, { version: '0.2.0', zipExtra: [] , files: programFiles('0.2.0'),
    manifest: m => { m.files.push({ path: 'fehlt.txt', size: 1, sha256: 'a'.repeat(64), executable: false }); } }),
  /fehlt\.txt fehlt in der ZIP-Datei/);
});

test('manifest.json mit persönlicher Datei, ../, absolutem Pfad oder Backslash → Abbruch, nichts geändert', async () => {
  const cases = [
    ['config.jsonc', 'persönliche Datei'], ['tokens.json', 'persönliche Datei'], ['STATE.JSON', 'persönliche Datei'],
    ['lastfm-cache.json', 'persönliche Datei'], ['probelauf.json', 'persönliche Datei'], ['automatik.json', 'persönliche Datei'],
    ['docs/x.log', 'persönliche Datei'],
    ['../x', 'außerhalb des Ordners'], ['docs/../../x', 'außerhalb des Ordners'], ['/tmp/x', 'außerhalb des Ordners'],
    ['C:/x', 'außerhalb des Ordners'], ['C:\\x', 'außerhalb des Ordners'], ['..\\x', 'außerhalb des Ordners'],
    ['docs\\x.png', 'außerhalb des Ordners'], ['.update/backup-0.1.0/ui.mjs', 'unzulässiger Name'],
  ];
  for (const [p, reason] of cases) {
    const before = mockRequests().length;
    await expectUnchanged(rel => publish(rel, {
      version: '0.2.0', manifest: m => { m.files.push({ path: p, size: 3, sha256: sha('abc'), executable: false }); },
    }), new RegExp(`^Update fehlgeschlagen: manifest\\.json nennt „${p.replace(/[.\\/]/g, '\\$&')}“ \\(${reason}\\)\\.`));
    // Abbruch schon nach manifest.json: die ZIP-Datei wird gar nicht erst geladen
    assert.ok(!mockRequests().slice(before).some(e => /\.zip/.test(e.path ?? '')), `${p}: ZIP geladen`);
  }
});

test('Symbolischer Link im Programmordner oder in der ZIP-Datei → Abbruch, auch das Ziel des Links bleibt unverändert', async () => {
  const outside = path.join(tmp, 'ausserhalb');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'bild.png'), 'fremd');
  await expectUnchanged((rel, dir) => {
    fs.rmSync(path.join(dir, 'docs'), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, 'docs'), 'junction');
    publish(rel, { version: '0.2.0', files: { ...programFiles('0.2.0'), 'docs/bild.png': 'neu' } });
  }, /„docs“ ist ein symbolischer Link/);
  assert.equal(fs.readFileSync(path.join(outside, 'bild.png'), 'utf8'), 'fremd');
  await expectUnchanged(rel => publish(rel, { version: '0.2.0', zipModes: { 'dj.mjs': 0o120777 } }), /„dj\.mjs“ ist ein symbolischer Link/);
});

test('Gleiche, ältere oder Vorabversion, andere als bestätigte Version → abgelehnt', async () => {
  await expectUnchanged(rel => publish(rel, { version: '0.1.0' }), /Version 0\.1\.0 ist nicht neuer als deine \(0\.1\.0\)/);
  await expectUnchanged(rel => publish(rel, { version: '0.0.9' }), /Version 0\.0\.9 ist nicht neuer als deine \(0\.1\.0\)/);
  await expectUnchanged(rel => publish(rel, { version: '0.3.0-beta.1', release: { prerelease: true } }),
    /Auf GitHub gibt es keine veröffentlichte Version/);
  await expectUnchanged(rel => publish(rel, { version: '0.3.0' }), /Inzwischen gibt es Version 0\.3\.0 statt 0\.2\.0/, { expected: '0.2.0' });
});

test('Download nur von GitHub per HTTPS, mit Größenlimit; fehlende Release-Dateien', async () => {
  await expectUnchanged(rel => publish(rel, { version: '0.2.0', redirect: 'https://boese.example.com/dl' }),
    /Download von boese\.example\.com abgelehnt: Erlaubt ist nur HTTPS zu GitHub\./);
  await expectUnchanged(rel => publish(rel, { version: '0.2.0', redirect: 'http://release-assets.githubusercontent.com/x' }),
    /Download von release-assets\.githubusercontent\.com abgelehnt/);
  assert.ok(!mockRequests().some(e => e.unknown), 'fremde Adresse angefragt');
  await expectUnchanged(rel => {
    const r = publish(rel, { version: '0.2.0' });
    const reply = JSON.parse(fs.readFileSync(r.github, 'utf8'));
    reply.body.assets[1].browser_download_url = 'https://example.com/tweakable-dj-v0.2.0.zip';
    fs.writeFileSync(r.github, JSON.stringify(reply));
  }, /Version 0\.2\.0 hat keine Dateien für das automatische Update \(tweakable-dj-v0\.2\.0\.zip fehlt\)/);
  await expectUnchanged(rel => {
    const r = publish(rel, { version: '0.2.0' });
    const reply = JSON.parse(fs.readFileSync(r.github, 'utf8'));
    reply.body.assets = reply.body.assets.slice(1);
    fs.writeFileSync(r.github, JSON.stringify(reply));
  }, /manifest\.json fehlt/);
  await expectUnchanged(rel => publish(rel, { version: '0.2.0' }), /tweakable-dj-v0\.2\.0\.zip ist größer als erlaubt \(1 KB\)/,
    { limits: { release: 1e6, manifest: 1e5, zip: 1000, file: 1e6, total: 1e7, files: 100 } });
});

test('Nicht während eines Laufs, einer Anmeldung oder eines automatischen Laufs; nicht in einem git-Checkout', async () => {
  await expectUnchanged(rel => publish(rel, { version: '0.2.0' }), /^Update fehlgeschlagen: Gerade läuft ein Lauf\./,
    { busy: () => 'Gerade läuft ein Lauf.' });
  // Erst kurz vor dem Ersetzen beschäftigt (z. B. Anmeldung gestartet, während geladen wurde)
  let calls = 0;
  await expectUnchanged(rel => publish(rel, { version: '0.2.0' }), /Gerade läuft eine Anmeldung/,
    { busy: () => (++calls > 1 ? 'Gerade läuft eine Anmeldung bei Spotify.' : null) });
  await expectUnchanged((rel, dir) => {
    publish(rel, { version: '0.2.0' });
    fs.writeFileSync(path.join(dir, 'automatik.json'), JSON.stringify({ startedAt: new Date().toISOString(), finishedAt: null }));
  }, /Gerade läuft ein automatischer Lauf \(seit \d\d:\d\d Uhr\)/);
  await expectUnchanged((rel, dir) => {
    publish(rel, { version: '0.2.0' });
    fs.mkdirSync(path.join(dir, '.git'));
  }, /Dieser Ordner ist ein git-Repository\. Aktualisiere ihn mit „git pull“\./);
  const { dir } = project();
  assert.equal(installBlocker(dir, {}), null);
  assert.equal(installBlocker(dir, { TWEAKABLE_DJ_NO_UPDATE_CHECK: '1' }), 'update.disabled');
});

// --- Fehler beim Ersetzen: alles zurück ---

test('Fehler mitten beim Ersetzen → automatisch zurückgesichert, alle Dateien wie vorher', async () => {
  for (const failAt of ['ui.mjs', 'manifest.json']) {
    const { dir, release } = project();
    publish(release, { version: '0.2.0', files: { ...programFiles('0.2.0'), 'neu/hilfe.txt': 'neu\n' } });
    const before = snapshot(dir);
    const written = [];
    const { error } = await run(dir, {
      faults: { beforeWrite: p => { if (p === failAt) throw new Error('Festplatte voll (simuliert)'); written.push(p); } },
    });
    assert.ok(written.includes('neu/hilfe.txt') && written.includes('README.md'), written.join());
    assert.equal(error?.outcome, 'restored', error?.message);
    assert.equal(error.message, 'Update fehlgeschlagen: Unerwarteter Fehler (Festplatte voll (simuliert)). '
      + 'Die alte Version ist wiederhergestellt, alles ist wie vorher.');
    assert.deepEqual(snapshot(dir), before, `${failAt}: nicht alles wie vorher`);
    assert.equal(fs.existsSync(path.join(dir, 'neu')), false, 'neuer Ordner wieder weg');
    assert.equal(currentVersion(path.join(dir, 'package.json')), '0.1.0');
    personalUnchanged(dir);
  }
});

test('Ersetzen scheitert wirklich, fremder Ordner im Weg → Rest zurückgesichert, Meldung nennt die Sicherung', async () => {
  const { dir, release } = project();
  publish(release, { version: '0.2.0', files: { ...programFiles('0.2.0'), 'neu/a.txt': 'a', 'neu/b.txt': 'b' } });
  const before = snapshot(dir);
  // Nach der Prüfung, vor dem Ersetzen legt jemand anstelle von neu/b.txt einen Ordner an: Schreiben geht nicht, und
  // diesen Ordner löscht das Zurücksichern nicht (es löscht nur, was das Update selbst angelegt hat).
  const { error } = await run(dir, {
    faults: { beforeWrite: p => { if (p === 'neu/b.txt') fs.mkdirSync(path.join(dir, 'neu', 'b.txt', 'x'), { recursive: true }); } },
  });
  assert.equal(error?.outcome, 'restoreFailed', error?.message);
  assert.match(error.message, /^Update fehlgeschlagen: Unerwarteter Fehler \(E[A-Z]+\)\. Beim Zurückholen der alten Version gab es Probleme \(neu\/b\.txt: /);
  assert.match(error.message, /Die alten Programmdateien liegen in \.update\/backup-0\.1\.0\. Deine persönlichen Dateien wurden nicht angefasst\.$/);
  // Alles andere ist zurück; ohne den fremden Ordner ist der Stand wie vorher.
  fs.rmSync(path.join(dir, 'neu'), { recursive: true });
  assert.deepEqual(snapshot(dir), before);
  personalUnchanged(dir);
  assert.ok(fs.existsSync(path.join(dir, '.update', 'backup-0.1.0', 'ui.mjs')), 'Sicherung bleibt');
});

test('readZip: Info-ZIP-Format mit Ordnern, Links und Unix-Rechten; kaputte Datei', () => {
  const zip = buildZip([{ name: 'tweakable-dj/' }, { name: 'tweakable-dj/a.txt', data: 'abc' },
    { name: 'tweakable-dj/link', data: 'a.txt', mode: 0o120777 }, { name: 'tweakable-dj/x.sh', data: '', mode: 0o100755 }]);
  const entries = readZip(zip);
  assert.deepEqual([...entries.keys()], ['tweakable-dj/', 'tweakable-dj/a.txt', 'tweakable-dj/link', 'tweakable-dj/x.sh']);
  assert.deepEqual([...entries.values()].map(e => e.symlink), [false, false, true, false]);
  assert.throws(() => readZip(zip.subarray(0, zip.length - 30)), /central directory/);
  assert.throws(() => readZip(Buffer.from('kein zip')), /end of central directory/);
});

// --- Über die Oberfläche: POST /api/update/install, danach Ende des Servers (Exit-Code 75 bzw. 0) ---

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  }).on('error', reject);
});

// Kopie der echten Programmdateien als Version 0.1.0 (Repository beispiel/…) samt persönlichen Dateien.
function realProject() {
  const files = {};
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.mjs') || /^config\.example(\.de)?\.jsonc$/.test(f) || f === 'ui.html') files[f] = fs.readFileSync(path.join(ROOT, f));
  }
  const pkg = version => `${JSON.stringify({ name: 'tweakable-dj', version, repository: { type: 'git', url: `git+https://github.com/${OWNER_REPO}.git` } }, null, 2)}\n`;
  const { dir, release } = project({ ...files, 'package.json': pkg('0.1.0') });
  const newFiles = { ...files, 'package.json': pkg('0.2.0'), 'ui.html': `${files['ui.html']}<!-- neue Version 0.2.0 -->\n` };
  return { dir, release, newFiles };
}

async function startServer(dir, env) {
  const port = await freePort();
  const server = spawn(process.execPath, ['ui.mjs', '--no-browser'], {
    cwd: dir,
    env: { ...process.env, TWEAKABLE_DJ_PORT: String(port), TWEAKABLE_DJ_LANG: 'de', NODE_OPTIONS: `--import=${MOCK}`, ...env },
  });
  let out = '';
  server.stdout.on('data', chunk => (out += chunk));
  server.stderr.on('data', chunk => (out += chunk));
  const exited = new Promise(resolve => server.on('exit', code => resolve(code)));
  await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (out.includes('Oberfläche läuft auf')) {
        clearInterval(timer);
        resolve();
      }
    }, 20);
    exited.then(code => {
      clearInterval(timer);
      reject(new Error(`Server beendet (${code}): ${out}`));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const call = (route, opts = {}) => realFetch(base + route, {
    method: opts.method ?? 'GET',
    headers: { 'X-Tweakable-DJ': '1', 'X-Lang': opts.lang ?? 'de', 'Content-Type': 'application/json' },
    body: opts.body && JSON.stringify(opts.body),
  });
  return { server, exited, call, output: () => out };
}

for (const launcher of [true, false]) {
  test(`POST /api/update/install ${launcher ? 'mit' : 'ohne'} Startdatei: Update, dann Exit-Code ${launcher ? 75 : 0}`, async () => {
    const { dir, release, newFiles } = realProject();
    publish(release, { version: '0.2.0', files: newFiles });
    const { server, exited, call, output } = await startServer(dir, {
      TWEAKABLE_DJ_LAUNCHER: launcher ? '1' : '', MOCK_GITHUB: process.env.MOCK_GITHUB, MOCK_LOG: process.env.MOCK_LOG,
    });
    let personal;
    try {
      assert.deepEqual(await (await call('/api/version')).json(), { version: '0.1.0', app: 'tweakable-dj', busy: false, activity: null });
      const info = await (await call('/api/update')).json();
      assert.deepEqual([info.updateAvailable, info.latest, info.installable], [true, '0.2.0', true]);
      // Die Prüfung eben hat update-check.json neu geschrieben (ihr Tages-Cache); ab hier darf sich keine ändern.
      personal = Object.fromEntries(Object.keys(PERSONAL).map(p => [p, sha(fs.readFileSync(path.join(dir, p)))]));
      const res = await call('/api/update/install', { method: 'POST', body: { version: '0.2.0' }, lang: 'en' });
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.match(text, /^Asking GitHub for the newest version …$/m);
      assert.match(text, /^Replacing \d+ files \(\d+ are unchanged\) …$/m);
      assert.match(text, /^Version 0\.2\.0 is installed ✓$/m);
      const result = JSON.parse(text.split('\n').find(l => l.startsWith('@@RESULT ')).slice(9));
      assert.deepEqual([result.ok, result.from, result.to, result.restart], [true, '0.1.0', '0.2.0', launcher]);
      assert.equal(await exited, launcher ? 75 : 0);
      assert.match(output(), launcher ? /Update auf Version 0\.2\.0 installiert – Tweakable DJ startet neu …/
        : /Update auf Version 0\.2\.0 installiert\. Bitte Tweakable DJ neu starten\./);
    } finally {
      if (server.exitCode === null) server.kill();
      await exited;
    }
    assert.deepEqual(Object.fromEntries(Object.keys(PERSONAL).map(p => [p, sha(fs.readFileSync(path.join(dir, p)))])), personal);
    for (const [p, data] of Object.entries(newFiles)) assert.ok(fs.readFileSync(path.join(dir, p)).equals(Buffer.from(data)), p);

    // Neustart (wie die Startdatei): Der neue Server meldet die neue Version und liefert die neue Seite.
    const again = await startServer(dir, { MOCK_GITHUB: process.env.MOCK_GITHUB });
    try {
      assert.deepEqual(await (await again.call('/api/version')).json(), { version: '0.2.0', app: 'tweakable-dj', busy: false, activity: null });
      assert.match(await (await again.call('/')).text(), /<!-- neue Version 0\.2\.0 -->/);
      assert.equal((await (await again.call('/api/update')).json()).updateAvailable, false);
    } finally {
      again.server.kill();
      await again.exited;
    }
  });
}

// --- Neustart-Schleife der Startdateien (Exit-Code 75 = neu starten, ohne Browser) ---

// Ersatz für ui.mjs: merkt sich Argumente und TWEAKABLE_DJ_LAUNCHER und endet mit dem nächsten Code aus codes.txt.
// Beim ersten Aufruf ersetzt es die laufende Startdatei (wie ein Update) durch Befehle, die nie laufen dürfen.
const FAKE_UI = `import fs from 'node:fs';
const codes = fs.readFileSync('codes.txt', 'utf8').trim().split(/\\s+/).map(Number);
const calls = fs.existsSync('calls.json') ? JSON.parse(fs.readFileSync('calls.json', 'utf8')) : [];
calls.push({ args: process.argv.slice(2), launcher: process.env.TWEAKABLE_DJ_LAUNCHER ?? null });
fs.writeFileSync('calls.json', JSON.stringify(calls));
const start = process.env.REPLACE_START;
if (calls.length === 1 && start) {
  const junk = start.endsWith('.cmd')
    ? Array.from({ length: 300 }, (_, i) => 'echo MUELL' + i + ' & echo x> muell.txt\\r\\n').join('')
    : Array.from({ length: 300 }, (_, i) => 'echo MUELL' + i + '; echo x > muell.txt\\n').join('');
  try {
    fs.writeFileSync(start + '.neu', junk);
    fs.renameSync(start + '.neu', start);
  } catch {
    fs.writeFileSync(start, junk);
  }
}
process.exit(codes[calls.length - 1] ?? 0);
`;

function launcherCase(startFile, codes) {
  const dir = path.join(tmp, `start-${++caseNo}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, startFile), path.join(dir, startFile));
  fs.writeFileSync(path.join(dir, 'ui.mjs'), FAKE_UI);
  fs.writeFileSync(path.join(dir, 'codes.txt'), codes.join(' '));
  return dir;
}
const calls = dir => JSON.parse(fs.readFileSync(path.join(dir, 'calls.json'), 'utf8'));
const shell = spawnSync('sh', ['-c', 'exit 0']).error ? null : 'sh';
const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` };
delete env.TWEAKABLE_DJ_LAUNCHER;

test('start.sh: Syntax (sh -n, bash -n)', { skip: !shell && 'kein sh' }, () => {
  for (const sh of ['sh', 'bash']) {
    const r = spawnSync(sh, ['-n', path.join(ROOT, 'start.sh')], { encoding: 'utf8' });
    if (r.error?.code === 'ENOENT') continue;
    assert.equal(r.status, 0, `${sh} -n: ${r.stderr}`);
  }
  assert.equal(spawnSync('sh', ['-n', path.join(ROOT, 'Tweakable DJ.command')]).status, 0);
});

test('start.sh: startet bei Exit-Code 75 neu (mit --no-browser), hört bei 0 und 1 auf', { skip: !shell && 'kein sh' }, () => {
  for (const [codes, exit] of [[[75, 75, 0], 0], [[75, 1], 1], [[0], 0], [[1], 1], [[3], 3]]) {
    const dir = launcherCase('start.sh', codes);
    const r = spawnSync('sh', ['start.sh'], {
      cwd: dir, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, REPLACE_START: path.join(dir, 'start.sh') },
    });
    assert.equal(r.status, exit, `${codes}: ${r.stdout}${r.stderr}`);
    assert.deepEqual(calls(dir), codes.map((_, i) => ({ args: i ? ['--no-browser'] : [], launcher: '1' })));
    assert.equal((r.stdout.match(/Tweakable DJ startet neu … \/ Tweakable DJ is restarting …/g) ?? []).length, codes.length - 1);
    assert.ok(!/MUELL/.test(r.stdout + r.stderr) && !fs.existsSync(path.join(dir, 'muell.txt')), 'ersetzte Startdatei ausgeführt');
  }
});

test('Tweakable DJ.cmd: startet bei Exit-Code 75 neu, auch wenn die Datei währenddessen ersetzt wird', { skip: process.platform !== 'win32' && 'nur Windows' }, () => {
  for (const codes of [[75, 75, 0], [75, 1], [0], [1]]) {
    const dir = launcherCase('Tweakable DJ.cmd', codes);
    const file = path.join(dir, 'Tweakable DJ.cmd');
    // stdin leer: "pause" am Ende wartet dann nicht
    const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${file}""`], {
      cwd: dir, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: true,
      env: { ...env, REPLACE_START: file },
    });
    assert.equal(r.error, undefined, `${codes}: ${r.error}`);
    assert.deepEqual(calls(dir), codes.map((_, i) => ({ args: i ? ['--no-browser'] : [], launcher: '1' })), `${codes}: ${r.stdout}${r.stderr}`);
    assert.equal((r.stdout.match(/Tweakable DJ startet neu \.\.\. \/ Tweakable DJ is restarting \.\.\./g) ?? []).length, codes.length - 1);
    assert.ok(!/MUELL/.test(r.stdout + r.stderr) && !fs.existsSync(path.join(dir, 'muell.txt')), 'ersetzte Startdatei ausgeführt');
  }
});

// --- Überholte Dateien früherer Versionen (obsolete) ---

test('buildManifest: obsolete = Dateien früherer Releases, die es nicht mehr gibt, mit allen Prüfsummen; nie aktuelle oder persönliche', () => {
  const base = path.join(tmp, `obsolete-${++caseNo}`);
  const write = (root, files) => {
    for (const [p, data] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
      fs.writeFileSync(path.join(root, p), data);
    }
  };
  const cur = path.join(base, 'neu');
  write(cur, { ...programFiles('0.3.0'), 'docs/Screenshot.png': 'neu' });
  write(path.join(base, 'v0.1.0'), { ...programFiles('0.1.0'), 'docs/screenshot-alt.png': 'alt 1', 'docs/screenshot.png': 'gleicher Name, andere Schreibweise', 'alt.mjs': 'x' });
  write(path.join(base, 'v0.2.0'), { ...programFiles('0.2.0'), 'docs/screenshot-alt.png': 'alt 2', 'config.jsonc': '{}' });
  const m = buildManifest(cur, '0.3.0', [path.join(base, 'v0.1.0'), path.join(base, 'v0.2.0'), path.join(base, 'gibt-es-nicht')]);
  assert.deepEqual(m.obsolete, [
    { path: 'alt.mjs', sha256: [sha('x')] },
    { path: 'docs/screenshot-alt.png', sha256: [sha('alt 1'), sha('alt 2')].sort() },
  ]);
  assert.deepEqual(checkManifest(m, '0.3.0').obsolete, m.obsolete);
  assert.deepEqual(buildManifest(cur, '0.3.0').obsolete, [], 'ohne frühere Releases');
});

test('checkManifest: obsolete nur mit erlaubten Pfaden, nie eine Datei dieser Version, SHA-256 als Liste', () => {
  const m = makeRelease(path.join(tmp, `chk-${++caseNo}`), { version: '0.3.0' }).manifest;
  const ok = { path: 'docs/alt.png', sha256: [sha('a')] };
  assert.deepEqual(checkManifest({ ...m, obsolete: [ok] }, '0.3.0').obsolete, [ok]);
  assert.deepEqual(checkManifest({ ...m, obsolete: undefined }, '0.3.0').obsolete, [], 'ältere manifest.json ohne obsolete');
  for (const bad of [{ path: 'config.jsonc', sha256: [sha('a')] }, { path: '../x', sha256: [sha('a')] }, { path: 'archiv/x.txt', sha256: [sha('a')] },
    { path: 'UI.mjs', sha256: [sha('a')] }, { path: 'docs/alt.png', sha256: [] }, { path: 'docs/alt.png', sha256: ['xyz'] }, { path: 'docs/alt.png', sha256: sha('a') }]) {
    assert.throws(() => checkManifest({ ...m, obsolete: [bad] }, '0.3.0'), /manifest\.json|nicht erlaubt|not allowed|Update/i, JSON.stringify(bad));
  }
  assert.throws(() => checkManifest({ ...m, obsolete: [ok, ok] }, '0.3.0'), /twice|obsolete/);
  assert.throws(() => checkManifest({ ...m, obsolete: 'x' }, '0.3.0'), /obsolete/);
});

test('Update löscht überholte Dateien früherer Versionen – nur mit passender Prüfsumme, gesichert; persönliche bleiben', async () => {
  const old = { ...programFiles('0.1.0'), 'docs/screenshot-alt.png': 'altes Bild', 'docs/geaendert.png': 'von mir bearbeitet', 'alt/weg.mjs': 'alt' };
  const { dir, release } = project(old);
  publish(release, {
    version: '0.2.0',
    manifest: m => ({ ...m, obsolete: [
      { path: 'docs/screenshot-alt.png', sha256: [sha('altes Bild'), sha('noch älter')] },
      { path: 'docs/geaendert.png', sha256: [sha('Original')] },
      { path: 'alt/weg.mjs', sha256: [sha('alt')] },
      { path: 'gibt-es-nicht.txt', sha256: [sha('x')] },
    ] }),
  });
  const { result, error, steps } = await run(dir, { expected: '0.2.0' });
  assert.equal(error, undefined, error?.message);
  assert.deepEqual(result.removed, ['docs/screenshot-alt.png', 'alt/weg.mjs']);
  assert.equal(fs.existsSync(path.join(dir, 'docs/screenshot-alt.png')), false);
  assert.equal(fs.existsSync(path.join(dir, 'alt/weg.mjs')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'docs/geaendert.png'), 'utf8'), 'von mir bearbeitet', 'geänderte Datei bleibt');
  assert.ok(fs.existsSync(path.join(dir, 'docs/bild.png')) && fs.existsSync(path.join(dir, 'docs/mein-bild.png')), 'Ordner und andere Dateien bleiben');
  personalUnchanged(dir);
  const backup = path.join(dir, '.update', 'backup-0.1.0');
  assert.equal(fs.readFileSync(path.join(backup, 'docs/screenshot-alt.png'), 'utf8'), 'altes Bild', 'gesichert');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup, 'backup.json'), 'utf8')).removed, ['docs/screenshot-alt.png', 'alt/weg.mjs']);
  assert.ok(steps.includes('Entferne 2 überholte Programmdateien früherer Versionen …'), steps.join('\n'));
});

test('Fehler beim Löschen einer überholten Datei → alles zurückgesichert, auch schon gelöschte Dateien', async () => {
  const old = { ...programFiles('0.1.0'), 'docs/a.png': 'A', 'docs/b.png': 'B' };
  const { dir, release } = project(old);
  publish(release, { version: '0.2.0', manifest: m => ({ ...m, obsolete: [{ path: 'docs/a.png', sha256: [sha('A')] }, { path: 'docs/b.png', sha256: [sha('B')] }] }) });
  const before = snapshot(dir);
  const { error } = await run(dir, { faults: { beforeRemove: p => { if (p === 'docs/b.png') throw new Error('simuliert'); } } });
  assert.equal(error?.outcome, 'restored', error?.message);
  assert.deepEqual(snapshot(dir), before, 'wie vorher');
});

test('cleanObsolete: beim Start nach einem Update durch eine ältere Version – nur passende Version, kein git-Checkout, gesichert', () => {
  const { dir } = project({ ...programFiles('0.2.0'), 'docs/alt.png': 'alt', 'docs/eigen.png': 'eigen' });
  const write = m => fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
  const manifest = version => ({
    name: 'tweakable-dj', version, files: [{ path: 'package.json', size: 1, sha256: sha('p') }, { path: 'ui.mjs', size: 1, sha256: sha('u') }],
    obsolete: [{ path: 'docs/alt.png', sha256: [sha('alt')] }, { path: 'docs/eigen.png', sha256: [sha('anders')] }, { path: 'config.jsonc', sha256: [sha('x')] }],
  });
  // Andere Version in manifest.json als in package.json: nichts
  write(manifest('0.1.9'));
  assert.deepEqual(cleanObsolete(dir, 'de'), []);
  // Persönliche Datei in obsolete: ganze Liste ungültig, nichts
  write(manifest('0.2.0'));
  assert.deepEqual(cleanObsolete(dir, 'de'), []);
  const m = manifest('0.2.0');
  m.obsolete.pop();
  write(m);
  // git-Checkout: nichts
  fs.mkdirSync(path.join(dir, '.git'));
  assert.deepEqual(cleanObsolete(dir, 'de'), []);
  fs.rmSync(path.join(dir, '.git'), { recursive: true });
  // Sicherung des Updates auf 0.2.0 vorhanden: dorthin kopiert, in backup.json vermerkt
  const backup = path.join(dir, '.update', 'backup-0.1.0');
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, 'backup.json'), JSON.stringify({ from: '0.1.0', to: '0.2.0', createdAt: '2026-10-08T10:00:00Z', replaced: [], added: [] }));
  assert.deepEqual(cleanObsolete(dir, 'de'), ['docs/alt.png']);
  assert.equal(fs.existsSync(path.join(dir, 'docs/alt.png')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'docs/eigen.png'), 'utf8'), 'eigen', 'geändert: bleibt');
  assert.equal(fs.readFileSync(path.join(backup, 'docs/alt.png'), 'utf8'), 'alt');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup, 'backup.json'), 'utf8')).removed, ['docs/alt.png']);
  personalUnchanged(dir);
  assert.deepEqual(cleanObsolete(dir, 'de'), [], 'beim nächsten Start nichts mehr');
});
