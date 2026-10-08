// Systembenachrichtigungen: wenn ein automatischer Lauf (dj.mjs --auto) fehlschlägt, als Erinnerung kurz bevor die
// Spotify-Anmeldung abläuft, und für „Testbenachrichtigung senden“ in der Oberfläche.
// Nur Bordmittel des Systems, keine Abhängigkeiten:
//   Windows: PowerShell zeigt eine Toast-Benachrichtigung (Windows.UI.Notifications) unter der App-Kennung von Windows
//            PowerShell – die gibt es auf jedem Windows 10/11, eine eigene Registrierung ist nicht nötig. Der Text kommt
//            als fertig maskiertes XML in einer Umgebungsvariable, das (feste) Skript als -EncodedCommand: In der
//            Befehlszeile steht nichts vom Text, also lässt sich nichts einschleusen.
//   macOS:   osascript mit "display notification"; Titel und Text als Argumente des Skripts (on run argv), nie im Skript.
//   Linux:   notify-send, falls vorhanden. Fehlt DBUS_SESSION_BUS_ADDRESS (z. B. unter cron), der übliche Bus des Benutzers
//            (/run/user/<uid>/bus), sofern es ihn gibt.
// Eine Benachrichtigung darf nie einen Lauf stören: notify() wirft nie und gibt spätestens nach timeoutMs auf.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readText, writeAtomic } from './files.mjs';
import { t } from './i18n.mjs';

export const NOTIFY_TIMEOUT = 10_000;
// App-Kennung (AppUserModelID) von Windows PowerShell; Windows zeigt sie als Absender „Windows PowerShell“.
export const WINDOWS_APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';
export const TOAST_VAR = 'TWEAKABLE_DJ_TOAST';
export const APP_VAR = 'TWEAKABLE_DJ_TOAST_APP';
// Exit-Code des Skripts, wenn Windows Benachrichtigungen dieser App abgeschaltet hat (Einstellung auf stderr).
const BLOCKED_EXIT = 3;

// Spotify verlangt nach 180 Tagen eine neue Anmeldung (spotify.mjs); eine Woche vorher erinnert eine Benachrichtigung daran
// (Einstellung remindLogin, remindLogin() unten), höchstens einmal am Tag.
export const LOGIN_DAYS = 180;
export const REMIND_DAYS = 7;
const DAY = 86_400_000;

// Festes PowerShell-Skript: liest XML und App-Kennung nur aus der Umgebung. Exit 3 = von Windows blockiert.
const PS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$ProgressPreference = 'SilentlyContinue'",
  'try {',
  '  $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]',
  '  $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]',
  '  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
  `  $xml.LoadXml($env:${TOAST_VAR})`,
  `  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:${APP_VAR})`,
  // Setting ist in Windows PowerShell 5.1 oft $null (nicht lesbar); nur ein lesbares „nicht Enabled“ zählt als blockiert.
  '  $setting = $notifier.Setting',
  `  if ($null -ne $setting -and [string]$setting -ne 'Enabled') { [Console]::Error.WriteLine([string]$setting); exit ${BLOCKED_EXIT} }`,
  '  $notifier.Show((New-Object Windows.UI.Notifications.ToastNotification $xml))',
  '} catch {',
  '  [Console]::Error.WriteLine($_.Exception.Message)',
  '  exit 1',
  '}',
].join('\n');

// Steuerzeichen (außer Tab und Zeilenumbruch) und einzelne Surrogate sind in XML nicht erlaubt und stören auch sonst nur.
const tidy = s => String(s ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');

export const escapeXml = s => tidy(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// notify-send deutet den Text als einfache Auszeichnung (<b>, &amp; …); der Titel bleibt reiner Text.
const escapeMarkup = s => tidy(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const toastXml = (title, text) =>
  `<toast><visual><binding template="ToastGeneric"><text>${escapeXml(title)}</text><text>${escapeXml(text)}</text></binding></visual></toast>`;

// Befehl für die Plattform: { file, args, env } oder null (keine Benachrichtigungen auf dieser Plattform).
// exists und uid nur für die Tests (Linux: gibt es den Bus des Benutzers?).
export function notifyCommand({ title, text, platform = process.platform, env = process.env, exists = fs.existsSync, uid = process.getuid?.() }) {
  if (platform === 'win32') {
    const root = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
    return {
      file: `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', Buffer.from(PS_SCRIPT, 'utf16le').toString('base64')],
      env: { ...env, [TOAST_VAR]: toastXml(title, text), [APP_VAR]: WINDOWS_APP_ID },
    };
  }
  if (platform === 'darwin') {
    // Der Titel beginnt immer mit „Tweakable DJ“, also nie mit „-“: osascript nimmt ihn und alles danach als Argumente.
    return {
      file: '/usr/bin/osascript',
      args: ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run',
        tidy(title), tidy(text)],
      env,
    };
  }
  if (platform === 'linux' || platform === 'freebsd' || platform === 'openbsd') {
    const extra = {};
    if (!env.DBUS_SESSION_BUS_ADDRESS && uid != null) {
      const bus = `/run/user/${uid}/bus`;
      try {
        if (exists(bus)) extra.DBUS_SESSION_BUS_ADDRESS = `unix:path=${bus}`;
      } catch {
        // ohne Bus versuchen
      }
    }
    return { file: 'notify-send', args: ['--app-name=Tweakable DJ', '--', tidy(title), escapeMarkup(text)], env: { ...env, ...extra } };
  }
  return null;
}

// Startet ein Programm ohne Shell; Fehler tragen code (Exit-Code oder z. B. 'ENOENT'), killed und stderr.
function runFile(file, args, options) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: 'utf8', maxBuffer: 64 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

const firstLine = (s, max = 200) => {
  const line = String(s ?? '').split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

// Fehler des Befehls → { ok: false, reason, detail }: unavailable (Programm fehlt), blocked (Windows hat Benachrichtigungen
// dieser App abgeschaltet), timeout, failed.
function failure(e, platform) {
  const detail = firstLine(e?.stderr) || firstLine(e?.message);
  if (e?.code === 'ENOENT') return { ok: false, reason: 'unavailable', platform, detail };
  if (e?.killed || e?.code === 'ETIMEDOUT') return { ok: false, reason: 'timeout', platform, detail };
  if (platform === 'win32' && e?.code === BLOCKED_EXIT) return { ok: false, reason: 'blocked', platform, detail };
  return { ok: false, reason: 'failed', platform, detail };
}

// Zeigt eine Benachrichtigung. exec(file, args, options) startet das Programm (Standard: execFile ohne Shell) und liefert
// ein Promise, das bei einem Fehler ablehnt. Ergebnis: { ok: true } bzw. { ok: false, reason, platform, detail };
// reason: unsupported, unavailable, blocked, timeout, failed. Wirft nie.
export async function notify({ title, text, platform = process.platform, exec = runFile, env = process.env, timeoutMs = NOTIFY_TIMEOUT, ...rest } = {}) {
  let command;
  try {
    command = notifyCommand({ title, text, platform, env, ...rest });
  } catch (e) {
    return { ok: false, reason: 'failed', platform, detail: firstLine(e?.message) };
  }
  if (!command) return { ok: false, reason: 'unsupported', platform, detail: '' };
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve({ ok: false, reason: 'timeout', platform, detail: '' }), timeoutMs);
  });
  const attempt = (async () => {
    try {
      await exec(command.file, command.args, { env: command.env, timeout: timeoutMs, windowsHide: true });
      return { ok: true };
    } catch (e) {
      return failure(e, platform);
    }
  })();
  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Warum keine Benachrichtigung ankam, als Satz in der Sprache lang (für die Oberfläche und automatik.log).
export function notifyProblem(lang, result) {
  const { reason, platform, detail } = result ?? {};
  if (reason === 'unsupported') return t(lang, 'notify.unsupported');
  if (reason === 'unavailable') return t(lang, platform === 'win32' || platform === 'darwin' ? `notify.unavailable.${platform}` : 'notify.unavailable.linux');
  if (reason === 'blocked') return t(lang, 'notify.blocked', { setting: detail || '?' });
  if (reason === 'timeout') return t(lang, 'notify.timeout', { seconds: NOTIFY_TIMEOUT / 1000 });
  return t(lang, 'notify.failed', { detail: detail || '?' });
}

// Fehlerarten mit eigenem Grund und Rat; alles andere nennt die erste Zeile der Fehlermeldung.
const KNOWN = ['login_expired', 'not_logged_in', 'forbidden', 'lastfm_key', 'setup_incomplete', 'node_version', 'network'];
// Netzwerkfehler von fetch (errorCode 'other'): kein eigener errorCode, aber ein eigener Rat.
const NETWORK = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|UND_ERR|socket hang up/i;

// Titel und Text für einen fehlgeschlagenen Lauf (errorCode und error wie in automatik.json). now: Lauf von „Playlist jetzt
// neu erstellen“ (dj.mjs --now) – eigener Titel, Rat mit jetzt.log statt automatik.log und ohne „der nächste automatische Lauf“.
const NOW_ACTIONS = ['forbidden', 'network', 'other'];
export function failureNotice(lang, { errorCode, error } = {}, { now = false } = {}) {
  const code = errorCode === 'other' && NETWORK.test(String(error ?? '')) ? 'network' : errorCode;
  const known = KNOWN.includes(code);
  const reason = known ? t(lang, `notify.reason.${code}`) : firstLine(error) || t(lang, 'notify.reason.other');
  const action = known ? code : 'other';
  return {
    title: t(lang, now ? 'notify.nowFailedTitle' : 'notify.failedTitle'),
    text: `${reason}\n${t(lang, `notify.action.${action}${now && NOW_ACTIONS.includes(action) ? 'Now' : ''}`)}`,
  };
}

// „Playlist jetzt neu erstellen“ (dj.mjs --now): Ergebnis (wie @@RESULT) als Benachrichtigung – immer, auch ohne
// notifyOnFailure, denn man hat gerade selbst doppelgeklickt.
export function nowNotice(lang, result) {
  if (result?.ok !== true) return failureNotice(lang, result, { now: true });
  return { title: t(lang, 'notify.nowDoneTitle'), text: t(lang, 'notify.nowDoneText', { name: result.playlistName ?? '', songs: result.songs ?? 0 }) };
}
export const nowBusyNotice = lang => ({ title: t(lang, 'notify.nowBusyTitle'), text: t(lang, 'notify.nowBusyText') });
// … und gleich beim Start, damit man nach dem Doppelklick sofort sieht, dass es losgeht (name: Playlist, null = unbekannt).
export const nowStartNotice = (lang, name) => ({
  title: t(lang, 'notify.nowDoneTitle'), text: name ? t(lang, 'notify.nowStartText', { name }) : t(lang, 'notify.nowStartTextNoName'),
});

// Erinnerung: Die Spotify-Anmeldung läuft in daysLeft Tagen ab (0 = heute).
export function loginNotice(lang, daysLeft) {
  return { title: t(lang, 'notify.loginTitle'), text: t(lang, daysLeft > 0 ? 'notify.loginText' : 'notify.loginTextToday', { days: daysLeft }) };
}

export const testNotice = lang => ({ title: t(lang, 'notify.testTitle'), text: t(lang, 'notify.testText') });

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Benachrichtigung nach einem automatischen Lauf: { title, text } oder null (= keine). Nur bei einem Fehler.
//   result:  Ergebnis wie in automatik.json (ok, errorCode, error)
//   enabled: Einstellung notifyOnFailure (aus = gar keine Benachrichtigung)
// Die Erinnerung an die Spotify-Anmeldung ist davon getrennt (remindLogin, Einstellung remindLogin).
export function autoRunNotice({ result, lang, enabled = true }) {
  if (!enabled || result?.ok !== false) return null;
  return failureNotice(lang, result);
}

// Erinnerung an die Spotify-Anmeldung fällig? → Tage bis zum Ablauf (0 = heute) oder null.
//   authorizedAt: Zeitpunkt der Anmeldung (ms, aus tokens.json); lastAt: letzte Erinnerung (ISO, aus state.json)
// Fällig in den letzten REMIND_DAYS Tagen vor dem Ablauf, höchstens einmal am Tag. Danach ist die Anmeldung abgelaufen –
// das meldet dann der Lauf selbst (notifyOnFailure) bzw. der Hinweis in der Oberfläche.
export function loginReminderDays({ authorizedAt, lastAt = null, now = new Date() }) {
  if (!Number.isFinite(authorizedAt)) return null;
  const left = LOGIN_DAYS - Math.floor((now - authorizedAt) / DAY);
  if (left > REMIND_DAYS || left < 0) return null;
  const last = lastAt ? new Date(lastAt) : null;
  if (last && !Number.isNaN(last.getTime()) && sameDay(last, now)) return null;
  return left;
}

const readJsonFile = file => {
  try {
    return JSON.parse(readText(file));
  } catch {
    return undefined;
  }
};
const isObject = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Erinnerung an die Spotify-Anmeldung senden, wenn sie fällig ist (beim Start der Oberfläche und nach automatischen Läufen).
// dir = Programmordner (tokens.json, state.json); enabled = Einstellung remindLogin. Die letzte Erinnerung kommt nach
// state.json (loginReminderAt), aber nur, wenn sie angekommen ist. Ergebnis: null (aus bzw. nicht fällig) oder das von
// notify(); wirft nie.
export async function remindLogin({ dir, lang, enabled = true, now = new Date(), send = notify }) {
  try {
    if (!enabled) return null;
    const authorizedAt = Number(readJsonFile(path.join(dir, 'tokens.json'))?.authorized_at) || null;
    const stateFile = path.join(dir, 'state.json');
    const state = fs.existsSync(stateFile) ? readJsonFile(stateFile) : {};
    // Kaputte state.json nie überschreiben (Verlauf und Such-Cache); dann eben ohne Erinnerung.
    if (!isObject(state)) return null;
    const days = loginReminderDays({ authorizedAt, lastAt: state.loginReminderAt, now });
    if (days === null) return null;
    const sent = await send(loginNotice(lang, days));
    if (sent.ok) {
      // Frisch lesen: Ein Lauf kann state.json inzwischen geschrieben haben. Ohne Datei so, wie dj.mjs sie anlegt. Atomar
      // schreiben (files.mjs), damit ein Lauf daneben nie eine halbe Datei liest.
      const fresh = fs.existsSync(stateFile) ? readJsonFile(stateFile) : { history: [], cache: {} };
      if (isObject(fresh)) writeAtomic(stateFile, JSON.stringify({ ...fresh, loginReminderAt: now.toISOString() }, null, 2));
    }
    return sent;
  } catch (e) {
    return { ok: false, reason: 'failed', platform: process.platform, detail: firstLine(e?.message) };
  }
}
