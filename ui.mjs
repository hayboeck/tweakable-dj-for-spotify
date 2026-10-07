#!/usr/bin/env node
// Oberfläche für Tweakable DJ: Einrichtung, Regler für alle Einstellungen, Probelauf, Übernehmen des Probelaufs,
// Neuerstellung, Export und Import als Textdatei im Browser, das Playlist-Archiv (archive.mjs) zum Zurückholen sowie die
// Verknüpfung auf dem Desktop (shortcut.mjs).
//   node ui.mjs                startet die Oberfläche auf http://127.0.0.1:8899 (anderer Port: TWEAKABLE_DJ_PORT)
//   node ui.mjs --no-browser   dasselbe, ohne den Browser zu öffnen (so auch beim Neustart nach einem Update)
//   node ui.mjs --hidden       ohne Fenster (so startet die Verknüpfung auf dem Desktop; auch TWEAKABLE_DJ_HIDDEN=1): Ausgaben
//                              in ui.log, Probleme beim Start als Systembenachrichtigung, und ohne offene Seite beendet sich
//                              der Server nach 10 Minuten von selbst (TWEAKABLE_DJ_IDLE_MS)
// Läuft schon eine Oberfläche auf dem Port, öffnet ein zweiter Start nur den Browser und endet; ein fremdes Programm auf dem
// Port meldet er. „Tweakable DJ beenden“ in der Oberfläche: POST /api/quit.
// Sprache der Antworten: Header "X-Lang: de|en|es|fr" der Anfrage, sonst "language" aus config.jsonc, sonst die Systemsprache.
// Nach „Jetzt aktualisieren“ (POST /api/update/install) beendet sich der Server mit Exit-Code 75, wenn ihn eine Startdatei
// gestartet hat (TWEAKABLE_DJ_LAUNCHER=1); die startet ihn dann mit den neuen Dateien neu. Sonst endet er mit 0 und bittet
// darum, Tweakable DJ neu zu starten.
// Nur für Tests: TWEAKABLE_DJ_BROWSER=<Datei> hängt die Adresse an diese Datei an, statt den Browser zu öffnen.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  CONFIG, DEFAULTS, HERE, LIMITS, VARIETY_KEYS, VARIETY_LEVELS, checkValues, configLanguage, isPlaceholder, missingCredentials, numberProblems, readConfig, remindLoginOn,
  saveCredentials, updateConfig,
} from './config.mjs';
import { locale, resolveLang, systemLang, t } from './i18n.mjs';
import { applySchedule, scheduleStatus } from './schedule.mjs';
import { createShortcut, removeShortcut, SHORTCUTS, shortcutStatus } from './shortcut.mjs';
import { createSpotify, isScopeError, LIBRARY_SCOPE, login, openBrowser, REDIRECT_URI, SCOPE_LIST } from './spotify.mjs';
import { autoRunMessage, autoRunSince, installBlocker, installUpdate } from './install-update.mjs';
import { NOW_RESULT } from './schedule.mjs';
import { notify, notifyProblem, remindLogin, testNotice } from './notify.mjs';
import {
  exportFileName, formatExport, IMPORT_MAX_BYTES, importDescription, importHints, parseImport, readPlaylist, resolveImport, validUris,
  writePlaylist,
} from './playlist.mjs';
import { readTrial, trialInfo, trialProblem } from './trial.mjs';
import { archiveFileCount, archivePlaylist, listArchive, readArchive, undoTarget } from './archive.mjs';
import { checkForUpdate, currentVersion } from './update.mjs';
import { markSeen, whatsNew } from './whatsnew.mjs';

// Sprache für Konsole und Anfragen ohne X-Lang.
const defaultLang = () => resolveLang(configLanguage());

// Ohne Fenster gestartet (Verknüpfung auf dem Desktop: Startdatei mit --hidden)?
const HIDDEN = process.argv.includes('--hidden') || process.env.TWEAKABLE_DJ_HIDDEN === '1';
// Protokoll ohne Fenster: ui.log, höchstens etwa LOG_MAX Bytes; dann kommt es nach ui.old.log und ui.log beginnt neu.
const UI_LOG = 'ui.log';
const UI_LOG_OLD = 'ui.old.log';
const LOG_MAX = 1_000_000;
// Ohne Fenster: so lange ohne Lebenszeichen einer Seite (sie fragt alle 30 s GET /api/version), dann beenden.
const IDLE_MS = Number(process.env.TWEAKABLE_DJ_IDLE_MS) > 0 ? Number(process.env.TWEAKABLE_DJ_IDLE_MS) : 10 * 60_000;

// Ohne Fenster: alles, was sonst in der Konsole stünde, nach ui.log (die Konsole sieht niemand).
function logToFile() {
  const file = path.join(HERE, UI_LOG);
  let fd = null;
  let size = 0;
  const open = () => {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX) fs.renameSync(file, path.join(HERE, UI_LOG_OLD));
    } catch {
      // z. B. von einem zweiten Start gerade offen: dann eben weiter anhängen
    }
    try {
      size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      fd = fs.openSync(file, 'a');
    } catch {
      fd = null; // ohne Protokoll weiter
    }
  };
  const write = chunk => {
    if (fd === null) return;
    try {
      const data = Buffer.from(chunk);
      fs.writeSync(fd, data);
      size += data.length;
      if (size > LOG_MAX) {
        fs.closeSync(fd);
        open();
      }
    } catch {
      fd = null;
    }
  };
  open();
  for (const stream of [process.stdout, process.stderr]) {
    stream.write = (chunk, encoding, callback) => {
      write(chunk);
      (typeof encoding === 'function' ? encoding : callback)?.();
      return true;
    };
  }
  console.log(`\n=== ${new Date().toISOString()} · Tweakable DJ ${currentVersion() ?? '?'} · ${process.argv.slice(2).join(' ')}`);
}
if (HIDDEN) logToFile();

// Start bzw. Server gescheitert: Meldung in die Konsole bzw. nach ui.log. Ohne Fenster zusätzlich eine Systembenachrichtigung
// (title = Schlüssel des Titels) und Ende mit 0 – sonst startete die Startdatei mit Fenster neu, der Grund ist ja gemeldet.
async function giveUp(message, title = 'ui.startFailedTitle') {
  const lang = defaultLang();
  console.error(message);
  if (!HIDDEN) process.exit(1);
  const first = String(message).split('\n').find(l => l.trim()) ?? '';
  await notify({ title: t(lang, title), text: `${first}\n${t(lang, 'ui.logHint')}` });
  process.exit(0);
}
if (HIDDEN) {
  const crashed = e => giveUp(t(defaultLang(), 'run.error', { message: e?.stack ?? e }), 'ui.crashedTitle');
  process.on('uncaughtException', crashed);
  process.on('unhandledRejection', crashed);
}

// Gleiche Mindestversion wie dj.mjs – sonst käme die Meldung erst beim ersten Lauf.
if (Number(process.versions.node.split('.')[0]) < 18) {
  await giveUp(t(defaultLang(), 'node.tooOld', { version: process.versions.node }));
}

const PORT = Number(process.env.TWEAKABLE_DJ_PORT || 8899);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  await giveUp(t(defaultLang(), 'ui.badPort', { value: process.env.TWEAKABLE_DJ_PORT }));
}
const HOST = `127.0.0.1:${PORT}`;
const URL_BASE = `http://${HOST}`;
const TOKENS = path.join(HERE, 'tokens.json');
const LOGIN_TIMEOUT = 5 * 60_000;
const DAY = 86_400_000;
const LOGIN_CODES = ['login_expired', 'not_logged_in'];
// Fest erlaubte Dateien für die Seite: Logo im Kopf und Symbol im Browser-Tab (aus assets/). Nur genau diese Pfade –
// sonst liefert der Server keine Dateien aus dem Ordner (dort liegen config.jsonc, tokens.json usw.).
const STATIC = {
  '/assets/logo.png': { file: 'logo.png', type: 'image/png' },
  '/assets/logo-small.svg': { file: 'logo-small.svg', type: 'image/svg+xml' },
};
const noBrowser = process.argv.includes('--no-browser');
// Version beim Start: Nach einem Update meldet erst der neu gestartete Server die neue (GET /api/version).
const VERSION = currentVersion();
// Von Tweakable DJ.cmd, Tweakable DJ.command bzw. start.sh gestartet? Die starten nach Exit-Code 75 neu.
const LAUNCHER = process.env.TWEAKABLE_DJ_LAUNCHER === '1';
const RESTART_CODE = 75;
const APP_ID = 'tweakable-dj'; // in GET /api/version: So erkennt ein zweiter Start die eigene Oberfläche
let running = null;           // gestarteter Lauf von dj.mjs (Probelauf, Neuerstellung oder Übernehmen)
let loginJob = null;
let installing = false;
let importing = false;        // Import aus einer Textdatei (Suche oder Schreiben)
let lastSeen = Date.now();    // letzte Anfrage einer Seite (für das Beenden ohne offene Seite)
let quitting = false;

// Browser mit der Oberfläche öffnen (TWEAKABLE_DJ_BROWSER: nur für Tests, siehe oben).
function openPage() {
  const file = process.env.TWEAKABLE_DJ_BROWSER;
  if (!file) return openBrowser(URL_BASE);
  try {
    fs.appendFileSync(file, `${URL_BASE}\n`);
  } catch {
    // nur für Tests
  }
}

// Body der Anfrage als Text, höchstens max Bytes; tooLarge = Schlüssel der Meldung, wenn er größer ist.
function readBody(req, lang, max = 100_000, tooLarge = 'ui.tooLarge') {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      if (size > max) return; // schon zu groß: Rest nur noch verwerfen, nicht sammeln
      size += chunk.length;
      if (size > max) reject(new Error(t(lang, tooLarge)));
      else chunks.push(chunk);
    });
    // Erst am Ende umwandeln, dann bleiben Umlaute heil, auch wenn sie auf zwei Teile verteilt ankommen.
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const readJson = async (req, lang) => JSON.parse((await readBody(req, lang)) || '{}');

// Config lesen, ohne sie anzulegen – das passiert erst, wenn der Assistent etwas speichert.
const currentConfig = lang => (fs.existsSync(CONFIG) ? readConfig(lang) : { ...DEFAULTS });

function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
  } catch {
    return null;
  }
}

// Stand der Einrichtung: Fehlt noch etwas, zeigt die Seite den Assistenten statt der Regler.
function setupStatus(cfg) {
  const tokens = readTokens();
  const configExists = fs.existsSync(CONFIG);
  const missing = missingCredentials(cfg);
  const loggedIn = Boolean(tokens?.refresh_token);
  const authorizedAt = Number(tokens?.authorized_at) || null;
  // Fehlende Berechtigungen (z. B. user-follow-read bei älteren Anmeldungen); null = unbekannt, weil tokens.json
  // aus einer älteren Version noch keine scope enthält – die kommt beim nächsten Erneuern des Tokens dazu.
  const granted = typeof tokens?.scope === 'string' ? tokens.scope.split(/\s+/) : null;
  const clean = v => (typeof v === 'string' && !isPlaceholder(v) ? v : '');
  return {
    needsSetup: !configExists || missing.length > 0 || !loggedIn,
    configExists,
    missing,
    loggedIn,
    authorizedAt,
    authAgeDays: authorizedAt ? Math.floor((Date.now() - authorizedAt) / DAY) : null,
    missingScopes: loggedIn && granted ? SCOPE_LIST.filter(s => !granted.includes(s)) : null,
    redirectUri: REDIRECT_URI,
    credentials: { clientId: clean(cfg.spotify?.clientId), apiKey: clean(cfg.lastfm?.apiKey), user: clean(cfg.lastfm?.user) },
  };
}

// Prüft API-Key und Benutzer direkt bei Last.fm (user.getInfo; ohne Benutzer nur den Key).
async function checkLastfm({ apiKey = '', user = '' }, lang) {
  apiKey = String(apiKey).trim();
  user = String(user).trim();
  const fail = (kind, key, params) => ({ ok: false, kind, message: t(lang, key, params) });
  if (!/^[0-9a-f]{32}$/i.test(apiKey)) return fail('key', 'ui.keyFormat');
  if (user && !/^[\w.-]{2,30}$/.test(user)) return fail('user', 'ui.userFormat');
  const params = user ? { method: 'user.getInfo', user } : { method: 'chart.getTopArtists', limit: '1' };
  let data;
  try {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({ ...params, api_key: apiKey, format: 'json' })}`, {
      signal: AbortSignal.timeout(10_000),
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok && !data.error) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    return fail('net', 'ui.lastfmOffline', { detail: e.message });
  }
  // 10 = Key ungültig, 26 = Key gesperrt, 6 = Benutzer unbekannt
  if (data.error === 10) return fail('key', 'ui.keyInvalid');
  if (data.error === 26) return fail('key', 'ui.keySuspended');
  if (data.error === 6) return fail('user', 'ui.userUnknown', { user });
  if (data.error) return fail('other', 'ui.lastfmReports', { message: data.message ?? t(lang, 'ui.lastfmError', { code: data.error }) });
  if (!user) return { ok: true, scrobbles: null, message: t(lang, 'ui.keyOkNoUser') };
  const name = data.user?.name ?? user;
  const scrobbles = Number(data.user?.playcount) || 0;
  return {
    ok: true,
    name,
    scrobbles,
    message: scrobbles
      ? t(lang, 'ui.lastfmOk', { name, scrobbles })
      : t(lang, 'ui.noScrobbles', { name }),
  };
}

// Anmeldung bei Spotify im Hintergrund; die Seite fragt den Stand per GET /api/login ab.
// Die Meldung kommt in der Sprache der Anfrage, mit der die Anmeldung gestartet wurde.
const loginView = () => (loginJob
  ? { status: loginJob.status, message: loginJob.message, authUrl: loginJob.status === 'pending' ? loginJob.authUrl : null }
  : { status: 'idle', message: '' });

function startLogin(clientId, lang) {
  const controller = new AbortController();
  const job = { status: 'pending', message: '', authUrl: null, controller };
  let urlReady;
  const ready = new Promise(resolve => (urlReady = resolve));
  const onUrl = u => {
    job.authUrl = u;
    urlReady();
  };
  job.done = login(clientId, TOKENS, { signal: controller.signal, timeoutMs: LOGIN_TIMEOUT, onUrl, lang })
    .then(() => Object.assign(job, { status: 'ok', message: t(lang, 'ui.loggedIn') }))
    .catch(e => Object.assign(job, { status: controller.signal.aborted ? 'idle' : 'error', message: e.message }))
    .finally(urlReady);
  loginJob = job;
  return ready;
}

// Speichern und Änderungen am Zeitplaner nacheinander ausführen (z. B. bei Doppelklick auf „Speichern“).
let queue = Promise.resolve();
const serial = fn => (queue = queue.then(fn, fn));
const SCHEDULE_KEYS = ['schedule', 'scheduleTime', 'scheduleDay'];

// Zweite Verknüpfung (runShortcut): beim Speichern anlegen bzw. die eigene entfernen; klappt das nicht, wird nichts gespeichert.
// nameLang: Sprache ihres Namens (die der Oberfläche).
async function applyRunShortcut(on, lang, nameLang = lang) {
  try {
    if (on) await createShortcut({ lang, nameLang, kind: 'run' });
    else if ((await shortcutStatus({ lang, kind: 'run' })).installed) await removeShortcut({ lang, kind: 'run' });
  } catch (e) {
    throw new Error(t(lang, 'ui.runShortcutNotSaved', { message: e.message }));
  }
}

// Speichert Einstellungen aus der Oberfläche. Ändert sich die Automatik, wird zuerst der Zeitplaner angepasst;
// nur wenn das klappt, kommen die Werte in die config.jsonc. Ergebnis: neuer Stand der Automatik oder null.
// Fehlende Schlüssel kommen mit der Erklärung aus der Vorlage der gewählten Sprache dazu.
async function saveSettings(values, lang) {
  const tplLang = resolveLang(values.language, lang);
  const before = currentConfig(lang);
  const after = { ...before, ...values };
  const nameLang = resolveLang(after.language, lang);
  if ('runShortcut' in values && values.runShortcut !== (before.runShortcut === true)) await applyRunShortcut(values.runShortcut, lang, nameLang);
  else if ('language' in values && values.language !== before.language && after.runShortcut === true) {
    // Andere Sprache: die zweite Verknüpfung bekommt ihren Namen in der neuen Sprache. Klappt das nicht, bleibt sie, wie sie ist
    // (beim nächsten Start versucht es renewShortcuts noch einmal); die Sprache wird trotzdem gespeichert.
    await createShortcut({ lang, nameLang, kind: 'run' }).catch(e => console.warn(t(lang, 'shortcut.renewFailed', { message: e.message })));
  }
  if (!SCHEDULE_KEYS.some(k => after[k] !== before[k])) {
    updateConfig(values, tplLang);
    return null;
  }
  try {
    await applySchedule(after, { lang });
  } catch (e) {
    throw new Error(t(lang, 'ui.scheduleNotSaved', { message: e.message }));
  }
  // Alle drei zusammen und in dieser Reihenfolge schreiben, damit sie in der config.jsonc beisammen stehen.
  const rest = Object.entries(values).filter(([k]) => !SCHEDULE_KEYS.includes(k));
  try {
    updateConfig(Object.fromEntries([...rest, ...SCHEDULE_KEYS.map(k => [k, after[k]])]), tplLang);
  } catch (e) {
    await applySchedule(before, { lang }).catch(() => {}); // Zeitplaner wieder auf den alten Stand
    throw e;
  }
  return scheduleStatus(after, { lang });
}

// Hinweis auf neue Versionen (update.mjs): höchstens eine Abfrage gleichzeitig je Art, auch bei mehreren offenen Tabs.
// Schlägt etwas fehl, ist die Prüfung eben aus – die Oberfläche zeigt dann nichts an.
// force („Nach Updates suchen“): fragt GitHub sofort, am Tages-Cache vorbei – höchstens einmal pro FORCE_INTERVAL. Kommt
// ein weiterer Klick früher, gilt der gespeicherte Stand (bzw. die erzwungene Abfrage, die gerade läuft).
const FORCE_INTERVAL = 60_000;
const updateJobs = { normal: null, forced: null };
let forcedAt = -Infinity;
function updateStatus(force = false) {
  const throttled = force && Date.now() - forcedAt < FORCE_INTERVAL;
  const kind = force && (!throttled || updateJobs.forced) ? 'forced' : 'normal';
  if (kind === 'forced' && !updateJobs.forced) forcedAt = Date.now();
  updateJobs[kind] ??= checkForUpdate({ force: kind === 'forced' })
    .catch(e => ({ enabled: false, current: null, latest: null, updateAvailable: false, url: null, checkedAt: null, error: String(e?.message ?? e) }))
    .finally(() => (updateJobs[kind] = null));
  return updateJobs[kind];
}

// Warum gerade kein Update geht (übersetzt), sonst null: Lauf aus der Oberfläche oder Anmeldung bei Spotify.
// Einen automatischen Lauf prüft installUpdate() selbst (automatik.json), auch noch einmal kurz vor dem Ersetzen.
const sessionBusy = lang => (running ? t(lang, 'update.runBusy') : importing ? t(lang, 'update.importBusy')
  : loginJob?.status === 'pending' ? t(lang, 'update.loginBusy') : null);
// Warum gerade kein Lauf geht bzw. kein Import, sonst null. Ein Import wartet zusätzlich auf eine laufende Anmeldung
// (beide schreiben tokens.json), umgekehrt startet keine Anmeldung während eines Imports.
// „Playlist jetzt neu erstellen“ (dj.mjs --now, zweite Verknüpfung) läuft außerhalb der Oberfläche: erkennbar an jetzt.json.
const nowRunning = () => Boolean(autoRunSince(HERE, Date.now(), NOW_RESULT));
const ownBusy = lang => (running ? t(lang, 'ui.busy') : importing ? t(lang, 'ui.importBusy') : installing ? t(lang, 'update.inProgress') : null);
const runBusy = lang => ownBusy(lang) ?? (nowRunning() ? t(lang, 'ui.nowBusy') : null);
const importBusy = lang => runBusy(lang) ?? (loginJob?.status === 'pending' ? t(lang, 'ui.loginBusy') : null);
// Ohne Client ID oder Anmeldung geht nichts, was Spotify fragt.
const loginMissing = cfg => missingCredentials(cfg).includes('spotify.clientId') || !readTokens();
// Warum Tweakable DJ gerade nicht beendet werden kann (Lauf, Import, Update, Anmeldung), sonst null.
const quitBusy = lang => ownBusy(lang) ?? (loginJob?.status === 'pending' ? t(lang, 'ui.loginBusy') : restarting ? t(lang, 'update.inProgress') : null);

// Beenden: „Tweakable DJ beenden“ (reason 'ui.quit') bzw. ohne offene Seite (reason 'ui.idleQuit'). Die Startdatei endet dann
// auch (Exit-Code 0).
function quit(reason) {
  if (quitting) return;
  quitting = true;
  console.log(`${new Date().toISOString()} ${t(defaultLang(), reason, { minutes: Math.round(IDLE_MS / 60_000) })}`);
  server.close();
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 200);
}

// Läuft auf dem Port schon Tweakable DJ? Fragt GET /api/version wie die Seite (mit node:http – fetch ersetzen die Tests).
// Erkennt die eigene Antwort an app (bzw. bei Versionen bis 0.2.5 an version).
function ownInstance() {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/version', headers: { 'X-Tweakable-DJ': '1' }, timeout: 5000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => (body += (body.length < 10_000 ? chunk : '')));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(res.statusCode === 200 && (data.app === APP_ID || typeof data.version === 'string'));
        } catch {
          resolve(false);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

// Eigene Verknüpfungen auf dem Desktop, die auf diesen Ordner zeigen, aber veraltet sind (z. B. noch mit Fenster): beim Start
// still erneuern, damit niemand etwas tun muss. Nur, wenn eine Startdatei gestartet hat (also nicht in Tests); fremde Dateien
// und Verknüpfungen auf andere Ordner bleiben, wie sie sind.
async function renewShortcuts(lang) {
  for (const kind of Object.keys(SHORTCUTS)) {
    try {
      const status = await shortcutStatus({ lang, kind });
      if (status.state !== 'outdated') continue;
      await serial(() => createShortcut({ lang, kind }));
      console.log(t(lang, 'shortcut.renewed', { file: status.file }));
    } catch (e) {
      console.warn(t(lang, 'shortcut.renewFailed', { message: e.message }));
    }
  }
}

// Nach einem Update: Server beenden, damit die neuen Dateien gelten. Mit Startdatei (Exit-Code 75) startet sie ihn
// gleich wieder, ohne Browser (die Seite ist ja offen und lädt sich dann selbst neu); sonst bitte von Hand neu starten.
let restarting = false;
function restartAfterUpdate(version) {
  if (restarting) return;
  restarting = true;
  console.log(`\n${t(defaultLang(), LAUNCHER ? 'update.restarting' : 'update.startAgain', { version })}`);
  server.close();
  server.closeAllConnections?.();
  setTimeout(() => process.exit(LAUNCHER ? RESTART_CODE : 0), 200);
}

// Ergebnis für die Oberfläche, falls dj.mjs ohne eigene "@@RESULT"-Zeile endet (z. B. abgestürzt).
const fallbackResult = (lang, dry, code) => ({
  ok: false, dry, songs: null, fresh: null, freshCurrent: null, familiar: null, durationMs: null, durationEstimated: null,
  playlistName: null, playlistUrl: null, errorCode: 'other', error: t(lang, 'ui.exited', { code }), missingScope: null, trialId: null, archiveFile: null,
  artists: null, yearFrom: null, yearTo: null, firstTime: null,
});

// Startet dj.mjs mit args und schickt seine Ausgabe als Text (in der Sprache der Anfrage), am Ende eine Zeile "@@RESULT {…}".
function streamRun(res, args, lang, dry) {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  running = spawn(process.execPath, args, { cwd: HERE, env: { ...process.env, TWEAKABLE_DJ_LANG: lang } });
  let out = '';
  running.stdout.on('data', chunk => (out += chunk));
  running.stdout.pipe(res, { end: false });
  running.stderr.pipe(res, { end: false });
  running.on('close', code => {
    running = null;
    if (code === 0) return res.end('');
    const result = /^@@RESULT /m.test(out) ? '' : `@@RESULT ${JSON.stringify(fallbackResult(lang, dry, code))}\n`;
    res.end(`${result}\n${t(lang, 'ui.exited', { code })}`);
  });
}

const server = http.createServer(async (req, res) => {
  // X-Frame-Options: Seite nicht in fremde Seiten einbetten lassen (sonst Klicks unterschiebbar).
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const lang = resolveLang(req.headers['x-lang'], configLanguage());
  // Nur Anfragen an genau diese Adresse und (für die API) nur von der eigenen Seite (X-Tweakable-DJ: 1) annehmen,
  // damit fremde Webseiten im Browser keine Einstellungen ändern oder Läufe starten können.
  if (req.headers.host !== HOST) return send(403, { error: t(lang, 'ui.wrongHost') });
  lastSeen = Date.now(); // Lebenszeichen einer Seite
  let url;
  try {
    url = new URL(req.url, URL_BASE);
  } catch {
    return send(404, { error: t(lang, 'ui.notFound') }); // kaputte Adresse darf den Server nicht beenden
  }
  const own = req.headers['x-tweakable-dj'] === '1';
  if (url.pathname.startsWith('/api/') && !own) return send(403, { error: t(lang, 'ui.notAllowed') });
  const route = `${req.method} ${url.pathname}`;

  try {
    if (route === 'GET /') {
      return send(200, fs.readFileSync(path.join(HERE, 'ui.html'), 'utf8'), 'text/html; charset=utf-8');
    }

    // Logo und Symbol (STATIC): eine Stunde im Browser zwischenspeichern; SVG ohne Skripte (Content-Security-Policy).
    if (req.method === 'GET' && Object.hasOwn(STATIC, url.pathname)) {
      const { file, type } = STATIC[url.pathname];
      let data;
      try {
        data = fs.readFileSync(path.join(HERE, 'assets', file));
      } catch {
        return send(404, { error: t(lang, 'ui.notFound') });
      }
      res.writeHead(200, {
        'Content-Type': type, 'Cache-Control': 'max-age=3600', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      });
      return res.end(data);
    }

    // values.language: '' = noch nicht gewählt; systemLang = Sprache, die dann gilt (auch für automatische Läufe).
    // limits: erlaubte Bereiche und Regler der Zahlenwerte; variety: Stufen des Reglers „Abwechslung bei Künstlern“; problems: ungültige Zahlenwerte aus der config.jsonc (Schlüssel → Meldung).
    if (route === 'GET /api/config') {
      const cfg = currentConfig(lang);
      const values = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, cfg[k]]));
      return send(200, {
        values, defaults: DEFAULTS, limits: LIMITS, variety: { keys: VARIETY_KEYS, levels: VARIETY_LEVELS }, problems: numberProblems(cfg, lang), lang, systemLang: systemLang(), running: Boolean(running), importing,
        setup: setupStatus(cfg), archiveFiles: archiveFileCount(HERE),
      });
    }

    if (route === 'POST /api/config') {
      const values = checkValues(await readJson(req, lang), lang);
      const schedule = await serial(() => saveSettings(values, lang));
      return send(200, { ok: true, ...(schedule && { schedule }) });
    }

    // Automatik: Stand abfragen bzw. den gespeicherten Stand neu eintragen (z. B. nach dem Verschieben des Ordners).
    // archiveFiles: Dateien im Archiv (ändert sich mit jedem automatischen Lauf; die Seite fragt den Zeitplan danach ab).
    if (route === 'GET /api/schedule') return send(200, { ...await scheduleStatus(currentConfig(lang), { lang }), archiveFiles: archiveFileCount(HERE) });

    if (route === 'POST /api/schedule') {
      try {
        return send(200, await serial(() => applySchedule(currentConfig(lang), { lang })));
      } catch (e) {
        throw new Error(t(lang, 'ui.scheduleFailed', { message: e.message }));
      }
    }

    // Verknüpfung auf dem Desktop (shortcut.mjs): Stand abfragen, anlegen bzw. die eigene ersetzen, die eigene entfernen.
    // Antwort: Stand wie shortcutStatus() ({ supported, state, installed, matches, … }); Fehler 400 mit Meldung.
    if (route === 'GET /api/shortcut') return send(200, await shortcutStatus({ lang }));
    if (route === 'POST /api/shortcut') return send(200, await serial(() => createShortcut({ lang })));
    if (route === 'DELETE /api/shortcut') return send(200, await serial(() => removeShortcut({ lang })));

    // Zugangsdaten und Quelle aus dem Assistenten: { clientId?, apiKey?, user?, seed? }
    if (route === 'POST /api/setup') {
      saveCredentials(await readJson(req, lang), lang);
      return send(200, { ok: true, setup: setupStatus(readConfig(lang)) });
    }

    if (route === 'POST /api/lastfm') {
      return send(200, await checkLastfm(await readJson(req, lang), lang));
    }

    // Neue Version auf GitHub? Antwortet immer mit 200 (bei Problemen enabled: false bzw. mit error).
    // installable: „Jetzt aktualisieren“ geht in diesem Ordner (nicht bei einem git-Checkout).
    // ?force=1 („Nach Updates suchen“): sofort bei GitHub nachfragen, höchstens einmal pro Minute (updateStatus).
    if (route === 'GET /api/update') {
      return send(200, { ...await updateStatus(url.searchParams.get('force') === '1'), installable: !installBlocker(HERE) });
    }

    // Version dieses Servers; die Seite wartet nach einem Update darauf, dass der neue Server antwortet. Die Seite fragt
    // außerdem alle 30 Sekunden (Lebenszeichen, siehe IDLE_MS); ein zweiter Start erkennt daran die eigene Instanz.
    // busy: Lauf, Import oder Update der Oberfläche – dann startet „Playlist jetzt neu erstellen“ (dj.mjs --now) nicht.
    if (route === 'GET /api/version') return send(200, { version: VERSION, app: APP_ID, busy: Boolean(running || importing || installing) });

    // „Tweakable DJ beenden“: nicht während eines Laufs, Imports, Updates oder einer Anmeldung (409 mit Grund).
    if (route === 'POST /api/quit') {
      const busy = quitBusy(lang);
      if (busy) return send(409, { error: busy });
      send(200, { ok: true });
      return quit('ui.quit');
    }

    // „Neu in v0.x.y“ nach einem Update (whatsnew.mjs): { version, previous, items, more, url } oder { version: null }
    // (nichts zeigen). Punkte aus CHANGELOG.md in der Sprache der Anfrage (Deutsch bzw. sonst Englisch).
    // POST: Hinweis geschlossen – die laufende Version gilt ab jetzt als gesehen.
    if (route === 'GET /api/whatsnew') {
      let changelog = null;
      try {
        changelog = fs.readFileSync(path.join(HERE, 'CHANGELOG.md'), 'utf8');
      } catch {
        // ohne CHANGELOG.md kein Hinweis
      }
      return send(200, whatsNew({ dir: HERE, current: VERSION, lang, changelog }) ?? { version: null });
    }
    if (route === 'POST /api/whatsnew') return send(200, { ok: markSeen(HERE, VERSION) });

    // „Jetzt aktualisieren“: Body { version } = in der Seite bestätigte Version. Fortschritt als Text, am Ende eine Zeile
    // "@@RESULT {…}" wie bei /api/run: { ok: true, from, to, changed, same, restart } bzw. { ok: false, outcome, error }
    // mit outcome 'unchanged', 'restored' oder 'restoreFailed'. Danach beendet sich der Server (restartAfterUpdate).
    if (route === 'POST /api/update/install') {
      const { version } = await readJson(req, lang);
      const reason = installing ? t(lang, 'update.inProgress') : sessionBusy(lang) ?? autoRunMessage(HERE, lang);
      if (reason) return send(409, { error: reason });
      installing = true;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      let result;
      try {
        const r = await installUpdate({
          lang, expected: typeof version === 'string' ? version : null, onStep: line => res.write(`${line}\n`), busy: () => sessionBusy(lang),
        });
        res.write(`${t(lang, 'update.done', { version: r.to })}\n`);
        result = { ok: true, from: r.from, to: r.to, changed: r.changed.length, same: r.same, restart: LAUNCHER };
      } catch (e) {
        installing = false;
        result = { ok: false, outcome: e.outcome ?? 'unchanged', error: e.message };
        res.write(`${e.message}\n`);
      }
      // Nach einem Update beenden, sobald die Antwort draußen ist – spätestens nach 2 s, auch wenn die Seite schon zu ist.
      if (result.ok) {
        res.once('close', () => restartAfterUpdate(result.to));
        setTimeout(() => restartAfterUpdate(result.to), 2000);
      }
      res.end(`@@RESULT ${JSON.stringify(result)}\n`);
      return;
    }

    if (route === 'GET /api/login') return send(200, loginView());

    if (route === 'POST /api/login') {
      if (installing) return send(409, { error: t(lang, 'update.inProgress') });
      if (importing) return send(409, { error: t(lang, 'ui.importBusy') });
      // Läuft schon eine Anmeldung, nur deren Stand melden – kein zweiter Server auf Port 8888.
      if (loginJob?.status === 'pending') return send(200, loginView());
      const cfg = currentConfig(lang);
      if (missingCredentials(cfg).includes('spotify.clientId')) return send(400, { error: t(lang, 'ui.clientIdFirst') });
      await startLogin(cfg.spotify.clientId, lang);
      return send(200, loginView());
    }

    if (route === 'DELETE /api/login') {
      if (loginJob?.status === 'pending') {
        loginJob.controller.abort();
        await loginJob.done;
      }
      return send(200, loginView());
    }

    // Auswahl für die Quelle: Lieblingssongs + eigene bzw. gemeinsame Playlists (ohne die DJ-Playlist selbst).
    if (route === 'GET /api/playlists') {
      const cfg = currentConfig(lang);
      if (loginMissing(cfg)) return send(409, { error: t(lang, 'ui.loginFirst'), login: true });
      const spotify = createSpotify(cfg.spotify.clientId, TOKENS, { lang });
      const me = await spotify.me();
      const [liked, lists] = await Promise.all([spotify.likedCount().catch(() => null), spotify.ownPlaylists(me.id)]);
      const options = lists
        .filter(p => p.name !== cfg.playlistName)
        .sort((a, b) => a.name.localeCompare(b.name, locale(lang)))
        .map(p => ({ value: `https://open.spotify.com/playlist/${p.id}`, name: p.name, tracks: p.tracks, collaborative: p.collaborative }));
      return send(200, { user: me.display_name || me.id, options: [{ value: 'liked', name: t(lang, 'ui.likedSongs'), tracks: liked }, ...options] });
    }

    // „Testbenachrichtigung senden“: sofort eine Systembenachrichtigung in der Sprache der Anfrage, auch wenn notifyOnFailure
    // aus ist. Antwortet immer mit 200: { ok: true } bzw. { ok: false, error } (warum nichts angekommen ist).
    if (route === 'POST /api/notify/test') {
      const sent = await notify(testNotice(lang));
      return send(200, sent.ok ? { ok: true } : { ok: false, error: notifyProblem(lang, sent) });
    }

    // ♥ in der Liste eines Probelaufs: Welche Songs sind schon Lieblingssongs? Body { uris } (wie beim Import höchstens 500)
    // → { saved: [true/false, …] } in derselben Reihenfolge. Braucht nur user-library-read (hat jede Anmeldung).
    if (route === 'POST /api/library/contains') {
      const { uris } = await readJson(req, lang);
      if (!validUris(uris)) return send(400, { error: t(lang, 'ui.badRequest') });
      const cfg = currentConfig(lang);
      if (loginMissing(cfg)) return send(409, { error: t(lang, 'ui.loginFirst'), login: true });
      return send(200, { saved: await createSpotify(cfg.spotify.clientId, TOKENS, { lang }).libraryContains(uris) });
    }

    // ♥ anklicken: Body { uri, saved } – saved true = zu den Lieblingssongs hinzufügen, false = daraus entfernen → { ok, saved }.
    // Fehlt der Anmeldung user-library-modify (Anmeldung von 0.2.x oder älter), 409 mit missingScope: Dann bittet die Seite,
    // sich einmal neu anzumelden. Bekannt aus tokens.json (scope) oder aus der Antwort von Spotify.
    if (route === 'POST /api/library') {
      const { uri, saved } = await readJson(req, lang);
      if (!validUris([uri]) || typeof saved !== 'boolean') return send(400, { error: t(lang, 'ui.badRequest') });
      const cfg = currentConfig(lang);
      if (loginMissing(cfg)) return send(409, { error: t(lang, 'ui.loginFirst'), login: true });
      const noScope = () => send(409, { error: t(lang, 'ui.libraryScope'), missingScope: LIBRARY_SCOPE });
      const granted = readTokens()?.scope;
      if (typeof granted === 'string' && !granted.split(/\s+/).includes(LIBRARY_SCOPE)) return noScope();
      try {
        await createSpotify(cfg.spotify.clientId, TOKENS, { lang }).setSaved(uri, saved);
      } catch (e) {
        if (isScopeError(e) && !e.errorCode) return noScope();
        throw e;
      }
      return send(200, { ok: true, saved });
    }

    // Lauf starten: Ausgabe von dj.mjs als Text (in der Sprache der Anfrage), am Ende eine Zeile "@@RESULT {…}".
    if (route === 'POST /api/run') {
      const busy = runBusy(lang);
      if (busy) return send(409, { error: busy });
      const dry = url.searchParams.get('dry') === '1';
      return streamRun(res, ['dj.mjs', ...(dry ? ['--dry'] : [])], lang, dry);
    }

    // Stand des letzten Probelaufs (probelauf.json): Lässt er sich übernehmen? ?id= = Kennung aus @@RESULT (trialId).
    // { ok, reason ('missing', 'invalid', 'replaced', 'old', 'settings' oder null), message, trial: { id, createdAt, expiresAt, songs, playlistName } }
    // Mit ?tracks=1 zusätzlich tracks: [{ uri, artist, name }] in der Reihenfolge der Liste (für „sperren“ in der Oberfläche).
    if (route === 'GET /api/trial') {
      const trial = readTrial(HERE);
      const reason = trialProblem(trial, { cfg: currentConfig(lang), id: url.searchParams.get('id') });
      const info = trialInfo(trial);
      if (info && url.searchParams.get('tracks') === '1') info.tracks = trial.tracks.map(s => ({ uri: s.uri, artist: s.artist, name: s.name }));
      return send(200, { ok: !reason, reason, message: reason ? t(lang, `trial.${reason}`) : '', trial: info });
    }

    // „Diese Liste übernehmen“: Body { id } = Kennung des Probelaufs, den die Seite zeigt. Prüft wie dj.mjs --apply, ob er
    // noch gilt (409 mit reason, sonst), und schreibt ihn dann mit dj.mjs --apply – Ausgabe und @@RESULT wie bei /api/run.
    if (route === 'POST /api/apply') {
      const busy = runBusy(lang);
      if (busy) return send(409, { error: busy });
      const { id } = await readJson(req, lang);
      if (typeof id !== 'string' || !/^[0-9a-f]{12}$/.test(id)) return send(400, { error: t(lang, 'ui.badRequest') });
      const reason = trialProblem(readTrial(HERE), { cfg: currentConfig(lang), id });
      if (reason) return send(409, { error: t(lang, `trial.${reason}`), reason });
      return streamRun(res, ['dj.mjs', '--apply', `--trial=${id}`], lang, false);
    }

    // „Als Textdatei speichern“: { text, filename, songs } für den Download im Browser. Ohne ?trial= die Playlist, wie sie
    // gerade in Spotify ist; mit ?trial=<Kennung> der Probelauf, der noch nicht übernommen ist (aus probelauf.json).
    if (route === 'GET /api/export') {
      const now = new Date();
      const id = url.searchParams.get('trial');
      if (id) {
        const trial = readTrial(HERE);
        const reason = trial === null || trial.invalid ? trialProblem(trial, { cfg: {} }) : trial.id !== id ? 'replaced' : null;
        if (reason) return send(409, { error: t(lang, `trial.${reason}`), reason });
        const text = formatExport({ name: trial.playlistName, tracks: trial.tracks, lang, now, trialAt: new Date(trial.createdAt) });
        return send(200, { text, filename: exportFileName(lang, now, true), songs: trial.tracks.length });
      }
      const cfg = currentConfig(lang);
      if (loginMissing(cfg)) return send(409, { error: t(lang, 'ui.loginFirst'), login: true });
      const list = await readPlaylist(createSpotify(cfg.spotify.clientId, TOKENS, { lang }), cfg.playlistName);
      if (!list) return send(409, { error: t(lang, 'export.noPlaylist', { name: cfg.playlistName }) });
      const text = formatExport({ name: cfg.playlistName, url: list.url, tracks: list.tracks, lang, now });
      return send(200, { text, filename: exportFileName(lang, now), songs: list.tracks.length, playlistUrl: list.url });
    }

    // Textdatei importieren, Schritt 1 (Vorschau): Body = Inhalt der Datei (Text, höchstens 1 MB). Sucht die Songs auf
    // Spotify, Fortschritt als Text, am Ende "@@RESULT { ok, total, found, uris, notFound: [{ line, text, reason }],
    // hints: { blocked, explicit } (je [{ line, text }], nur zum Anzeigen, siehe importHints), playlistName }" bzw.
    // { ok: false, error, errorCode }. Schreibt nichts.
    if (route === 'POST /api/import/preview') {
      const busy = importBusy(lang);
      if (busy) return send(409, { error: busy });
      importing = true;
      try {
        const cfg = currentConfig(lang);
        if (loginMissing(cfg)) return send(409, { error: t(lang, 'ui.loginFirst'), login: true });
        const entries = parseImport(await readBody(req, lang, IMPORT_MAX_BYTES, 'import.tooLarge'), lang);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        // Seite geschlossen oder Import abgebrochen: nicht weitersuchen.
        const controller = new AbortController();
        res.on('close', () => controller.abort());
        let result;
        try {
          res.write(`${t(lang, 'import.reading', { count: entries.length })}\n`);
          const { uris, notFound, tracks } = await resolveImport(createSpotify(cfg.spotify.clientId, TOKENS, { lang }), entries, {
            signal: controller.signal, onProgress: (done, total) => res.write(`${t(lang, 'import.searching', { done, total })}\n`),
          });
          res.write(`${t(lang, 'import.found', { found: uris.length, total: entries.length })}\n`);
          result = { ok: true, total: entries.length, found: uris.length, uris, notFound, hints: importHints(tracks, cfg), playlistName: cfg.playlistName };
        } catch (e) {
          res.write(`${t(lang, 'run.error', { message: e.message })}\n`);
          result = { ok: false, error: e.message, errorCode: e.errorCode ?? (e.status === 403 ? 'forbidden' : 'other') };
        }
        res.end(`@@RESULT ${JSON.stringify(result)}\n`);
        return;
      } finally {
        importing = false;
      }
    }

    // Textdatei importieren, Schritt 2 (nach der Rückfrage): Body { uris } aus der Vorschau. Ersetzt den Inhalt der Playlist
    // und setzt die Beschreibung; zählt nicht als Lauf (state.json bleibt, wie es ist). Danach kommt die Playlist ins Archiv;
    // klappt das nicht, steht der Grund in warning. → { ok, songs, playlistName, playlistUrl, created, archiveRemoved,
    // archiveFile (Name der neuen Archivdatei oder null), warning? }
    if (route === 'POST /api/import') {
      const busy = importBusy(lang);
      if (busy) return send(409, { error: busy });
      importing = true;
      try {
        const { uris } = await readJson(req, lang);
        if (!validUris(uris)) return send(400, { error: t(lang, 'import.badList') });
        const cfg = currentConfig(lang);
        if (loginMissing(cfg)) return send(409, { error: t(lang, 'ui.loginFirst'), login: true });
        const spotify = createSpotify(cfg.spotify.clientId, TOKENS, { lang });
        const { url: playlistUrl, created } = await writePlaylist(spotify, {
          name: cfg.playlistName, uris, description: importDescription(lang, new Date(), uris.length), lang,
        });
        let warning = null;
        let archived = null;
        try {
          archived = await archivePlaylist(HERE, spotify, { name: cfg.playlistName, lang, keep: cfg.archiveCount });
        } catch (e) {
          warning = t(lang, 'archive.failed', { message: e.message });
        }
        // archiveRemoved: so viele ältere Playlists hat das Aufräumen des Archivs gelöscht
        return send(200, {
          ok: true, songs: uris.length, playlistName: cfg.playlistName, playlistUrl, created, archiveRemoved: archived?.removed?.length ?? 0,
          archiveFile: archived ? path.basename(archived.file) : null, ...(warning && { warning }),
        });
      } finally {
        importing = false;
      }
    }

    // Playlist-Archiv für „Importieren … → Frühere Playlist …“: { keep (archiveCount, 0 = aus), entries: [{ id, at, songs }] },
    // neueste zuerst. Liest nur den Ordner archiv/, fragt Spotify nicht.
    // ?after=<Archivdatei eines Laufs bzw. Imports> zusätzlich undo: Eintrag für „Vorige Playlist wiederherstellen“ oder null
    // (undoTarget in archive.mjs).
    if (route === 'GET /api/archive') {
      const entries = listArchive(HERE);
      const after = url.searchParams.get('after');
      return send(200, { keep: currentConfig(lang).archiveCount, entries, ...(after !== null && { undo: undoTarget(entries, after) }) });
    }

    // Inhalt eines Eintrags: ?id=<Dateiname aus der Liste> → { id, text }. Die Seite schickt text dann wie eine Datei an
    // POST /api/import/preview. Nur Namen nach dem eigenen Muster, ohne Pfad (readArchive); sonst 404.
    if (route === 'GET /api/archive/entry') {
      const id = url.searchParams.get('id');
      const text = readArchive(HERE, id);
      if (text === null) return send(404, { error: t(lang, 'archive.notFound') });
      return send(200, { id, text });
    }

    send(404, { error: t(lang, 'ui.notFound') });
  } catch (e) {
    const relogin = LOGIN_CODES.includes(e.errorCode);
    send(400, { error: e.message, ...(e.errorCode && { errorCode: e.errorCode }), ...(relogin && { login: true }) });
  }
});

server.on('error', async e => {
  const lang = defaultLang();
  if (e.code !== 'EADDRINUSE') return giveUp(t(lang, 'run.error', { message: e.message }));
  // Läuft schon Tweakable DJ – einfach die bestehende Oberfläche öffnen. Sonst belegt ein anderes Programm den Port.
  if (!(await ownInstance())) return giveUp(t(lang, 'ui.portBusy', { port: PORT }));
  console.log(t(lang, 'ui.alreadyRunning', { url: URL_BASE }));
  if (!noBrowser) openPage();
});

// Ohne Fenster: beenden, wenn IDLE_MS lang keine Seite mehr gefragt hat und nichts läuft. Ein großer Zeitsprung zwischen zwei
// Prüfungen heißt: Der PC war im Ruhezustand – dann konnte die Seite nichts schicken, die Wartezeit beginnt neu.
function watchIdle() {
  const every = Math.min(30_000, Math.max(500, IDLE_MS / 10));
  let lastCheck = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (now - lastCheck > 3 * every) lastSeen = now;
    lastCheck = now;
    if (now - lastSeen >= IDLE_MS && !quitBusy(defaultLang())) quit('ui.idleQuit');
  }, every);
}

server.listen(PORT, '127.0.0.1', () => {
  const lang = defaultLang();
  console.log(t(lang, 'ui.listening', { url: URL_BASE }));
  console.log(HIDDEN ? t(lang, 'ui.hiddenHint', { minutes: Math.round(IDLE_MS / 60_000) }) : t(lang, 'ui.stopHint'));
  if (!noBrowser) openPage();
  if (HIDDEN) watchIdle();
  if (LAUNCHER) renewShortcuts(lang);
  // Läuft die Spotify-Anmeldung bald ab: Systembenachrichtigung (Einstellung remindLogin, höchstens einmal am Tag).
  remindLogin({ dir: HERE, lang, enabled: remindLoginOn() }).then(sent => {
    if (sent && !sent.ok) console.warn(t(lang, 'notify.logNote', { problem: notifyProblem(lang, sent) }));
  });
});
