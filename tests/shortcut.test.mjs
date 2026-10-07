// Unit-Tests für shortcut.mjs: Inhalte der Verknüpfung je Plattform (Quoting mit Leerzeichen, Umlauten, Apostroph, $ …),
// Erkennen des Stands und Anlegen/Entfernen mit simulierten Befehlen in Testordnern. Der echte Desktop bleibt immer
// unberührt: Jeder Test gibt einen eigenen Desktop-Ordner vor. Am Ende ein Durchlauf mit dem echten System (PowerShell,
// Dateien, sh), ebenfalls nur in einem Testordner.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLE_ID, createShortcut, DESKTOP_VAR, FILE_NAMES, LINUX_MARKER, linuxDesktopEntry, linuxEntryDir, macInfoPlist, macLauncher,
  macLauncherDir, removeShortcut, RUN_TIMEOUT, shortcutStatus, windowsCommand, windowsOwner, windowsShortcut,
} from '../shortcut.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
delete process.env[DESKTOP_VAR];

// Ordnernamen, die beim Quoting Ärger machen könnten
const TRICKY = [
  '/Users/Manuel Hayböck/Tweakable DJ',
  "/home/o'brien/it's mine",
  '/home/x/$HOME und $(rm -rf ~) `id`',
  '/home/x/back\\slash "quote" 100% & more; |pipe|',
  '/home/x/-dash/ä ö ü ß é 日本',
];

const temps = [];
const tmp = name => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `tdj shortcut ${name} ü-`));
  temps.push(d);
  return d;
};
after(() => {
  for (const d of temps) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

// Programmordner mit Logo-Dateien (wie im Release)
function programDir(name = 'prog') {
  const dir = tmp(name);
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const f of ['logo.ico', 'logo.icns', 'logo.png']) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(dir, 'assets', f));
  return dir;
}

let sh = null;
try {
  execFileSync('sh', ['-c', 'exit 0']);
  sh = 'sh';
} catch {
  // kein sh (z. B. Windows ohne Git): Tests mit sh entfallen
}

// --- macOS ---

test('macOS: Info.plist mit Kennung, Programm und Symbol', () => {
  const plist = macInfoPlist();
  for (const [key, value] of [['CFBundleName', 'Tweakable DJ'], ['CFBundleIdentifier', BUNDLE_ID], ['CFBundleExecutable', 'launcher'],
    ['CFBundleIconFile', 'logo'], ['CFBundlePackageType', 'APPL']]) {
    assert.match(plist, new RegExp(`<key>${key}</key>\\s*<string>${value.replace(/\./g, '\\.')}</string>`), key);
  }
  assert.equal(BUNDLE_ID, 'io.github.tweakable-dj.launcher');
  assert.match(plist, /<key>LSUIElement<\/key>\s*<true\/>/, 'kein Symbol im Dock');
  assert.match(plist, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!DOCTYPE plist/);
});

test('macOS: Startskript startet start.sh --hidden im Hintergrund, ohne Node.js "Tweakable DJ.command" im Terminal; Pfad gequotet', { skip: !sh && 'kein sh' }, () => {
  for (const dir of TRICKY) {
    const script = macLauncher(dir);
    assert.match(script, /^#!\/bin\/sh\n/);
    assert.equal(macLauncherDir(script), dir, dir);
    const file = path.join(tmp('sh'), 'launcher');
    fs.writeFileSync(file, script);
    execFileSync(sh, ['-n', file]); // Syntax
    // Statt cd, nohup und open: Argumente ausgeben – so muss genau der Pfad ankommen. Node.js da bzw. nicht da: true/false.
    const echo = script.replace(/^cd /m, "printf 'cd:%s|' ").replace(/^if command -v node .*; then$/m, 'if NODE; then')
      .replace('nohup /bin/sh ', "printf 'nohup:%s|' /bin/sh ").replace(' >/dev/null 2>&1 &', '')
      .replace('exec /usr/bin/open -a Terminal ', "printf '%s|' -a Terminal ");
    fs.writeFileSync(file, echo.replace('NODE', 'true'));
    assert.equal(execFileSync(sh, [file], { encoding: 'utf8' }), `cd:${dir}|nohup:/bin/sh|nohup:./start.sh|nohup:--hidden|`, dir);
    fs.writeFileSync(file, echo.replace('NODE', 'false'));
    assert.equal(execFileSync(sh, [file], { encoding: 'utf8' }), `cd:${dir}|-a|Terminal|${dir}/Tweakable DJ.command|`, dir);
  }
  // Startskript der früheren Fassung (nur Terminal): Ordner ebenfalls erkennbar
  assert.equal(macLauncherDir("#!/bin/sh\nexec /usr/bin/open -a Terminal '/a/b c/Tweakable DJ.command'\n"), '/a/b c');
  assert.equal(macLauncherDir('#!/bin/sh\necho fremd\n'), null);
});

// --- Linux ---

// Desktop-Eintrag lesen wie ein Desktop: Werte entmaskieren, dann Exec in Argumente zerlegen (Spezifikation).
const unescapeValue = v => v.replace(/\\(.)/g, (all, c) => ({ s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' })[c] ?? all);
function execArgs(exec) {
  const args = [];
  let i = 0;
  while (i < exec.length) {
    if (exec[i] === ' ') { i++; continue; }
    let arg = '';
    if (exec[i] === '"') {
      i++;
      while (exec[i] !== '"') {
        assert.ok(i < exec.length, `nicht geschlossen: ${exec}`);
        if (exec[i] === '\\') {
          assert.match(exec[i + 1], /["`$\\]/, `ungültige Maskierung in ${exec}`);
          arg += exec[i + 1];
          i += 2;
        } else {
          assert.doesNotMatch(exec[i], /[`$]/, `ungeschützt: ${exec}`);
          arg += exec[i++];
        }
      }
      i++;
    } else {
      while (i < exec.length && exec[i] !== ' ') arg += exec[i++];
    }
    args.push(arg.replace(/%%/g, '%'));
  }
  return args;
}
const field = (text, key) => text.split('\n').find(l => l.startsWith(`${key}=`))?.slice(key.length + 1);

test('Linux: Desktop-Eintrag startet start.sh --hidden ohne Terminal, Exec nach der Spezifikation gequotet, Symbol = logo.png', () => {
  for (const dir of TRICKY) {
    const text = linuxDesktopEntry(dir, { lang: 'de' });
    assert.match(text, /^\[Desktop Entry\]\nType=Application\n/);
    assert.equal(field(text, 'Name'), 'Tweakable DJ');
    assert.equal(field(text, 'Terminal'), 'false');
    assert.ok(text.split('\n').includes(LINUX_MARKER));
    assert.deepEqual(execArgs(unescapeValue(field(text, 'Exec'))), ['/bin/sh', `${dir}/start.sh`, '--hidden'], dir);
    assert.ok(!/%(?!%)/.test(field(text, 'Exec').replace(/%%/g, '')), `einzelnes % in Exec: ${field(text, 'Exec')}`);
    assert.equal(unescapeValue(field(text, 'Icon')), `${dir}/assets/logo.png`);
    assert.equal(unescapeValue(field(text, 'Path')), dir);
    assert.equal(linuxEntryDir(text), dir);
    assert.equal(unescapeValue(field(text, 'Comment')), `Startet Tweakable DJ for Spotify (Ordner: ${dir})`);
  }
  // $ und \ wie im Beispiel der Spezifikation: \\$ bzw. \\\\
  assert.equal(field(linuxDesktopEntry('/a/$b', { lang: 'en' }), 'Exec'), '/bin/sh "/a/\\\\$b/start.sh" --hidden');
  assert.equal(field(linuxDesktopEntry('/a\\b', { lang: 'en' }), 'Exec'), '/bin/sh "/a\\\\\\\\b/start.sh" --hidden');
  assert.equal(field(linuxDesktopEntry('/a/50%', { lang: 'en' }), 'Exec'), '/bin/sh "/a/50%%/start.sh" --hidden');
  assert.equal(field(linuxDesktopEntry('/x', { lang: 'en' }), 'Comment'), 'Starts Tweakable DJ for Spotify (folder: /x)');
});

// --- Windows ---

test('Windows: Ziel conhost --headless, Arbeitsordner, Symbol; Werte nur in der Umgebung, nie in der Befehlszeile', () => {
  const dir = 'C:\\Users\\Manuel Hayböck\\Documents\\it\'s $HOME & 100% `x`';
  const s = windowsShortcut(dir, { lang: 'de', env: { SystemRoot: 'C:\\Windows' } });
  assert.deepEqual(s, {
    target: 'C:\\Windows\\System32\\conhost.exe',
    arguments: `--headless "C:\\Windows\\System32\\cmd.exe" /d /c call "${dir}\\Tweakable DJ.cmd" --hidden`,
    workdir: dir, icon: `${dir}\\assets\\logo.ico,0`, description: `Startet Tweakable DJ for Spotify (Ordner: ${dir})`,
  });
  // Wem gehört eine .lnk? Neue Fassung, frühere Fassung (direkt "Tweakable DJ.cmd"), fremd
  assert.deepEqual(windowsOwner(s), { kind: 'open', dir, legacy: false });
  assert.deepEqual(windowsOwner({ target: `${dir}\\TWEAKABLE DJ.CMD`, arguments: '' }), { kind: 'open', dir, legacy: true });
  assert.equal(windowsOwner({ target: s.target, arguments: '--headless cmd.exe /c call "C:\\x\\anderes.cmd" --hidden' }), null);
  assert.equal(windowsOwner({ target: s.target, arguments: s.arguments.replace('--hidden', '--fremd') }), null);
  assert.equal(windowsOwner({ target: 'C:\\Windows\\notepad.exe', arguments: s.arguments }), null);
  const c = windowsCommand('write', { dir, desktop: 'D:\\Test Desktop ü', lang: 'de', env: { SystemRoot: 'C:\\Windows', PATH: 'x' } });
  assert.equal(c.file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(c.args.at(-2), '-EncodedCommand');
  assert.ok(!c.args.some(a => a.includes('Hayb') || a.includes('Desktop')), 'kein Pfad in der Befehlszeile');
  const script = Buffer.from(c.args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /GetFolderPath\('Desktop'\)/);
  assert.match(script, /WScript\.Shell/);
  assert.doesNotMatch(script, /Hayb|Tweakable DJ\.cmd/, 'Skript ist fest');
  assert.equal(c.env.TWEAKABLE_DJ_SC_ACTION, 'write');
  assert.equal(c.env.TWEAKABLE_DJ_SC_DESKTOP, 'D:\\Test Desktop ü');
  assert.equal(c.env.TWEAKABLE_DJ_SC_FILE, 'Tweakable DJ.lnk');
  assert.equal(c.env.TWEAKABLE_DJ_SC_TARGET, s.target);
  assert.equal(c.env.TWEAKABLE_DJ_SC_ARGUMENTS, s.arguments);
  assert.equal(c.env.TWEAKABLE_DJ_SC_WORKDIR, dir);
  assert.equal(c.env.TWEAKABLE_DJ_SC_ICON, s.icon);
  assert.equal(c.env.PATH, 'x', 'übrige Umgebung bleibt');
  assert.equal(windowsCommand('read', { dir, env: {} }).env.TWEAKABLE_DJ_SC_DESKTOP, '', 'ohne Vorgabe: Desktop des Benutzers');
});

// Simuliertes PowerShell: eine .lnk ist hier eine JSON-Datei mit target, workdir, icon, arguments.
function fakePowerShell(calls, { userDesktop } = {}) {
  return async (file, args, { env }) => {
    calls.push({ file, args, env });
    assert.match(file, /powershell\.exe$/);
    const desktop = env.TWEAKABLE_DJ_SC_DESKTOP || userDesktop;
    const lnk = path.join(desktop, env.TWEAKABLE_DJ_SC_FILE);
    if (env.TWEAKABLE_DJ_SC_ACTION === 'write') {
      fs.writeFileSync(lnk, JSON.stringify({
        target: env.TWEAKABLE_DJ_SC_TARGET, workdir: env.TWEAKABLE_DJ_SC_WORKDIR, icon: env.TWEAKABLE_DJ_SC_ICON, arguments: env.TWEAKABLE_DJ_SC_ARGUMENTS,
      }));
    }
    const exists = fs.existsSync(lnk);
    const data = exists ? JSON.parse(fs.readFileSync(lnk, 'utf8')) : {};
    return { code: 0, stdout: `\uFEFF${JSON.stringify({ desktop, exists, target: '', workdir: '', icon: '', arguments: '', ...data })}\r\n`, stderr: '' };
  };
}

test('Windows (simuliert): anlegen, Stand, anderer Ordner, ersetzen, fremde Datei bleibt, entfernen', async () => {
  const desktop = tmp('desktop');
  const calls = [];
  const run = fakePowerShell(calls, { userDesktop: desktop });
  const dirA = 'C:\\Programme\\Tweakable DJ ä';
  const dirB = "D:\\Manuel Hayböck\\it's $x";
  const base = { platform: 'win32', run, desktop: '', env: { SystemRoot: 'C:\\Windows' }, lang: 'de' };
  const lnk = path.join(desktop, 'Tweakable DJ.lnk');

  let s = await shortcutStatus({ ...base, dir: dirA });
  assert.deepEqual([s.supported, s.state, s.installed, s.matches, s.file], [true, 'missing', false, false, lnk]);
  assert.equal(calls.at(-1).env.TWEAKABLE_DJ_SC_DESKTOP, '', 'Desktop des Benutzers (GetFolderPath)');

  s = await createShortcut({ ...base, dir: dirA });
  assert.deepEqual([s.state, s.installed, s.matches], ['ok', true, true]);
  const call = dir => `--headless "C:\\Windows\\System32\\cmd.exe" /d /c call "${dir}\\Tweakable DJ.cmd" --hidden`;
  assert.deepEqual(JSON.parse(fs.readFileSync(lnk, 'utf8')), {
    target: 'C:\\Windows\\System32\\conhost.exe', workdir: dirA, icon: `${dirA}\\assets\\logo.ico,0`, arguments: call(dirA),
  });
  assert.equal(calls.filter(c => c.env.TWEAKABLE_DJ_SC_ACTION === 'write').at(-1).env.TWEAKABLE_DJ_SC_DESKTOP, desktop, 'schreibt in denselben Ordner');

  // Groß-/Kleinschreibung zählt unter Windows nicht
  assert.equal((await shortcutStatus({ ...base, dir: dirA.toUpperCase() })).state, 'ok');
  s = await shortcutStatus({ ...base, dir: dirB });
  assert.deepEqual([s.state, s.installed, s.matches, s.folder], ['otherFolder', true, false, dirA]);
  // Symbol anders (z. B. von Hand geändert) → veraltet
  fs.writeFileSync(lnk, JSON.stringify({ target: 'C:\\Windows\\System32\\conhost.exe', workdir: dirA, icon: 'C:\\x.ico,0', arguments: call(dirA) }));
  assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'outdated');
  // Frühere Fassung (mit Fenster: Ziel direkt "Tweakable DJ.cmd") für diesen Ordner → veraltet, für einen anderen → anderer Ordner
  fs.writeFileSync(lnk, JSON.stringify({ target: `${dirA}\\Tweakable DJ.cmd`, workdir: dirA, icon: `${dirA}\\assets\\logo.ico,0`, arguments: '' }));
  assert.deepEqual([(await shortcutStatus({ ...base, dir: dirA })).state, (await shortcutStatus({ ...base, dir: dirB })).state], ['outdated', 'otherFolder']);
  assert.equal((await createShortcut({ ...base, dir: dirA })).state, 'ok', 'erneuert');

  s = await createShortcut({ ...base, dir: dirB });
  assert.equal(s.state, 'ok');
  assert.equal(JSON.parse(fs.readFileSync(lnk, 'utf8')).arguments, call(dirB));

  s = await removeShortcut({ ...base, dir: dirA });
  assert.deepEqual([s.state, s.installed, fs.existsSync(lnk)], ['missing', false, false], 'eigene Verknüpfung, egal für welchen Ordner');
  assert.equal((await removeShortcut({ ...base, dir: dirA })).state, 'missing', 'nichts da: nichts zu tun');

  // Fremde Verknüpfung gleichen Namens: weder ersetzen noch entfernen
  const foreign = JSON.stringify({ target: 'C:\\Windows\\notepad.exe', workdir: '', icon: '', arguments: 'x' });
  fs.writeFileSync(lnk, foreign);
  s = await shortcutStatus({ ...base, dir: dirA });
  assert.deepEqual([s.state, s.installed, s.matches], ['foreign', false, false]);
  await assert.rejects(createShortcut({ ...base, dir: dirA }), { message: `Auf dem Desktop gibt es schon „${lnk}“, aber nicht von Tweakable DJ – das bleibt, wie es ist. Benenne es um, dann klappt es.` });
  await assert.rejects(removeShortcut({ ...base, dir: dirA, lang: 'en' }), /isn’t from Tweakable DJ/);
  assert.equal(fs.readFileSync(lnk, 'utf8'), foreign, 'unverändert');
  assert.ok(calls.every(c => !c.args.some(a => a.includes('Hayb'))), 'Pfade nie in der Befehlszeile');
});

test('Windows (simuliert): Fehler von PowerShell mit verständlicher Meldung, kein Desktop', async () => {
  const run = async () => ({ code: 1, stdout: '', stderr: 'Zugriff verweigert\r\nZeile 2' });
  const s = await shortcutStatus({ platform: 'win32', run, dir: 'C:\\x', lang: 'de' });
  assert.deepEqual([s.supported, s.state, s.message], [true, null, 'PowerShell meldet: Zugriff verweigert']);
  await assert.rejects(createShortcut({ platform: 'win32', run, dir: 'C:\\x', lang: 'en' }), { message: 'PowerShell reports: Zugriff verweigert' });
  const missing = async () => ({ code: 'ENOENT', stdout: '', stderr: '' });
  assert.equal((await shortcutStatus({ platform: 'win32', run: missing, dir: 'C:\\x', lang: 'de' })).message, 'PowerShell meldet: Fehlercode ENOENT');
  // Zu langsam (z. B. kalter PC): nach RUN_TIMEOUT abgebrochen, verständliche Meldung statt eines Fehlercodes
  const slow = async () => ({ code: 'timeout', stdout: '{"desk', stderr: '' });
  assert.equal(RUN_TIMEOUT, 90_000);
  assert.equal((await shortcutStatus({ platform: 'win32', run: slow, dir: 'C:\\x', lang: 'de' })).message,
    'PowerShell hat nicht rechtzeitig geantwortet (nach 90 Sekunden abgebrochen). Bitte noch einmal versuchen.');
  await assert.rejects(createShortcut({ platform: 'win32', run: slow, dir: 'C:\\x', lang: 'en' }),
    { message: 'PowerShell didn’t respond in time (stopped after 90 seconds). Please try again.' });
  const empty = async () => ({ code: 0, stdout: JSON.stringify({ desktop: '', exists: false }), stderr: '' });
  assert.equal((await shortcutStatus({ platform: 'win32', run: empty, dir: 'C:\\x', lang: 'fr' })).message, 'Aucun dossier Bureau trouvé.');
});

// --- macOS und Linux mit echten Dateien in Testordnern ---

test('macOS (Dateien): App-Paket anlegen, Stand, anderer Ordner, fremdes Paket bleibt, entfernen', async () => {
  const desktop = tmp('mac-desktop');
  const dirA = programDir("prog it's $A");
  const dirB = programDir('prog B');
  const base = { platform: 'darwin', desktop, lang: 'de' };
  const app = path.join(desktop, 'Tweakable DJ.app');
  assert.equal(FILE_NAMES.darwin, 'Tweakable DJ.app');

  assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'missing');
  let s = await createShortcut({ ...base, dir: dirA });
  assert.deepEqual([s.state, s.matches, s.file], ['ok', true, app]);
  const contents = path.join(app, 'Contents');
  assert.equal(fs.readFileSync(path.join(contents, 'Info.plist'), 'utf8'), macInfoPlist());
  assert.equal(fs.readFileSync(path.join(contents, 'MacOS', 'launcher'), 'utf8'), macLauncher(dirA));
  assert.ok(fs.readFileSync(path.join(contents, 'Resources', 'logo.icns')).equals(fs.readFileSync(path.join(ROOT, 'assets', 'logo.icns'))));
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(contents, 'MacOS', 'launcher')).mode & 0o777, 0o755);
  if (sh) execFileSync(sh, ['-n', path.join(contents, 'MacOS', 'launcher')]);

  s = await shortcutStatus({ ...base, dir: dirB });
  assert.deepEqual([s.state, s.folder], ['otherFolder', dirA]);
  fs.writeFileSync(path.join(contents, 'Extra.txt'), 'alt');
  s = await createShortcut({ ...base, dir: dirB });
  assert.equal(s.state, 'ok');
  assert.ok(!fs.existsSync(path.join(contents, 'Extra.txt')), 'altes Paket ganz ersetzt');
  // Symbol fehlt im Paket → veraltet
  fs.rmSync(path.join(contents, 'Resources', 'logo.icns'));
  assert.equal((await shortcutStatus({ ...base, dir: dirB })).state, 'outdated');

  s = await removeShortcut({ ...base, dir: dirA });
  assert.deepEqual([s.state, fs.existsSync(app)], ['missing', false]);

  // Fremdes Programm gleichen Namens (andere Kennung) bzw. Datei statt Ordner: bleibt
  fs.mkdirSync(path.join(contents), { recursive: true });
  const foreignPlist = macInfoPlist().replace(BUNDLE_ID, 'com.example.other');
  fs.writeFileSync(path.join(contents, 'Info.plist'), foreignPlist);
  assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'foreign');
  await assert.rejects(createShortcut({ ...base, dir: dirA }), /nicht von Tweakable DJ/);
  await assert.rejects(removeShortcut({ ...base, dir: dirA }), /nicht von Tweakable DJ/);
  assert.equal(fs.readFileSync(path.join(contents, 'Info.plist'), 'utf8'), foreignPlist);
  fs.rmSync(app, { recursive: true });
  fs.writeFileSync(app, 'Datei');
  assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'foreign');
  await assert.rejects(removeShortcut({ ...base, dir: dirA }));
  assert.equal(fs.readFileSync(app, 'utf8'), 'Datei');

  // Ohne Desktop-Ordner: verständliche Meldung
  const s2 = await shortcutStatus({ platform: 'darwin', home: path.join(desktop, 'gibts-nicht'), dir: dirA, lang: 'en' });
  assert.deepEqual([s2.supported, s2.state, s2.message], [true, null, 'No desktop folder found.']);
});

test('Linux (Dateien): Desktop-Ordner über xdg-user-dir bzw. ~/Desktop, anlegen, ausführbar, gio, fremde Datei bleibt', async () => {
  const home = tmp('home');
  const xdg = path.join(home, 'Schreibtisch');
  fs.mkdirSync(xdg);
  const dirA = programDir('prog $(id) ü');
  const dirB = programDir('prog B');
  const calls = [];
  const run = async (file, args) => {
    calls.push([file, ...args]);
    if (file === 'xdg-user-dir') return { code: 0, stdout: `${xdg}\n`, stderr: '' };
    if (file === 'gio') return { code: 'ENOENT', stdout: '', stderr: '' }; // gio fehlt: egal
    throw new Error(`unerwartet: ${file}`);
  };
  const base = { platform: 'linux', home, run, desktop: '', lang: 'de' };
  const file = path.join(xdg, 'tweakable-dj.desktop');

  assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'missing');
  let s = await createShortcut({ ...base, dir: dirA });
  assert.deepEqual([s.state, s.matches, s.file], ['ok', true, file]);
  assert.equal(fs.readFileSync(file, 'utf8'), linuxDesktopEntry(dirA, { lang: 'de' }));
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o755);
  assert.deepEqual(calls.find(c => c[0] === 'gio'), ['gio', 'set', file, 'metadata::trusted', 'true']);
  assert.deepEqual(fs.readdirSync(xdg), ['tweakable-dj.desktop'], 'keine Zwischendatei übrig');

  assert.deepEqual([(await shortcutStatus({ ...base, dir: dirB })).state, (await shortcutStatus({ ...base, dir: dirB })).folder], ['otherFolder', dirA]);
  // Andere Sprache der Oberfläche ändert nur den Kommentar: Verknüpfung bleibt in Ordnung
  assert.equal((await shortcutStatus({ ...base, dir: dirA, lang: 'en' })).state, 'ok');
  // Von Hand geändert (z. B. Exec) bzw. nicht mehr ausführbar → veraltet
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace('Terminal=false', 'Terminal=true'), { mode: 0o755 });
  assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'outdated');
  fs.writeFileSync(file, text);
  if (process.platform !== 'win32') {
    fs.chmodSync(file, 0o644);
    assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'outdated');
    fs.chmodSync(file, 0o755);
  }
  assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'ok');
  assert.equal((await createShortcut({ ...base, dir: dirB })).state, 'ok');
  assert.equal(linuxEntryDir(fs.readFileSync(file, 'utf8')), dirB);
  s = await removeShortcut({ ...base, dir: dirA });
  assert.deepEqual([s.state, fs.existsSync(file)], ['missing', false]);

  // Fremde Datei gleichen Namens bleibt
  const foreign = '[Desktop Entry]\nType=Application\nName=Etwas anderes\nExec=/usr/bin/true\n';
  fs.writeFileSync(file, foreign);
  assert.equal((await shortcutStatus({ ...base, dir: dirA })).state, 'foreign');
  await assert.rejects(createShortcut({ ...base, dir: dirA }), /nicht von Tweakable DJ/);
  await assert.rejects(removeShortcut({ ...base, dir: dirA }), /nicht von Tweakable DJ/);
  assert.equal(fs.readFileSync(file, 'utf8'), foreign);
  fs.rmSync(file);

  // Ohne xdg-user-dir bzw. wenn es nur den persönlichen Ordner nennt: ~/Desktop
  const plain = path.join(home, 'Desktop');
  fs.mkdirSync(plain);
  const noXdg = async f => (f === 'xdg-user-dir' ? { code: 'ENOENT', stdout: '', stderr: '' } : { code: 0, stdout: '', stderr: '' });
  assert.equal((await shortcutStatus({ ...base, run: noXdg, dir: dirA })).file, path.join(plain, 'tweakable-dj.desktop'));
  const homeOnly = async f => (f === 'xdg-user-dir' ? { code: 0, stdout: `${home}\n`, stderr: '' } : { code: 0, stdout: '', stderr: '' });
  assert.equal((await shortcutStatus({ ...base, run: homeOnly, dir: dirA })).file, path.join(plain, 'tweakable-dj.desktop'));
  fs.rmSync(plain, { recursive: true });
  const none = await shortcutStatus({ ...base, run: homeOnly, dir: dirA });
  assert.deepEqual([none.supported, none.message], [true, 'Kein Desktop-Ordner gefunden.']);
  await assert.rejects(createShortcut({ ...base, run: homeOnly, dir: dirA, lang: 'es' }), { message: 'No se encontró la carpeta del escritorio.' });
});

test('Nicht unterstützte Plattform und Zeilenumbruch im Pfad', async () => {
  const s = await shortcutStatus({ platform: 'aix', dir: '/x', lang: 'de' });
  assert.deepEqual([s.supported, s.state, s.message], [false, null, 'Eine Verknüpfung auf dem Desktop gibt es nur unter Windows, macOS und Linux.']);
  await assert.rejects(createShortcut({ platform: 'aix', dir: '/x', lang: 'en' }), { message: 'A desktop shortcut is only available on Windows, macOS and Linux.' });
  await assert.rejects(removeShortcut({ platform: 'aix', dir: '/x', lang: 'en' }), /only available/);
  const desktop = tmp('nl');
  await assert.rejects(createShortcut({ platform: 'linux', desktop, dir: '/a\nb', lang: 'de' }), /Zeilenumbruch/);
  assert.deepEqual(fs.readdirSync(desktop), []);
});

test('TWEAKABLE_DJ_DESKTOP gibt den Desktop-Ordner vor (für Tests der Oberfläche)', async () => {
  const desktop = tmp('env');
  const s = await shortcutStatus({ platform: 'linux', env: { [DESKTOP_VAR]: desktop }, run: async () => assert.fail('kein Befehl'), dir: '/x' });
  assert.equal(s.file, path.join(desktop, 'tweakable-dj.desktop'));
});

// --- Echtes System (nur in Testordnern) ---

// PowerShell braucht auf einem kalten Windows-Rechner (z. B. bei GitHub) je Aufruf manchmal über 30 s: Zeit für alle Aufrufe
// dieses Tests, jeweils bis RUN_TIMEOUT.
test('Echtes System: anlegen, Stand, entfernen – Programmordner mit Leerzeichen, Umlaut und Apostroph', { timeout: 8 * RUN_TIMEOUT }, async () => {
  const desktop = tmp('echt-desktop');
  const dir = programDir("echt Hayböck's");
  const opts = { desktop, dir, lang: 'de' };
  const s = await createShortcut(opts);
  assert.deepEqual([s.state, s.matches], ['ok', true]);
  assert.equal(path.dirname(s.file), desktop);
  assert.equal((await shortcutStatus(opts)).state, 'ok');
  assert.equal((await shortcutStatus({ ...opts, dir: path.join(dir, 'anders') })).state, 'otherFolder');
  if (process.platform === 'win32') {
    // .lnk mit WScript.Shell zurücklesen (unabhängig von shortcut.mjs)
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = "$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; $l = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); [Console]::Out.Write($l.TargetPath + '|' + $l.Arguments + '|' + $l.WorkingDirectory + '|' + $l.IconLocation)";
    const out = execFileSync(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { env: { ...process.env, LNK: s.file }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const sys = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    assert.equal(out.toLowerCase(), `${sys}\\conhost.exe|--headless "${sys}\\cmd.exe" /d /c call "${dir}\\Tweakable DJ.cmd" --hidden|${dir}|${dir}\\assets\\logo.ico,0`.toLowerCase());
  } else if (process.platform === 'linux') {
    assert.equal(fs.statSync(s.file).mode & 0o777, 0o755);
  }
  const r = await removeShortcut(opts);
  assert.equal(r.state, 'missing');
  assert.deepEqual(fs.readdirSync(desktop), []);
});
