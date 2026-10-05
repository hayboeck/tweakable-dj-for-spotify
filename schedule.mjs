// Automatische Neuerstellung: trägt "node dj.mjs --auto" in den Zeitplaner des Betriebssystems ein.
//   Windows: Aufgabenplanung (schtasks), macOS: LaunchAgent (launchd), Linux: crontab
// nextRun() und die Erzeugung der Einträge (Task-XML, plist, crontab-Zeile) sind reine Funktionen,
// damit sie sich ohne Eingriffe ins System testen lassen.
// Einträge unter dem früheren Namen "Mein DJ" werden beim Eintragen und Ausschalten mit entfernt.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { DEFAULTS, HERE, WEEKDAYS, checkValue } from './config.mjs';
import { resolveLang, t, tError } from './i18n.mjs';

export const AUTO_LOG = 'automatik.log';
export const AUTO_RESULT = 'automatik.json';

// Name des Eintrags im Zeitplaner und frühere Namen, deren Einträge beim Eintragen bzw. Ausschalten mit verschwinden.
export const TASK_NAME = 'Tweakable DJ';
export const LEGACY_NAMES = ['Mein DJ'];

const KEYS = ['schedule', 'scheduleTime', 'scheduleDay'];
const DAY_NAMES = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
const SYSTEM32 = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32');

// Wochentag als Zahl wie bei Date.getDay(), cron und launchd: 0 = Sonntag, 1 = Montag … 6 = Samstag.
const dayNumber = day => (WEEKDAYS.indexOf(day) + 1) % 7;
const pad = n => String(n).padStart(2, '0');
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tweakable-dj';

// Kennungen eines Eintrags: Aufgabenname (Windows), Label (macOS) und Marker (crontab).
// "Tweakable DJ" → io.github.tweakable-dj.auto bzw. tweakable-dj-auto, "Mein DJ" → io.github.mein-dj.auto bzw. mein-dj-auto.
export const entryIds = name => ({ name, label: `io.github.${slug(name)}.auto`, marker: `${slug(name)}-auto` });

// Geprüfte Automatik-Einstellungen (eine von Hand geänderte config.jsonc wird wie beim Speichern geprüft).
export function scheduleSettings(cfg, lang) {
  return Object.fromEntries(KEYS.map(k => [k, checkValue(k, cfg[k] ?? DEFAULTS[k], lang)]));
}

// Nächster Lauf nach `now` in Ortszeit (Sommerzeit inklusive); null, wenn die Automatik aus ist.
export function nextRun(cfg, now = new Date(), lang) {
  const { schedule, scheduleTime, scheduleDay } = scheduleSettings(cfg, lang);
  if (schedule === 'off') return null;
  const [hour, minute] = scheduleTime.split(':').map(Number);
  for (let i = 0; i <= 7; i++) {
    // Gibt es die Uhrzeit wegen der Zeitumstellung nicht (z. B. 02:30), macht Date daraus die Zeit danach (03:30).
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute);
    if (at > now && (schedule === 'daily' || at.getDay() === dayNumber(scheduleDay))) return at;
  }
  return null;
}

// Was der Zeitplaner startet: node dj.mjs --auto. nodeArgs/args nur für Tests (z. B. ['--import', mock], ['--dry']).
const program = (nodePath, script, { nodeArgs = [], args = [] }) => [nodePath, ...nodeArgs, script, '--auto', ...args];

// --- Windows: Aufgabenplanung ---

// Aufgabe für schtasks /Create /XML. Startet den Lauf über "conhost --headless", damit kein Konsolenfenster
// aufpoppt (conhost = Pfad oder null, dann direkt node). StartBoundary = nächster Lauf, damit Windows
// nicht gleich nach dem Anlegen einen "verpassten" Lauf nachholt. lang = Sprache der Beschreibung.
export function windowsTaskXml(cfg, nodePath, dir, { now = new Date(), conhost = null, lang, ...opts } = {}) {
  const s = scheduleSettings(cfg, lang);
  const start = nextRun(s, now, lang);
  if (!start) throw tError(lang, 'schedule.off');
  const script = path.win32.join(dir, 'dj.mjs');
  const quote = a => (a === nodePath || a === script || /\s/.test(a) ? `"${a}"` : a);
  const argv = program(nodePath, script, opts).map(quote);
  const [command, ...args] = conhost ? [conhost, '--headless', ...argv] : argv;
  const stamp = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}:00`;
  const trigger = s.schedule === 'daily'
    ? '<ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>'
    : `<ScheduleByWeek><DaysOfWeek><${DAY_NAMES[s.scheduleDay]} /></DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek>`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Tweakable DJ</Author>
    <Description>${xml(t(lang, 'schedule.description', { dir }))}</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${stamp}</StartBoundary>
      <Enabled>true</Enabled>
      ${trigger}
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT30M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xml(command)}</Command>
      <Arguments>${xml(args.join(' '))}</Arguments>
      <WorkingDirectory>${xml(dir)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

// schtasks liest die XML-Datei als UTF-16LE mit BOM.
export const utf16 = text => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

// Vergleicht die Aufgabe laut "schtasks /Query /XML" mit der erwarteten: null = passt, sonst der Grund.
// schtasks gibt in der OEM-Codepage aus (Umlaute z. B. als 0x94), deshalb zählen Nicht-ASCII-Zeichen nur als Platzhalter.
// Die Beschreibung zählt nicht mit (sie hängt von der Sprache ab).
export function checkWindowsTask(installed, expected) {
  const loose = s => s.replace(/[^\x20-\x7e]+/g, '?');
  const pick = (text, tag) => loose(unxml(text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? ''));
  const time = text => text.match(/<StartBoundary>[^<]*T(\d\d:\d\d)/)?.[1];
  const days = text => text.match(/<DaysOfWeek>([\s\S]*?)<\/DaysOfWeek>/)?.[1].replace(/\s/g, '') ?? '';
  const kind = text => (text.includes('<ScheduleByWeek>') ? 'weekly' : text.includes('<ScheduleByDay>') ? 'daily' : 'other');
  if (pick(installed, 'WorkingDirectory') !== pick(expected, 'WorkingDirectory')) return 'folder';
  if (/<Enabled>false<\/Enabled>/.test(installed)) return 'disabled';
  const same = ['Command', 'Arguments'].every(tag => pick(installed, tag) === pick(expected, tag))
    && time(installed) === time(expected) && kind(installed) === kind(expected) && days(installed) === days(expected);
  return same ? null : 'settings';
}

// --- macOS: LaunchAgent ---

// launchd holt einen Lauf nach, wenn der Mac zur Zeit schlief, aber nicht, wenn er aus war.
export function launchAgentPlist(cfg, nodePath, dir, { label = entryIds(TASK_NAME).label, lang, ...opts } = {}) {
  const s = scheduleSettings(cfg, lang);
  if (s.schedule === 'off') throw tError(lang, 'schedule.off');
  const [hour, minute] = s.scheduleTime.split(':').map(Number);
  const interval = [['Hour', hour], ['Minute', minute], ...(s.schedule === 'weekly' ? [['Weekday', dayNumber(s.scheduleDay)]] : [])];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${program(nodePath, path.posix.join(dir, 'dj.mjs'), opts).map(a => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(dir)}</string>
  <key>StartCalendarInterval</key>
  <dict>
${interval.map(([k, v]) => `    <key>${k}</key>\n    <integer>${v}</integer>`).join('\n')}
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;
}

// --- Linux: crontab ---

const shell = s => `'${s.replace(/'/g, `'\\''`)}'`;

// Eine crontab-Zeile, erkennbar am Kommentar "# <marker> <Ordner>" am Ende. cron holt verpasste Läufe nicht nach.
export function cronLine(cfg, nodePath, dir, { marker = entryIds(TASK_NAME).marker, lang, ...opts } = {}) {
  const s = scheduleSettings(cfg, lang);
  if (s.schedule === 'off') throw tError(lang, 'schedule.off');
  if (/[\r\n]/.test(dir + nodePath)) throw tError(lang, 'schedule.newline');
  const [hour, minute] = s.scheduleTime.split(':').map(Number);
  const day = s.schedule === 'weekly' ? dayNumber(s.scheduleDay) : '*';
  const [node, ...rest] = program(nodePath, path.posix.join(dir, 'dj.mjs'), opts);
  const command = [shell(node), ...rest.map(a => (/^[\w@+=:,./-]+$/.test(a) ? a : shell(a)))].join(' ');
  // % heißt in der crontab "Zeilenumbruch" und muss als \% stehen, auch im Kommentar.
  return `${minute} ${hour} * * ${day} cd ${shell(dir)} && ${command} >/dev/null 2>&1 # ${marker} ${dir}`.replace(/%/g, '\\%');
}

const hasMarker = (line, marker) => line.includes(`# ${marker} `);

// Neue crontab: fremde Zeilen bleiben, wie sie sind; die eigene (am Marker erkannt) wird ersetzt bzw. bei line = null entfernt.
// Zeilen mit einem der früheren Marker (legacy, z. B. "mein-dj-auto") kommen ebenfalls weg.
export function updateCrontab(current, line, marker = entryIds(TASK_NAME).marker, legacy = []) {
  const lines = current ? current.replace(/\n$/, '').split('\n') : [];
  const kept = lines.filter(l => ![marker, ...legacy].some(m => hasMarker(l, m)));
  if (line) kept.push(line);
  return kept.length ? `${kept.join('\n')}\n` : '';
}

const ownCronLine = (text, marker) => text.split('\n').find(l => hasMarker(l, marker)) ?? null;

// --- Aufrufe ans System ---

// Programm ohne Shell starten: Pfade mit Leerzeichen und Umlauten kommen unverändert an.
function run(file, args, input = '') {
  return new Promise(resolve => {
    const child = execFile(file, args, { encoding: 'buffer', windowsHide: true, timeout: 30_000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? -1 : 0, stdout, stderr });
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);
  });
}

// schtasks antwortet in der OEM-Codepage (meist 850 oder 437), crontab und launchctl in UTF-8.
const OEM = { 0x81: 'ü', 0x84: 'ä', 0x8e: 'Ä', 0x94: 'ö', 0x99: 'Ö', 0x9a: 'Ü', 0xe1: 'ß' };
function decode(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return [...buf].map(b => (b < 0x80 ? String.fromCharCode(b) : OEM[b] ?? '?')).join('');
  }
}
const failure = (lang, who, r) => tError(lang, 'schedule.reports', {
  who,
  message: decode(r.stderr).trim() || decode(r.stdout).trim() || t(lang, 'schedule.exitCode', { code: r.code }),
});

// Node.js für den Lauf: das gerade laufende. Unter macOS/Linux lieber der gleichwertige Link aus dem PATH
// (z. B. /opt/homebrew/bin/node), weil der aufgelöste Pfad in einen Versionsordner bei Updates verschwindet.
function currentNode() {
  const exe = process.execPath;
  if (process.platform === 'win32') return exe;
  try {
    const real = fs.realpathSync(exe);
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
      const candidate = path.join(dir, 'node');
      if (path.isAbsolute(dir) && fs.existsSync(candidate) && fs.realpathSync(candidate) === real) return candidate;
    }
  } catch {
    // PATH nicht lesbar: dann eben der Pfad des laufenden Node.js
  }
  return exe;
}

// Nur für Tests, damit der echte Eintrag frei bleibt: TWEAKABLE_DJ_TASK_NAME (z. B. "Tweakable DJ TEST") und
// TWEAKABLE_DJ_TASK_ARGS (JSON, z. B. {"nodeArgs": ["--import", "<Mock>"], "args": ["--dry"]}).
function testArgs() {
  try {
    return JSON.parse(process.env.TWEAKABLE_DJ_TASK_ARGS || '{}');
  } catch {
    return {};
  }
}

// Optionen für Status und Einrichtung. Frühere Namen (legacy) gelten nur für den echten Namen,
// damit ein Test-Eintrag nie den Eintrag einer älteren Version anfasst.
function options({ name = process.env.TWEAKABLE_DJ_TASK_NAME || TASK_NAME, legacy = name === TASK_NAME ? LEGACY_NAMES : [], dir = HERE,
  nodePath = currentNode(), platform = process.platform, nodeArgs = testArgs().nodeArgs ?? [], args = testArgs().args ?? [], lang } = {}) {
  return { ...entryIds(name), dir, nodePath, platform, nodeArgs, args, lang: resolveLang(lang), legacy: legacy.map(entryIds) };
}

const conhost = () => {
  const file = path.win32.join(SYSTEM32, 'conhost.exe');
  return fs.existsSync(file) ? file : null;
};
const SCHTASKS = path.win32.join(SYSTEM32, 'schtasks.exe');

// Je Plattform: read → Eintrag oder null, check → null (passt) oder Grund, install, remove (nur, wenn ein Eintrag da ist).
// Alle bekommen die Optionen o; für einen früheren Eintrag sind name, label und marker durch dessen Kennungen ersetzt.
// Exportiert, damit Tests einen simulierten Zeitplaner ergänzen können.
export const PLATFORMS = {
  win32: {
    async read(o) {
      const r = await run(SCHTASKS, ['/Query', '/TN', o.name, '/XML']);
      return r.code === 0 ? decode(r.stdout) : null;
    },
    check: (entry, o, s) => checkWindowsTask(entry, windowsTaskXml(s, o.nodePath, o.dir, { ...o, conhost: conhost() })),
    async install(o, s) {
      const file = path.join(os.tmpdir(), `tweakable-dj-task-${process.pid}-${Date.now()}.xml`);
      fs.writeFileSync(file, utf16(windowsTaskXml(s, o.nodePath, o.dir, { ...o, conhost: conhost() })));
      try {
        const r = await run(SCHTASKS, ['/Create', '/TN', o.name, '/XML', file, '/F']);
        if (r.code !== 0) throw failure(o.lang, t(o.lang, 'schedule.windows'), r);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
    async remove(o) {
      const r = await run(SCHTASKS, ['/Delete', '/TN', o.name, '/F']);
      if (r.code !== 0) throw failure(o.lang, t(o.lang, 'schedule.windows'), r);
    },
  },

  darwin: {
    file: o => path.join(os.homedir(), 'Library', 'LaunchAgents', `${o.label}.plist`),
    domain: () => `gui/${process.getuid()}`,
    async read(o) {
      let plist;
      try {
        plist = fs.readFileSync(this.file(o), 'utf8');
      } catch {
        return null;
      }
      const loaded = (await run('/bin/launchctl', ['print', `${this.domain()}/${o.label}`])).code === 0;
      return { plist, loaded };
    },
    check(entry, o, s) {
      const folder = text => text.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]*)<\/string>/)?.[1];
      const expected = launchAgentPlist(s, o.nodePath, o.dir, o);
      if (folder(entry.plist) !== folder(expected)) return 'folder';
      if (entry.plist !== expected) return 'settings';
      return entry.loaded ? null : 'disabled';
    },
    async install(o, s) {
      const file = this.file(o);
      await run('/bin/launchctl', ['bootout', this.domain(), file]); // Fehler egal: war noch nicht geladen
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, launchAgentPlist(s, o.nodePath, o.dir, o));
      const r = await run('/bin/launchctl', ['bootstrap', this.domain(), file]);
      if (r.code !== 0) throw failure(o.lang, 'launchd', r);
    },
    async remove(o) {
      const file = this.file(o);
      await run('/bin/launchctl', ['bootout', this.domain(), file]);
      fs.rmSync(file, { force: true });
    },
  },

  linux: {
    async crontab(o) {
      const r = await run('crontab', ['-l']);
      if (r.code === 'ENOENT') {
        throw tError(o.lang, 'schedule.noCrontab');
      }
      if (r.code === 0) return decode(r.stdout);
      // Noch keine crontab = leer. Andere Fehler nicht als leer werten, sonst ginge beim Schreiben die crontab verloren.
      if (/no crontab|can't open|No such file/i.test(decode(r.stderr))) return '';
      throw failure(o.lang, 'crontab', r);
    },
    async read(o) {
      return ownCronLine(await this.crontab(o), o.marker);
    },
    check(line, o, s) {
      const expected = cronLine(s, o.nodePath, o.dir, o);
      if (line === expected) return null;
      const suffix = text => text.slice(text.indexOf(`# ${o.marker} `));
      return suffix(line) === suffix(expected) ? 'settings' : 'folder';
    },
    // Schreibt die crontab neu; dabei verschwinden auch Zeilen früherer Namen.
    async write(o, line) {
      const r = await run('crontab', ['-'], updateCrontab(await this.crontab(o), line, o.marker, o.legacy.map(l => l.marker)));
      if (r.code !== 0) throw failure(o.lang, 'crontab', r);
    },
    install(o, s) {
      return this.write(o, cronLine(s, o.nodePath, o.dir, o));
    },
    remove(o) {
      return this.write(o, null);
    },
  },
};

// Optionen für einen früheren Eintrag: dessen Kennungen statt der eigenen.
const legacyOptions = (o, ids) => ({ ...o, ...ids });

// Letzter automatischer Lauf aus automatik.json (von "node dj.mjs --auto"), null = noch keiner.
export function lastRun(dir = HERE) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, AUTO_RESULT), 'utf8'));
  } catch {
    return null;
  }
}

// Stand der Automatik. matches = der Eintrag im Zeitplaner passt genau zu diesem Ordner und dieser Einstellung;
// problem sagt sonst, warum nicht: missing, leftover (Automatik aus und Eintrag noch da, oder ein Eintrag unter
// einem früheren Namen), folder, settings, disabled, invalid. legacy = es gibt noch einen Eintrag unter einem
// früheren Namen (legacyNames: welche); der verschwindet beim nächsten Eintragen oder Ausschalten.
export async function scheduleStatus(cfg, opts = {}) {
  const o = options(opts);
  const status = {
    supported: false, platform: o.platform, name: o.name, installed: false, matches: false, problem: null,
    legacy: false, legacyNames: [], nextRun: null, lastRun: lastRun(o.dir), message: '',
  };
  const platform = PLATFORMS[o.platform];
  if (!platform) return { ...status, message: t(o.lang, 'schedule.platform') };
  let entry;
  try {
    entry = await platform.read(o);
    for (const ids of o.legacy) {
      if (await platform.read(legacyOptions(o, ids))) status.legacyNames.push(ids.name);
    }
  } catch (e) {
    return { ...status, message: e.message };
  }
  Object.assign(status, { supported: true, installed: entry !== null, legacy: status.legacyNames.length > 0 });
  let s;
  try {
    s = scheduleSettings(cfg, o.lang);
  } catch (e) {
    return { ...status, problem: 'invalid', message: e.message };
  }
  const problem = s.schedule === 'off' ? (entry ? 'leftover' : null) : entry ? platform.check(entry, o, s) : 'missing';
  // Ein früherer Eintrag ist übrig, wenn sonst alles passt oder der eigene noch fehlt.
  status.problem = status.legacy && (problem === null || problem === 'missing') ? 'leftover' : problem;
  status.matches = status.problem === null;
  if (status.matches && s.schedule !== 'off') status.nextRun = nextRun(s, new Date(), o.lang).toISOString();
  return status;
}

// Trägt die Automatik ein (bzw. ersetzt den Eintrag) oder entfernt sie bei 'off'; Einträge unter früheren
// Namen kommen in beiden Fällen weg. Prüft danach, ob alles passt.
// Wo es keinen Zeitplaner gibt, klappt nur 'off' (dann ist nichts zu tun).
export async function applySchedule(cfg, opts = {}) {
  const o = options(opts);
  const s = scheduleSettings(cfg, o.lang);
  const before = await scheduleStatus(s, opts);
  if (!before.supported) {
    if (s.schedule === 'off') return before;
    throw new Error(before.message);
  }
  const platform = PLATFORMS[o.platform];
  if (s.schedule !== 'off') await platform.install(o, s);
  else if (before.installed) await platform.remove(o);
  for (const ids of o.legacy) {
    const old = legacyOptions(o, ids);
    if (await platform.read(old)) await platform.remove(old);
  }
  const status = await scheduleStatus(s, opts);
  if (!status.matches) throw new Error(status.message || t(o.lang, 'schedule.notMatching', { problem: status.problem }));
  return status;
}

// Für "node dj.mjs --auto": Konsolenausgabe zusätzlich in automatik.log (bei jedem Lauf neu) und das Ergebnis
// in automatik.json – schon beim Start (ok = null heißt "läuft"), am Ende mit denselben Feldern wie @@RESULT
// (ok, dry, songs, fresh, freshCurrent, familiar, playlistName, playlistUrl, errorCode, error, missingScope) plus summary.
export function recordAutoRun(dir = HERE, lang = resolveLang()) {
  const result = {
    startedAt: new Date().toISOString(), finishedAt: null, ok: null, dry: process.argv.includes('--dry'),
    songs: null, fresh: null, freshCurrent: null, familiar: null, playlistName: null, playlistUrl: null,
    errorCode: null, error: null, missingScope: null, summary: null,
  };
  const save = () => {
    try {
      fs.writeFileSync(path.join(dir, AUTO_RESULT), `${JSON.stringify(result, null, 2)}\n`);
    } catch {
      // Nicht speicherbar (z. B. Ordner schreibgeschützt): der Lauf selbst geht trotzdem weiter.
    }
  };
  let log = null;
  try {
    log = fs.openSync(path.join(dir, AUTO_LOG), 'w');
  } catch {
    // ohne Protokolldatei weiter
  }
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => {
      if (log !== null) {
        try {
          fs.writeSync(log, typeof chunk === 'string' ? chunk : Buffer.from(chunk));
        } catch {
          log = null;
        }
      }
      return write(chunk, ...rest);
    };
  }
  const finish = values => {
    if (result.finishedAt) return;
    Object.assign(result, values, { finishedAt: new Date().toISOString() });
    save();
  };
  // Sicherheitsnetz, falls der Lauf anders endet als vorgesehen.
  process.on('exit', code => finish(code === 0
    ? { ok: true }
    : { ok: false, errorCode: 'other', error: t(lang, 'schedule.aborted', { code }) }));
  save();
  return { finish };
}
