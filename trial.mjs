// Probelauf merken und später genau so nach Spotify bringen. In der Oberfläche heißt er „erstellte Liste“ („Playlist
// erstellen“), gebracht wird er mit „„<Name>“ überschreiben“ bzw. „Neue Playlist anlegen“, im Terminal mit node dj.mjs --apply
// (--apply --new). Der Dateiname probelauf.json bleibt aus Rücksicht auf ältere Installationen.
//
// dj.mjs --dry speichert sein Ergebnis in probelauf.json: die Songs in ihrer Reihenfolge (URI, Künstler, Titel, Markierung),
// Name und Beschreibung der Playlist, die Zahlen für die Zusammenfassung samt Spieldauer (durationMs, durationEstimated;
// fehlen bei Probeläufen älterer Versionen), den Zeitpunkt und einen Fingerabdruck von Spotify-App und Last.fm-Benutzer
// (accountHash). Die Liste ist fertig: Geänderte Regler und ihr Alter ändern nichts daran, sie lässt sich so nach Spotify
// bringen, solange sie gilt (trialProblem): kein neuerer Probelauf (andere Kennung), seitdem keine Neuerstellung – ein echter
// Lauf und das Schreiben nach Spotify selbst löschen probelauf.json (removeTrial) –, dasselbe Konto und kein Song daraus
// seitdem gesperrt.
// probelauf.json ist eine persönliche Datei wie state.json: nie im Repository, nie in der ZIP-Datei, ein Update schreibt sie nie.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS } from './config.mjs';
import { readText, writeAtomic } from './files.mjs';
import { artistBlocker, trackBlocker } from './lineup.mjs';

export const TRIAL_FILE = 'probelauf.json';
// 2: accountHash statt des Fingerabdrucks aller Einstellungen (bis 0.4.0) – ältere Dateien zählen als 'invalid'.
const FORMAT = 2;

// Einstellungen, die die Auswahl nicht beeinflussen. Die Oberfläche bekommt die Liste mit GET /api/config (trialIgnored):
// Ändert sich seit dem Erstellen eine andere, sagt sie dazu, dass die Liste so bleibt, wie sie oben steht.
export const TRIAL_IGNORED = ['schedule', 'scheduleTime', 'scheduleDay', 'notifyOnFailure', 'remindLogin', 'runShortcut', 'language', 'archiveCount', 'theme', 'accent', 'mode'];

// Fingerabdruck von Spotify-App und Last.fm-Benutzer: Eine Liste aus einem anderen Konto (andere Lieblingssongs, anderer
// Hörverlauf) soll nicht in dieses. 16 Hex-Zeichen von SHA-256.
export function accountHash(cfg) {
  const account = { 'spotify.clientId': cfg.spotify?.clientId ?? null, 'lastfm.user': cfg.lastfm?.user ?? null };
  return crypto.createHash('sha256').update(JSON.stringify(account)).digest('hex').slice(0, 16);
}

const URI = /^spotify:track:[A-Za-z0-9]{1,64}$/;
const text = v => typeof v === 'string';
const count = v => Number.isInteger(v) && v >= 0;

// Passt der Inhalt von probelauf.json? (Von Hand geändert oder von einer anderen Version: lieber nicht nach Spotify schreiben.)
function valid(t) {
  return Boolean(t) && t.format === FORMAT && /^[0-9a-f]{12}$/.test(t.id) && Number.isFinite(Date.parse(t.createdAt))
    && text(t.accountHash) && text(t.playlistName) && t.playlistName.trim() && text(t.description) && text(t.summary)
    && ['songs', 'fresh', 'freshCurrent', 'familiar'].every(k => count(t[k]))
    && (t.durationMs === undefined || t.durationMs === null || count(t.durationMs))
    && (t.durationEstimated === undefined || t.durationEstimated === null || typeof t.durationEstimated === 'boolean')
    && Array.isArray(t.tracks) && t.tracks.length > 0 && t.tracks.length <= LIMITS.size.max && t.tracks.length === t.songs
    && t.tracks.every(s => s && URI.test(s.uri) && text(s.artist) && text(s.name) && text(s.kind)
      && Array.isArray(s.artists) && s.artists.every(text));
}

const INVALID = Object.freeze({ invalid: true });

// Inhalt von probelauf.json; null = gibt es nicht, { invalid: true } = unlesbar oder unpassend.
export function readTrial(dir) {
  let raw;
  try {
    raw = readText(path.join(dir, TRIAL_FILE));
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
    accountHash: accountHash(cfg),
    lang,
    playlistName: cfg.playlistName,
    description,
    summary,
    songs: counts.songs,
    fresh: counts.fresh,
    freshCurrent: counts.freshCurrent,
    familiar: counts.familiar,
    durationMs: counts.durationMs ?? null,
    durationEstimated: counts.durationEstimated ?? null,
    // Spanne der Erscheinungsjahre (lineupStats; null = unbekannt): Die Songs hier haben kein Jahr mehr.
    yearFrom: counts.yearFrom ?? null,
    yearTo: counts.yearTo ?? null,
    tracks: tracks.map(s => ({
      uri: s.uri, artist: s.artist, artists: (s.artists?.length ? s.artists : [s.artist]).filter(text), name: s.name, kind: s.kind,
    })),
  };
  writeAtomic(path.join(dir, TRIAL_FILE), `${JSON.stringify(trial, null, 2)}\n`);
  return trial;
}

export const removeTrial = dir => fs.rmSync(path.join(dir, TRIAL_FILE), { force: true });

// Warum sich die erstellte Liste (Probelauf) nicht (mehr) nach Spotify bringen lässt, als Schlüssel für die Meldung (trial.<grund> in i18n.mjs):
// 'missing' (keine Datei, z. B. weil die Playlist seitdem neu erstellt wurde), 'invalid', 'replaced' (neuerer Probelauf,
// andere Kennung als id), 'account' (andere Spotify-App oder anderer Last.fm-Benutzer), 'blocked' (ein Song daraus oder sein
// Künstler ist seitdem gesperrt). null = lässt sich nach Spotify bringen.
export function trialProblem(trial, { cfg, id = null }) {
  if (trial === null) return 'missing';
  if (trial.invalid) return 'invalid';
  if (id && trial.id !== id) return 'replaced';
  if (trial.accountHash !== accountHash(cfg)) return 'account';
  const isBlockedArtist = artistBlocker([].concat(cfg.blockedArtists ?? []));
  const isBlockedTrack = trackBlocker(cfg.blockedTracks);
  if (trial.tracks.some(s => s.artists.some(isBlockedArtist) || isBlockedTrack(s))) return 'blocked';
  return null;
}

// Für die Oberfläche (GET /api/trial): nur die Eckdaten, nicht die ganze Liste.
export const trialInfo = trial => (trial && !trial.invalid ? {
  id: trial.id, createdAt: trial.createdAt, songs: trial.tracks.length, playlistName: trial.playlistName,
} : null);
