// „Jetzt aktualisieren“: installiert das neueste Release von GitHub in diesen Ordner. Läuft nur auf Klick in der
// Oberfläche (POST /api/update/install in ui.mjs), nie von selbst.
//
// Ablauf (installUpdate):
//   1. Neuestes Release abfragen. Nur eine fertige Version, die neuer ist als die eigene (kein Downgrade, keine Vorabversion).
//   2. manifest.json und die ZIP-Datei des Releases laden: nur HTTPS, nur GitHub-Adressen (auch bei Weiterleitungen),
//      jeweils mit Größenlimit.
//   3. Jede in manifest.json genannte Datei aus der ZIP-Datei holen, Größe und SHA-256 prüfen und nach .update/staging
//      schreiben. Passt irgendetwas nicht, bricht das Update ab, bevor im Programmordner etwas geändert ist.
//   4. Die Programmdateien, die sich ändern, nach .update/backup-<alte Version> sichern, dann ersetzen (package.json und
//      manifest.json zuletzt). Unveränderte Dateien bleiben unangetastet. Danach überholte Programmdateien früherer Versionen
//      löschen (obsolete, siehe unten; ebenfalls vorher gesichert). Geht dabei etwas schief, kommen die gesicherten Dateien
//      automatisch zurück.
//
// Persönliche Dateien bleiben immer unverändert: Geschrieben werden nur Dateien aus manifest.json (Erlaubnisliste), gelöscht
// nur Dateien aus deren Liste obsolete – und nur, wenn sie Byte für Byte einer früher veröffentlichten Fassung entsprechen
// (SHA-256); geänderte oder eigene Dateien bleiben, Ordner auch. Nennt manifest.json eine persönliche Datei (config.jsonc,
// tokens.json, state.json, lastfm-cache.json, probelauf.json, automatik.*, jetzt.json, update-check.json, seen-version.json,
// *.log wie ui.log, ui.old.log und jetzt.log, alles im Archiv archiv/ und im Ordner node/ mit dem eigenen Node.js) oder einen
// Pfad außerhalb des Ordners, oder führt der
// Weg zu einer Datei durch einen symbolischen Link, bricht das ganze Update ab, bevor etwas geschrieben ist.
//
// manifest.json entsteht beim Veröffentlichen (.github/release-manifest.mjs, aufgerufen von .github/workflows/release.yml):
//   { "name": "tweakable-dj", "version": "0.2.0", "files": [{ "path": "ui.mjs", "size": 15569, "sha256": "…", "executable": false }, …],
//     "obsolete": [{ "path": "docs/screenshot-main.png", "sha256": ["…", …] }, …] }
// obsolete (ab 0.3.3): Dateien früherer Releases, die es nicht mehr gibt, mit den SHA-256 aller veröffentlichten Fassungen.
// Ein Update mit einer älteren Version kennt die Liste nicht; dann löscht sie die neue Version beim Start (cleanObsolete).
// Die ZIP-Datei enthält dieselben Dateien im Ordner tweakable-dj/ (dazu manifest.json selbst).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { locale, resolveLang, t, tError } from './i18n.mjs';
import { AUTO_RESULT, lastRun, NOW_RESULT } from './schedule.mjs';
import { compareVersions, currentVersion, isUpdate, parseVersion, repoSlug, switchedOff } from './update.mjs';
import { readText } from './files.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST = 'manifest.json';
export const UPDATE_DIR = '.update';

// Nur diese Adressen, nur per HTTPS (auch das Ziel jeder Weiterleitung).
export const HOSTS = ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
// Größenlimits in Bytes (die ZIP-Datei von 0.1.0 hat rund 1,4 MB) und höchstens so viele Dateien.
export const LIMITS = { release: 1_000_000, manifest: 512_000, zip: 50_000_000, file: 20_000_000, total: 100_000_000, files: 2000 };
const TIMEOUT = { api: 15_000, download: 120_000 };
// automatik.json mit startedAt, aber ohne finishedAt: Läuft gerade ein automatischer Lauf? Älter = abgestürzt.
const AUTO_RUN_MAX = 30 * 60_000;

// Persönliche und automatisch angelegte Dateien: Die schreibt ein Update nie, egal in welcher Ordnertiefe und in welcher
// Groß-/Kleinschreibung (Windows und macOS unterscheiden die nicht).
export const PERSONAL_FILES = ['config.jsonc', 'tokens.json', 'state.json', 'lastfm-cache.json', 'probelauf.json', 'automatik.json',
  'automatik.log', 'update-check.json', 'seen-version.json', 'ui.log', 'ui.old.log', 'jetzt.json', 'jetzt.log'];
// Persönliche Ordner: das Playlist-Archiv (archive.mjs) und node/ mit dem eigenen Node.js (get-node.cmd bzw. get-node.sh; das
// tauschen nur die Startdateien aus). Kein Pfad aus manifest.json darf hindurchführen, auch nicht in obsolete; das Update legt
// dort nichts ab, und weil es nur Programmdateien sichert und zurückholt, löscht es dort auch beim Zurücksichern nichts.
export const PERSONAL_DIRS = ['archiv', 'node'];
export function isPersonal(name) {
  const n = String(name).toLowerCase();
  return PERSONAL_FILES.includes(n) || PERSONAL_DIRS.includes(n) || n.startsWith('automatik.') || n.endsWith('.log');
}

// Erlaubte Namen je Pfadteil: Buchstaben, Ziffern, Leerzeichen und ._()+-; keine Gerätenamen von Windows.
const SEGMENT = /^[\w.()+-][\w .()+-]*$/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

// Warum ein Pfad aus manifest.json nie geschrieben werden darf (Schlüssel aus i18n.mjs), null = in Ordnung.
// Pfade sind relativ zum Programmordner und nur mit / getrennt.
export function pathProblem(p) {
  if (typeof p !== 'string' || !p || p.length > 200) return 'update.reasonName';
  if (p.includes('\\') || p.includes('\0') || p.startsWith('/') || /^[a-z]:/i.test(p)) return 'update.reasonOutside';
  const parts = p.split('/');
  if (parts.some(s => s === '..' || s === '.')) return 'update.reasonOutside';
  if (parts.some(isPersonal)) return 'update.reasonPersonal';
  if (parts.length > 8 || parts.some(s => !SEGMENT.test(s) || /[. ]$/.test(s) || RESERVED.test(s))) return 'update.reasonName';
  // eigener Arbeitsordner, git und manifest.json selbst (das schreibt das Update getrennt, aus dem geprüften Download)
  if (['.update', '.git'].includes(parts[0].toLowerCase()) || p.toLowerCase() === MANIFEST) return 'update.reasonName';
  return null;
}

// Pfad für Meldungen: Steuerzeichen raus, nicht zu lang.
const shown = p => String(p).replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 120);
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const fail = (lang, key, params) => tError(lang, key, params, { update: true });

// Prüft manifest.json (schon als Objekt) gegen die erwartete Version; wirft mit übersetzter Meldung.
// Ergebnis: { version, files: [{ path, size, sha256, executable }], obsolete: [{ path, sha256: [...] }] }
export function checkManifest(data, version, lang = resolveLang(), limits = LIMITS) {
  const bad = detail => fail(lang, 'update.badManifest', { detail });
  if (!data || typeof data !== 'object' || !Array.isArray(data.files)) throw bad('files');
  if (typeof data.version !== 'string' || compareVersions(data.version, version) !== 0) {
    throw bad(`version ${shown(data.version)} ≠ ${version}`);
  }
  if (!data.files.length || data.files.length > limits.files) throw bad(`${data.files.length} files`);
  const seen = new Set();
  let total = 0;
  const files = data.files.map(f => {
    const reason = pathProblem(f?.path);
    if (reason) throw fail(lang, 'update.forbiddenPath', { path: shown(f?.path), reason: t(lang, reason) });
    const key = f.path.toLowerCase();
    if (seen.has(key)) throw bad(`${shown(f.path)} twice`);
    seen.add(key);
    if (!Number.isSafeInteger(f.size) || f.size < 0 || f.size > limits.file) throw bad(`${shown(f.path)}: size`);
    if (typeof f.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(f.sha256)) throw bad(`${shown(f.path)}: sha256`);
    if (f.executable !== undefined && typeof f.executable !== 'boolean') throw bad(`${shown(f.path)}: executable`);
    total += f.size;
    return { path: f.path, size: f.size, sha256: f.sha256, executable: f.executable === true };
  });
  if (total > limits.total) throw bad(`${total} bytes`);
  for (const required of ['package.json', 'ui.mjs']) if (!seen.has(required)) throw bad(`${required} missing`);
  // Überholte Dateien: gleiche Regeln für die Pfade; nie eine Datei, die es in dieser Version (in irgendeiner Schreibweise) gibt.
  const list = data.obsolete === undefined ? [] : data.obsolete;
  if (!Array.isArray(list) || list.length > limits.files) throw bad('obsolete');
  const gone = new Set();
  const obsolete = list.map(o => {
    const reason = pathProblem(o?.path);
    if (reason) throw fail(lang, 'update.forbiddenPath', { path: shown(o?.path), reason: t(lang, reason) });
    const key = o.path.toLowerCase();
    if (seen.has(key) || gone.has(key)) throw bad(`${shown(o.path)}: obsolete`);
    gone.add(key);
    if (!Array.isArray(o.sha256) || !o.sha256.length || o.sha256.length > 200 || !o.sha256.every(h => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h))) {
      throw bad(`${shown(o.path)}: sha256`);
    }
    return { path: o.path, sha256: [...new Set(o.sha256)] };
  });
  return { version, files, obsolete };
}

// Überholte Dateien (obsolete aus manifest.json), die im Ordner dir genau so liegen wie in einer früheren Version:
// [{ path, target, old, oldSha, oldMode, created: [] }]. Geändert, ein Ordner, ein Link oder ein Link auf dem Weg dorthin: bleibt.
export function obsoleteFiles(dir, obsolete, lang = resolveLang()) {
  const out = [];
  for (const o of obsolete ?? []) {
    if (pathProblem(o?.path)) continue;
    let st;
    try {
      st = inspect(dir, o.path, lang);
    } catch {
      continue; // Link oder Ordner im Weg: nicht anfassen
    }
    if (!st) continue;
    const target = inside(dir, o.path, lang);
    const old = fs.readFileSync(target);
    const oldSha = sha256(old);
    if (o.sha256.includes(oldSha)) out.push({ path: o.path, target, old, oldSha, oldMode: st.mode, created: [], remove: true });
  }
  return out;
}

// Neueste Sicherung eines Updates auf version (.update/backup-*/backup.json mit to = version): { dir, file, data } oder null.
function backupFor(dir, version) {
  let names;
  try {
    names = fs.readdirSync(path.join(dir, UPDATE_DIR)).filter(n => n.startsWith('backup-'));
  } catch {
    return null;
  }
  let best = null;
  for (const name of names) {
    const file = path.join(dir, UPDATE_DIR, name, 'backup.json');
    let data;
    try {
      data = JSON.parse(readText(file));
    } catch {
      continue;
    }
    if (compareVersions(data?.to, version) !== 0) continue;
    if (!best || String(data.createdAt) > String(best.data.createdAt)) best = { dir: path.dirname(file), file, data };
  }
  return best;
}

// Beim Start: überholte Dateien laut der installierten manifest.json löschen – für Updates, die eine ältere Version installiert
// hat (deren „Jetzt aktualisieren“ kennt obsolete noch nicht). Nur in einem Ordner aus der ZIP-Datei (kein git-Checkout), nur
// wenn manifest.json zur Version in package.json passt, nur mit passender Prüfsumme (obsoleteFiles). Die gelöschten Dateien
// kommen vorher in die Sicherung des Updates auf diese Version (.update/backup-<alt>), sofern es sie gibt.
// Ergebnis: gelöschte Pfade. Wirft nie.
export function cleanObsolete(dir = HERE, lang = resolveLang()) {
  try {
    if (fs.existsSync(path.join(dir, '.git'))) return [];
    const version = currentVersion(path.join(dir, 'package.json'));
    if (!parseVersion(version)) return [];
    let data;
    try {
      data = JSON.parse(readText(path.join(dir, MANIFEST)));
    } catch {
      return [];
    }
    if (!Array.isArray(data?.obsolete) || !data.obsolete.length) return [];
    const list = obsoleteFiles(dir, checkManifest(data, version, lang).obsolete, lang);
    if (!list.length) return [];
    const backup = backupFor(dir, version);
    const removed = [];
    for (const p of list) {
      try {
        if (backup) {
          const b = inside(backup.dir, p.path, lang);
          fs.mkdirSync(path.dirname(b), { recursive: true });
          fs.writeFileSync(b, p.old);
          if (sha256(fs.readFileSync(b)) !== p.oldSha) continue; // Sicherung kaputt: lieber stehen lassen
        }
        fs.rmSync(p.target);
        removed.push(p.path);
      } catch {
        // bleibt eben liegen
      }
    }
    if (backup && removed.length) {
      try {
        const before = Array.isArray(backup.data.removed) ? backup.data.removed : [];
        fs.writeFileSync(backup.file, `${JSON.stringify({ ...backup.data, removed: [...new Set([...before, ...removed])] }, null, 2)}\n`);
      } catch {
        // nur die Liste in backup.json fehlt
      }
    }
    return removed;
  } catch {
    return [];
  }
}

// --- ZIP-Datei lesen (ohne Abhängigkeiten): Inhaltsverzeichnis am Ende, Daten gespeichert oder mit Deflate gepackt ---

// Einträge laut Inhaltsverzeichnis (central directory); kein ZIP64, keine Verschlüsselung.
export function readZip(buf) {
  const bad = detail => { throw new Error(detail); };
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) bad('no end of central directory');
  const count = buf.readUInt16LE(end + 10);
  const dirSize = buf.readUInt32LE(end + 12);
  let pos = buf.readUInt32LE(end + 16);
  if (count === 0xffff || pos === 0xffffffff || pos + dirSize > end) bad('ZIP64 or broken central directory');
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (pos + 46 > end || buf.readUInt32LE(pos) !== 0x02014b50) bad('broken central directory entry');
    const madeBy = buf.readUInt16LE(pos + 4);
    const flags = buf.readUInt16LE(pos + 8);
    const nameLength = buf.readUInt16LE(pos + 28);
    const external = buf.readUInt32LE(pos + 38);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', pos + 46, pos + 46 + nameLength);
    // Unix-Rechte stehen in den oberen 16 Bit der externen Attribute (wenn mit Unix gepackt)
    const mode = madeBy >> 8 === 3 ? external >>> 16 : 0;
    if (entries.has(name)) bad(`${shown(name)} twice`);
    entries.set(name, {
      name, flags,
      method: buf.readUInt16LE(pos + 10),
      compressed: buf.readUInt32LE(pos + 20),
      size: buf.readUInt32LE(pos + 24),
      offset: buf.readUInt32LE(pos + 42),
      symlink: (mode & 0o170000) === 0o120000,
    });
    pos += 46 + nameLength + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
  return entries;
}

// Inhalt eines Eintrags, höchstens max Bytes (sonst Fehler).
export function zipData(buf, entry, max) {
  if (entry.flags & 1) throw new Error('encrypted');
  const at = entry.offset;
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== 0x04034b50) throw new Error('broken local header');
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  if (start + entry.compressed > buf.length) throw new Error('truncated');
  const raw = buf.subarray(start, start + entry.compressed);
  if (entry.method === 0) {
    if (raw.length > max) throw new Error('too large');
    return Buffer.from(raw);
  }
  if (entry.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, max) });
  throw new Error(`compression method ${entry.method}`);
}

// --- Herunterladen ---

function allowedUrl(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  return u.protocol === 'https:' && HOSTS.includes(u.hostname) && !u.port && !u.username && !u.password ? u : null;
}
const hostOf = href => {
  try {
    return new URL(href).host || shown(href);
  } catch {
    return shown(href);
  }
};

// Lädt href (Weiterleitungen nur zu erlaubten Adressen, höchstens 5) und liefert den Inhalt, höchstens limit Bytes.
// name: Datei für Meldungen.
async function download(href, { fetch, lang, limit, timeout, name, api = false }) {
  const signal = AbortSignal.timeout(timeout);
  const headers = api
    ? { Accept: 'application/vnd.github+json', 'User-Agent': 'tweakable-dj', 'X-GitHub-Api-Version': '2022-11-28' }
    : { Accept: 'application/octet-stream', 'User-Agent': 'tweakable-dj' };
  let next = href;
  for (let hop = 0; hop <= 5; hop++) {
    const u = allowedUrl(next);
    if (!u) throw fail(lang, 'update.badHost', { host: hostOf(next) });
    let res;
    try {
      res = await fetch(u.href, { headers, redirect: 'manual', signal });
    } catch (e) {
      throw fail(lang, 'update.offline', { detail: e?.name === 'TimeoutError' ? 'Timeout' : e?.cause?.code ?? e?.message });
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw fail(lang, 'update.github', { file: name, status: res.status });
      next = new URL(location, u).href;
      continue;
    }
    if (res.status === 403 || res.status === 429) throw fail(lang, 'update.rateLimit');
    if (res.status === 404) throw fail(lang, api ? 'update.noRelease' : 'update.missingAsset', { file: name });
    if (!res.ok) throw fail(lang, 'update.github', { file: name, status: res.status });
    if (Number(res.headers.get('content-length')) > limit) throw fail(lang, 'update.tooLarge', { file: name, limit: size(limit, lang) });
    const chunks = [];
    let total = 0;
    try {
      for await (const chunk of res.body ?? []) {
        total += chunk.length;
        if (total > limit) throw fail(lang, 'update.tooLarge', { file: name, limit: size(limit, lang) });
        chunks.push(chunk);
      }
    } catch (e) {
      if (e.update) throw e;
      throw fail(lang, 'update.offline', { detail: e?.name === 'TimeoutError' ? 'Timeout' : e?.cause?.code ?? e?.message });
    }
    return Buffer.concat(chunks.map(c => Buffer.from(c)));
  }
  throw fail(lang, 'update.github', { file: name, status: 'redirect' });
}

// 1,3 MB bzw. 1.3 MB (unter 100 KB in KB)
function size(bytes, lang) {
  if (bytes < 100_000) return `${Math.max(1, Math.round(bytes / 1000)).toLocaleString(locale(lang))} KB`;
  return `${(bytes / 1e6).toLocaleString(locale(lang), { maximumFractionDigits: 1 })} MB`;
}

// --- Vorbedingungen ---

// Warum in diesem Ordner gar kein Update geht (Schlüssel aus i18n.mjs), sonst null. Ein git-Checkout aktualisiert man
// mit "git pull": Würde das Update hier Dateien ersetzen, hätte git danach lauter Änderungen.
export function installBlocker(dir = HERE, env = process.env) {
  if (switchedOff(env) || !repoSlug(path.join(dir, 'package.json')) || !parseVersion(currentVersion(path.join(dir, 'package.json')))) {
    return 'update.disabled';
  }
  if (fs.existsSync(path.join(dir, '.git'))) return 'update.gitCheckout';
  return null;
}

// Beginn des laufenden automatischen Laufs (ISO-Zeit) oder null. file = NOW_RESULT: Lauf von „Playlist jetzt neu erstellen“.
export function autoRunSince(dir = HERE, now = Date.now(), file = AUTO_RESULT) {
  const run = lastRun(dir, file);
  const started = Date.parse(run?.startedAt);
  if (!run || run.finishedAt || !Number.isFinite(started)) return null;
  const age = now - started;
  return age > -60_000 && age < AUTO_RUN_MAX ? run.startedAt : null;
}

// Meldung, falls gerade ein automatischer Lauf bzw. „Playlist jetzt neu erstellen“ läuft (in der Sprache lang), sonst null.
// key: Meldung zum automatischen Lauf ('update.autoBusy' fürs Update, 'ui.autoBusy' für Lauf und Import in der Oberfläche).
export function autoRunMessage(dir = HERE, lang = resolveLang(), now = Date.now(), key = 'update.autoBusy') {
  const since = autoRunSince(dir, now);
  if (since) return t(lang, key, { time: new Date(since).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' }) });
  return autoRunSince(dir, now, NOW_RESULT) ? t(lang, 'ui.nowBusy') : null;
}

// --- Schreiben ---

// Absoluter Pfad im Ordner base; Schranke zusätzlich zu pathProblem().
function inside(base, rel, lang) {
  const root = path.resolve(base);
  const p = path.resolve(root, ...rel.split('/'));
  if (!p.startsWith(root + path.sep)) throw fail(lang, 'update.forbiddenPath', { path: shown(rel), reason: t(lang, 'update.reasonOutside') });
  return p;
}

// Weg zur Zieldatei prüfen: Kein Teil darf ein symbolischer Link (unter Windows auch eine Verknüpfung/Junction) sein,
// Ordner müssen Ordner sein, die Datei selbst eine normale Datei. Ergebnis: lstat der Datei, null = gibt es noch nicht.
function inspect(base, rel, lang) {
  const parts = rel.split('/');
  let p = path.resolve(base);
  for (let i = 0; i < parts.length; i++) {
    p = path.join(p, parts[i]);
    let st;
    try {
      st = fs.lstatSync(p);
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
    const sub = parts.slice(0, i + 1).join('/');
    if (st.isSymbolicLink()) throw fail(lang, 'update.symlink', { path: shown(sub) });
    if (i < parts.length - 1 ? !st.isDirectory() : !st.isFile()) throw fail(lang, 'update.notAFile', { path: shown(sub) });
    if (i === parts.length - 1) return st;
  }
  return null;
}

// Eigener Arbeitsordner .update (kein Link, keine Datei); wird bei Bedarf angelegt.
function updateDir(dir, lang) {
  const p = path.join(dir, UPDATE_DIR);
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) throw fail(lang, 'update.symlink', { path: UPDATE_DIR });
    if (!st.isDirectory()) throw fail(lang, 'update.notAFile', { path: UPDATE_DIR });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    fs.mkdirSync(p);
  }
  return p;
}

// Ordner (neu) anlegen; rm entfernt Links nur selbst, nie ihr Ziel.
function freshDir(p) {
  fs.rmSync(p, { recursive: true, force: true });
  fs.mkdirSync(p, { recursive: true });
  return p;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let tmpCount = 0;

// Datei ersetzen: erst in .update schreiben, dann umbenennen. So entsteht nie eine halb geschriebene Datei, und ein
// laufendes start.sh liest weiter aus der alten (sh liest aus der geöffneten Datei, nicht neu über den Namen).
// Lässt sich nicht umbenennen (z. B. Datei unter Windows gerade von einem Virenscanner geöffnet), direkt überschreiben.
async function place(tmpDir, target, data) {
  const tmp = path.join(tmpDir, `tmp-${process.pid}-${++tmpCount}`);
  fs.writeFileSync(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (e) {
      if (attempt < 3 && ['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) {
        await sleep(100);
        continue;
      }
      fs.rmSync(tmp, { force: true });
      fs.writeFileSync(target, data);
      return;
    }
  }
}

// Ordner bis zur Datei anlegen; Ergebnis: neu angelegte Ordner (für das Zurücksichern).
function makeParents(dir, rel) {
  const created = [];
  let p = path.resolve(dir);
  for (const part of rel.split('/').slice(0, -1)) {
    p = path.join(p, part);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p);
      created.push(p);
    }
  }
  return created;
}

// Reihenfolge beim Ersetzen: package.json und manifest.json zuletzt. Bricht das Programm mittendrin ab, nennt package.json
// noch die alte Version, und der Hinweis auf die neue Version (mit erneutem Update) bleibt.
const LAST = ['package.json', MANIFEST];
const order = p => LAST.indexOf(p.path);

// Alle bisher ersetzten bzw. gelöschten Dateien zurück auf den alten Stand; Ergebnis: Fehler beim Zurücksichern (leer = alles
// wie vorher).
async function rollback(done, tmpDir) {
  const errors = [];
  for (const p of [...done].reverse()) {
    try {
      if (p.old) {
        await place(tmpDir, p.target, p.old);
        if (process.platform !== 'win32') fs.chmodSync(p.target, p.oldMode & 0o7777);
        if (sha256(fs.readFileSync(p.target)) !== p.oldSha) throw new Error('verify');
      } else {
        fs.rmSync(p.target, { force: true }); // nur eine Datei, die das Update eben erst angelegt hat
      }
      for (const d of [...p.created].reverse()) {
        try {
          fs.rmdirSync(d); // eben erst angelegter, wieder leerer Ordner
        } catch {
          // nicht leer: bleibt
        }
      }
    } catch (e) {
      errors.push(`${p.path}: ${e.code ?? e.message}`);
    }
  }
  return errors;
}

// Installiert das neueste Release. Wirft bei jedem Problem einen Fehler mit übersetzter Meldung und
// outcome: 'unchanged' (nichts geändert), 'restored' (alte Version wiederhergestellt) oder 'restoreFailed'.
//   lang: Sprache der Meldungen; expected: in der Oberfläche bestätigte Version (sonst Abbruch, falls inzwischen eine andere);
//   onStep(text): Fortschritt; busy(): übersetzter Grund, warum gerade nicht (Lauf, Anmeldung), sonst null.
//   dir, fetch, env, now, limits, faults (faults.beforeWrite(path, index) bzw. faults.beforeRemove(path) wirft = Fehler beim
//   Ersetzen bzw. Löschen): für Tests.
// Ergebnis: { from, to, changed: [ersetzte bzw. neue Pfade], removed: [gelöschte überholte Pfade], same: Anzahl unveränderter
// Dateien, backup: '.update/backup-<from>' }
export async function installUpdate({ dir = HERE, lang = resolveLang(), expected = null, onStep = () => {}, busy = () => null,
  fetch = globalThis.fetch, env = process.env, now = Date.now, limits = LIMITS, faults = {} } = {}) {
  const step = (key, params) => onStep(t(lang, key, params));
  const outcome = (e, kind, params = {}) => {
    const message = e.update ? e.message : t(lang, 'update.unexpected', { detail: e?.code ?? e?.message ?? String(e) });
    const key = { unchanged: 'update.failedUnchanged', restored: 'update.failedRestored', restoreFailed: 'update.failedRestore' }[kind];
    return Object.assign(new Error(t(lang, key, { message, ...params })), { outcome: kind, cause: e });
  };
  const checkBusy = () => {
    const reason = busy();
    if (reason) throw Object.assign(new Error(reason), { update: true });
    const auto = autoRunMessage(dir, lang, now());
    if (auto) throw Object.assign(new Error(auto), { update: true });
  };

  let plan;
  let removals = [];
  let same = 0;
  let tmpDir;
  let from;
  let to;
  let backupName;
  // --- 1.–3.: abfragen, laden, prüfen, nach .update/staging; bis hierhin ändert sich im Programmordner nichts ---
  try {
    const pkgFile = path.join(dir, 'package.json');
    const blocker = installBlocker(dir, env);
    if (blocker) throw fail(lang, blocker);
    from = currentVersion(pkgFile);
    const repo = repoSlug(pkgFile);
    checkBusy();

    step('update.stepCheck');
    let release;
    try {
      release = JSON.parse(await download(`https://api.github.com/repos/${repo}/releases/latest`,
        { fetch, lang, limit: limits.release, timeout: TIMEOUT.api, name: 'GitHub', api: true }));
    } catch (e) {
      if (e.update) throw e;
      throw fail(lang, 'update.github', { file: 'GitHub', status: 'JSON' });
    }
    const tag = typeof release?.tag_name === 'string' ? release.tag_name.trim() : '';
    if (!parseVersion(tag) || release.draft || release.prerelease) throw fail(lang, 'update.noRelease');
    to = tag.replace(/^v/i, '');
    if (!isUpdate(to, from)) throw fail(lang, 'update.notNewer', { latest: to, current: from });
    if (expected != null && compareVersions(String(expected), to) !== 0) {
      throw fail(lang, 'update.otherVersion', { latest: to, expected: shown(expected) });
    }

    // Dateien des Releases: nur Links auf die Release-Downloads dieses Repositorys
    const zipName = `tweakable-dj-${tag}.zip`;
    const prefix = `https://github.com/${repo}/releases/download/${tag}/`.toLowerCase();
    const asset = name => {
      const a = Array.isArray(release.assets) ? release.assets.find(x => x?.name === name) : null;
      const href = typeof a?.browser_download_url === 'string' ? a.browser_download_url : '';
      if (!a || href.toLowerCase() !== prefix + name.toLowerCase()) throw fail(lang, 'update.noAssets', { version: to, file: name });
      return a;
    };
    const manifestAsset = asset(MANIFEST);
    const zipAsset = asset(zipName);
    for (const [a, limit] of [[manifestAsset, limits.manifest], [zipAsset, limits.zip]]) {
      if (Number(a.size) > limit) throw fail(lang, 'update.tooLarge', { file: a.name, limit: size(limit, lang) });
    }

    step('update.stepDownload', { file: MANIFEST, size: size(Number(manifestAsset.size) || 0, lang) });
    const manifestData = await download(manifestAsset.browser_download_url,
      { fetch, lang, limit: limits.manifest, timeout: TIMEOUT.download, name: MANIFEST });
    let manifestJson;
    try {
      manifestJson = JSON.parse(manifestData.toString('utf8'));
    } catch {
      throw fail(lang, 'update.badManifest', { detail: 'JSON' });
    }
    const manifest = checkManifest(manifestJson, to, lang, limits);

    step('update.stepDownload', { file: zipName, size: size(Number(zipAsset.size) || 0, lang) });
    const zip = await download(zipAsset.browser_download_url, { fetch, lang, limit: limits.zip, timeout: TIMEOUT.download, name: zipName });

    // Jede Datei aus manifest.json in der ZIP-Datei (Ordner tweakable-dj/): Größe und SHA-256 müssen stimmen.
    step('update.stepVerify', { count: manifest.files.length });
    let entries;
    try {
      entries = readZip(zip);
    } catch (e) {
      throw fail(lang, 'update.badZip', { detail: e.message });
    }
    const top = new Set([...entries.keys()].map(n => n.split('/')[0]));
    if (top.size !== 1) throw fail(lang, 'update.badZip', { detail: 'folder' });
    const root = `${[...top][0]}/`;
    const files = manifest.files.map(f => {
      const entry = entries.get(root + f.path);
      if (!entry) throw fail(lang, 'update.missingFile', { file: shown(f.path) });
      if (entry.symlink) throw fail(lang, 'update.symlink', { path: shown(f.path) });
      let data;
      try {
        data = zipData(zip, entry, f.size);
      } catch {
        throw fail(lang, 'update.badChecksum', { file: shown(f.path) });
      }
      if (data.length !== f.size || sha256(data) !== f.sha256) throw fail(lang, 'update.badChecksum', { file: shown(f.path) });
      return { ...f, data };
    });
    // manifest.json in der ZIP-Datei (falls dabei) muss dieselbe sein wie die geladene.
    const zipManifest = entries.get(root + MANIFEST);
    if (zipManifest) {
      let inZip = null;
      try {
        inZip = zipData(zip, zipManifest, limits.manifest);
      } catch {
        // unten: passt nicht
      }
      if (!inZip?.equals(manifestData)) throw fail(lang, 'update.badChecksum', { file: MANIFEST });
    }
    // package.json der neuen Version muss genau diese Version nennen.
    let found = null;
    try {
      found = JSON.parse(files.find(f => f.path === 'package.json').data.toString('utf8').replace(/^﻿/, '')).version;
    } catch {
      // unten
    }
    if (typeof found !== 'string' || compareVersions(found, to) !== 0) {
      throw fail(lang, 'update.versionMismatch', { found: shown(found), version: to });
    }
    files.push({ path: MANIFEST, size: manifestData.length, sha256: sha256(manifestData), executable: false, data: manifestData });

    // Alles nach .update/staging und von dort noch einmal lesen und prüfen.
    tmpDir = updateDir(dir, lang);
    const staging = freshDir(path.join(tmpDir, 'staging'));
    for (const f of files) {
      const p = inside(staging, f.path, lang);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.data);
    }
    for (const f of files) {
      f.data = fs.readFileSync(inside(staging, f.path, lang));
      if (sha256(f.data) !== f.sha256) throw fail(lang, 'update.badChecksum', { file: shown(f.path) });
    }

    // Ziele prüfen (keine Links, keine Ordner statt Dateien) und unveränderte Dateien aussortieren.
    const all = files.map(f => {
      const target = inside(dir, f.path, lang);
      const st = inspect(dir, f.path, lang);
      const old = st ? fs.readFileSync(target) : null;
      return { ...f, target, old, oldSha: old && sha256(old), oldMode: st?.mode ?? 0, created: [] };
    });
    plan = all.filter(p => p.oldSha !== p.sha256).sort((a, b) => order(a) - order(b));
    same = all.length - plan.length;
    removals = obsoleteFiles(dir, manifest.obsolete, lang);
    checkBusy(); // könnte inzwischen ein automatischer Lauf begonnen haben

    // --- 4a. Sicherung der Dateien, die ersetzt werden (nur Programmdateien aus manifest.json) ---
    backupName = `backup-${from}`;
    const replaced = plan.filter(p => p.old);
    step('update.stepBackup', { count: replaced.length + removals.length, dir: `${UPDATE_DIR}/${backupName}` });
    const backup = freshDir(path.join(tmpDir, backupName));
    for (const p of [...replaced, ...removals]) {
      const b = inside(backup, p.path, lang);
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.writeFileSync(b, p.old);
      if (sha256(fs.readFileSync(b)) !== p.oldSha) throw fail(lang, 'update.badChecksum', { file: `${backupName}/${shown(p.path)}` });
    }
    fs.writeFileSync(path.join(backup, 'backup.json'), `${JSON.stringify({
      from, to, createdAt: new Date(now()).toISOString(),
      replaced: replaced.map(p => p.path), added: plan.filter(p => !p.old).map(p => p.path), removed: removals.map(p => p.path),
    }, null, 2)}\n`);
  } catch (e) {
    throw outcome(e, 'unchanged');
  }

  // --- 4b. Ersetzen; bei einem Fehler alles zurück ---
  step('update.stepCopy', { count: plan.length, same });
  const done = [];
  try {
    for (const [i, p] of plan.entries()) {
      faults.beforeWrite?.(p.path, i);
      done.push(p);
      p.created = makeParents(dir, p.path);
      await place(tmpDir, p.target, p.data);
      if (process.platform !== 'win32') fs.chmodSync(p.target, p.executable ? 0o755 : (p.oldMode & 0o7777) || 0o644);
      if (sha256(fs.readFileSync(p.target)) !== p.sha256) throw fail(lang, 'update.badChecksum', { file: shown(p.path) });
    }
    // Überholte Dateien früherer Versionen (gesichert wie die ersetzten; beim Zurücksichern kommen sie wieder)
    if (removals.length) step('update.stepRemove', { count: removals.length });
    for (const p of removals) {
      faults.beforeRemove?.(p.path);
      done.push(p);
      fs.rmSync(p.target);
    }
  } catch (e) {
    const errors = await rollback(done, tmpDir);
    if (errors.length) throw outcome(e, 'restoreFailed', { detail: errors.join(', '), backup: `${UPDATE_DIR}/${backupName}` });
    throw outcome(e, 'restored');
  }

  // Aufräumen in .update: Zwischenablage weg, nur die Sicherung dieses Updates behalten. Fehler hier sind egal.
  try {
    for (const name of fs.readdirSync(tmpDir)) {
      if (name === backupName) continue;
      if (name === 'staging' || name.startsWith('backup-') || name.startsWith('tmp-')) {
        fs.rmSync(path.join(tmpDir, name), { recursive: true, force: true });
      }
    }
  } catch {
    // bleibt eben liegen
  }
  return { from, to, changed: plan.map(p => p.path), removed: removals.map(p => p.path), same, backup: `${UPDATE_DIR}/${backupName}` };
}
