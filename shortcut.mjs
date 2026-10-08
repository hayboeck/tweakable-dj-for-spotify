// Verknüpfung auf dem Desktop: startet Tweakable DJ per Doppelklick, mit dem Logo als Symbol, ohne Konsolen- bzw.
// Terminalfenster (Startdatei mit --hidden; Ausgaben in ui.log, siehe ui.mjs). Genau eine je Art, immer unter demselben
// Namen; erneutes Anlegen ersetzt sie (z. B. nach dem Verschieben des Ordners).
//   Windows: "Tweakable DJ.lnk" auf dem Desktop (auch bei Umleitung nach OneDrive: [Environment]::GetFolderPath('Desktop')),
//            angelegt mit PowerShell und WScript.Shell. Das Skript ist fest (-EncodedCommand), Pfade und Texte kommen nur
//            über Umgebungsvariablen – Leerzeichen, Umlaute, Apostrophe und $ kommen unverändert an.
//            Ziel: conhost.exe --headless cmd.exe /d /c call "…\Tweakable DJ.cmd" --hidden (kein Fenster), Arbeitsordner =
//            Programmordner, Symbol assets\logo.ico. Frühere Fassungen zielten direkt auf "Tweakable DJ.cmd" (mit Fenster).
//   macOS:   kleines Programm "Tweakable DJ.app" in ~/Desktop: Info.plist (Kennung io.github.tweakable-dj.launcher,
//            LSUIElement = kein Symbol im Dock), Resources/logo.icns und Contents/MacOS/launcher (sh), das start.sh --hidden
//            per nohup im Hintergrund startet. Fehlt Node.js (oder ist es zu alt), öffnet es stattdessen
//            "Tweakable DJ.command" im Terminal, damit man die Meldung sieht.
//   Linux:   "tweakable-dj.desktop" im Desktop-Ordner (xdg-user-dir DESKTOP, sonst ~/Desktop): startet start.sh --hidden ohne
//            Terminal, Symbol assets/logo.png; ausführbar und – wo es gio gibt – als vertrauenswürdig markiert.
// Entfernt bzw. ersetzt wird nur die eigene Verknüpfung (Windows: Aufruf von "Tweakable DJ.cmd" mit dem Argument der Art,
// macOS: Kennung in der Info.plist, Linux: Zeile X-Tweakable-DJ=…). Eine fremde Datei gleichen Namens bleibt immer unangetastet.
// Arten (SHORTCUTS, Option kind): 'open' = die Oberfläche, 'run' = „Tweakable DJ – Playlist neu erstellen“ (Einstellung runShortcut):
// erstellt die Playlist ohne Oberfläche neu (Startdatei mit --now, siehe dj.mjs) und meldet sich mit einer Benachrichtigung.
// Die Inhalte (plist, Skript, Desktop-Eintrag) sind reine Funktionen; Befehle, Pfade und Plattform lassen sich für Tests
// übergeben (wie in schedule.mjs).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { HERE } from './config.mjs';
import { resolveLang, t, tError } from './i18n.mjs';

// Arten von Verknüpfungen: name (auf dem Desktop; names: je Sprache der Oberfläche), arg (für Tweakable DJ.cmd bzw. start.sh),
// bundleId (macOS), linux (Dateiname), marker (Zeile im Desktop-Eintrag), description (Schlüssel in i18n.mjs).
// Erkannt wird die eigene Verknüpfung nie am Namen, sondern an Ziel/Argument, Kennung bzw. Marker; eine Verknüpfung unter
// dem Namen einer anderen Sprache bzw. einem früheren Namen (oldNames) gilt als veraltet und wird beim nächsten Anlegen
// (Speichern, Start) umbenannt.
export const SHORTCUTS = {
  open: {
    name: 'Tweakable DJ', arg: '--hidden', bundleId: 'io.github.tweakable-dj.launcher', linux: 'tweakable-dj.desktop',
    marker: 'X-Tweakable-DJ=launcher', description: 'shortcut.description',
  },
  // Namen: auf allen Plattformen gültige Dateinamen (ohne / \ : * ? " < > |).
  run: {
    name: 'Tweakable DJ – Playlist neu erstellen', arg: '--now',
    names: {
      de: 'Tweakable DJ – Playlist neu erstellen', en: 'Tweakable DJ – Rebuild playlist', es: 'Tweakable DJ – Recrear la playlist',
      fr: 'Tweakable DJ – Recréer la playlist',
    },
    // Namen bis 0.3.2 („Playlist neu“ ließ sich mit „Neue Playlist anlegen“ verwechseln); werden beim Start umbenannt.
    oldNames: { de: ['Tweakable DJ – Playlist neu'], en: ['Tweakable DJ – New playlist'], es: ['Tweakable DJ – Nueva playlist'], fr: ['Tweakable DJ – Nouvelle playlist'] },
    bundleId: 'io.github.tweakable-dj.run', linux: 'tweakable-dj-playlist.desktop',
    marker: 'X-Tweakable-DJ=run', description: 'shortcut.runDescription',
  },
};
const kindOf = kind => SHORTCUTS[kind] ?? SHORTCUTS.open;
// Name auf dem Desktop in der Sprache lang
export const shortcutName = (kind, lang) => kindOf(kind).names?.[resolveLang(lang)] ?? kindOf(kind).name;
// Dateiname der Verknüpfung je Plattform (lang: Sprache des Namens; name: anderer Name, z. B. ein früherer)
export const fileNames = (kind, lang, name = shortcutName(kind, lang)) => ({ win32: `${name}.lnk`, darwin: `${name}.app`, linux: kindOf(kind).linux });
// Dateiname für die Optionen o (o.altName: ein anderer Name als der der Sprache, siehe otherNames)
const fileNameOf = (o, platform) => fileNames(o.kind, o.nameLang, o.altName ?? shortcutName(o.kind, o.nameLang))[platform];
export const SHORTCUT_NAME = SHORTCUTS.open.name;
export const BUNDLE_ID = SHORTCUTS.open.bundleId;
export const LINUX_MARKER = SHORTCUTS.open.marker;
export const FILE_NAMES = fileNames('open');
// Nur für Tests: anderer Desktop-Ordner (der echte Desktop bleibt dann unberührt).
export const DESKTOP_VAR = 'TWEAKABLE_DJ_DESKTOP';

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Für sh in einfachen Anführungszeichen: ' wird zu '\''
const shell = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

// --- macOS: kleines App-Paket ---

export function macInfoPlist(kind, lang) {
  const k = { ...kindOf(kind), name: shortcutName(kind, lang) };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${xml(k.name)}</string>
  <key>CFBundleDisplayName</key>
  <string>${xml(k.name)}</string>
  <key>CFBundleIdentifier</key>
  <string>${k.bundleId}</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIconFile</key>
  <string>logo</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleVersion</key>
  <string>2</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

// Startet start.sh mit dem Argument der Art per nohup im Hintergrund (ohne Terminal). Das Startskript endet gleich wieder,
// so startet jeder Doppelklick neu (ein zweiter Start öffnet nur den Browser, siehe ui.mjs). Ohne passendes Node.js:
// "Tweakable DJ.command" im Terminal öffnen (wie ein Doppelklick darauf im Finder), damit man die Meldung sieht.
export function macLauncher(dir, kind) {
  return `#!/bin/sh
# Angelegt von Tweakable DJ (Einstellungen → Verknüpfung): startet Tweakable DJ ohne Terminalfenster (Ausgaben in ui.log).
# Fehlt Node.js oder ist es zu alt, öffnet es "Tweakable DJ.command" im Terminal, damit man die Meldung sieht.
PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
export PATH
cd ${shell(dir)} || exit 1
if command -v node >/dev/null 2>&1 && node -e 'process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)' >/dev/null 2>&1; then
  nohup /bin/sh ./start.sh ${kindOf(kind).arg} >/dev/null 2>&1 &
  exit 0
fi
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

// Ohne Terminal: start.sh schreibt mit --hidden in ui.log und meldet ein fehlendes Node.js per notify-send.
// nameLang: Sprache des Namens (sonst lang)
export function linuxDesktopEntry(dir, { lang, kind, nameLang = lang } = {}) {
  const k = { ...kindOf(kind), name: shortcutName(kind, nameLang) };
  return `[Desktop Entry]
Type=Application
Version=1.0
Name=${k.name}
Comment=${desktopValue(t(resolveLang(lang), k.description, { dir }))}
Exec=${desktopValue(`/bin/sh ${execArg(path.posix.join(dir, 'start.sh'))} ${k.arg}`)}
Path=${desktopValue(dir)}
Icon=${desktopValue(path.posix.join(dir, 'assets', 'logo.png'))}
Terminal=false
Categories=AudioVideo;Audio;
${k.marker}
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
  `      $link.Arguments = $env:${PS_PREFIX}ARGUMENTS`,
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

const system32 = env => path.win32.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'System32');

// Was die Verknüpfung unter Windows enthalten soll (Pfade im Programmordner dir): conhost.exe --headless startet cmd.exe
// ohne sichtbares Fenster; "call" davor, damit cmd /c die Anführungszeichen um den Pfad nicht entfernt.
export function windowsShortcut(dir, { lang, kind, env = process.env } = {}) {
  const k = kindOf(kind);
  return {
    target: path.win32.join(system32(env), 'conhost.exe'),
    arguments: `--headless "${path.win32.join(system32(env), 'cmd.exe')}" /d /c call "${path.win32.join(dir, 'Tweakable DJ.cmd')}" ${k.arg}`,
    workdir: path.win32.normalize(dir),
    icon: `${path.win32.join(dir, 'assets', 'logo.ico')},0`,
    description: t(resolveLang(lang), k.description, { dir }),
  };
}

// Von wem ist eine .lnk? → { kind, dir, legacy } oder null (fremd). Erkannt am Aufruf von "Tweakable DJ.cmd" mit dem
// Argument einer Art; legacy = frühere Fassung von 'open' (Ziel direkt "Tweakable DJ.cmd", mit Fenster).
export function windowsOwner(entry) {
  const target = String(entry?.target ?? '');
  const base = path.win32.basename(target).toLowerCase();
  if (base === 'tweakable dj.cmd') return { kind: 'open', dir: path.win32.dirname(target), legacy: true };
  if (base !== 'conhost.exe') return null;
  const m = /\bcall "([^"]*\\Tweakable DJ\.cmd)" (--[a-z]+)\s*$/i.exec(String(entry.arguments ?? ''));
  const kind = m ? Object.keys(SHORTCUTS).find(k => SHORTCUTS[k].arg === m[2].toLowerCase()) : null;
  return kind ? { kind, dir: path.win32.dirname(m[1]), legacy: false } : null;
}

// Befehl für PowerShell: { file, args, env }. action: 'read' oder 'write'; desktop: fester Ordner oder '' (= Desktop des
// Benutzers). Die Werte stehen nur in der Umgebung, nie in der Befehlszeile.
export function windowsCommand(action, { dir, desktop = '', lang, kind, nameLang = lang, altName, env = process.env } = {}) {
  const root = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
  const s = windowsShortcut(dir, { lang, kind, env });
  return {
    file: `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS_SCRIPT, 'utf16le').toString('base64')],
    env: {
      ...env, [`${PS_PREFIX}ACTION`]: action, [`${PS_PREFIX}DESKTOP`]: desktop, [`${PS_PREFIX}FILE`]: fileNameOf({ kind, nameLang: resolveLang(nameLang), altName }, 'win32'),
      [`${PS_PREFIX}TARGET`]: s.target, [`${PS_PREFIX}ARGUMENTS`]: s.arguments, [`${PS_PREFIX}WORKDIR`]: s.workdir, [`${PS_PREFIX}ICON`]: s.icon,
      [`${PS_PREFIX}DESCRIPTION`]: s.description,
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
// kind: Art der Verknüpfung (SHORTCUTS, Standard 'open'); nameLang: Sprache des Namens (Standard lang).
function options({ dir = HERE, platform = process.platform, env = process.env, desktop = env[DESKTOP_VAR] || '', home = os.homedir(),
  run = runFile, lang, kind = 'open', nameLang } = {}) {
  // Windows-Pfade mit path.win32 (unter Windows dasselbe wie path.resolve; so auch in den simulierten Tests auf Linux/macOS)
  return {
    dir: platform === 'win32' ? path.win32.resolve(dir) : path.resolve(dir), platform, env, desktop, home, run, lang: resolveLang(lang),
    kind: Object.hasOwn(SHORTCUTS, kind) ? kind : 'open', nameLang: resolveLang(nameLang ?? lang), altName: null,
  };
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
      return { desktop: data.desktop, file: path.join(data.desktop, fileNameOf(o, 'win32')), entry: data.exists ? data : null };
    },
    read(o) {
      return this.call(o, 'read');
    },
    // Eigen = ruft "Tweakable DJ.cmd" mit dem Argument dieser Art auf, egal in welchem Ordner (windowsOwner). Eine frühere
    // Fassung für diesen Ordner ist veraltet (ui.mjs erneuert sie beim Start).
    check(entry, o) {
      const owner = windowsOwner(entry);
      if (owner?.kind !== o.kind) return { own: false, state: 'foreign', dir: null };
      if (!samePath(owner.dir, o.dir)) return { own: true, state: 'otherFolder', dir: owner.dir };
      const want = windowsShortcut(o.dir, o);
      const same = !owner.legacy && samePath(entry.target, want.target) && String(entry.arguments).toLowerCase() === want.arguments.toLowerCase()
        && samePath(entry.workdir, want.workdir) && samePath(entry.icon, want.icon);
      return { own: true, state: same ? 'ok' : 'outdated', dir: owner.dir };
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
      const file = path.join(desktop, fileNameOf(o, 'darwin'));
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
      const id = kindOf(o.kind).bundleId.replace(/\./g, '\\.');
      const own = entry.dir && new RegExp(`<key>CFBundleIdentifier</key>\\s*<string>${id}</string>`).test(entry.plist ?? '');
      if (!own) return { own: false, state: 'foreign', dir: null };
      const dir = macLauncherDir(entry.launcher);
      if (dir !== o.dir) return { own: true, state: 'otherFolder', dir };
      const same = entry.launcher === macLauncher(o.dir, o.kind) && entry.plist === macInfoPlist(o.kind, o.nameLang) && entry.executable
        && (entry.icon || !fs.existsSync(path.join(o.dir, 'assets', 'logo.icns')));
      return { own: true, state: same ? 'ok' : 'outdated', dir };
    },
    write(o, current) {
      if (current.entry) fs.rmSync(current.file, { recursive: true, force: true });
      const contents = path.join(current.file, 'Contents');
      fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
      fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
      fs.writeFileSync(path.join(contents, 'Info.plist'), macInfoPlist(o.kind, o.nameLang));
      const launcher = path.join(contents, 'MacOS', 'launcher');
      fs.writeFileSync(launcher, macLauncher(o.dir, o.kind));
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
      const file = path.join(desktop, fileNames(o.kind).linux);
      let entry = null;
      try {
        const st = fs.lstatSync(file);
        entry = { file: st.isFile() && !st.isSymbolicLink(), text: st.isFile() ? readText(file) : null, executable: executable(file) };
      } catch {
        // gibt es nicht
      }
      return { desktop, file, entry };
    },
    // Eigen = normale Datei mit der Zeile der Art (z. B. X-Tweakable-DJ=launcher).
    check(entry, o) {
      const own = entry.file && (entry.text ?? '').split(/\r?\n/).includes(kindOf(o.kind).marker);
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
// Eigene Verknüpfungen dieser Art unter den Namen anderer Sprachen bzw. früheren Namen (oldNames; nur Windows und macOS:
// Dort ist der Name der Dateiname) → [{ o, current, check }]. desktop: Ordner der Verknüpfungen – nachgesehen (unter Windows
// mit PowerShell) wird nur, wo es eine Datei dieses Namens gibt.
async function otherNames(platform, o, desktop) {
  const k = kindOf(o.kind);
  if (!k.names || o.platform === 'linux') return [];
  const mine = fileNameOf(o, o.platform);
  const candidates = [...new Set([...Object.values(k.names), ...Object.values(k.oldNames ?? {}).flat()])]
    .filter(name => fileNames(o.kind, o.nameLang, name)[o.platform] !== mine)
    .filter(name => !desktop || fs.existsSync(path.join(desktop, fileNames(o.kind, o.nameLang, name)[o.platform])));
  const found = await Promise.all(candidates.map(async name => {
    const other = { ...o, altName: name };
    try {
      const current = await platform.read(other);
      const check = current.entry ? platform.check(current.entry, other) : null;
      return check?.own ? { o: other, current, check } : null;
    } catch {
      return null;
    }
  }));
  return found.filter(Boolean);
}

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
  if (!current.entry) {
    // Unter dem Namen einer anderen Sprache? Dann ist sie veraltet (bzw. zeigt auf einen anderen Ordner).
    const other = (await otherNames(platform, o, current.desktop))[0];
    if (!other) return { ...status, state: 'missing' };
    const state = other.check.state === 'otherFolder' ? 'otherFolder' : 'outdated';
    return { ...status, file: other.current.file, state, installed: true, matches: false, folder: other.check.dir };
  }
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
  // Dieselbe Verknüpfung unter dem Namen einer anderen Sprache (für diesen Ordner) ist damit ersetzt: weg damit.
  for (const other of await otherNames(platform, o, current.desktop)) {
    if (other.check.state !== 'otherFolder') await platform.remove(other.o, other.current);
  }
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
  for (const other of await otherNames(platform, o, current.desktop)) await platform.remove(other.o, other.current);
  return shortcutStatus(opts);
}
