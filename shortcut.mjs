// Verknüpfung auf dem Desktop: startet Tweakable DJ per Doppelklick, mit dem Logo als Symbol. Genau eine, immer unter
// demselben Namen; erneutes Anlegen ersetzt sie (z. B. nach dem Verschieben des Ordners).
//   Windows: "Tweakable DJ.lnk" auf dem Desktop (auch bei Umleitung nach OneDrive: [Environment]::GetFolderPath('Desktop')),
//            angelegt mit PowerShell und WScript.Shell. Das Skript ist fest (-EncodedCommand), Pfade und Texte kommen nur
//            über Umgebungsvariablen – Leerzeichen, Umlaute, Apostrophe und $ kommen unverändert an.
//            Ziel "Tweakable DJ.cmd", Arbeitsordner = Programmordner, Symbol assets\logo.ico.
//   macOS:   kleines Programm "Tweakable DJ.app" in ~/Desktop: Info.plist (Kennung io.github.tweakable-dj.launcher),
//            Resources/logo.icns und Contents/MacOS/launcher (sh), das "Tweakable DJ.command" im Terminal öffnet.
//   Linux:   "tweakable-dj.desktop" im Desktop-Ordner (xdg-user-dir DESKTOP, sonst ~/Desktop): startet start.sh in einem
//            Terminal, Symbol assets/logo.png; ausführbar und – wo es gio gibt – als vertrauenswürdig markiert.
// Entfernt bzw. ersetzt wird nur die eigene Verknüpfung (Windows: Ziel heißt "Tweakable DJ.cmd", macOS: Kennung in der
// Info.plist, Linux: Zeile X-Tweakable-DJ=launcher). Eine fremde Datei gleichen Namens bleibt immer unangetastet.
// Die Inhalte (plist, Skript, Desktop-Eintrag) sind reine Funktionen; Befehle, Pfade und Plattform lassen sich für Tests
// übergeben (wie in schedule.mjs).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { HERE } from './config.mjs';
import { resolveLang, t, tError } from './i18n.mjs';

export const SHORTCUT_NAME = 'Tweakable DJ';
export const BUNDLE_ID = 'io.github.tweakable-dj.launcher';
export const LINUX_MARKER = 'X-Tweakable-DJ=launcher';
// Dateiname der Verknüpfung je Plattform
export const FILE_NAMES = { win32: `${SHORTCUT_NAME}.lnk`, darwin: `${SHORTCUT_NAME}.app`, linux: 'tweakable-dj.desktop' };
// Nur für Tests: anderer Desktop-Ordner (der echte Desktop bleibt dann unberührt).
export const DESKTOP_VAR = 'TWEAKABLE_DJ_DESKTOP';

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Für sh in einfachen Anführungszeichen: ' wird zu '\''
const shell = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

// --- macOS: kleines App-Paket ---

export function macInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${xml(SHORTCUT_NAME)}</string>
  <key>CFBundleDisplayName</key>
  <string>${xml(SHORTCUT_NAME)}</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIconFile</key>
  <string>logo</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
</dict>
</plist>
`;
}

// Startet "Tweakable DJ.command" im Terminal (wie ein Doppelklick darauf im Finder).
export function macLauncher(dir) {
  return `#!/bin/sh
# Angelegt von Tweakable DJ (Einstellungen → Verknüpfung): öffnet "Tweakable DJ.command" im Terminal.
exec /usr/bin/open -a Terminal ${shell(path.posix.join(dir, 'Tweakable DJ.command'))}
`;
}

// Programmordner aus dem Startskript zurücklesen (für „zeigt auf einen anderen Ordner“), null = nicht erkennbar.
export function macLauncherDir(script) {
  const m = /^exec \/usr\/bin\/open -a Terminal '((?:[^']|'\\'')*)'$/m.exec(script ?? '');
  return m ? path.posix.dirname(m[1].replace(/'\\''/g, "'")) : null;
}

// --- Linux: Desktop-Eintrag (freedesktop.org Desktop Entry Specification) ---

// Werte vom Typ string: \ als \\, Zeilenumbrüche usw. maskiert.
const desktopValue = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
// Ein Argument in Exec: in "…", darin " ` $ \ mit \ davor; % (Platzhalter von Exec) als %%. desktopValue verdoppelt danach
// jeden \ noch einmal – so verlangt es die Spezifikation (aus einem $ wird also \\$, aus einem \ wird \\\\).
const execArg = s => `"${String(s).replace(/["`$\\]/g, c => `\\${c}`).replace(/%/g, '%%')}"`;

export function linuxDesktopEntry(dir, { lang } = {}) {
  return `[Desktop Entry]
Type=Application
Version=1.0
Name=${SHORTCUT_NAME}
Comment=${desktopValue(t(resolveLang(lang), 'shortcut.description', { dir }))}
Exec=${desktopValue(`/bin/sh ${execArg(path.posix.join(dir, 'start.sh'))}`)}
Path=${desktopValue(dir)}
Icon=${desktopValue(path.posix.join(dir, 'assets', 'logo.png'))}
Terminal=true
Categories=AudioVideo;Audio;
${LINUX_MARKER}
`;
}

// Desktop-Eintrag ohne die Zeile Comment= (zum Vergleichen unabhängig von der Sprache)
const withoutComment = text => String(text ?? '').split(/\r?\n/).filter(l => !l.startsWith('Comment=')).join('\n');

// Programmordner aus einem Desktop-Eintrag (Zeile Path=), null = nicht erkennbar.
export function linuxEntryDir(text) {
  const m = /^Path=(.*)$/m.exec(text ?? '');
  if (!m) return null;
  return m[1].replace(/\\(.)/g, (all, c) => ({ s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' })[c] ?? all);
}

// --- Windows: .lnk über PowerShell ---

const PS_PREFIX = 'TWEAKABLE_DJ_SC_';
// Festes Skript: liest alles aus der Umgebung. ACTION=write legt die Verknüpfung an (bzw. überschreibt sie), danach – und
// bei ACTION=read nur das – kommt der Stand als JSON: desktop (Ordner), exists, target, workdir, icon, arguments.
const PS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$ProgressPreference = 'SilentlyContinue'",
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false',
  'try {',
  `  $desktop = $env:${PS_PREFIX}DESKTOP`,
  "  if (-not $desktop) { $desktop = [Environment]::GetFolderPath('Desktop') }",
  "  $result = [ordered]@{ desktop = [string]$desktop; exists = $false; target = ''; workdir = ''; icon = ''; arguments = '' }",
  '  if ($desktop) {',
  `    $file = [System.IO.Path]::Combine($desktop, $env:${PS_PREFIX}FILE)`,
  '    $shell = New-Object -ComObject WScript.Shell',
  `    if ($env:${PS_PREFIX}ACTION -eq 'write') {`,
  '      $link = $shell.CreateShortcut($file)',
  `      $link.TargetPath = $env:${PS_PREFIX}TARGET`,
  "      $link.Arguments = ''",
  `      $link.WorkingDirectory = $env:${PS_PREFIX}WORKDIR`,
  `      $link.IconLocation = $env:${PS_PREFIX}ICON`,
  `      $link.Description = $env:${PS_PREFIX}DESCRIPTION`,
  '      $link.WindowStyle = 1',
  '      $link.Save()',
  '    }',
  '    if ([System.IO.File]::Exists($file)) {',
  '      $link = $shell.CreateShortcut($file)',
  '      $result.exists = $true',
  '      $result.target = [string]$link.TargetPath',
  '      $result.workdir = [string]$link.WorkingDirectory',
  '      $result.icon = [string]$link.IconLocation',
  '      $result.arguments = [string]$link.Arguments',
  '    }',
  '  }',
  '  [Console]::Out.Write(($result | ConvertTo-Json -Compress))',
  '} catch {',
  '  [Console]::Error.WriteLine($_.Exception.Message)',
  '  exit 1',
  '}',
].join('\n');

// Was die Verknüpfung unter Windows enthalten soll (Pfade im Programmordner dir).
export function windowsShortcut(dir, { lang } = {}) {
  return {
    target: path.win32.join(dir, 'Tweakable DJ.cmd'),
    workdir: path.win32.normalize(dir),
    icon: `${path.win32.join(dir, 'assets', 'logo.ico')},0`,
    description: t(resolveLang(lang), 'shortcut.description', { dir }),
  };
}

// Befehl für PowerShell: { file, args, env }. action: 'read' oder 'write'; desktop: fester Ordner oder '' (= Desktop des
// Benutzers). Die Werte stehen nur in der Umgebung, nie in der Befehlszeile.
export function windowsCommand(action, { dir, desktop = '', lang, env = process.env } = {}) {
  const root = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
  const s = windowsShortcut(dir, { lang });
  return {
    file: `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS_SCRIPT, 'utf16le').toString('base64')],
    env: {
      ...env, [`${PS_PREFIX}ACTION`]: action, [`${PS_PREFIX}DESKTOP`]: desktop, [`${PS_PREFIX}FILE`]: FILE_NAMES.win32,
      [`${PS_PREFIX}TARGET`]: s.target, [`${PS_PREFIX}WORKDIR`]: s.workdir, [`${PS_PREFIX}ICON`]: s.icon, [`${PS_PREFIX}DESCRIPTION`]: s.description,
    },
  };
}

// Windows vergleicht Pfade ohne Groß-/Kleinschreibung.
const samePath = (a, b) => path.win32.normalize(String(a ?? '')).replace(/\\+$/, '').toLowerCase()
  === path.win32.normalize(String(b ?? '')).replace(/\\+$/, '').toLowerCase();

// --- Aufrufe ans System ---

// Zeitlimit für einen Aufruf: PowerShell mit WScript.Shell braucht auf einem frisch gestarteten bzw. langsamen PC (und auf
// den Test-Rechnern von GitHub) manchmal deutlich über 30 Sekunden.
export const RUN_TIMEOUT = 90_000;

// Programm ohne Shell starten → { code, stdout, stderr } (code: Exit-Code bzw. z. B. 'ENOENT', 'timeout' = nach RUN_TIMEOUT
// abgebrochen; 0 = in Ordnung).
function runFile(file, args, { env } = {}) {
  return new Promise(resolve => {
    execFile(file, args, { env, encoding: 'utf8', windowsHide: true, timeout: RUN_TIMEOUT, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.killed ? 'timeout' : err.code ?? -1) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

const firstLine = s => String(s ?? '').split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? '';
// Zeitüberschreitung: verständliche Meldung statt eines Fehlercodes (die halbe Ausgabe davor hilft niemandem).
const failure = (lang, who, r) => (r.code === 'timeout'
  ? tError(lang, 'shortcut.timeout', { who, seconds: RUN_TIMEOUT / 1000 })
  : tError(lang, 'shortcut.reports', { who, message: firstLine(r.stderr) || firstLine(r.stdout) || t(lang, 'shortcut.exitCode', { code: r.code }) }));

// Optionen: dir = Programmordner, platform, desktop = fester Desktop-Ordner (Tests; sonst TWEAKABLE_DJ_DESKTOP bzw. der
// des Systems), home, env, run(file, args, { env }) für die Befehle, lang.
function options({ dir = HERE, platform = process.platform, env = process.env, desktop = env[DESKTOP_VAR] || '', home = os.homedir(),
  run = runFile, lang } = {}) {
  // Windows-Pfade mit path.win32 (unter Windows dasselbe wie path.resolve; so auch in den simulierten Tests auf Linux/macOS)
  return { dir: platform === 'win32' ? path.win32.resolve(dir) : path.resolve(dir), platform, env, desktop, home, run, lang: resolveLang(lang) };
}

const isDir = p => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
// Ausführbar? Windows kennt kein Ausführbar-Bit (zählt dort als ja; betrifft nur Tests der macOS- und Linux-Fassung).
const executable = p => {
  try {
    return process.platform === 'win32' || (fs.statSync(p).mode & 0o111) !== 0;
  } catch {
    return false;
  }
};
const readText = p => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

// Je Plattform: read(o) → { desktop, file, entry } (entry = null, wenn es keine Datei dieses Namens gibt), check(entry, o)
// → Stand, write(o, current), remove(o, current). Exportiert für Tests.
export const PLATFORMS = {
  win32: {
    async call(o, action) {
      const c = windowsCommand(action, o);
      const r = await o.run(c.file, c.args, { env: c.env });
      if (r.code !== 0) throw failure(o.lang, 'PowerShell', r);
      let data;
      try {
        data = JSON.parse(String(r.stdout).replace(/^﻿/, '').trim());
      } catch {
        throw failure(o.lang, 'PowerShell', { ...r, stderr: `JSON: ${firstLine(r.stdout)}` });
      }
      if (!data.desktop) throw tError(o.lang, 'shortcut.noDesktop');
      // path.join: unter Windows dasselbe wie path.win32.join; so laufen auch die simulierten Tests auf macOS und Linux.
      return { desktop: data.desktop, file: path.join(data.desktop, FILE_NAMES.win32), entry: data.exists ? data : null };
    },
    read(o) {
      return this.call(o, 'read');
    },
    // Eigen = Ziel ist eine "Tweakable DJ.cmd" (egal in welchem Ordner).
    check(entry, o) {
      if (path.win32.basename(entry.target).toLowerCase() !== 'tweakable dj.cmd') return { own: false, state: 'foreign', dir: null };
      const want = windowsShortcut(o.dir, o);
      const dir = path.win32.dirname(entry.target);
      if (!samePath(entry.target, want.target)) return { own: true, state: 'otherFolder', dir };
      const same = samePath(entry.workdir, want.workdir) && samePath(entry.icon, want.icon) && !entry.arguments;
      return { own: true, state: same ? 'ok' : 'outdated', dir };
    },
    async write(o, current) {
      // Erst die alte löschen, damit nichts von ihr übrig bleibt (z. B. Tastenkürzel); write legt sie neu an.
      if (current.entry) fs.rmSync(current.file, { force: true });
      await this.call({ ...o, desktop: current.desktop }, 'write');
    },
    remove(o, current) {
      fs.rmSync(current.file, { force: true });
    },
  },

  darwin: {
    read(o) {
      const desktop = o.desktop || path.join(o.home, 'Desktop');
      if (!isDir(desktop)) throw tError(o.lang, 'shortcut.noDesktop');
      const file = path.join(desktop, FILE_NAMES.darwin);
      let st = null;
      try {
        st = fs.lstatSync(file);
      } catch {
        // gibt es nicht
      }
      const contents = path.join(file, 'Contents');
      const entry = st && {
        dir: st.isDirectory() && !st.isSymbolicLink(),
        plist: readText(path.join(contents, 'Info.plist')),
        launcher: readText(path.join(contents, 'MacOS', 'launcher')),
        icon: fs.existsSync(path.join(contents, 'Resources', 'logo.icns')),
        executable: executable(path.join(contents, 'MacOS', 'launcher')),
      };
      return { desktop, file, entry };
    },
    // Eigen = echter Ordner mit unserer Kennung in der Info.plist.
    check(entry, o) {
      const own = entry.dir && new RegExp(`<key>CFBundleIdentifier</key>\\s*<string>${BUNDLE_ID.replace(/\./g, '\\.')}</string>`).test(entry.plist ?? '');
      if (!own) return { own: false, state: 'foreign', dir: null };
      const dir = macLauncherDir(entry.launcher);
      if (dir !== o.dir) return { own: true, state: 'otherFolder', dir };
      const same = entry.launcher === macLauncher(o.dir) && entry.plist === macInfoPlist() && entry.executable
        && (entry.icon || !fs.existsSync(path.join(o.dir, 'assets', 'logo.icns')));
      return { own: true, state: same ? 'ok' : 'outdated', dir };
    },
    write(o, current) {
      if (current.entry) fs.rmSync(current.file, { recursive: true, force: true });
      const contents = path.join(current.file, 'Contents');
      fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
      fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
      fs.writeFileSync(path.join(contents, 'Info.plist'), macInfoPlist());
      const launcher = path.join(contents, 'MacOS', 'launcher');
      fs.writeFileSync(launcher, macLauncher(o.dir));
      fs.chmodSync(launcher, 0o755);
      const icon = path.join(o.dir, 'assets', 'logo.icns');
      if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(contents, 'Resources', 'logo.icns'));
    },
    remove(o, current) {
      fs.rmSync(current.file, { recursive: true, force: true });
    },
  },

  linux: {
    async read(o) {
      let desktop = o.desktop;
      if (!desktop) {
        // xdg-user-dir nennt den Desktop-Ordner in der Sprache des Systems (z. B. ~/Schreibtisch); ohne es ~/Desktop.
        const r = await o.run('xdg-user-dir', ['DESKTOP'], { env: o.env });
        const found = r.code === 0 ? firstLine(r.stdout) : '';
        desktop = [found, path.join(o.home, 'Desktop')]
          .find(d => d && path.isAbsolute(d) && path.resolve(d) !== path.resolve(o.home) && isDir(d)) ?? '';
      }
      if (!desktop || !isDir(desktop)) throw tError(o.lang, 'shortcut.noDesktop');
      const file = path.join(desktop, FILE_NAMES.linux);
      let entry = null;
      try {
        const st = fs.lstatSync(file);
        entry = { file: st.isFile() && !st.isSymbolicLink(), text: st.isFile() ? readText(file) : null, executable: executable(file) };
      } catch {
        // gibt es nicht
      }
      return { desktop, file, entry };
    },
    // Eigen = normale Datei mit der Zeile X-Tweakable-DJ=launcher.
    check(entry, o) {
      const own = entry.file && (entry.text ?? '').split(/\r?\n/).includes(LINUX_MARKER);
      if (!own) return { own: false, state: 'foreign', dir: null };
      const dir = linuxEntryDir(entry.text);
      if (dir !== o.dir) return { own: true, state: 'otherFolder', dir };
      // Der Kommentar steht in der Sprache beim Anlegen; eine andere Sprache der Oberfläche macht sie nicht veraltet.
      const same = withoutComment(entry.text) === withoutComment(linuxDesktopEntry(o.dir, o));
      return { own: true, state: same && entry.executable ? 'ok' : 'outdated', dir };
    },
    async write(o, current) {
      // Neu schreiben statt ändern: über eine Zwischendatei, dann umbenennen (ersetzt die alte in einem Schritt).
      const tmp = `${current.file}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(tmp, linuxDesktopEntry(o.dir, o), { mode: 0o755 });
        fs.chmodSync(tmp, 0o755);
        fs.renameSync(tmp, current.file);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
      // GNOME startet Desktop-Einträge erst, wenn sie als vertrauenswürdig markiert sind; ohne gio egal.
      await o.run('gio', ['set', current.file, 'metadata::trusted', 'true'], { env: o.env });
    },
    remove(o, current) {
      fs.rmSync(current.file, { force: true });
    },
  },
};

// Stand der Verknüpfung:
//   supported: gibt es Verknüpfungen auf dieser Plattform; message: sonst bzw. bei einem Fehler der Grund
//   state: 'missing' (keine Datei), 'ok' (unsere, passt zu diesem Ordner), 'otherFolder' (unsere, aber für einen anderen
//          Ordner, z. B. nach dem Verschieben), 'outdated' (unsere, dieser Ordner, aber Einzelheiten anders, z. B. Symbol),
//          'foreign' (Datei dieses Namens, aber nicht von Tweakable DJ – bleibt unangetastet), null (Stand unbekannt)
//   installed: unsere Verknüpfung ist da; matches: state 'ok'; file: Pfad der Verknüpfung; folder: Ordner, auf den sie zeigt
export async function shortcutStatus(opts = {}) {
  const o = options(opts);
  const status = { supported: false, platform: o.platform, state: null, installed: false, matches: false, file: null, folder: null, message: '' };
  const platform = PLATFORMS[o.platform];
  if (!platform) return { ...status, message: t(o.lang, 'shortcut.platform') };
  status.supported = true;
  let current;
  try {
    current = await platform.read(o);
  } catch (e) {
    return { ...status, message: e.message };
  }
  status.file = current.file;
  if (!current.entry) return { ...status, state: 'missing' };
  const { own, state, dir } = platform.check(current.entry, o);
  return { ...status, state, installed: own, matches: state === 'ok', folder: dir };
}

// Legt die Verknüpfung an bzw. ersetzt die eigene. Eine fremde Datei gleichen Namens bleibt (Fehler 'shortcut.foreign').
// Prüft danach, ob alles passt; Ergebnis: der neue Stand.
export async function createShortcut(opts = {}) {
  const o = options(opts);
  const platform = PLATFORMS[o.platform];
  if (!platform) throw tError(o.lang, 'shortcut.platform');
  // Ein Zeilenumbruch im Pfad ließe sich in keinem der Formate sauber zurücklesen.
  if (/[\r\n]/.test(o.dir)) throw tError(o.lang, 'shortcut.newline');
  const current = await platform.read(o);
  if (current.entry && !platform.check(current.entry, o).own) throw tError(o.lang, 'shortcut.foreign', { file: current.file });
  await platform.write(o, current);
  const status = await shortcutStatus(opts);
  if (!status.matches) throw new Error(status.message || t(o.lang, 'shortcut.notMatching', { problem: t(o.lang, `shortcut.state.${status.state}`) }));
  return status;
}

// Entfernt die eigene Verknüpfung (egal, auf welchen Ordner sie zeigt); fehlt sie, ist nichts zu tun. Eine fremde Datei
// gleichen Namens bleibt (Fehler 'shortcut.foreign'). Ergebnis: der neue Stand.
export async function removeShortcut(opts = {}) {
  const o = options(opts);
  const platform = PLATFORMS[o.platform];
  if (!platform) throw tError(o.lang, 'shortcut.platform');
  const current = await platform.read(o);
  if (current.entry) {
    if (!platform.check(current.entry, o).own) throw tError(o.lang, 'shortcut.foreign', { file: current.file });
    await platform.remove(o, current);
  }
  return shortcutStatus(opts);
}
