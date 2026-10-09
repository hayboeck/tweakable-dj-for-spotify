// Hinweis auf neue Versionen: fragt höchstens einmal am Tag das neueste Release auf GitHub ab.
// Gesendet wird nur diese eine GET-Anfrage, ohne persönliche Daten. Abgeschaltet ist die Prüfung mit
// TWEAKABLE_DJ_NO_UPDATE_CHECK=1 oder solange package.json kein "repository" (bzw. keine "version") hat.
//
// Eingebunden in ui.mjs (GET /api/update). ui.html fragt einmal nach dem Laden und zeigt bei updateAvailable
// „Neue Version {latest} verfügbar (du hast {current}) – Download“ mit Link auf url. Installieren kann man sie dort mit
// „Jetzt aktualisieren“ (install-update.mjs, nur auf Klick).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, 'package.json');
const CACHE = path.join(HERE, 'update-check.json');
const MAX_AGE = 86400_000;      // erfolgreiche Abfrage gilt einen Tag
const RETRY_AFTER = 3600_000;   // nach einem Fehler frühestens nach einer Stunde erneut
const TIMEOUT = 5000;

// 1.2.3, v1.2.3, 1.2.3-beta.1, 1.2.3+build; fehlende Stellen (v2.0) zählen als 0
const VERSION = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9a-z-]+(?:\.[0-9a-z-]+)*))?(?:\+[0-9a-z.-]+)?$/i;
// github:owner/repo, owner/repo, https://github.com/owner/repo(.git), git+https://…, git@github.com:owner/repo.git
const REPO = /^(?:github:|(?:git\+)?(?:https?|git|ssh):\/\/(?:[^@/]+@)?(?:www\.)?github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

export function parseVersion(v) {
  const m = typeof v === 'string' && v.trim().match(VERSION);
  if (!m) return null;
  return { core: [m[1], m[2] ?? 0, m[3] ?? 0].map(Number), pre: m[4] ? m[4].split('.') : [] };
}

// Wie bei semver: -1, 0 oder 1 (Build-Angaben nach + zählen nicht); null, wenn eine keine Versionsnummer ist.
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return Math.sign(x.core[i] - y.core[i]);
  // Vorabversion < fertige Version
  if (!x.pre.length || !y.pre.length) return Math.sign(y.pre.length - x.pre.length);
  // Teil für Teil: Zahlen numerisch und vor Text, Text nach ASCII; bei gleichem Anfang ist die kürzere kleiner
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn && Number(p) !== Number(q)) return Math.sign(Number(p) - Number(q));
    if (pn !== qn) return pn ? -1 : 1;
    if (!pn && p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

// Vorabversion (Pre-release): Versionsnummer mit Vorab-Kennung nach dem Bindestrich, z. B. 0.4.0-beta.1 oder 0.4.0-rc.1.
// Sie erscheint auf GitHub als „Pre-release“ zum Ausprobieren; installierte Programme aktualisieren nie darauf.
export function isPrerelease(v) {
  return Boolean(parseVersion(v)?.pre.length);
}

// Update nur, wenn latest eine reguläre Version ist und neuer als current; Vorabversionen nie. Wer selbst eine Vorabversion
// hat (z. B. 0.4.0-beta.1), bekommt die reguläre Version derselben Nummer (0.4.0) und jede neuere angeboten, keine ältere.
export function isUpdate(latest, current) {
  return Boolean(parseVersion(latest) && !isPrerelease(latest) && compareVersions(latest, current) > 0);
}

// Fehlende oder kaputte package.json = leer.
function readPkg(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) ?? {};
  } catch {
    return {};
  }
}

export function currentVersion(pkgFile = PKG) {
  const v = readPkg(pkgFile).version;
  return typeof v === 'string' ? v : null;
}

// "owner/repo" aus package.json; null = kein GitHub-Repository eingetragen, Prüfung abgeschaltet.
export function repoSlug(pkgFile = PKG) {
  const repo = readPkg(pkgFile).repository;
  const m = String((typeof repo === 'string' ? repo : repo?.url) ?? '').trim().match(REPO);
  if (!m || [m[1], m[2]].some(s => s === '.' || s === '..')) return null;
  return `${m[1]}/${m[2]}`;
}

// TWEAKABLE_DJ_NO_UPDATE_CHECK=1 (auch true, yes, ja, on): keine Prüfung und kein Update (install-update.mjs).
export const switchedOff = env => /^(1|true|yes|ja|on)$/i.test(String(env?.TWEAKABLE_DJ_NO_UPDATE_CHECK ?? '').trim());
const str = s => (typeof s === 'string' ? s : null);
// Nur Links auf github.com übernehmen (landen in der Oberfläche als href).
const githubUrl = u => (typeof u === 'string' && /^https:\/\/github\.com\//.test(u) ? u : null);

// Fehlende oder kaputte Datei bzw. Stand für ein anderes Repository = kein Cache.
function readCache(file, repo) {
  if (!file) return null;
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (c?.repo !== repo || !Number.isFinite(Date.parse(c.checkedAt))) return null;
    // okAt fehlt in update-check.json älterer Versionen: dann zählt checkedAt, wenn diese Abfrage geklappt hat.
    const okAt = Number.isFinite(Date.parse(c.okAt)) ? c.okAt : c.error ? null : c.checkedAt;
    return { latest: str(c.latest), url: githubUrl(c.url), checkedAt: c.checkedAt, okAt, error: str(c.error) };
  } catch {
    return null;
  }
}

// Schreibfehler (z. B. schreibgeschützter Ordner) sind egal: dann wird eben öfter gefragt.
function writeCache(file, data) {
  if (!file) return;
  try {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  } catch {}
}

// Neuestes reguläres Release laut GitHub; latest null = noch keins veröffentlicht. /releases/latest liefert laut GitHub nie
// Entwürfe (draft) oder Vorabversionen (prerelease); zur Sicherheit zählt ein solches Release trotzdem nicht, ebenso eines,
// dessen Tag eine Vorab-Kennung hat (z. B. v0.4.0-beta.1, auch wenn es versehentlich nicht als Pre-release markiert ist).
// Fehlertexte sind technisch und sprachneutral (Fehlercode bzw. HTTP-Status): Die Oberfläche zeigt sie nicht an,
// sie stehen nur in der Antwort von GET /api/update und in update-check.json.
async function fetchLatest(repo, fetch, timeout) {
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'tweakable-dj', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new Error(`GitHub: ${e?.name === 'TimeoutError' ? 'TimeoutError' : e?.cause?.code ?? e?.message}`);
  }
  if (res.status === 404) return { latest: null, url: null };
  // 403/429 = Abfragelimit von GitHub
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!parseVersion(data?.tag_name)) throw new Error('GitHub: invalid tag_name');
  if (data.draft || data.prerelease || isPrerelease(data.tag_name)) return { latest: null, url: null };
  return {
    latest: data.tag_name.trim().replace(/^v/i, ''),
    url: githubUrl(data.html_url) ?? `https://github.com/${repo}/releases/latest`,
  };
}

// Wirft nie. Ergebnis: { enabled, current, prerelease, latest, updateAvailable, url, checkedAt, okAt, error }
//   prerelease: Die eigene Version ist eine Vorabversion (die Oberfläche zeigt das bei „Programm“ an);
//   checkedAt: Zeitpunkt der letzten echten Abfrage (ISO), okAt: der letzten erfolgreichen (ISO oder null; die Oberfläche
//   zeigt ihn bei „Du hast die neueste Version“), error: Grund, falls sie fehlschlug;
//   latest/url stammen dann aus der letzten erfolgreichen Abfrage (oder null).
// now: Zeitpunkt (ms oder Date); force: Cache übergehen; cacheFile: null = ohne Cache.
// pkgFile, env, timeout: für Tests.
export async function checkForUpdate({ now = Date.now(), fetch = globalThis.fetch, cacheFile = CACHE, force = false,
  pkgFile = PKG, env = process.env, timeout = TIMEOUT } = {}) {
  const current = currentVersion(pkgFile);
  const view = ({ latest = null, url = null, checkedAt = null, okAt = null, error = null } = {}, enabled = true) =>
    ({ enabled, current, prerelease: isPrerelease(current), latest, updateAvailable: enabled && isUpdate(latest, current), url, checkedAt, okAt, error });

  const repo = repoSlug(pkgFile);
  if (switchedOff(env) || !repo) return view({}, false);
  if (!parseVersion(current)) return view({ error: 'package.json: invalid "version"' }, false);

  const t = Number(now) || Date.now();
  const cached = readCache(cacheFile, repo);
  const age = cached ? t - Date.parse(cached.checkedAt) : NaN;
  // Den Stand der eigenen Version vergleicht view() jedes Mal neu, ein Update verschwindet also sofort.
  if (cached && !force && age >= 0 && age < (cached.error ? RETRY_AFTER : MAX_AGE)) return view(cached);

  const checkedAt = new Date(t).toISOString();
  let fresh;
  try {
    fresh = { ...(await fetchLatest(repo, fetch, timeout)), checkedAt, okAt: checkedAt, error: null };
  } catch (e) {
    fresh = { latest: cached?.latest ?? null, url: cached?.url ?? null, checkedAt, okAt: cached?.okAt ?? null, error: String(e?.message ?? e) };
  }
  writeCache(cacheFile, { repo, ...fresh });
  return view(fresh);
}
