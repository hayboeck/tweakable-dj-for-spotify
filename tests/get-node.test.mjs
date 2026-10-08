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
    // Nie nodejs.org: ohne eigene Adresse ein Port, an dem niemand antwortet.
    const fullEnv = { ...process.env, TWEAKABLE_DJ_NODE_MIRROR: 'http://127.0.0.1:1', ...env };
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
    const script = `#!/bin/sh\nif [ "$1" = "-v" ]; then echo '${prints}'; exit 0; fi\nTDJ_OWN_NODE=1 exec '${process.execPath}' "$@"\n`;
    fs.writeFileSync(path.join(root, 'bin', 'node'), script, { mode: 0o755 });
    const r = spawnSync('tar', [file.endsWith('.xz') ? '-cJf' : '-czf', out, '-C', pack, name]);
    assert.equal(r.status, 0, String(r.stderr));
  }
  return fs.readFileSync(out);
}

// Server wie nodejs.org/dist: /v<Version>/SHASUMS256.txt und /v<Version>/<Archiv>. mode: 'ok', 'badsum' (falsche Prüfsumme),
// 'abort' (Verbindung nach der Hälfte weg), 'missing' (404). requests: angefragte Pfade.
async function mirror(file, data, version = VERSION) {
  const s = { mode: 'ok', requests: [] };
  const server = http.createServer((req, res) => {
    s.requests.push(req.url);
    if (s.mode === 'missing') return res.writeHead(404).end();
    if (req.url === `/v${version}/SHASUMS256.txt`) {
      const hash = s.mode === 'badsum' ? sha('etwas anderes') : sha(data);
      return res.end(`${sha('x')}  node-v${version}-aix-ppc64.tar.gz\n${hash}  ${file}\n${sha('y')}  win-x64/node.exe\n`);
    }
    if (req.url !== `/v${version}/${file}`) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Length': data.length });
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
    assert.equal((await getNode(dir, ['--check'], env)).code, 1);
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
  assert.equal(msg.out.trim(), 'Node.js wird einmalig heruntergeladen (ca. 55 MB) … / Node.js is being downloaded once (about 55 MB) …');
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
fs.writeFileSync('ui-lief-mit.json', JSON.stringify({ execPath: process.execPath, own: process.env.TDJ_OWN_NODE === '1', args: process.argv.slice(2) }));
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
