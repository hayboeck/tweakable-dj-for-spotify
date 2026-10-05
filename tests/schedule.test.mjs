// Unit-Tests für schedule.mjs: nächster Lauf, die Einträge für Windows, macOS und Linux und die Übernahme
// alter Einträge ("Mein DJ"). Nur reine Funktionen bzw. ein simulierter Zeitplaner – keine Eingriffe ins System.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEEKDAYS } from '../config.mjs';
import {
  applySchedule, checkWindowsTask, cronLine, entryIds, lastRun, launchAgentPlist, LEGACY_NAMES, nextRun, PLATFORMS,
  scheduleStatus, TASK_NAME, updateCrontab, utf16, windowsTaskXml,
} from '../schedule.mjs';

// Zeitzone mit Sommerzeit, damit die Umstellung geprüft werden kann (wirkt auch unter Windows).
process.env.TZ = 'Europe/Vienna';
// Echte Namen verwenden (der simulierte Zeitplaner unten ändert nichts am System).
delete process.env.TWEAKABLE_DJ_TASK_NAME;
delete process.env.TWEAKABLE_DJ_TASK_ARGS;

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const daily = (time = '07:00') => ({ schedule: 'daily', scheduleTime: time, scheduleDay: 'MON' });
const weekly = (day, time = '07:00') => ({ schedule: 'weekly', scheduleTime: time, scheduleDay: day });
const HOUR = 3_600_000;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

test('nextRun: aus, täglich vor, genau zur und nach der Uhrzeit', () => {
  assert.equal(nextRun({ schedule: 'off' }, local(2026, 10, 1, 8)), null);
  assert.equal(nextRun({}, local(2026, 10, 1, 8)), null, 'ohne Einstellung = Standard = aus');
  assert.deepEqual(nextRun(daily(), local(2026, 10, 1, 6, 59)), local(2026, 10, 1, 7));
  assert.deepEqual(nextRun(daily(), local(2026, 10, 1, 7)), local(2026, 10, 2, 7), 'genau zur Uhrzeit = erst morgen wieder');
  assert.deepEqual(nextRun(daily(), local(2026, 10, 1, 8)), local(2026, 10, 2, 7));
  assert.deepEqual(nextRun(daily('23:59'), local(2026, 12, 31, 23, 59)), local(2027, 1, 1, 23, 59), 'genau zur Uhrzeit, über den Jahreswechsel');
  assert.deepEqual(nextRun(daily('00:00'), local(2026, 10, 1, 8)), local(2026, 10, 2, 0));
});

test('nextRun: wöchentlich, auch über den Wochen- und Jahreswechsel', () => {
  // 1. 10. 2026 ist ein Donnerstag
  assert.deepEqual(nextRun(weekly('MON'), local(2026, 10, 5, 6, 59)), local(2026, 10, 5, 7), 'Montag vor der Uhrzeit');
  assert.deepEqual(nextRun(weekly('MON'), local(2026, 10, 5, 7, 30)), local(2026, 10, 12, 7), 'Montag nach der Uhrzeit');
  assert.deepEqual(nextRun(weekly('MON'), local(2026, 10, 4, 23, 30)), local(2026, 10, 5, 7), 'Sonntagnacht → Montag');
  assert.deepEqual(nextRun(weekly('TUE'), local(2026, 10, 3, 12)), local(2026, 10, 6, 7), 'Samstag → Dienstag');
  assert.deepEqual(nextRun(weekly('SUN'), local(2026, 10, 5, 12)), local(2026, 10, 11, 7), 'Montag → Sonntag');
  assert.deepEqual(nextRun(weekly('FRI'), local(2026, 12, 30, 12)), local(2027, 1, 1, 7), 'über den Jahreswechsel');
  for (const [i, day] of WEEKDAYS.entries()) {
    const at = nextRun(weekly(day), local(2026, 10, 1, 8));
    assert.equal(at.getDay(), (i + 1) % 7, day);
    assert.ok(at - local(2026, 10, 1, 8) <= 7 * 24 * HOUR);
  }
});

test('nextRun: Sommerzeit-Umstellung (Europe/Vienna)', () => {
  // 29. 3. 2026: 02:00 → 03:00, die Nacht hat nur 23 Stunden
  const spring = nextRun(daily(), local(2026, 3, 28, 8));
  assert.deepEqual([spring.getDate(), spring.getHours(), spring.getMinutes()], [29, 7, 0]);
  assert.equal(spring - local(2026, 3, 28, 8), 22 * HOUR);
  // 02:30 gibt es an diesem Tag nicht: plausibel ist die Zeit danach (03:30), nicht der nächste Tag
  const gap = nextRun(daily('02:30'), local(2026, 3, 28, 8));
  assert.deepEqual([gap.getDate(), gap.getHours(), gap.getMinutes()], [29, 3, 30]);
  // 25. 10. 2026: 03:00 → 02:00, die Nacht hat 25 Stunden
  const autumn = nextRun(daily(), local(2026, 10, 24, 8));
  assert.deepEqual([autumn.getDate(), autumn.getHours()], [25, 7]);
  assert.equal(autumn - local(2026, 10, 24, 8), 24 * HOUR);
  const sunday = nextRun(weekly('SUN'), local(2026, 3, 28, 8));
  assert.deepEqual([sunday.getDate(), sunday.getHours()], [29, 7]);
});

test('nextRun: ungültige Einstellungen werden abgewiesen', () => {
  assert.throws(() => nextRun({ schedule: 'hourly' }), /schedule/);
  assert.throws(() => nextRun({ schedule: 'hourly' }, new Date(), 'en'), /^Error: schedule: expected "off", "daily" or "weekly"$/);
  assert.throws(() => nextRun({ schedule: 'hourly' }, new Date(), 'de'), /^Error: schedule: "off", "daily" oder "weekly" erwartet$/);
  assert.throws(() => nextRun({ schedule: 'daily', scheduleTime: '7:00' }), /scheduleTime/);
  assert.throws(() => nextRun({ schedule: 'weekly', scheduleDay: 'Mo' }), /scheduleDay/);
});

// --- Windows ---

const WIN_NODE = 'C:\\Program Files\\nodejs\\node.exe';
const WIN_DIR = 'C:\\Users\\Zoë & Jörg\\Tweakable DJ (neu)';
const CONHOST = 'C:\\Windows\\System32\\conhost.exe';
const tag = (text, name) => text.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];

test('Windows: Aufgaben-XML mit conhost, Pfaden mit Leerzeichen, Umlauten und &', () => {
  const xml = windowsTaskXml(daily(), WIN_NODE, WIN_DIR, { now: local(2026, 10, 1, 8), conhost: CONHOST });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-16"?>'));
  assert.equal(tag(xml, 'Author'), 'Tweakable DJ');
  assert.match(tag(xml, 'Description'), /^Recreates the Tweakable DJ playlist automatically\. Folder: C:/, 'ohne lang: Englisch');
  const de = windowsTaskXml(daily(), WIN_NODE, WIN_DIR, { now: local(2026, 10, 1, 8), conhost: CONHOST, lang: 'de' });
  assert.match(tag(de, 'Description'), /^Erstellt die Playlist von Tweakable DJ automatisch neu\./);
  // Die Beschreibung (Sprache) zählt beim Abgleich nicht mit
  assert.equal(checkWindowsTask(de, xml), null);
  assert.equal(tag(xml, 'Command'), CONHOST);
  assert.equal(tag(xml, 'Arguments'), '--headless "C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\Zoë &amp; Jörg\\Tweakable DJ (neu)\\dj.mjs" --auto');
  assert.equal(tag(xml, 'WorkingDirectory'), 'C:\\Users\\Zoë &amp; Jörg\\Tweakable DJ (neu)');
  assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;)/, 'nicht maskiertes &');
  // Erster Lauf = nächster Termin in Ortszeit (ohne Zeitzone), täglich
  assert.equal(tag(xml, 'StartBoundary'), '2026-10-02T07:00:00');
  assert.match(xml, /<ScheduleByDay><DaysInterval>1<\/DaysInterval><\/ScheduleByDay>/);
  assert.doesNotMatch(xml, /ScheduleByWeek/);
  // Verpasste Läufe nachholen, nur mit Netz, auch auf Akku, kein zweiter Lauf parallel, höchstens 30 Minuten
  for (const [name, value] of [['StartWhenAvailable', 'true'], ['RunOnlyIfNetworkAvailable', 'true'], ['DisallowStartIfOnBatteries', 'false'],
    ['StopIfGoingOnBatteries', 'false'], ['MultipleInstancesPolicy', 'IgnoreNew'], ['ExecutionTimeLimit', 'PT30M'],
    ['LogonType', 'InteractiveToken'], ['RunLevel', 'LeastPrivilege']]) {
    assert.equal(tag(xml, name), value, name);
  }
  // Ohne Admin-Rechte und ohne Passwort; den Benutzer trägt schtasks selbst ein
  assert.doesNotMatch(xml, /<UserId>|<Password>|HighestAvailable/);
});

test('Windows: ohne conhost direkt node; Wochentage und StartBoundary', () => {
  const plain = windowsTaskXml(daily(), WIN_NODE, WIN_DIR, { now: local(2026, 10, 1, 6) });
  assert.equal(tag(plain, 'Command'), '"C:\\Program Files\\nodejs\\node.exe"');
  assert.equal(tag(plain, 'Arguments'), '"C:\\Users\\Zoë &amp; Jörg\\Tweakable DJ (neu)\\dj.mjs" --auto');
  assert.equal(tag(plain, 'StartBoundary'), '2026-10-01T07:00:00', 'heute noch, weil 07:00 noch kommt');
  WEEKDAYS.forEach((day, i) => {
    const xml = windowsTaskXml(weekly(day, '18:45'), WIN_NODE, WIN_DIR, { now: local(2026, 10, 1, 8), conhost: CONHOST });
    assert.match(xml, new RegExp(`<ScheduleByWeek><DaysOfWeek><${DAY_NAMES[i]} /></DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek>`), day);
    const start = new Date(tag(xml, 'StartBoundary'));
    assert.equal(start.getDay(), (i + 1) % 7, `StartBoundary fällt auf ${day}`);
    assert.equal(tag(xml, 'StartBoundary').slice(11), '18:45:00');
  });
  assert.throws(() => windowsTaskXml({ schedule: 'off' }, WIN_NODE, WIN_DIR, { lang: 'de' }), /aus/);
  assert.throws(() => windowsTaskXml({ schedule: 'off' }, WIN_NODE, WIN_DIR, { lang: 'en' }), /^Error: Automatic runs are off/);
});

test('Windows: Datei für schtasks ist UTF-16LE mit BOM', () => {
  const xml = windowsTaskXml(daily(), WIN_NODE, WIN_DIR, { conhost: CONHOST });
  const buf = utf16(xml);
  assert.deepEqual([...buf.subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(buf.subarray(2).toString('utf16le'), xml);
});

test('Windows: Abgleich mit der Ausgabe von schtasks /Query /XML', () => {
  const opts = { now: local(2026, 10, 1, 8), conhost: CONHOST };
  const expected = windowsTaskXml(weekly('FRI'), WIN_NODE, WIN_DIR, opts);
  // So ungefähr liefert schtasks die Aufgabe zurück: umformatiert, mit Benutzer, späterem StartBoundary-Datum
  // und Umlauten aus der OEM-Codepage, die hier nur noch als Platzhalter ankommen.
  const queried = expected
    .replace('<Principal id="Author">', '<Principal id="Author">\n      <UserId>S-1-5-21-1-2-3-1001</UserId>')
    .replace(/<Enabled>true<\/Enabled>/g, '')
    .replace('<DaysOfWeek><Friday /></DaysOfWeek>', '<DaysOfWeek>\n          <Friday />\n        </DaysOfWeek>')
    .replace('2026-10-02T07:00:00', '2026-10-09T07:00:00')
    .replace(/[öë]/g, '?');
  assert.equal(checkWindowsTask(queried, expected), null);
  assert.equal(checkWindowsTask(expected, expected), null);
  // Ordner verschoben
  const moved = windowsTaskXml(weekly('FRI'), WIN_NODE, 'D:\\Musik\\Tweakable DJ', opts);
  assert.equal(checkWindowsTask(moved, expected), 'folder');
  // Andere Uhrzeit, anderer Tag, täglich statt wöchentlich, anderes Node.js
  assert.equal(checkWindowsTask(windowsTaskXml(weekly('FRI', '08:00'), WIN_NODE, WIN_DIR, opts), expected), 'settings');
  assert.equal(checkWindowsTask(windowsTaskXml(weekly('SAT'), WIN_NODE, WIN_DIR, opts), expected), 'settings');
  assert.equal(checkWindowsTask(windowsTaskXml(daily(), WIN_NODE, WIN_DIR, opts), expected), 'settings');
  assert.equal(checkWindowsTask(windowsTaskXml(weekly('FRI'), 'C:\\nvm\\node.exe', WIN_DIR, opts), expected), 'settings');
  // In der Aufgabenplanung deaktiviert
  assert.equal(checkWindowsTask(queried.replace('<Hidden>', '<Enabled>false</Enabled>\n    <Hidden>'), expected), 'disabled');
});

// --- Linux ---

const LINUX_DIR = "/home/zoë/Tweakable DJ's 100% Ordner";

test('Linux: crontab-Zeile mit Quoting, % und Wochentagen (0 = Sonntag)', () => {
  assert.equal(
    cronLine(daily(), '/usr/bin/node', LINUX_DIR),
    "0 7 * * * cd '/home/zoë/Tweakable DJ'\\''s 100\\% Ordner' && '/usr/bin/node' '/home/zoë/Tweakable DJ'\\''s 100\\% Ordner/dj.mjs' --auto >/dev/null 2>&1"
      + " # tweakable-dj-auto /home/zoë/Tweakable DJ's 100\\% Ordner",
  );
  const fields = line => line.split(' ').slice(0, 5).join(' ');
  assert.equal(fields(cronLine(daily('23:05'), '/usr/bin/node', '/opt/dj')), '5 23 * * *');
  assert.deepEqual(WEEKDAYS.map(day => fields(cronLine(weekly(day, '06:30'), '/usr/bin/node', '/opt/dj'))),
    ['30 6 * * 1', '30 6 * * 2', '30 6 * * 3', '30 6 * * 4', '30 6 * * 5', '30 6 * * 6', '30 6 * * 0']);
  assert.match(cronLine(daily(), '/usr/bin/node', '/opt/dj', { marker: 'tweakable-dj-test-auto' }), / # tweakable-dj-test-auto \/opt\/dj$/);
  assert.throws(() => cronLine(daily(), '/usr/bin/node', '/opt/dj\nrm -rf ~', { lang: 'de' }), /Zeilenumbruch/);
  assert.throws(() => cronLine(daily(), '/usr/bin/node', '/opt/dj\nrm -rf ~', { lang: 'en' }), /line break/);
  assert.throws(() => cronLine({ schedule: 'off' }, '/usr/bin/node', '/opt/dj', { lang: 'de' }), /aus/);
});

test('Linux: fremde crontab-Zeilen bleiben unverändert', () => {
  const ours = cronLine(daily(), '/usr/bin/node', '/opt/dj');
  const foreign = ['# Meine Jobs', 'MAILTO=""', '', '*/5 * * * * /usr/bin/backup --leise  # nachts auch', '@reboot echo hallo'];
  const before = `${foreign.join('\n')}\n`;
  // Ohne crontab bzw. leer
  assert.equal(updateCrontab('', ours), `${ours}\n`);
  assert.equal(updateCrontab('', null), '');
  // Hinzufügen, ersetzen, entfernen
  const added = updateCrontab(before, ours);
  assert.equal(added, `${before}${ours}\n`);
  const changed = cronLine(weekly('SUN', '09:00'), '/usr/bin/node', '/opt/dj');
  assert.equal(updateCrontab(added, changed), `${before}${changed}\n`);
  assert.equal(updateCrontab(added, null), before);
  // Auch ohne Zeilenumbruch am Ende und mit eigener Zeile mitten drin
  assert.equal(updateCrontab(`${foreign[0]}\n${ours}\n${foreign[3]}`, null), `${foreign[0]}\n${foreign[3]}\n`);
  // Ein Test-Eintrag berührt den echten nicht und umgekehrt
  const copy = cronLine(daily(), '/usr/bin/node', '/tmp/kopie', { marker: 'tweakable-dj-test-auto' });
  assert.equal(updateCrontab(added, copy, 'tweakable-dj-test-auto'), `${before}${ours}\n${copy}\n`);
  assert.equal(updateCrontab(`${before}${ours}\n${copy}\n`, null, 'tweakable-dj-test-auto'), `${before}${ours}\n`);
});

// --- macOS ---

const MAC_DIR = '/Users/zoë/Tweakable DJ & Co <neu>';
const plistValue = (plist, key) => plist.match(new RegExp(`<key>${key}</key>\\s*<(string|integer)>([^<]*)</`))?.[2];

test('macOS: LaunchAgent-plist mit maskierten Pfaden und launchd-Wochentagen', () => {
  const plist = launchAgentPlist(daily('07:05'), '/opt/homebrew/bin/node', MAC_DIR);
  assert.ok(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist'));
  assert.equal(plistValue(plist, 'Label'), 'io.github.tweakable-dj.auto');
  assert.equal(plistValue(plist, 'WorkingDirectory'), '/Users/zoë/Tweakable DJ &amp; Co &lt;neu&gt;');
  const args = [...plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)[1].matchAll(/<string>([^<]*)<\/string>/g)].map(m => m[1]);
  assert.deepEqual(args, ['/opt/homebrew/bin/node', '/Users/zoë/Tweakable DJ &amp; Co &lt;neu&gt;/dj.mjs', '--auto']);
  assert.equal(plistValue(plist, 'Hour'), '7');
  assert.equal(plistValue(plist, 'Minute'), '5');
  assert.equal(plistValue(plist, 'Weekday'), undefined, 'täglich: ohne Wochentag');
  assert.doesNotMatch(plist, /&(?!amp;|lt;|gt;)/);
  // launchd: 0 (oder 7) = Sonntag, 1 = Montag … 6 = Samstag
  assert.deepEqual(WEEKDAYS.map(day => plistValue(launchAgentPlist(weekly(day), '/usr/local/bin/node', '/Users/a/dj'), 'Weekday')),
    ['1', '2', '3', '4', '5', '6', '0']);
  assert.equal(plistValue(launchAgentPlist(daily(), '/usr/local/bin/node', '/Users/a/dj', { label: 'io.github.tweakable-dj-test.auto' }), 'Label'),
    'io.github.tweakable-dj-test.auto');
  assert.throws(() => launchAgentPlist({ schedule: 'off' }, '/usr/local/bin/node', '/Users/a/dj', { lang: 'de' }), /aus/);
});

// --- Status und letzter Lauf (ohne Zeitplaner: unbekannte Plattform) ---

test('Status: unbekannte Plattform, letzter Lauf aus automatik.json', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  try {
    const opts = { platform: 'sunos', dir, lang: 'de' };
    const status = await scheduleStatus(daily(), opts);
    assert.equal(status.supported, false);
    assert.equal(status.installed, false);
    assert.match(status.message, /Windows, macOS und Linux/);
    assert.equal(status.lastRun, null);
    // Ausschalten geht dort trotzdem (es ist nichts zu tun), Einschalten nicht
    assert.equal((await applySchedule({ schedule: 'off' }, opts)).supported, false);
    await assert.rejects(applySchedule(daily(), opts), /Windows, macOS und Linux/);
    await assert.rejects(applySchedule(daily(), { ...opts, lang: 'en' }), /only available on Windows, macOS and Linux/);

    const run = {
      startedAt: '2026-10-01T05:00:00.000Z', finishedAt: '2026-10-01T05:01:00.000Z', ok: true, dry: false, songs: 50, fresh: 42, freshCurrent: 10,
      familiar: 8, playlistName: 'Tweakable DJ', playlistUrl: 'https://open.spotify.com/playlist/x', errorCode: null, error: null,
      summary: 'Tweakable DJ: 50 Songs (42 neu, davon 10 über aktuelles Hören; 8 Favoriten)',
    };
    fs.writeFileSync(path.join(dir, 'automatik.json'), JSON.stringify(run));
    assert.deepEqual(lastRun(dir), run);
    assert.deepEqual((await scheduleStatus(daily(), opts)).lastRun, run);
    fs.writeFileSync(path.join(dir, 'automatik.json'), '{ kaputt');
    assert.equal(lastRun(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Neuer Name und Übernahme alter Einträge ---

test('Kennungen: neuer Name, früherer Name "Mein DJ"', () => {
  assert.equal(TASK_NAME, 'Tweakable DJ');
  assert.deepEqual(LEGACY_NAMES, ['Mein DJ']);
  assert.deepEqual(entryIds('Tweakable DJ'), { name: 'Tweakable DJ', label: 'io.github.tweakable-dj.auto', marker: 'tweakable-dj-auto' });
  assert.deepEqual(entryIds('Mein DJ'), { name: 'Mein DJ', label: 'io.github.mein-dj.auto', marker: 'mein-dj-auto' });
  assert.deepEqual(entryIds('Tweakable DJ TEST'), { name: 'Tweakable DJ TEST', label: 'io.github.tweakable-dj-test.auto', marker: 'tweakable-dj-test-auto' });
  assert.match(cronLine(daily(), '/usr/bin/node', '/opt/dj'), / # tweakable-dj-auto \/opt\/dj$/);
});

test('Linux: alte Zeilen von "Mein DJ" verschwinden beim Eintragen und Ausschalten, fremde bleiben', () => {
  const foreign = ['MAILTO=""', '*/5 * * * * /usr/bin/backup  # mein-dj-auto-fremd'];
  const old = "0 7 * * * cd '/home/a/mein-dj' && '/usr/bin/node' '/home/a/mein-dj/dj.mjs' --auto >/dev/null 2>&1 # mein-dj-auto /home/a/mein-dj";
  const ours = cronLine(daily(), '/usr/bin/node', '/home/a/tweakable-dj');
  const before = `${foreign[0]}\n${old}\n${foreign[1]}\n`;
  assert.equal(updateCrontab(before, ours, 'tweakable-dj-auto', ['mein-dj-auto']), `${foreign.join('\n')}\n${ours}\n`);
  assert.equal(updateCrontab(`${before}${ours}\n`, null, 'tweakable-dj-auto', ['mein-dj-auto']), `${foreign.join('\n')}\n`);
  // Ohne legacy bleibt die alte Zeile (z. B. beim Test-Eintrag)
  assert.equal(updateCrontab(before, null, 'tweakable-dj-test-auto'), before);
});

// Simulierter Zeitplaner: Einträge in einer Map, Name → { dir, when }.
function simulated() {
  const entries = new Map();
  const when = s => `${s.schedule} ${s.scheduleTime} ${s.schedule === 'weekly' ? s.scheduleDay : ''}`;
  const calls = [];
  PLATFORMS.sim = {
    async read(o) {
      return entries.get(o.name) ?? null;
    },
    check: (entry, o, s) => (entry.dir !== o.dir ? 'folder' : entry.when !== when(s) ? 'settings' : null),
    async install(o, s) {
      calls.push(`install ${o.name}`);
      entries.set(o.name, { dir: o.dir, when: when(s) });
    },
    async remove(o) {
      calls.push(`remove ${o.name}`);
      entries.delete(o.name);
    },
  };
  return { entries, calls, when };
}

test('Übernahme: alter Eintrag "Mein DJ" wird als leftover gemeldet und beim Eintragen bzw. Ausschalten entfernt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  const { entries, calls, when } = simulated();
  try {
    const opts = { platform: 'sim', dir, lang: 'en' };
    // Nur der alte Eintrag ist da (Update von "Mein DJ"): leftover, auch wenn die Automatik eingestellt ist
    entries.set('Mein DJ', { dir, when: when(daily()) });
    let status = await scheduleStatus(daily(), opts);
    assert.deepEqual([status.supported, status.installed, status.matches, status.problem, status.legacy, status.legacyNames],
      [true, false, false, 'leftover', true, ['Mein DJ']]);
    assert.equal(status.name, 'Tweakable DJ');
    // Automatik aus, alter Eintrag noch da: ebenfalls leftover
    assert.equal((await scheduleStatus({ schedule: 'off' }, opts)).problem, 'leftover');

    // Eintragen: neuer Eintrag kommt, alter verschwindet
    status = await applySchedule(daily(), opts);
    assert.deepEqual(calls, ['install Tweakable DJ', 'remove Mein DJ']);
    assert.deepEqual([...entries.keys()], ['Tweakable DJ']);
    assert.deepEqual([status.matches, status.problem, status.legacy, status.installed], [true, null, false, true]);
    assert.ok(status.nextRun);

    // Neuer Eintrag passt, alter taucht wieder auf (z. B. alte Kopie): leftover statt passt
    entries.set('Mein DJ', { dir: '/anderswo', when: when(daily()) });
    assert.equal((await scheduleStatus(daily(), opts)).problem, 'leftover');
    // Ist der neue Eintrag selbst falsch, geht dieser Grund vor
    assert.equal((await scheduleStatus(weekly('SUN'), opts)).problem, 'settings');

    // Ausschalten entfernt beide
    calls.length = 0;
    status = await applySchedule({ schedule: 'off' }, opts);
    assert.deepEqual(calls, ['remove Tweakable DJ', 'remove Mein DJ']);
    assert.equal(entries.size, 0);
    assert.deepEqual([status.matches, status.problem, status.installed, status.legacy], [true, null, false, false]);

    // Nur der alte Eintrag, Automatik aus: Ausschalten räumt ihn weg
    entries.set('Mein DJ', { dir, when: when(daily()) });
    calls.length = 0;
    await applySchedule({ schedule: 'off' }, opts);
    assert.deepEqual(calls, ['remove Mein DJ']);
  } finally {
    delete PLATFORMS.sim;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Übernahme: ein Test-Eintrag fasst den alten Eintrag nie an', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  const { entries, calls } = simulated();
  try {
    entries.set('Mein DJ', { dir, when: 'x' });
    const opts = { platform: 'sim', dir, name: 'Tweakable DJ TEST' };
    const status = await scheduleStatus(daily(), opts);
    assert.deepEqual([status.legacy, status.problem], [false, 'missing']);
    await applySchedule(daily(), opts);
    await applySchedule({ schedule: 'off' }, opts);
    assert.deepEqual(calls, ['install Tweakable DJ TEST', 'remove Tweakable DJ TEST']);
    assert.ok(entries.has('Mein DJ'));
    // Frühere Namen lassen sich für Tests ausdrücklich angeben
    await applySchedule({ schedule: 'off' }, { ...opts, legacy: ['Mein DJ'] });
    assert.equal(entries.size, 0);
  } finally {
    delete PLATFORMS.sim;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Fehlermeldungen des Zeitplaners in der Sprache der Anfrage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  simulated();
  PLATFORMS.sim.check = () => 'settings'; // passt nie
  try {
    await assert.rejects(applySchedule(daily(), { platform: 'sim', dir, lang: 'de' }), /^Error: Der Eintrag im Zeitplaner stimmt danach nicht \(settings\)\.$/);
    await assert.rejects(applySchedule(daily(), { platform: 'sim', dir, lang: 'en' }), /^Error: The scheduler entry still doesn’t match afterwards \(settings\)\.$/);
    const invalid = await scheduleStatus({ schedule: 'daily', scheduleTime: '7 Uhr' }, { platform: 'sim', dir, lang: 'en' });
    assert.deepEqual([invalid.problem, invalid.message], ['invalid', 'scheduleTime: expected a time as HH:MM, e.g. "07:00"']);
  } finally {
    delete PLATFORMS.sim;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('READMEs, Abschnitt Deinstallieren: Befehle zum Entfernen von Hand mit den echten Kennungen', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const { name, label, marker } = entryIds(TASK_NAME);
  assert.deepEqual([name, label, marker], ['Tweakable DJ', 'io.github.tweakable-dj.auto', 'tweakable-dj-auto']);
  for (const [file, heading] of [['README.md', '## 9. Uninstalling'], ['README.de.md', '## 9. Deinstallieren']]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
    const start = text.indexOf(`\n${heading}\n`);
    assert.ok(start > 0, `${file}: ${heading}`);
    const section = text.slice(start, text.indexOf('\n## ', start + 1));
    for (const s of [`schtasks /Delete /TN "${name}" /F`, `launchctl bootout gui/$(id -u)/${label}`, `rm ~/Library/LaunchAgents/${label}.plist`,
      'crontab -e', `\`${marker}\``]) {
      assert.ok(section.includes(s), `${file}: ${s}`);
    }
  }
});
