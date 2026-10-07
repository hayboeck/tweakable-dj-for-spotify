// Systembenachrichtigungen (notify.mjs): Befehl je Plattform mit heiklen Texten, Zeitlimit und Fehler, Texte nach
// errorCode und wann ein automatischer Lauf überhaupt meldet. Gestartet wird hier nichts: exec ist immer ein Ersatz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  APP_VAR, LOGIN_DAYS, NOTIFY_TIMEOUT, REMIND_DAYS, TOAST_VAR, WINDOWS_APP_ID, autoRunNotice, escapeXml, failureNotice, loginReminderDays,
  notify, notifyCommand, notifyProblem, remindLogin, testNotice, toastXml,
} from '../notify.mjs';

// Text mit allem, was in einer Befehlszeile, in XML oder in AppleScript Ärger machen könnte.
const TRICKY = 'Zoë "Jörg" O\'Neil <b>&amp;</b> $(rm -rf ~) `whoami` %PATH% ; | & ^ \\ \n2. Zeile\r\nä ö ü ß € 🎵';
const TITLE = 'Tweakable DJ: <Test> & "Probe"';

// Ersatz für execFile: merkt sich die Aufrufe; answer(file, args, options) liefert das Ergebnis bzw. wirft.
function fakeExec(answer = () => ({ stdout: '', stderr: '' })) {
  const calls = [];
  const exec = async (file, args, options) => {
    calls.push({ file, args, options });
    return answer(file, args, options);
  };
  return { calls, exec };
}

test('escapeXml: Sonderzeichen maskiert, Steuerzeichen und einzelne Surrogate weg, Zeilenumbrüche vereinheitlicht', () => {
  assert.equal(escapeXml('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  assert.equal(escapeXml('a\u0000b\u0007c\u001bd\te\r\nf\rg'), 'abcd\te\nf\ng');
  assert.equal(escapeXml('x\ud800y\udc00z 🎵'), 'xyz 🎵');
  assert.equal(escapeXml(null), '');
});

test('Windows: PowerShell versteckt, festes Skript als -EncodedCommand, Text nur als maskiertes XML in der Umgebung', () => {
  const env = { SystemRoot: 'C:\\WINDOWS', PATH: 'C:\\x' };
  const cmd = notifyCommand({ title: TITLE, text: TRICKY, platform: 'win32', env });
  assert.equal(cmd.file, 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(cmd.args.slice(0, -1), ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']);
  // Nichts vom Text in der Befehlszeile – auch nicht im Skript
  const script = Buffer.from(cmd.args.at(-1), 'base64').toString('utf16le');
  for (const part of ['Jörg', 'rm -rf', 'whoami', 'Probe', '<Test>']) {
    assert.ok(!cmd.args.join(' ').includes(part) && !script.includes(part), part);
  }
  assert.match(script, /\$xml\.LoadXml\(\$env:TWEAKABLE_DJ_TOAST\)/);
  assert.match(script, /CreateToastNotifier\(\$env:TWEAKABLE_DJ_TOAST_APP\)/);
  assert.match(script, /exit 3/);
  // Text als XML: wohlgeformt, alles maskiert, Umlaute und Emoji unverändert
  assert.equal(cmd.env[APP_VAR], WINDOWS_APP_ID);
  assert.equal(cmd.env[TOAST_VAR], toastXml(TITLE, TRICKY));
  assert.equal(cmd.env[TOAST_VAR],
    '<toast><visual><binding template="ToastGeneric"><text>Tweakable DJ: &lt;Test&gt; &amp; &quot;Probe&quot;</text>'
    + '<text>Zoë &quot;Jörg&quot; O&apos;Neil &lt;b&gt;&amp;amp;&lt;/b&gt; $(rm -rf ~) `whoami` %PATH% ; | &amp; ^ \\ \n2. Zeile\nä ö ü ß € 🎵</text>'
    + '</binding></visual></toast>');
  assert.equal(cmd.env.PATH, 'C:\\x', 'übrige Umgebung bleibt');
  assert.equal(env[TOAST_VAR], undefined, 'Umgebung des Aufrufers unverändert');
  // Ohne SystemRoot: Standardordner
  assert.equal(notifyCommand({ title: 'a', text: 'b', platform: 'win32', env: {} }).file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
});

test('macOS: osascript mit festem Skript, Titel und Text als Argumente (on run argv)', () => {
  const cmd = notifyCommand({ title: TITLE, text: TRICKY, platform: 'darwin', env: { HOME: '/Users/zoë' } });
  assert.equal(cmd.file, '/usr/bin/osascript');
  assert.deepEqual(cmd.args.slice(0, 6), ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run']);
  assert.deepEqual(cmd.args.slice(6), [TITLE, TRICKY.replace(/\r\n/g, '\n')]);
  assert.equal(cmd.args.length, 8);
  assert.deepEqual(cmd.env, { HOME: '/Users/zoë' });
});

test('Linux: notify-send mit -- vor dem Text, Auszeichnung im Text maskiert; Bus des Benutzers nur, wenn keiner gesetzt ist', () => {
  const exists = file => file === '/run/user/1000/bus';
  const cmd = notifyCommand({ title: TITLE, text: TRICKY, platform: 'linux', env: { PATH: '/usr/bin' }, exists, uid: 1000 });
  assert.equal(cmd.file, 'notify-send');
  assert.deepEqual(cmd.args, ['--app-name=Tweakable DJ', '--', TITLE,
    'Zoë "Jörg" O\'Neil &lt;b&gt;&amp;amp;&lt;/b&gt; $(rm -rf ~) `whoami` %PATH% ; | &amp; ^ \\ \n2. Zeile\nä ö ü ß € 🎵']);
  assert.equal(cmd.env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');
  // Schon gesetzt: bleibt; kein Bus: nichts dazu; Prüfung wirft: trotzdem ein Befehl
  const own = notifyCommand({ title: 'a', text: 'b', platform: 'linux', env: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/eigener' }, exists, uid: 1000 });
  assert.equal(own.env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/tmp/eigener');
  assert.equal(notifyCommand({ title: 'a', text: 'b', platform: 'linux', env: {}, exists, uid: 1001 }).env.DBUS_SESSION_BUS_ADDRESS, undefined);
  const throwing = notifyCommand({ title: 'a', text: 'b', platform: 'linux', env: {}, exists: () => { throw new Error('EACCES'); }, uid: 1000 });
  assert.equal(throwing.env.DBUS_SESSION_BUS_ADDRESS, undefined);
  // Andere Plattformen: kein Befehl
  assert.equal(notifyCommand({ title: 'a', text: 'b', platform: 'aix', env: {} }), null);
});

test('notify: startet den Befehl mit Zeitlimit und ohne Fenster; Ergebnis ok', async () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const { calls, exec } = fakeExec();
    assert.deepEqual(await notify({ title: TITLE, text: TRICKY, platform, exec, env: {}, exists: () => false }), { ok: true });
    assert.equal(calls.length, 1);
    const expected = notifyCommand({ title: TITLE, text: TRICKY, platform, env: {}, exists: () => false });
    assert.deepEqual([calls[0].file, calls[0].args, calls[0].options.env], [expected.file, expected.args, expected.env], platform);
    assert.deepEqual([calls[0].options.timeout, calls[0].options.windowsHide], [NOTIFY_TIMEOUT, true]);
  }
  assert.ok(NOTIFY_TIMEOUT <= 10_000);
});

test('notify: Fehler und Zeitüberschreitung werden geschluckt und als Grund zurückgegeben', async () => {
  const fail = error => fakeExec(() => { throw error; }).exec;
  const send = (exec, platform = 'win32', timeoutMs) => notify({ title: 'a', text: 'b', platform, exec, env: {}, timeoutMs });
  assert.deepEqual(await send(fail(Object.assign(new Error('spawn notify-send ENOENT'), { code: 'ENOENT' })), 'linux'),
    { ok: false, reason: 'unavailable', platform: 'linux', detail: 'spawn notify-send ENOENT' });
  assert.deepEqual(await send(fail(Object.assign(new Error('Command failed'), { code: 3, stderr: 'DisabledForUser\r\n' }))),
    { ok: false, reason: 'blocked', platform: 'win32', detail: 'DisabledForUser' });
  assert.deepEqual(await send(fail(Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' }))),
    { ok: false, reason: 'timeout', platform: 'win32', detail: 'Command failed' });
  assert.deepEqual(await send(fail(Object.assign(new Error('Command failed'), { code: 1, stderr: '\nElement not found.\n' }))),
    { ok: false, reason: 'failed', platform: 'win32', detail: 'Element not found.' });
  // Wirft schon beim Aufruf (synchron) bzw. etwas, das kein Error ist
  assert.equal((await send(() => { throw new TypeError('kaputt'); })).reason, 'failed');
  assert.equal((await send(async () => { throw 'nur ein Text'; })).reason, 'failed');
  // Antwortet nie: nach timeoutMs aufgegeben
  const started = Date.now();
  assert.deepEqual(await send(() => new Promise(() => {}), 'darwin', 50), { ok: false, reason: 'timeout', platform: 'darwin', detail: '' });
  assert.ok(Date.now() - started < 2000);
  // Plattform ohne Benachrichtigungen: nichts gestartet
  const { calls, exec } = fakeExec();
  assert.deepEqual(await send(exec, 'aix'), { ok: false, reason: 'unsupported', platform: 'aix', detail: '' });
  assert.equal(calls.length, 0);
});

test('notifyProblem: verständlicher Grund auf Deutsch und Englisch', () => {
  assert.equal(notifyProblem('de', { reason: 'blocked', platform: 'win32', detail: 'DisabledForUser' }),
    'Windows blockiert Benachrichtigungen von Windows PowerShell (DisabledForUser). Einschalten unter Einstellungen › System › Benachrichtigungen.');
  assert.equal(notifyProblem('en', { reason: 'unavailable', platform: 'linux' }),
    'The “notify-send” command is missing. Install the package “libnotify-bin” (Debian, Ubuntu) or “libnotify” (Fedora, Arch).');
  assert.equal(notifyProblem('de', { reason: 'unavailable', platform: 'win32' }), 'Windows PowerShell wurde nicht gefunden.');
  assert.equal(notifyProblem('en', { reason: 'timeout' }), 'No response after 10 seconds.');
  assert.equal(notifyProblem('de', { reason: 'failed', detail: 'Element not found.' }), 'Senden fehlgeschlagen: Element not found.');
  assert.equal(notifyProblem('en', { reason: 'unsupported' }), 'Notifications are only available on Windows, macOS and Linux.');
});

test('failureNotice: Grund aus errorCode und was zu tun ist; sonst die erste Zeile der Fehlermeldung', () => {
  assert.deepEqual(failureNotice('de', { errorCode: 'login_expired', error: 'Spotify-Anmeldung abgelaufen (invalid_grant). …' }), {
    title: 'Tweakable DJ: automatischer Lauf fehlgeschlagen',
    text: 'Die Spotify-Anmeldung ist abgelaufen.\nÖffne Tweakable DJ und melde dich neu bei Spotify an.',
  });
  assert.deepEqual(failureNotice('en', { errorCode: 'lastfm_key', error: 'Last.fm has suspended your API key. …' }), {
    title: 'Tweakable DJ: automatic run failed',
    text: 'The Last.fm API key is invalid or suspended.\nOpen Tweakable DJ and enter a valid API key under “Change credentials”.',
  });
  // Netzwerkfehler (errorCode other): eigener Rat
  assert.equal(failureNotice('de', { errorCode: 'other', error: 'fetch failed' }).text,
    'Keine Verbindung zu Spotify oder Last.fm.\nPrüfe die Internetverbindung. Der nächste automatische Lauf versucht es wieder.');
  assert.match(failureNotice('en', { errorCode: 'other', error: 'getaddrinfo ENOTFOUND api.spotify.com' }).text, /^No connection to Spotify or Last\.fm\./);
  // Sonst: erste Zeile, gekürzt
  assert.equal(failureNotice('en', { errorCode: 'other', error: 'Spotify GET /me: 500 Internal\n  at x' }).text,
    'Spotify GET /me: 500 Internal\nOpen Tweakable DJ; details are in automatik.log in the Tweakable DJ folder.');
  const long = failureNotice('de', { errorCode: 'other', error: 'x'.repeat(500) }).text.split('\n')[0];
  assert.equal(long.length, 200);
  assert.ok(long.endsWith('…'));
  assert.equal(failureNotice('de', { errorCode: 'other', error: null }).text.split('\n')[0], 'Unbekannter Fehler.');
  // Jeder bekannte Code hat Grund und Rat in beiden Sprachen
  for (const lang of ['de', 'en']) {
    for (const errorCode of ['login_expired', 'not_logged_in', 'forbidden', 'lastfm_key', 'setup_incomplete', 'node_version']) {
      const { text } = failureNotice(lang, { errorCode, error: 'x' });
      assert.ok(!text.includes('notify.') && text.split('\n').length === 2 && !text.startsWith('x'), `${lang} ${errorCode}: ${text}`);
    }
  }
  assert.deepEqual(testNotice('en'), { title: 'Tweakable DJ: test notification', text: 'This is how Tweakable DJ tells you when an automatic run fails.' });
});

test('autoRunNotice: nur bei Fehlern, Schalter wirkt; Erfolg und laufende Läufe melden nie', () => {
  const failed = { ok: false, errorCode: 'login_expired', error: 'abgelaufen' };
  assert.equal(autoRunNotice({ result: failed, lang: 'de' }).title, 'Tweakable DJ: automatischer Lauf fehlgeschlagen');
  assert.equal(autoRunNotice({ result: failed, lang: 'de', enabled: false }), null, 'Schalter aus');
  assert.equal(autoRunNotice({ result: { ok: true }, lang: 'de' }), null);
  assert.equal(autoRunNotice({ result: { ok: null }, lang: 'de' }), null);
  assert.equal(autoRunNotice({ result: null, lang: 'de' }), null);
});

test('loginReminderDays: in der letzten Woche vor dem Ablauf, höchstens einmal am Tag', () => {
  const now = new Date(2026, 9, 6, 7, 0);
  const days = n => now.getTime() - n * 86_400_000;
  assert.equal(loginReminderDays({ authorizedAt: null, now }), null);
  assert.equal(loginReminderDays({ authorizedAt: days(LOGIN_DAYS - REMIND_DAYS - 0.5), now }), null, 'Tag 172: noch nicht');
  assert.equal(loginReminderDays({ authorizedAt: days(LOGIN_DAYS - REMIND_DAYS), now }), 7);
  assert.equal(loginReminderDays({ authorizedAt: days(LOGIN_DAYS + 0.5), now }), 0, 'heute');
  assert.equal(loginReminderDays({ authorizedAt: days(LOGIN_DAYS + 1), now }), null, 'schon abgelaufen');
  assert.equal(loginReminderDays({ authorizedAt: days(175), lastAt: new Date(2026, 9, 6, 0, 1).toISOString(), now }), null, 'heute schon');
  assert.equal(loginReminderDays({ authorizedAt: days(175), lastAt: new Date(2026, 9, 5, 23, 59).toISOString(), now }), 5);
  assert.equal(loginReminderDays({ authorizedAt: days(175), lastAt: 'kaputt', now }), 5);
});

test('remindLogin: sendet, merkt sich den Tag in state.json (Rest bleibt), Schalter wirkt, kaputte state.json bleibt', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj erinnerung ö-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const now = new Date(2026, 9, 6, 7, 0);
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ refresh_token: 'x', authorized_at: now.getTime() - 175 * 86_400_000 }));
  const sent = [];
  const send = async notice => (sent.push(notice), { ok: true });
  assert.equal(await remindLogin({ dir, lang: 'de', enabled: false, now, send }), null);
  assert.deepEqual(await remindLogin({ dir, lang: 'de', now, send }), { ok: true });
  assert.deepEqual(sent, [{ title: 'Tweakable DJ: Spotify-Anmeldung läuft bald ab', text: 'Die Spotify-Anmeldung läuft in 5 Tagen ab – öffne Tweakable DJ und melde dich neu an.' }]);
  const state = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  assert.deepEqual(state('state.json'), { history: [], cache: {}, loginReminderAt: now.toISOString() }, 'neu angelegt wie von dj.mjs');
  assert.equal(await remindLogin({ dir, lang: 'de', now, send }), null, 'heute schon erinnert');
  // Nicht angekommen: nicht merken (nächster Start versucht es wieder)
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ history: [['a|b']], cache: { k: null } }));
  assert.deepEqual(await remindLogin({ dir, lang: 'en', now, send: async () => ({ ok: false, reason: 'blocked' }) }), { ok: false, reason: 'blocked' });
  assert.equal(state('state.json').loginReminderAt, undefined);
  await remindLogin({ dir, lang: 'en', now, send });
  assert.deepEqual(state('state.json'), { history: [['a|b']], cache: { k: null }, loginReminderAt: now.toISOString() });
  assert.equal(sent.at(-1).text, 'Your Spotify login expires in 5 days – open Tweakable DJ and log in again.');
  fs.writeFileSync(path.join(dir, 'state.json'), '{ kaputt');
  assert.equal(await remindLogin({ dir, lang: 'de', now, send }), null);
  assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), '{ kaputt');
});
