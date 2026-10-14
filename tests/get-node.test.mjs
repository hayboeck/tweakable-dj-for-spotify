// Tests für das eigene Node.js im Programmordner (get-node.cmd unter Windows, get-node.sh unter macOS und Linux) und wie die
// Startdateien es nutzen. Statt nodejs.org liefert ein lokaler Server (TWEAKABLE_DJ_NODE_MIRROR) ein kleines Archiv samt
// SHASUMS256.txt: unter Windows mit einer Kopie des laufenden node.exe (node-version.txt nennt dann dessen Version), unter
// macOS und Linux mit einem Skript als bin/node, das die Version nennt und sonst das laufende Node.js startet.
// Alles läuft in temporären Ordnern mit Leerzeichen und Umlaut – nie im Projektordner, ohne Internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WIN = process.platform === 'win32';
const VERSION = process.versions.node;
const SH = !WIN || !spawnSync('sh', ['-c', 'exit 0']).error;
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

let tmp;
let caseNo = 0;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-node-'));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

// Programm ausführen, ohne die Ereignisschleife zu blockieren (der Server läuft im selben Prozess).
function run(file, args, { cwd, env = {}, timeout = 120_000 } = {}) {
  return new Promise(resolve => {
    // Nie nodejs.org: ohne eigene Adresse ein Port, an dem niemand antwortet. Ein festes „heute“ für „heute schon versucht“,
    // damit kein Test scheitert, wenn er über Mitternacht läuft.
    const fullEnv = { ...process.env, TWEAKABLE_DJ_NODE_MIRROR: 'http://127.0.0.1:1', TWEAKABLE_DJ_TEST_DATE: 'Testtag', ...env };
    for (const [k, v] of Object.entries(fullEnv)) if (v === undefined) delete fullEnv[k];
    const child = spawn(file, args, { cwd, env: fullEnv, windowsHide: true, windowsVerbatimArguments: WIN && file === 'cmd.exe', stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', c => (out += c));
    child.stderr.on('data', c => (out += c));
    const timer = setTimeout(() => child.kill(), timeout);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

// get-node.cmd bzw. get-node.sh im Ordner dir aufrufen (sh = true: immer get-node.sh).
const getNode = (dir, args = [], env = {}, sh = false) => (WIN && !sh
  ? run('cmd.exe', ['/d', '/s', '/c', `""${path.join(dir, 'get-node.cmd')}" ${args.join(' ')}"`], { cwd: dir, env })
  : run('sh', [path.join(dir, 'get-node.sh'), ...args], { cwd: dir, env }));

// Kopie der Startdateien in einem neuen Ordner; node-version.txt nennt version.
function program(version = VERSION) {
  const dir = path.join(tmp, `prog ${++caseNo}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['get-node.cmd', 'get-node.sh', 'start.sh', 'Tweakable DJ.cmd']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'node-version.txt'), `${version}\n`);
  return dir;
}

// Dateiname des Archivs für dieses System (unter macOS und Linux von get-node.sh selbst)
async function archiveName(dir) {
  if (WIN) return `node-v${VERSION}-win-${process.arch === 'arm64' ? 'arm64' : 'x64'}.zip`;
  const r = await getNode(dir, ['--name'], {}, true);
  assert.equal(r.code, 0, r.out);
  return r.out.trim();
}

// Archiv wie auf nodejs.org: Ordner <name>/ mit node.exe bzw. bin/node und LICENSE (dazu eine Datei, die nicht entpackt wird).
// prints: Version, die bin/node bei -v nennt (nur macOS/Linux).
function buildArchive(file, prints = `v${VERSION}`) {
  const name = file.replace(/\.(zip|tar\.gz|tar\.xz)$/, '');
  const pack = path.join(tmp, `pack ${++caseNo}`);
  const root = path.join(pack, name);
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'LICENSE'), 'MIT\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'nicht entpacken\n');
  const out = path.join(pack, file);
  if (WIN) {
    fs.copyFileSync(process.execPath, path.join(root, 'node.exe'));
    const r = spawnSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['--format', 'zip', '--options', 'zip:compression=store', '-cf', out, '-C', pack, name]);
    assert.equal(r.status, 0, String(r.stderr));
  } else {
    // Nennt bei -v die Version; sonst startet es das laufende Node.js und sagt ihm, dass es das eigene ist.
    const script = `#!/bin/sh\nif [ "$1" = "-v" ]; then echo '${prints}'; exit 0; fi\nTWEAKABLE_DJ_TEST_OWN_NODE=1 exec '${process.execPath}' "$@"\n`;
    fs.writeFileSync(path.join(root, 'bin', 'node'), script, { mode: 0o755 });
    const r = spawnSync('tar', [file.endsWith('.xz') ? '-cJf' : '-czf', out, '-C', pack, name]);
    assert.equal(r.status, 0, String(r.stderr));
  }
  return fs.readFileSync(out);
}

// Server wie nodejs.org/dist: /v<Version>/SHASUMS256.txt und /v<Version>/<Archiv>. mode: 'ok', 'badsum' (falsche Prüfsumme),
// 'abort' (Verbindung nach der Hälfte weg), 'missing' (404), 'nocurl' (bricht nur bei curl ab, PowerShell bekommt alles).
// slowMs: so lange vor der zweiten Hälfte des Archivs warten. requests: angefragte Pfade.
async function mirror(file, data, version = VERSION) {
  const s = { mode: 'ok', requests: [], slowMs: 0 };
  const server = http.createServer(async (req, res) => {
    s.requests.push(req.url);
    if (s.mode === 'nocurl' && /curl/i.test(req.headers['user-agent'] ?? '')) return res.socket.destroy();
    if (s.mode === 'missing') return res.writeHead(404).end();
    if (req.url === `/v${version}/SHASUMS256.txt`) {
      const hash = s.mode === 'badsum' ? sha('etwas anderes') : sha(data);
      return res.end(`${sha('x')}  node-v${version}-aix-ppc64.tar.gz\n${hash}  ${file}\n${sha('y')}  win-x64/node.exe\n`);
    }
    if (req.url !== `/v${version}/${file}`) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Length': data.length });
    if (s.slowMs) {
      res.write(data.subarray(0, data.length >> 1));
      await new Promise(resolve => setTimeout(resolve, s.slowMs));
      return res.end(data.subarray(data.length >> 1));
    }
    if (s.mode === 'abort') {
      res.write(data.subarray(0, data.length >> 1), () => res.socket.destroy());
      return undefined;
    }
    return res.end(data);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  s.url = `http://127.0.0.1:${server.address().port}`;
  s.close = () => new Promise(resolve => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
  return s;
}

const ownNode = dir => (WIN ? path.join(dir, 'node', 'current', 'node.exe') : path.join(dir, 'node', 'current', 'bin', 'node'));
const leftovers = dir => ['download', 'new', 'old'].filter(d => fs.existsSync(path.join(dir, 'node', d)));

test('Download: Prüfsumme passt → node/current; zweiter Aufruf lädt nichts; --check sagt 0', { timeout: 300_000 }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    const env = { TWEAKABLE_DJ_NODE_MIRROR: srv.url };
    assert.equal((await getNode(dir, ['--check'], env)).code, 1, 'vorher: Download nötig');
    assert.deepEqual(srv.requests, [], '--check lädt nichts');
    const r = await getNode(dir, [], env);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Node\.js wird einmalig heruntergeladen \(ca\. \d+ MB\)/);
    assert.match(r.out, new RegExp(`Node\\.js ${VERSION.replace(/\./g, '\\.')} ist bereit`));
    assert.deepEqual(srv.requests, [`/v${VERSION}/SHASUMS256.txt`, `/v${VERSION}/${file}`]);
    assert.ok(fs.existsSync(ownNode(dir)));
    assert.ok(fs.existsSync(path.join(dir, 'node', 'current', 'LICENSE')));
    assert.ok(!fs.existsSync(path.join(dir, 'node', 'current', 'README.md')), 'nur node und LICENSE entpackt');
    assert.deepEqual(leftovers(dir), []);
    const again = await getNode(dir, [], env);
    assert.equal(again.code, 0, again.out);
    assert.doesNotMatch(again.out, /heruntergeladen/);
    assert.equal(srv.requests.length, 2, 'kein zweiter Download');
    assert.equal((await getNode(dir, ['--check'], env)).code, 0);
  } finally {
    await srv.close();
  }
});

test('Prüfsumme falsch, Download abgebrochen, offline, Datei fehlt: kein node/current, keine Reste; danach klappt es', { timeout: 300_000 }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    const env = { TWEAKABLE_DJ_NODE_MIRROR: srv.url };
    for (const mode of ['badsum', 'abort', 'missing']) {
      srv.mode = mode;
      const r = await getNode(dir, [], env);
      assert.equal(r.code, 1, `${mode}: ${r.out}`);
      assert.match(r.out, /Node\.js konnte nicht heruntergeladen werden/, mode);
      if (mode === 'badsum') assert.match(r.out, /Prüfsumme|Pruefsumme/);
      assert.ok(!fs.existsSync(path.join(dir, 'node', 'current')), `${mode}: halb fertig gilt nie als fertig`);
      assert.deepEqual(leftovers(dir), [], mode);
    }
    const offline = await getNode(dir, [], { TWEAKABLE_DJ_NODE_MIRROR: 'http://127.0.0.1:1' });
    assert.equal(offline.code, 1, offline.out);
    // --check: Heute schon versucht, und ein installiertes Node.js ist da (das laufende im PATH) → kein neuer Versuch ohne
    // Fenster; ohne Versuch heute bzw. ganz ohne Node.js → Download nötig.
    const nodeInPath = { PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` };
    assert.equal((await getNode(dir, ['--check'], { ...env, ...nodeInPath })).code, 0);
    if (WIN) assert.equal((await getNode(dir, ['--check'], { ...env, PATH: [path.join(process.env.SystemRoot, 'System32'), process.env.SystemRoot].join(';') })).code, 1);
    fs.rmSync(path.join(dir, 'node', 'last-download'));
    assert.equal((await getNode(dir, ['--check'], { ...env, ...nodeInPath })).code, 1);
    srv.mode = 'ok';
    const ok = await getNode(dir, [], env);
    assert.equal(ok.code, 0, ok.out);
    assert.ok(fs.existsSync(ownNode(dir)));
  } finally {
    await srv.close();
  }
});

test('Neue festgelegte Version: lädt sie, tauscht node/current aus und räumt die alte weg; offline bleibt die alte', { timeout: 300_000 }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    // „Alte“ Version: node/current mit einem node, das eine andere Version nennt (unter Windows: eines, das gar nicht läuft)
    const old = path.join(dir, 'node', 'current');
    fs.mkdirSync(path.join(old, 'bin'), { recursive: true });
    if (WIN) fs.writeFileSync(path.join(old, 'node.exe'), 'kein Programm');
    else fs.writeFileSync(path.join(old, 'bin', 'node'), '#!/bin/sh\necho v18.0.0\n', { mode: 0o755 });
    fs.writeFileSync(path.join(old, 'alte-version.txt'), 'alt');
    // offline: Die alte tut es vorerst (Exit-Code 0), nichts geändert
    const offline = await getNode(dir, [], { TWEAKABLE_DJ_NODE_MIRROR: 'http://127.0.0.1:1' });
    assert.equal(offline.code, 0, offline.out);
    assert.ok(fs.existsSync(path.join(old, 'alte-version.txt')));
    // online: getauscht, die alte ist weg
    const r = await getNode(dir, [], { TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.equal(r.code, 0, r.out);
    assert.ok(!fs.existsSync(path.join(old, 'alte-version.txt')), 'alte Version weg');
    assert.ok(fs.existsSync(ownNode(dir)));
    assert.deepEqual(leftovers(dir), []);
    // Schon geprüfte neue Version (node/new) wird beim nächsten Aufruf eingesetzt, ohne Download
    fs.renameSync(old, path.join(dir, 'node', 'new'));
    srv.requests.length = 0;
    assert.equal((await getNode(dir, ['--check'], { TWEAKABLE_DJ_NODE_MIRROR: srv.url })).code, 0);
    assert.ok(fs.existsSync(ownNode(dir)) && !fs.existsSync(path.join(dir, 'node', 'new')));
    assert.deepEqual(srv.requests, []);
  } finally {
    await srv.close();
  }
});

test('get-node.sh: Dateinamen je System, nicht unterstützte Systeme, Hinweistext; Syntax', { skip: !SH && 'kein sh' }, async () => {
  const dir = program('24.21.0');
  for (const sh of ['sh', 'bash']) {
    const r = spawnSync(sh, ['-n', path.join(ROOT, 'get-node.sh')], { encoding: 'utf8' });
    if (r.error?.code === 'ENOENT') continue;
    assert.equal(r.status, 0, `${sh} -n: ${r.stderr}`);
  }
  const name = async (os_, arch) => {
    const r = await getNode(dir, ['--name'], { TWEAKABLE_DJ_NODE_OS: os_, TWEAKABLE_DJ_NODE_ARCH: arch }, true);
    return r.code === 0 ? r.out.trim() : r.code;
  };
  assert.equal(await name('Darwin', 'arm64'), 'node-v24.21.0-darwin-arm64.tar.gz');
  assert.equal(await name('Darwin', 'x86_64'), 'node-v24.21.0-darwin-x64.tar.gz');
  assert.match(await name('Linux', 'x86_64'), /^node-v24\.21\.0-linux-x64\.tar\.(xz|gz)$/);
  assert.match(await name('Linux', 'aarch64'), /^node-v24\.21\.0-linux-arm64\.tar\.(xz|gz)$/);
  assert.equal(await name('Linux', 'armv7l'), 2, '32-Bit-ARM: keins');
  assert.equal(await name('FreeBSD', 'amd64'), 2);
  fs.writeFileSync(path.join(dir, 'node-version.txt'), '24.21.0; rm -rf /\n');
  assert.equal(await name('Linux', 'x86_64'), 2, 'ungültige Version');
  fs.writeFileSync(path.join(dir, 'node-version.txt'), '24.21.0\r\n');
  assert.match(await name('Linux', 'x86_64'), /^node-v24\.21\.0-linux-x64/, 'CRLF egal');
  const msg = await getNode(dir, ['--message'], { TWEAKABLE_DJ_NODE_OS: 'Darwin', TWEAKABLE_DJ_NODE_ARCH: 'arm64' }, true);
  assert.equal(msg.out.trim(), 'Node.js wird einmalig heruntergeladen (ca. 50 MB) … / Node.js is being downloaded once (about 50 MB) …');
});

test('get-node.sh: Läuft das geladene Node.js hier nicht, merkt es sich das und versucht es nicht jedes Mal neu', { skip: WIN && 'nur macOS/Linux' }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file, 'v0.0.1'));
  try {
    const env = { TWEAKABLE_DJ_NODE_MIRROR: srv.url };
    const r = await getNode(dir, [], env);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /läuft auf diesem Rechner nicht/);
    assert.equal((await getNode(dir, ['--check'], env)).code, 2);
    assert.equal((await getNode(dir, [], env)).code, 2);
    assert.equal(srv.requests.length, 2, 'kein zweiter Download');
  } finally {
    await srv.close();
  }
});

// --- Startdateien: nehmen das eigene Node.js, sonst ein installiertes ---

// Ersatz für ui.mjs: merkt sich, mit welchem Node.js es lief.
const FAKE_UI = `import fs from 'node:fs';
fs.writeFileSync('ui-lief-mit.json', JSON.stringify({ execPath: process.execPath, own: process.env.TWEAKABLE_DJ_TEST_OWN_NODE === '1', args: process.argv.slice(2) }));
`;
const ranWith = dir => JSON.parse(fs.readFileSync(path.join(dir, 'ui-lief-mit.json'), 'utf8'));
const startFile = (dir, args, env) => (WIN
  ? run('cmd.exe', ['/d', '/s', '/c', `""${path.join(dir, 'Tweakable DJ.cmd')}" ${args.join(' ')}"`], { cwd: dir, env })
  : run('sh', [path.join(dir, 'start.sh'), ...args], { cwd: dir, env }));
// Ein installiertes Node.js im PATH (das laufende)
const withNode = { PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, TWEAKABLE_DJ_LAUNCHER: undefined, TWEAKABLE_DJ_HIDDEN: undefined };

test('Startdatei: lädt beim ersten Start, nimmt dann das eigene Node.js; offline ein installiertes', { timeout: 300_000 }, async () => {
  const dir = program();
  fs.writeFileSync(path.join(dir, 'ui.mjs'), FAKE_UI);
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    // offline: installiertes Node.js
    const offline = await startFile(dir, [], { ...withNode, TWEAKABLE_DJ_NODE_MIRROR: 'http://127.0.0.1:1' });
    assert.match(offline.out, /Node\.js konnte nicht heruntergeladen werden/);
    assert.ok(!ranWith(dir).execPath.startsWith(path.join(dir, 'node')), offline.out);
    assert.equal(ranWith(dir).own, false);
    // online: lädt und nimmt das eigene
    fs.rmSync(path.join(dir, 'ui-lief-mit.json'));
    const online = await startFile(dir, [], { ...withNode, TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.match(online.out, /Node\.js wird einmalig heruntergeladen/);
    if (WIN) assert.equal(ranWith(dir).execPath.toLowerCase(), ownNode(dir).toLowerCase(), online.out);
    else assert.equal(ranWith(dir).own, true, online.out);
    // zweiter Start: kein neuer Download
    const again = await startFile(dir, [], { ...withNode, TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.doesNotMatch(again.out, /heruntergeladen/);
    assert.equal(srv.requests.length, 2);
    if (!WIN) assert.equal(ranWith(dir).own, true);
  } finally {
    await srv.close();
  }
});

test('start.sh --hidden: Download nötig → Systembenachrichtigung (hier: ui.log), Ausgaben in ui.log, dann das eigene Node.js', { skip: WIN && 'nur macOS/Linux', timeout: 300_000 }, async () => {
  const dir = program();
  fs.writeFileSync(path.join(dir, 'ui.mjs'), FAKE_UI);
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    // Ohne notify-send und osascript bleibt nur ui.log (PATH ohne Benachrichtigungsprogramme ist hier nicht nötig: melde
    // schreibt immer auch nach ui.log).
    const r = await startFile(dir, ['--hidden'], { ...withNode, TWEAKABLE_DJ_NODE_MIRROR: srv.url, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nicht/da' });
    assert.equal(r.code, 0, r.out);
    const log = fs.readFileSync(path.join(dir, 'ui.log'), 'utf8');
    assert.match(log, /Node\.js wird einmalig heruntergeladen \(ca\. \d+ MB\) … \/ Node\.js is being downloaded once/);
    assert.match(log, /ist bereit/);
    assert.equal(ranWith(dir).own, true);
  } finally {
    await srv.close();
  }
});

// --- Zweite Verknüpfung (--now): Download wird gemeldet, dann dj.mjs --now mit dem eigenen Node.js ---

const FAKE_DJ = `import fs from 'node:fs';
fs.writeFileSync('dj-lief-mit.json', JSON.stringify({ execPath: process.execPath, own: process.env.TWEAKABLE_DJ_TEST_OWN_NODE === '1', args: process.argv.slice(2) }));
`;
const djRanWith = dir => JSON.parse(fs.readFileSync(path.join(dir, 'dj-lief-mit.json'), 'utf8'));

test('start.sh --now: nötiger Download → Benachrichtigung „Node.js wird einmalig heruntergeladen …“, dann dj.mjs --now mit dem eigenen', { skip: WIN && 'nur macOS/Linux', timeout: 300_000 }, async () => {
  const dir = program();
  fs.writeFileSync(path.join(dir, 'dj.mjs'), FAKE_DJ);
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    const r = await startFile(dir, ['--now'], { ...withNode, TWEAKABLE_DJ_NODE_MIRROR: srv.url, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nicht/da' });
    assert.equal(r.code, 0, r.out);
    assert.match(fs.readFileSync(path.join(dir, 'ui.log'), 'utf8'), /Node\.js wird einmalig heruntergeladen/);
    assert.deepEqual([djRanWith(dir).own, djRanWith(dir).args], [true, ['--now']]);
  } finally {
    await srv.close();
  }
});

test('Tweakable DJ.cmd --now: eigenes Node.js vorhanden → ohne Fenster dj.mjs --now damit', { skip: !WIN && 'nur Windows', timeout: 300_000 }, async () => {
  const dir = program();
  fs.writeFileSync(path.join(dir, 'dj.mjs'), FAKE_DJ);
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    assert.equal((await getNode(dir, [], { TWEAKABLE_DJ_NODE_MIRROR: srv.url })).code, 0);
    const r = await startFile(dir, ['--now'], { ...withNode, TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /heruntergeladen/);
    assert.equal(djRanWith(dir).execPath.toLowerCase(), ownNode(dir).toLowerCase());
    assert.deepEqual(djRanWith(dir).args, ['--now']);
    assert.equal(srv.requests.length, 2, 'nur der eine Download vorher');
  } finally {
    await srv.close();
  }
});

// --- Zwei Aufrufe zugleich, Marker „läuft hier nicht“, Sonderzeichen im Ordner, Start ohne Fenster ---

test('Zwei Aufrufe zugleich: Der zweite wartet auf den ersten (Hinweis „wird gerade schon heruntergeladen“), ein Download, beide klappen', { timeout: 300_000 }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  srv.slowMs = 6000;
  try {
    const env = { TWEAKABLE_DJ_NODE_MIRROR: srv.url };
    const first = getNode(dir, [], env);
    // Der zweite startet, sobald der erste lädt.
    for (let i = 0; i < 300 && !srv.requests.some(r => r.endsWith(file)); i++) await new Promise(resolve => setTimeout(resolve, 100));
    const second = await getNode(dir, [], env);
    const one = await first;
    assert.equal(one.code, 0, one.out);
    assert.equal(second.code, 0, second.out);
    assert.match(second.out, /Node\.js wird gerade schon heruntergeladen/);
    assert.doesNotMatch(second.out, /Prüfsumme|Pruefsumme|konnte nicht/);
    assert.equal(srv.requests.length, 2, 'nur ein Download');
    assert.ok(fs.existsSync(ownNode(dir)));
    assert.deepEqual(leftovers(dir), []);
  } finally {
    await srv.close();
  }
});

test('Marker „läuft hier nicht“: Mit voriger eigener Version nimmt es die (Exit-Code 0, Hinweis, wie man es erneut versucht); ohne gibt es keins (2)', { timeout: 300_000 }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    const env = { TWEAKABLE_DJ_NODE_MIRROR: srv.url };
    assert.equal((await getNode(dir, [], env)).code, 0);
    // Eine spätere Version, die auf diesem Rechner nicht läuft (Marker wie nach einem Download, den „node -v“ nicht bestand)
    fs.writeFileSync(path.join(dir, 'node-version.txt'), '99.0.0\n');
    const later = file.replace(VERSION, '99.0.0').replace(/\.(zip|tar\.gz|tar\.xz)$/, '');
    fs.writeFileSync(path.join(dir, 'node', `not-runnable-${later}`), '');
    const r = await getNode(dir, [], env);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /99\.0\.0 (laeuft auf diesem PC|läuft auf diesem Rechner) nicht/);
    assert.match(r.out, /not-runnable-/);
    assert.equal((await getNode(dir, ['--check'], env)).code, 0, 'nichts zu tun: die vorige tut es');
    assert.equal(srv.requests.length, 2, 'kein Download der 99.0.0');
    // Startdatei: nimmt die vorige eigene Version, nicht ein installiertes Node.js
    fs.writeFileSync(path.join(dir, 'ui.mjs'), FAKE_UI);
    const started = await startFile(dir, [], { ...withNode, TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.ok(WIN ? ranWith(dir).execPath.toLowerCase() === ownNode(dir).toLowerCase() : ranWith(dir).own, started.out);
    // Ohne vorige Version: keins
    fs.rmSync(path.join(dir, 'node', 'current'), { recursive: true, force: true });
    assert.equal((await getNode(dir, [], env)).code, 2);
    assert.equal((await getNode(dir, ['--check'], env)).code, 2);
  } finally {
    await srv.close();
  }
});

// Nur Windows: ein PATH ohne installiertes Node.js
const noNodePath = () => [path.join(process.env.SystemRoot, 'System32'), process.env.SystemRoot].join(';');

test('Tweakable DJ.cmd: Ordner mit %, ^, ; und & im Namen – eigenes Node.js wird geladen und genommen', { skip: !WIN && 'nur Windows', timeout: 300_000 }, async () => {
  const dir = path.join(tmp, `prog ${++caseNo} 100% ^a;b & c`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['get-node.cmd', 'Tweakable DJ.cmd']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'node-version.txt'), `${VERSION}\n`);
  fs.writeFileSync(path.join(dir, 'ui.mjs'), FAKE_UI);
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    const r = await startFile(dir, [], { PATH: noNodePath(), TWEAKABLE_DJ_NODE_MIRROR: srv.url, TWEAKABLE_DJ_LAUNCHER: undefined, TWEAKABLE_DJ_HIDDEN: undefined });
    assert.match(r.out, /ist bereit/, r.out);
    assert.equal(ranWith(dir).execPath.toLowerCase(), ownNode(dir).toLowerCase(), r.out);
  } finally {
    await srv.close();
  }
});

test('get-node.cmd: node-version.txt wird geprüft, bevor sie in einen Befehl kommt', { skip: !WIN && 'nur Windows' }, async () => {
  const dir = program('24.21.0&md INJIZIERT');
  const r = await getNode(dir, ['--check']);
  assert.equal(r.code, 2, r.out);
  assert.ok(!fs.existsSync(path.join(dir, 'INJIZIERT')));
  assert.doesNotMatch(r.out, /24\.21\.0/);
});

test('get-node.cmd: Scheitert curl (nicht 404), lädt PowerShell', { skip: !WIN && 'nur Windows', timeout: 300_000 }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  srv.mode = 'nocurl';
  try {
    const r = await getNode(dir, [], { TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Zweiter Versuch mit PowerShell/);
    assert.ok(fs.existsSync(ownNode(dir)));
  } finally {
    await srv.close();
  }
});

test('Tweakable DJ.cmd --hidden: Fenster nur für einen nötigen Download, höchstens einmal am Tag, wenn ein brauchbares Node.js da ist', { skip: !WIN && 'nur Windows', timeout: 300_000 }, async () => {
  const dir = program();
  fs.writeFileSync(path.join(dir, 'ui.mjs'), FAKE_UI);
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  const base = { TWEAKABLE_DJ_TEST_START: '1', TWEAKABLE_DJ_LAUNCHER: undefined, TWEAKABLE_DJ_HIDDEN: undefined, TWEAKABLE_DJ_WINDOW: undefined };
  try {
    // Gar kein Node.js: mit Fenster laden
    const none = await startFile(dir, ['--hidden'], { ...base, PATH: noNodePath(), TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.match(none.out, /START window --hidden/, none.out);
    assert.equal(srv.requests.length, 0, 'ohne Fenster lädt es nichts');
    // Das Fenster (TWEAKABLE_DJ_WINDOW=download) lädt und startet dann wieder ohne Fenster
    const win = await startFile(dir, [], { ...base, PATH: noNodePath(), TWEAKABLE_DJ_NODE_MIRROR: srv.url, TWEAKABLE_DJ_WINDOW: 'download' });
    assert.match(win.out, /ist bereit/, win.out);
    assert.match(win.out, /START hidden/, win.out);
    assert.ok(!fs.existsSync(path.join(dir, 'ui-lief-mit.json')), 'die Oberfläche startet erst der Neustart ohne Fenster');
    // Danach ohne Fenster: eigenes Node.js, kein Fenster
    const hidden = await startFile(dir, ['--hidden'], { ...base, PATH: noNodePath(), TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.doesNotMatch(hidden.out, /START/, hidden.out);
    assert.equal(ranWith(dir).execPath.toLowerCase(), ownNode(dir).toLowerCase());
    // Neue festgelegte Version, offline: Der erste Start heute öffnet ein Fenster für den Versuch …
    fs.writeFileSync(path.join(dir, 'node-version.txt'), '99.0.0\n');
    const offline = { ...base, PATH: noNodePath(), TWEAKABLE_DJ_NODE_MIRROR: 'http://127.0.0.1:1' };
    fs.rmSync(path.join(dir, 'node', 'last-download'), { force: true });
    assert.match((await startFile(dir, ['--hidden'], offline)).out, /START window --hidden/);
    const tryWin = await startFile(dir, [], { ...offline, TWEAKABLE_DJ_WINDOW: 'download' });
    assert.match(tryWin.out, /konnte nicht heruntergeladen werden/, tryWin.out);
    assert.match(tryWin.out, /startet trotzdem/, tryWin.out);
    assert.match(tryWin.out, /START hidden/, tryWin.out);
    // … danach bleibt es heute ohne Fenster, mit der vorigen eigenen Version
    fs.rmSync(path.join(dir, 'ui-lief-mit.json'));
    const later = await startFile(dir, ['--hidden'], offline);
    assert.doesNotMatch(later.out, /START/, later.out);
    assert.equal(ranWith(dir).execPath.toLowerCase(), ownNode(dir).toLowerCase());
  } finally {
    await srv.close();
  }
});

test('get-node.sh: verwaiste Sperre (Prozess läuft nicht mehr) zählt nicht', { skip: WIN && 'nur macOS/Linux', timeout: 300_000 }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    fs.mkdirSync(path.join(dir, 'node', 'lock'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node', 'lock', 'pid'), '999999\n');
    const r = await getNode(dir, [], { TWEAKABLE_DJ_NODE_MIRROR: srv.url });
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(ownNode(dir)));
    assert.ok(!fs.existsSync(path.join(dir, 'node', 'lock')), 'Sperre wieder weg');
  } finally {
    await srv.close();
  }
});

// --- Kein Schreibrecht, kein passendes Node.js, Entpacken ohne tar.exe, Datum ---

// Ordner dir für den laufenden Nutzer schreibgeschützt machen (Windows: Verweigern-Eintrag für „Jeder“; sonst chmod).
function readOnly(dir, on) {
  if (WIN) {
    const r = spawnSync('icacls', on ? [dir, '/deny', '*S-1-1-0:(OI)(CI)(WD,AD)'] : [dir, '/remove:d', '*S-1-1-0'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } else fs.chmodSync(dir, on ? 0o555 : 0o755);
}
const ROOT_USER = !WIN && process.getuid?.() === 0;

test('Kein Schreibrecht (Ordner bzw. node/): sofort Meldung und Exit-Code 3 statt 20 Minuten zu warten; die Startdatei startet nicht', { skip: ROOT_USER && 'root darf alles', timeout: 300_000 }, async () => {
  const dir = program();
  fs.writeFileSync(path.join(dir, 'ui.mjs'), FAKE_UI);
  const noWrite = /kann in seinem Ordner nicht schreiben[\s\S]*can't write to its folder/;
  const check = async (what, sh = false) => {
    for (const args of [['--check'], []]) {
      const t = Date.now();
      const r = await getNode(dir, args, {}, sh);
      assert.equal(r.code, 3, `${what} ${args}: ${r.out}`);
      assert.match(r.out, noWrite, what);
      assert.ok(Date.now() - t < 30_000, `${what}: wartet nicht`);
    }
  };
  // 1) Der Ordner selbst ist schreibgeschützt (node/ lässt sich nicht anlegen), 2) node/ ist da, aber schreibgeschützt
  readOnly(dir, true);
  try {
    await check('Ordner');
  } finally {
    readOnly(dir, false);
  }
  const nodeDir = path.join(dir, 'node');
  fs.mkdirSync(nodeDir);
  readOnly(nodeDir, true);
  try {
    await check('node/');
    if (WIN) {
      const base = { TWEAKABLE_DJ_TEST_START: '1', TWEAKABLE_DJ_LAUNCHER: undefined, TWEAKABLE_DJ_HIDDEN: undefined, TWEAKABLE_DJ_WINDOW: undefined };
      // Ohne Fenster: Neustart mit Fenster, damit man die Meldung sieht; das Fenster zeigt sie und startet nichts.
      assert.match((await startFile(dir, ['--hidden'], { ...withNode, ...base })).out, /START window --hidden/);
      const win = await startFile(dir, [], { ...withNode, ...base, TWEAKABLE_DJ_WINDOW: '1' });
      assert.match(win.out, noWrite);
      assert.doesNotMatch(win.out, /START/);
    } else {
      const r = await startFile(dir, [], withNode);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, noWrite);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'ui-lief-mit.json')), 'Tweakable DJ startet nicht');
  } finally {
    readOnly(nodeDir, false);
  }
});

test('Exit-Code 2 mit Meldung: ungültige node-version.txt bzw. kein passendes System; Startdatei ohne Node.js sagt, dass es hier keins gibt', { timeout: 300_000 }, async () => {
  const dir = program('kaputt');
  const r = await getNode(dir, []);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /node-version\.txt fehlt oder ist ung(ü|ue)ltig/);
  if (SH) {
    const s = await getNode(program('24.21.0'), [], { TWEAKABLE_DJ_NODE_OS: 'FreeBSD', TWEAKABLE_DJ_NODE_ARCH: 'amd64' }, true);
    assert.equal(s.code, 2, s.out);
    assert.match(s.out, /Für dieses System \(FreeBSD, amd64\) gibt es kein passendes Node\.js/);
  }
  if (WIN) {
    fs.writeFileSync(path.join(dir, 'ui.mjs'), FAKE_UI);
    const start = await startFile(dir, [], { PATH: noNodePath(), TWEAKABLE_DJ_LAUNCHER: undefined, TWEAKABLE_DJ_HIDDEN: undefined, TWEAKABLE_DJ_WINDOW: undefined });
    assert.match(start.out, /Fuer dieses System kann Tweakable DJ kein eigenes Node\.js einrichten/, start.out);
    assert.doesNotMatch(start.out, /Internetverbindung/);
  }
});

test('get-node.cmd ohne tar.exe: PowerShell entpackt ebenso nur node.exe und LICENSE', { skip: !WIN && 'nur Windows', timeout: 300_000 }, async () => {
  const dir = program();
  const file = await archiveName(dir);
  const srv = await mirror(file, buildArchive(file));
  try {
    const r = await getNode(dir, [], { TWEAKABLE_DJ_NODE_MIRROR: srv.url, TWEAKABLE_DJ_NODE_NO_TAR: '1' });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'node', 'current')).sort(), ['LICENSE', 'node.exe']);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    await srv.close();
  }
});

test('„Heute schon versucht“ hängt am Datum: an einem neuen Tag ist der Download wieder nötig', { timeout: 300_000 }, async () => {
  const dir = program();
  // Download scheitert (offline), ein installiertes Node.js ist da
  assert.equal((await getNode(dir, [], { TWEAKABLE_DJ_TEST_DATE: 'Tag1' })).code, 1);
  const nodeInPath = { PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` };
  assert.equal((await getNode(dir, ['--check'], { ...nodeInPath, TWEAKABLE_DJ_TEST_DATE: 'Tag1' })).code, 0, 'heute schon versucht');
  assert.equal((await getNode(dir, ['--check'], { ...nodeInPath, TWEAKABLE_DJ_TEST_DATE: 'Tag2' })).code, 1, 'neuer Tag');
});
