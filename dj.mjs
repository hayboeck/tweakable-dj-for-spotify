#!/usr/bin/env node
// Tweakable DJ: befüllt eine Spotify-Playlist mit Favoriten + neuen, ähnlichen Songs (via Last.fm).
//   node dj.mjs login   einmalig bei Spotify anmelden
//   node dj.mjs         Playlist neu befüllen
//   node dj.mjs --dry   nur anzeigen, nichts an Spotify schicken; das Ergebnis kommt in probelauf.json
//   node dj.mjs --apply diesen Probelauf genau so in die Playlist schreiben, ohne neu zu losen (höchstens 24 Stunden alt,
//                       mit denselben Einstellungen; mit --dry nur prüfen und anzeigen)
//   node dj.mjs export [datei.txt]   Playlist als Textdatei speichern (ohne Angabe: tweakable-dj-<Datum>.txt hier im Ordner)
//   node dj.mjs import <datei.txt>   Songs aus einer Textdatei in die Playlist schreiben (mit --dry nur anzeigen);
//                       zählt nicht als Lauf des DJ, der Verlauf in state.json bleibt unverändert
//   node dj.mjs --auto  Lauf aus dem Zeitplaner: Ausgabe zusätzlich in automatik.log, Ergebnis in automatik.json; schlägt er
//                       fehl, meldet er sich mit einer Systembenachrichtigung (notifyOnFailure, notify.mjs); läuft die
//                       Spotify-Anmeldung bald ab, erinnert er daran (remindLogin)
// Nach jedem Schreiben der Playlist (Lauf, --apply, import) kommt die Liste als Textdatei in den Ordner archiv/ (archive.mjs).
// Sprache der Ausgabe: TWEAKABLE_DJ_LANG (de/en/es/fr), sonst "language" in config.jsonc, sonst die Systemsprache.
// Letzte Zeile auf stdout (nicht im Terminal): "@@RESULT " + JSON mit dem Ergebnis für die Oberfläche.

import fs from 'node:fs';
import path from 'node:path';
import { HERE, configLanguage, loadConfig, notifyOnFailure, remindLoginOn } from './config.mjs';
import { formatDuration, formatStats, resolveLang, t, tError } from './i18n.mjs';
import { createLastfm } from './lastfm.mjs';
import { autoRunNotice, notify, notifyProblem, remindLogin } from './notify.mjs';
import { recordAutoRun } from './schedule.mjs';
import { createSpotify, FOLLOW_SCOPE, isScopeError, login, REDIRECT_URI } from './spotify.mjs';
import {
  dateTime, exportFileName, formatExport, IMPORT_MAX_BYTES, importDescription, importHints, mapLimit, parseImport, readPlaylist,
  resolveImport, writePlaylist,
} from './playlist.mjs';
import { readTrial, removeTrial, saveTrial, trialProblem } from './trial.mjs';
import { archivedTracks, archivePlaylist, saveArchive } from './archive.mjs';
import {
  arrange, artistBlocker, cacheEntry, cacheValue, candidateWeight, followedFactor, followedMatcher, lineupDuration, lineupStats, newerFactor,
  norm, playableDurationMs, playableUri, rememberPlayed, searchAgain, shuffle, trackBlocker, trackKey, weightedOrder, windowViolations,
} from './lineup.mjs';

const lang = resolveLang(process.env.TWEAKABLE_DJ_LANG, configLanguage());
const dry = process.argv.includes('--dry');
const apply = process.argv.includes('--apply');
// Befehl (login, export, import) und dessen Datei; sonst ein Lauf.
const [command, fileArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));

// Automatischer Lauf (--auto, auch zusammen mit --dry): Ausgabe und Ergebnis mitschreiben.
const isAuto = process.argv.includes('--auto');
const auto = isAuto ? recordAutoRun(HERE, lang) : null;

const TOKENS = path.join(HERE, 'tokens.json');
const STATE = path.join(HERE, 'state.json');
const LASTFM_CACHE = path.join(HERE, 'lastfm-cache.json');

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

// Ergebnis des Laufs: wird in main() nach und nach gefüllt.
// missingScope: Berechtigung, die der Spotify-Anmeldung fehlte (z. B. 'user-follow-read'), sonst null.
// trialId: Kennung des gespeicherten Probelaufs (probelauf.json), sonst null.
// durationMs: Spieldauer der Liste in Millisekunden; durationEstimated: true, wenn sie für einzelne Songs geschätzt ist.
// archiveFile: Name der Archivdatei, die dieser Lauf angelegt hat (für „Vorige Playlist wiederherstellen“), sonst null.
// artists, yearFrom, yearTo, firstTime: Zeile nach der Zusammenfassung (lineupStats in lineup.mjs; null = unbekannt).
const result = { dry, songs: null, fresh: null, freshCurrent: null, familiar: null, durationMs: null, durationEstimated: null, playlistName: null, playlistUrl: null, missingScope: null, trialId: null, archiveFile: null, artists: null, yearFrom: null, yearTo: null, firstTime: null, summary: null };

// Fehlerart für die Oberfläche: login_expired, not_logged_in, forbidden, lastfm_key, setup_incomplete, node_version,
// trial_expired (Probelauf lässt sich nicht mehr übernehmen), other.
const errorCodeOf = e => e.errorCode ?? (e.status === 403 ? 'forbidden' : 'other');

// Ergebnis melden: automatik.json (bei --auto) und als letzte Zeile "@@RESULT {…}" für die Oberfläche.
function report(values) {
  const { summary, ...r } = { ...result, ...values };
  const out = {
    ok: r.ok, dry: r.dry, songs: r.songs, fresh: r.fresh, freshCurrent: r.freshCurrent, familiar: r.familiar,
    durationMs: r.durationMs ?? null, durationEstimated: r.durationEstimated ?? null,
    playlistName: r.playlistName, playlistUrl: r.playlistUrl, errorCode: r.errorCode ?? null, error: r.error ?? null,
    missingScope: r.missingScope ?? null, trialId: r.trialId ?? null, archiveFile: r.archiveFile ?? null,
    artists: r.artists ?? null, yearFrom: r.yearFrom ?? null, yearTo: r.yearTo ?? null, firstTime: r.firstTime ?? null,
  };
  auto?.finish({ ...out, summary: summary ?? null });
  if (!process.stdout.isTTY) process.stdout.write(`@@RESULT ${JSON.stringify(out)}\n`);
  if (auto) notifyAutoRun(out);
}

// Systembenachrichtigung nach einem automatischen Lauf (nur bei --auto): bei einem Fehler (autoRunNotice in notify.mjs),
// sonst ggf. die Erinnerung an die bald ablaufende Spotify-Anmeldung (remindLogin, höchstens einmal am Tag). Kommt nach dem
// Ergebnis, wartet höchstens 10 Sekunden und ändert weder automatik.json noch den Exit-Code; klappt sie nicht, steht nur ein
// Hinweis in automatik.log.
async function notifyAutoRun(out) {
  try {
    const notice = autoRunNotice({ result: out, lang, enabled: notifyOnFailure() });
    const sent = notice ? await notify(notice) : await remindLogin({ dir: HERE, lang, enabled: remindLoginOn() });
    if (sent && !sent.ok) console.warn(t(lang, 'notify.logNote', { problem: notifyProblem(lang, sent) }));
  } catch {
    // Eine Benachrichtigung darf den Lauf nie stören.
  }
}

const warn = msg => console.warn(`  ⚠ ${msg}`);
// Nicht wiederholen: nur die letzten noRepeatRuns Läufe merken (0 = keinen).
const lastRuns = (cfg, history) => (cfg.noRepeatRuns > 0 ? history.slice(-cfg.noRepeatRuns) : []);
const lineupLine = (track, i) => `${String(i + 1).padStart(3)}. ${track.artist} – ${track.name}  (${track.kind})`;

async function loadSeeds(spotify, seed) {
  if (seed === 'liked') return spotify.likedTracks();
  const id = seed.match(/playlist[/:]([A-Za-z0-9]+)/)?.[1] ?? seed;
  const tracks = await spotify.playlistTracks(id);
  if (!tracks.length) throw new Error(t(lang, 'run.seedEmpty'));
  return tracks;
}

async function main() {
  const cfg = loadConfig(lang);
  result.playlistName = cfg.playlistName;

  if (command === 'login') {
    await login(cfg.spotify.clientId, TOKENS, { lang });
    console.log(t(lang, 'run.loggedIn'));
    return {};
  }

  const spotify = createSpotify(cfg.spotify.clientId, TOKENS, { lang });
  if (command === 'export') return exportPlaylist(cfg, spotify);
  if (command === 'import') return importFile(cfg, spotify);
  if (apply) return applyTrial(cfg, spotify);
  const lastfm = createLastfm(cfg.lastfm.apiKey, LASTFM_CACHE, { lang });
  const state = readJson(STATE, { history: [], cache: {} });
  // Für .catch(): Fehler melden und mit `fallback` weitermachen – außer bei ungültigem Last.fm-API-Key.
  const warnOr = fallback => e => {
    if (e.fatal) throw e;
    warn(e.message);
    return fallback;
  };
  // Sperrliste: gesperrte Künstler und gesperrte Songs (blockedTracks, auch andere Versionen über trackKey) weder als
  // Ausgangspunkt, noch als neuer Song, noch als Favorit. Ein Song, der zugleich von einem gesperrten Künstler ist, zählt
  // bei den Künstlern.
  const isBlockedArtist = artistBlocker([].concat(cfg.blockedArtists ?? []));
  const isBlockedTrack = trackBlocker(cfg.blockedTracks);
  const blockedOut = new Set();
  const blockedTrackOut = new Set();
  const allowed = track => {
    // Songs von Spotify kennen alle Beteiligten, Songs von Last.fm nur den Künstler-Text.
    const names = track.artists?.length ? track.artists : [track.artist];
    const out = names.some(isBlockedArtist) ? blockedOut : isBlockedTrack(track) ? blockedTrackOut : null;
    out?.add(trackKey(track.artist, track.name));
    return !out;
  };
  // Keine Songs mit expliziten Texten (excludeExplicit): gilt für alles, was in die Playlist kommt (Favoriten, neue Songs,
  // Auffüllen), nicht für die Ausgangspunkte – die bestimmen nur, wonach Last.fm sucht.
  const excludeExplicit = cfg.excludeExplicit === true;
  const explicitOut = new Set();
  const notExplicit = track => {
    if (!excludeExplicit || !track.explicit) return true;
    explicitOut.add(trackKey(track.artist, track.name));
    return false;
  };

  console.log(t(lang, 'run.loadingFavorites'));
  const seeds = await loadSeeds(spotify, cfg.seed);
  const seedKeys = new Set(seeds.map(s => trackKey(s.artist, s.name)));
  const favorites = seeds.filter(allowed);
  console.log(t(lang, 'run.songs', { count: seeds.length }));

  // Gefolgte Künstler (followedArtists): 0 = egal, dann wird die Liste gar nicht abgefragt. Fehlt der Anmeldung die
  // Berechtigung (ältere Anmeldungen) oder klappt die Abfrage nicht, geht der Lauf weiter wie mit 0.
  let followedNames = [];
  if (cfg.followedArtists !== 0) {
    try {
      followedNames = await spotify.followedArtists();
      console.log(t(lang, 'run.followed', { count: followedNames.length }));
    } catch (e) {
      if (isScopeError(e)) {
        warn(t(lang, 'run.followedScope'));
        result.missingScope = FOLLOW_SCOPE;
      } else {
        warn(t(lang, 'run.followedFailed', { message: e.message }));
      }
    }
  }
  // Faktor für das Los (lineup.mjs): 0 = Songs gefolgter Künstler ganz weglassen (Haupt- und Gastkünstler).
  const followedWeight = followedFactor(followedNames.length ? cfg.followedArtists : 0);
  const isFollowed = followedMatcher(followedNames);
  const byFollowed = track => isFollowed(track.artists?.length ? track.artists : [track.artist]);
  const followedOut = new Set();
  const notFollowedOut = track => {
    if (followedWeight > 0 || !byFollowed(track)) return true;
    followedOut.add(trackKey(track.artist, track.name));
    return false;
  };
  const followWeight = track => (byFollowed(track) ? followedWeight : 1);
  // Neuere / ältere Songs (preferNewer, 0 = aus): Faktor nach dem Erscheinungsjahr, unbekanntes Jahr = 1 (lineup.mjs).
  const newerWeight = year => newerFactor(cfg.preferNewer, year);
  // Favoriten für die Playlist (die Ausgangspunkte bleiben davon unberührt).
  const favoritePool = favorites.filter(notFollowedOut).filter(notExplicit);

  // Nicht wiederholen: kürzlich gehört (Last.fm) + in den letzten Läufen schon drin gewesen.
  const blocked = new Set(lastRuns(cfg, state.history).flat());
  // "Aktuell" = in den letzten currentDays gehört (Song oder Künstler).
  const currentKeys = new Set();
  const currentArtists = new Set();
  let discoverySeeds = favorites;
  if (cfg.lastfm.user) {
    console.log(t(lang, 'run.loadingHistory'));
    // null = Benutzer unbekannt; andere Fehler nur melden und trotzdem weitermachen.
    const user = await lastfm.userInfo(cfg.lastfm.user).catch(warnOr({}));
    if (user === null) {
      warn(t(lang, 'run.userUnknown', { user: cfg.lastfm.user }));
    } else {
      const now = Date.now() / 1000;
      const days = Math.max(cfg.excludeRecentDays, cfg.currentDays);
      const recent = await lastfm.recentTracks(cfg.lastfm.user, Math.floor(now - days * 86400)).catch(warnOr(null));
      if (recent?.length === 0 && days > 0) warn(t(lang, 'run.noScrobbles', { days, user: cfg.lastfm.user }));
      const current = [];
      for (const r of recent ?? []) {
        const ageDays = (now - r.playedAt) / 86400;
        // 0 = aus, auch für den Song, der gerade läuft (Alter 0)
        if (cfg.excludeRecentDays > 0 && ageDays <= cfg.excludeRecentDays) blocked.add(trackKey(r.artist, r.name));
        if (cfg.currentDays > 0 && ageDays <= cfg.currentDays) {
          currentKeys.add(trackKey(r.artist, r.name));
          currentArtists.add(norm(r.artist));
          current.push(r);
        }
      }
      console.log(t(lang, 'run.scrobbles', { total: recent?.length ?? 0, current: current.length, days: cfg.currentDays, artists: currentArtists.size }));
      const top = cfg.useLastfmTopTracks ? await lastfm.userTopTracks(cfg.lastfm.user).catch(warnOr([])) : [];
      discoverySeeds = [...favorites, ...top, ...current];
    }
  }
  const isCurrent = track => currentKeys.has(trackKey(track.artist, track.name)) || currentArtists.has(norm(track.artist));
  const seedWeight = track => (isCurrent(track) ? cfg.currentFactor : 1);
  const uniqueSeeds = [...new Map(discoverySeeds.filter(allowed).map(s => [trackKey(s.artist, s.name), s])).values()];
  const startingPoints = weightedOrder(uniqueSeeds, seedWeight).slice(0, cfg.seedsPerRun);
  console.log(t(lang, 'run.startingPoints', { current: startingPoints.filter(isCurrent).length, total: startingPoints.length, factor: cfg.currentFactor }));

  console.log(t(lang, 'run.searchingSimilar'));
  const candidates = new Map();
  const addCandidate = (track, match, via) => {
    if (!track.artist || !track.name || !allowed(track)) return;
    const key = trackKey(track.artist, track.name);
    if (seedKeys.has(key) || blocked.has(key) || !notFollowedOut(track)) return;
    const existing = candidates.get(key);
    if (existing) {
      // Von mehreren Favoriten aus gefunden = wahrscheinlich ein guter Treffer.
      existing.match = Math.min(1, Math.max(existing.match, match) + 0.1);
      existing.viaCurrent ||= isCurrent(via);
    } else {
      candidates.set(key, { key, artist: track.artist, name: track.name, match, via: via.artist, viaCurrent: isCurrent(via), weight: followWeight(track) });
    }
  };

  await mapLimit(startingPoints, 4, async seed => {
    try {
      const similar = await lastfm.similarTracks(seed.artist, seed.name);
      similar.forEach(s => addCandidate(s, s.match, seed));
      // Ausflug zu einem verwandten Künstler – je höher "adventure", desto weiter weg.
      if (similar.length < 5 || Math.random() < cfg.adventure) {
        const artists = (await lastfm.similarArtists(seed.artist)).filter(a => !isBlockedArtist(a.name));
        const pool = artists.slice(Math.floor(artists.length * cfg.adventure * 0.5));
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick) {
          const tops = await lastfm.artistTopTracks(pick.name);
          shuffle(tops).slice(0, 3).forEach(s => addCandidate(s, pick.match * 0.8, seed));
        }
      }
    } catch (e) {
      if (e.fatal) throw e;
      warn(`${seed.artist} – ${seed.name}: ${e.message}`);
    }
  });
  // Last.fm wird ab hier nicht mehr gefragt: Cache jetzt speichern, dann bleibt er auch bei Spotify-Fehlern erhalten.
  try {
    lastfm.saveCache();
  } catch (e) {
    warn(t(lang, 'run.cacheNotSaved', { message: e.message }));
  }
  const { hits, total } = lastfm.cacheStats();
  console.log(t(lang, 'run.candidates', { count: candidates.size, hits, total }));
  if (blockedOut.size) console.log(t(lang, 'run.blocked', { count: blockedOut.size }));
  if (followedOut.size) console.log(t(lang, 'run.followedOut', { count: followedOut.size }));

  // Tags = Interpret + Künstler, über den ein neuer Song gefunden wurde. Beide zählen für die Fensterregel.
  const tagsOf = (artist, via) => [...new Set([norm(artist), ...(via ? [norm(via)] : [])])];
  const tagLimit = Math.ceil((cfg.size * cfg.maxPerWindow) / cfg.artistWindow);
  const perArtist = new Map();
  const perTag = new Map();
  const usedUris = new Set();
  const count = (map, k) => map.get(k) ?? 0;
  const fits = track =>
    count(perArtist, norm(track.artist)) < cfg.maxPerArtist && track.tags.every(tag => count(perTag, tag) < tagLimit) && !usedUris.has(track.uri);
  const take = (list, track) => {
    perArtist.set(norm(track.artist), count(perArtist, norm(track.artist)) + 1);
    track.tags.forEach(tag => perTag.set(tag, count(perTag, tag) + 1));
    usedUris.add(track.uri);
    list.push(track);
  };
  // Markierung in der Liste: "Favorit · aktuell" bzw. "neu, über X · aktuell" (englisch "favorite · current", "new, via X · current").
  const current = yes => (yes ? t(lang, 'run.current') : '');
  const asFavorite = track => ({ ...track, tags: tagsOf(track.artist), kind: t(lang, 'run.favorite') + current(isCurrent(track)) });

  const familiar = [];
  const familiarTarget = Math.round(cfg.size * cfg.familiarShare);
  for (const track of weightedOrder(favoritePool, f => seedWeight(f) * followWeight(f) * newerWeight(f.releaseYear)).map(asFavorite)) {
    if (familiar.length >= familiarTarget) break;
    if (!blocked.has(trackKey(track.artist, track.name)) && fits(track)) take(familiar, track);
  }

  console.log(t(lang, 'run.searchingSpotify'));
  // Alle Künstler laut Spotify zu den Songs, die dieser Lauf gesucht hat (für probelauf.json und den Export);
  // Songs aus dem Such-Cache in state.json kennen nur den Künstler von Last.fm. Format des Caches: cacheEntry() in lineup.mjs.
  const spotifyArtists = new Map();
  const fresh = [];
  const cached = key => (Object.hasOwn(state.cache, key) ? cacheEntry(state.cache[key]) : undefined);
  // Erscheinungsjahr neuer Songs: bekannt nur aus dem Such-Cache (Songs, die schon einmal gesucht wurden), sonst erst nach
  // der Suche unten.
  const ordered = weightedOrder(
    [...candidates.values()],
    c => candidateWeight(c.match, cfg.adventure) * (c.viaCurrent ? cfg.currentFactor : 1) * c.weight * newerWeight(cached(c.key)?.year),
  );
  for (const c of ordered) {
    if (familiar.length + fresh.length >= cfg.size) break;
    const track = { ...c, tags: tagsOf(c.artist, c.via), kind: t(lang, 'run.new', { via: c.via }) + current(c.viaCurrent) };
    if (!fits(track)) continue;
    let entry = cached(c.key);
    let searched = false;
    // Neu suchen: nicht im Cache, oder mit excludeExplicit ein Eintrag von 0.1.1 (explicit unbekannt).
    if (searchAgain(entry, excludeExplicit)) {
      searched = true;
      try {
        const hit = await spotify.findTrack(c.artist, c.name);
        state.cache[c.key] = cacheValue(hit);
        entry = cacheEntry(state.cache[c.key]);
        for (const h of [hit, hit?.clean]) if (h) spotifyArtists.set(h.uri, h.artists);
      } catch (e) {
        // Fehler nicht als "nicht gefunden" merken, beim nächsten Lauf wird neu gesucht. Bei 403 abbrechen.
        if (e.status === 403) throw e;
        warn(e.message);
        continue;
      }
    }
    if (!entry) continue; // auf Spotify nicht gefunden
    // Jahr erst durch diese Suche bekannt (beim Auslosen zählte es noch nicht): Ein kleineres Los nach preferNewer gilt jetzt
    // als Wahrscheinlichkeit, den Song zu nehmen. Beim nächsten Lauf steht das Jahr im Cache und zählt schon beim Auslosen.
    const late = searched ? newerWeight(entry.year) : 1;
    if (late < 1 && Math.random() >= late) continue;
    // Explizit und keine nicht explizite Version gefunden: auslassen.
    track.uri = playableUri(entry, excludeExplicit);
    if (!track.uri) {
      explicitOut.add(c.key);
      continue;
    }
    // Gesperrter Song, den erst die URI verrät (Last.fm nennt ihn anders als die Sperrliste)
    if (isBlockedTrack(track)) {
      blockedTrackOut.add(c.key);
      continue;
    }
    track.artists = spotifyArtists.get(track.uri);
    // Spieldauer aus dem Cache; fehlt sie (Eintrag von 0.1.4 oder älter), wird sie geschätzt, nicht neu gesucht.
    track.durationMs = playableDurationMs(entry, excludeExplicit);
    track.releaseYear = entry.year;
    if (fits(track)) take(fresh, track);
  }

  // Zu wenig gefunden? Mit weiteren Favoriten auffüllen (dann auch kürzlich gehörte).
  for (const track of shuffle(favoritePool).map(asFavorite)) {
    if (familiar.length + fresh.length >= cfg.size) break;
    if (fits(track)) take(familiar, track);
  }

  if (blockedTrackOut.size) console.log(t(lang, 'run.blockedSongs', { count: blockedTrackOut.size }));
  if (explicitOut.size) console.log(t(lang, 'run.explicitOut', { count: explicitOut.size }));

  const lineup = arrange([...familiar, ...fresh], { gap: cfg.artistGap, window: cfg.artistWindow, maxPerWindow: cfg.maxPerWindow });
  // Kein einziger Song (z. B. keine Lieblingssongs und kein Hörverlauf): abbrechen, statt die Playlist zu leeren.
  if (!lineup.length) throw new Error(t(lang, 'run.noSongs'));
  const freshCurrent = fresh.filter(c => c.viaCurrent).length;
  const counts = { songs: lineup.length, fresh: fresh.length, freshCurrent, familiar: familiar.length, ...lineupDuration(lineup) };
  const duration = formatDuration(lang, counts.durationMs, counts.durationEstimated);
  const summary = t(lang, 'run.summary', { name: cfg.playlistName, ...counts, duration });
  const stats = lineupStats(lineup, playedSet(state));
  console.log(`\n${summary}\n${formatStats(lang, stats)}\n`);
  if (windowViolations(lineup, cfg.artistWindow, cfg.maxPerWindow)) {
    warn(t(lang, 'run.windowRule', { max: cfg.maxPerWindow, window: cfg.artistWindow }));
  }
  lineup.forEach((track, i) => console.log(lineupLine(track, i)));
  const description = t(lang, 'run.description', { ...dateTime(lang, new Date()), fresh: fresh.length, familiar: familiar.length });

  if (dry) {
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    console.log(`\n${t(lang, 'run.dry')}`);
    // Für „Diese Liste übernehmen“ bzw. --apply merken; klappt das nicht, ist der Probelauf trotzdem gültig.
    let trial = null;
    try {
      trial = saveTrial(HERE, { cfg, lang, tracks: lineup, counts: { ...counts, ...stats }, summary, description });
      console.log(t(lang, 'run.trialSaved'));
    } catch (e) {
      warn(t(lang, 'run.trialNotSaved', { message: e.message }));
    }
    return { ...counts, ...stats, summary, trialId: trial?.id ?? null };
  }

  // Such-Cache jetzt speichern, dann bleibt er auch bei Fehlern beim Schreiben erhalten.
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  const playlistUrl = await toSpotify(cfg, spotify, lineup, description);
  return { ...counts, ...stats, summary, playlistUrl };
}

// Songs, die der DJ schon in die Playlist geschrieben hat, als Set von trackKey (state.played, für „zum ersten Mal dabei“).
// Fehlt state.played (Verlauf von 0.2.x oder älter), zählen die Läufe in state.history und die Playlists im Archiv.
function playedSet(state) {
  if (Array.isArray(state.played)) return new Set(state.played);
  return new Set([...(state.history ?? []).flat(), ...archivedTracks(HERE).map(s => trackKey(s.artist, s.name))]);
}

// Songs eines Laufs (bzw. eines übernommenen Probelaufs) in die Playlist schreiben und als Lauf merken (state.history, für
// „Vorige Läufe sperren“, und state.played, für „zum ersten Mal dabei“). Ein älterer Probelauf passt danach nicht mehr zum Verlauf: probelauf.json kommt weg.
async function toSpotify(cfg, spotify, lineup, description) {
  const { url, created } = await writePlaylist(spotify, { name: cfg.playlistName, uris: lineup.map(track => track.uri), description, lang, warn });
  if (created) console.log(`\n${t(lang, 'run.created', { name: cfg.playlistName })}`);
  await toArchive(() => saveArchive(HERE, { name: cfg.playlistName, url, tracks: lineup, lang, keep: cfg.archiveCount }));
  const state = readJson(STATE, { history: [], cache: {} });
  const keys = lineup.map(track => trackKey(track.artist, track.name));
  state.played = rememberPlayed([...playedSet(state)], keys);
  state.history = lastRuns(cfg, [...state.history, keys]);
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  try {
    removeTrial(HERE);
  } catch (e) {
    warn(e.message);
  }
  console.log(`\n${t(lang, 'run.done', { url })}`);
  return url;
}

// Geschriebene Liste ins Archiv (archive.mjs; archiveCount 0 = aus). Ein Fehler dabei ist nur eine Warnung, der Lauf zählt.
// Der Name der neuen Datei kommt als archiveFile ins Ergebnis.
async function toArchive(save) {
  try {
    const saved = await save();
    if (saved) {
      result.archiveFile = path.basename(saved.file);
      console.log(t(lang, 'archive.saved', { file: saved.file }));
    }
    if (saved?.removed?.length) console.log(t(lang, 'archive.removed', { count: saved.removed.length }));
  } catch (e) {
    warn(t(lang, 'archive.failed', { message: e.message }));
  }
}

// --apply: den gespeicherten Probelauf genau so übernehmen – dieselben Songs in derselben Reihenfolge, ohne neu zu losen.
// --trial=<Kennung> (von der Oberfläche): nur genau diesen Probelauf, nicht einen neueren aus einem anderen Fenster.
async function applyTrial(cfg, spotify) {
  const trial = readTrial(HERE);
  const id = process.argv.find(a => a.startsWith('--trial='))?.slice('--trial='.length) || null;
  const problem = trialProblem(trial, { cfg, id });
  if (problem) throw tError(lang, `trial.${problem}`, {}, { errorCode: 'trial_expired' });
  console.log(t(lang, 'apply.start', { ...dateTime(lang, new Date(trial.createdAt)), count: trial.tracks.length }));
  // Künstler und „zum ersten Mal“ jetzt (der Verlauf kann sich seit dem Probelauf geändert haben); die Erscheinungsjahre
  // kennt nur der Probelauf (fehlen bei Probeläufen älterer Versionen).
  const now = lineupStats(trial.tracks, playedSet(readJson(STATE, { history: [], cache: {} })));
  const stats = { ...now, yearFrom: trial.yearFrom ?? null, yearTo: trial.yearTo ?? null };
  console.log(`\n${trial.summary}\n${formatStats(lang, stats)}\n`);
  trial.tracks.forEach((track, i) => console.log(lineupLine(track, i)));
  // Spieldauer fehlt bei Probeläufen älterer Versionen (dann null).
  const counts = {
    songs: trial.songs, fresh: trial.fresh, freshCurrent: trial.freshCurrent, familiar: trial.familiar,
    durationMs: trial.durationMs ?? null, durationEstimated: trial.durationEstimated ?? null,
  };
  if (dry) {
    console.log(`\n${t(lang, 'run.dry')}`);
    return { ...counts, ...stats, summary: trial.summary, trialId: trial.id };
  }
  const playlistUrl = await toSpotify(cfg, spotify, trial.tracks, trial.description);
  return { ...counts, ...stats, summary: trial.summary, playlistUrl };
}

// export [datei.txt]: die Playlist so, wie sie gerade in Spotify ist, als Textdatei (Format in playlist.mjs).
async function exportPlaylist(cfg, spotify) {
  const now = new Date();
  const file = path.resolve(fileArg ?? exportFileName(lang, now));
  // Nur .txt: So überschreibt ein Tippfehler nie config.jsonc oder eine Programmdatei.
  if (!/\.txt$/i.test(file)) throw tError(lang, 'export.txtOnly', { file });
  const list = await readPlaylist(spotify, cfg.playlistName);
  if (!list) throw tError(lang, 'export.noPlaylist', { name: cfg.playlistName });
  fs.writeFileSync(file, formatExport({ name: cfg.playlistName, url: list.url, tracks: list.tracks, lang, now }));
  console.log(t(lang, 'export.saved', { file, count: list.tracks.length }));
  return { songs: list.tracks.length, playlistUrl: list.url };
}

// import <datei.txt>: Songs aus einer Textdatei suchen und in die Playlist schreiben (mit --dry nur anzeigen).
// Kein Lauf des DJ: state.json (Verlauf und Such-Cache) bleibt unverändert, ein Probelauf gilt weiter.
async function importFile(cfg, spotify) {
  if (!fileArg) throw tError(lang, 'import.usage');
  let text;
  try {
    if (fs.statSync(fileArg).size > IMPORT_MAX_BYTES) throw tError(lang, 'import.tooLarge');
    text = fs.readFileSync(fileArg, 'utf8');
  } catch (e) {
    throw e.code === 'ENOENT' ? tError(lang, 'import.fileMissing', { file: path.resolve(fileArg) }) : e;
  }
  const entries = parseImport(text, lang);
  console.log(t(lang, 'import.reading', { count: entries.length }));
  // Fortschritt alle 25 Songs und am Ende
  const onProgress = (done, total) => (done % 25 === 0 || done === total) && console.log(t(lang, 'import.searching', { done, total }));
  const { uris, notFound, tracks } = await resolveImport(spotify, entries, { onProgress });
  console.log(`\n${t(lang, 'import.found', { found: uris.length, total: entries.length })}`);
  if (notFound.length) {
    console.log(t(lang, 'import.notFound'));
    for (const n of notFound) console.log(t(lang, 'import.notFoundLine', { line: n.line, text: n.text, reason: t(lang, `import.reason.${n.reason}`) }));
  }
  // Gesperrte bzw. explizite Songs nur melden: Die Datei ist deine Liste, der Import schreibt sie trotzdem.
  const hints = importHints(tracks, cfg);
  for (const [key, list] of [['import.hintBlocked', hints.blocked], ['import.hintExplicit', hints.explicit]]) {
    if (!list.length) continue;
    console.log(t(lang, key, { count: list.length }));
    for (const h of list) console.log(t(lang, 'import.hintLine', h));
  }
  if (!uris.length) throw tError(lang, 'import.noneFound');
  if (dry) {
    console.log(`\n${t(lang, 'run.dry')}`);
    return { songs: uris.length };
  }
  const { url, created } = await writePlaylist(spotify, {
    name: cfg.playlistName, uris, description: importDescription(lang, new Date(), uris.length), lang, warn,
  });
  if (created) console.log(`\n${t(lang, 'run.created', { name: cfg.playlistName })}`);
  await toArchive(() => archivePlaylist(HERE, spotify, { name: cfg.playlistName, lang, keep: cfg.archiveCount }));
  console.log(`\n${t(lang, 'import.done', { name: cfg.playlistName, count: uris.length, url })}`);
  return { songs: uris.length, playlistUrl: url };
}

function fail(e) {
  const errorCode = errorCodeOf(e);
  console.error(`\n${t(lang, 'run.error', { message: e.message })}`);
  if (/INVALID_CLIENT|redirect/i.test(e.message)) console.error(t(lang, 'run.redirectHint', { uri: REDIRECT_URI }));
  // Premium lässt sich nicht direkt prüfen: GET /me liefert seit Feb. 2026 kein "product" mehr.
  if (errorCode === 'forbidden') console.error(t(lang, 'run.forbidden'));
  report({ ok: false, errorCode, error: e.message });
  process.exitCode = 1;
}

// Ältere Node-Versionen (z. B. ohne eingebautes fetch) mit klarer Meldung abweisen.
if (Number(process.versions.node.split('.')[0]) < 18) {
  const error = t(lang, 'node.tooOld', { version: process.versions.node });
  console.error(error);
  report({ ok: false, errorCode: 'node_version', error });
  process.exitCode = 1;
} else {
  main().then(values => report({ ok: true, ...values }), fail);
}
