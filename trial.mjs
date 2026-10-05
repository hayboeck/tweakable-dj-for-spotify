// Probelauf merken und später genau so übernehmen („Diese Liste übernehmen“ in der Oberfläche bzw. node dj.mjs --apply).
//
// dj.mjs --dry speichert sein Ergebnis in probelauf.json: die Songs in ihrer Reihenfolge (URI, Künstler, Titel, Markierung),
// Name und Beschreibung der Playlist, die Zahlen für die Zusammenfassung, den Zeitpunkt und einen Fingerabdruck der
// Einstellungen, die die Auswahl bestimmen (settingsHash). Übernehmen lässt sich die Liste nur, solange sie gilt
// (trialProblem): höchstens 24 Stunden alt, Einstellungen seitdem unverändert, kein neuerer Probelauf (andere Kennung) und
// seitdem keine Neuerstellung – ein echter Lauf und das Übernehmen selbst löschen probelauf.json (removeTrial).
// probelauf.json ist eine persönliche Datei wie state.json: nie im Repository, nie in der ZIP-Datei, ein Update schreibt sie nie.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, LIMITS } from './config.mjs';

export const TRIAL_FILE = 'probelauf.json';
export const TRIAL_MAX_AGE = 24 * 3600_000;
const FORMAT = 1;

// Einstellungen, die die Auswahl nicht beeinflussen; alle anderen zählen für den Fingerabdruck.
const NOT_RELEVANT = ['schedule', 'scheduleTime', 'scheduleDay', 'language'];
export const TRIAL_KEYS = Object.keys(DEFAULTS).filter(k => !NOT_RELEVANT.includes(k));

// Fingerabdruck der Einstellungen, die das Ergebnis bestimmen, dazu Spotify-App und Last.fm-Benutzer
// (ein anderes Konto hätte andere Lieblingssongs und einen anderen Hörverlauf). 16 Hex-Zeichen von SHA-256.
export function settingsHash(cfg) {
  const relevant = Object.fromEntries(TRIAL_KEYS.map(k => [k, cfg[k] ?? null]));
  relevant['spotify.clientId'] = cfg.spotify?.clientId ?? null;
  relevant['lastfm.user'] = cfg.lastfm?.user ?? null;
  return crypto.createHash('sha256').update(JSON.stringify(relevant)).digest('hex').slice(0, 16);
}

const URI = /^spotify:track:[A-Za-z0-9]{1,64}$/;
const text = v => typeof v === 'string';
const count = v => Number.isInteger(v) && v >= 0;

// Passt der Inhalt von probelauf.json? (Von Hand geändert oder von einer anderen Version: lieber nicht übernehmen.)
function valid(t) {
  return Boolean(t) && t.format === FORMAT && /^[0-9a-f]{12}$/.test(t.id) && Number.isFinite(Date.parse(t.createdAt))
    && text(t.settingsHash) && text(t.playlistName) && t.playlistName.trim() && text(t.description) && text(t.summary)
    && ['songs', 'fresh', 'freshCurrent', 'familiar'].every(k => count(t[k]))
    && Array.isArray(t.tracks) && t.tracks.length > 0 && t.tracks.length <= LIMITS.size.max && t.tracks.length === t.songs
    && t.tracks.every(s => s && URI.test(s.uri) && text(s.artist) && text(s.name) && text(s.kind)
      && Array.isArray(s.artists) && s.artists.every(text));
}

const INVALID = Object.freeze({ invalid: true });

// Inhalt von probelauf.json; null = gibt es nicht, { invalid: true } = unlesbar oder unpassend.
export function readTrial(dir) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, TRIAL_FILE), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    const trial = JSON.parse(raw);
    return valid(trial) ? trial : INVALID;
  } catch {
    return INVALID;
  }
}

// Speichert das Ergebnis eines Probelaufs (ersetzt den vorigen). tracks: die Songs der Playlist in ihrer Reihenfolge.
export function saveTrial(dir, { cfg, lang, tracks, counts, summary, description, now = new Date() }) {
  const trial = {
    format: FORMAT,
    id: crypto.randomBytes(6).toString('hex'),
    createdAt: now.toISOString(),
    settingsHash: settingsHash(cfg),
    lang,
    playlistName: cfg.playlistName,
    description,
    summary,
    songs: counts.songs,
    fresh: counts.fresh,
    freshCurrent: counts.freshCurrent,
    familiar: counts.familiar,
    tracks: tracks.map(s => ({
      uri: s.uri, artist: s.artist, artists: (s.artists?.length ? s.artists : [s.artist]).filter(text), name: s.name, kind: s.kind,
    })),
  };
  fs.writeFileSync(path.join(dir, TRIAL_FILE), `${JSON.stringify(trial, null, 2)}\n`);
  return trial;
}

export const removeTrial = dir => fs.rmSync(path.join(dir, TRIAL_FILE), { force: true });

// Warum sich der Probelauf nicht (mehr) übernehmen lässt, als Schlüssel für die Meldung (trial.<grund> in i18n.mjs):
// 'missing' (keine Datei, z. B. weil die Playlist seitdem neu erstellt wurde), 'invalid', 'replaced' (neuerer Probelauf,
// andere Kennung als id), 'old' (älter als 24 Stunden), 'settings' (Einstellungen geändert). null = lässt sich übernehmen.
export function trialProblem(trial, { cfg, id = null, now = Date.now() }) {
  if (trial === null) return 'missing';
  if (trial.invalid) return 'invalid';
  if (id && trial.id !== id) return 'replaced';
  const age = now - Date.parse(trial.createdAt);
  // Aus der Zukunft (Uhr verstellt) zählt wie zu alt.
  if (age > TRIAL_MAX_AGE || age < -5 * 60_000) return 'old';
  if (trial.settingsHash !== settingsHash(cfg)) return 'settings';
  return null;
}

// Für die Oberfläche (GET /api/trial): nur die Eckdaten, nicht die ganze Liste.
export const trialInfo = trial => (trial && !trial.invalid ? {
  id: trial.id, createdAt: trial.createdAt, expiresAt: new Date(Date.parse(trial.createdAt) + TRIAL_MAX_AGE).toISOString(),
  songs: trial.tracks.length, playlistName: trial.playlistName,
} : null);
