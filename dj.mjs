#!/usr/bin/env node
// Tweakable DJ: befüllt eine Spotify-Playlist mit Favoriten + neuen, ähnlichen Songs (via Last.fm).
//   node dj.mjs login   einmalig bei Spotify anmelden
//   node dj.mjs         Playlist neu befüllen
//   node dj.mjs --dry   nur anzeigen, nichts an Spotify schicken
//   node dj.mjs --auto  Lauf aus dem Zeitplaner: Ausgabe zusätzlich in automatik.log, Ergebnis in automatik.json
// Sprache der Ausgabe: TWEAKABLE_DJ_LANG (de/en), sonst "language" in config.jsonc, sonst die Systemsprache.
// Letzte Zeile auf stdout (nicht im Terminal): "@@RESULT " + JSON mit dem Ergebnis für die Oberfläche.

import fs from 'node:fs';
import path from 'node:path';
import { HERE, configLanguage, loadConfig } from './config.mjs';
import { locale, resolveLang, t } from './i18n.mjs';
import { createLastfm } from './lastfm.mjs';
import { recordAutoRun } from './schedule.mjs';
import { createSpotify, login, REDIRECT_URI } from './spotify.mjs';
import { arrange, artistBlocker, candidateWeight, norm, shuffle, trackKey, weightedOrder, windowViolations } from './lineup.mjs';

const lang = resolveLang(process.env.TWEAKABLE_DJ_LANG, configLanguage());
const dry = process.argv.includes('--dry');

// Automatischer Lauf (--auto, auch zusammen mit --dry): Ausgabe und Ergebnis mitschreiben.
const auto = process.argv.includes('--auto') ? recordAutoRun(HERE, lang) : null;

const TOKENS = path.join(HERE, 'tokens.json');
const STATE = path.join(HERE, 'state.json');
const LASTFM_CACHE = path.join(HERE, 'lastfm-cache.json');

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

// Ergebnis des Laufs: wird in main() nach und nach gefüllt.
const result = { dry, songs: null, fresh: null, freshCurrent: null, familiar: null, playlistName: null, playlistUrl: null, summary: null };

// Fehlerart für die Oberfläche: login_expired, not_logged_in, forbidden, lastfm_key, setup_incomplete, node_version, other.
const errorCodeOf = e => e.errorCode ?? (e.status === 403 ? 'forbidden' : 'other');

// Ergebnis melden: automatik.json (bei --auto) und als letzte Zeile "@@RESULT {…}" für die Oberfläche.
function report(values) {
  const { summary, ...r } = { ...result, ...values };
  const out = {
    ok: r.ok, dry: r.dry, songs: r.songs, fresh: r.fresh, freshCurrent: r.freshCurrent, familiar: r.familiar,
    playlistName: r.playlistName, playlistUrl: r.playlistUrl, errorCode: r.errorCode ?? null, error: r.error ?? null,
  };
  auto?.finish({ ...out, summary: summary ?? null });
  if (!process.stdout.isTTY) process.stdout.write(`@@RESULT ${JSON.stringify(out)}\n`);
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

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

  if (process.argv[2] === 'login') {
    await login(cfg.spotify.clientId, TOKENS, { lang });
    console.log(t(lang, 'run.loggedIn'));
    return {};
  }

  const spotify = createSpotify(cfg.spotify.clientId, TOKENS, { lang });
  const lastfm = createLastfm(cfg.lastfm.apiKey, LASTFM_CACHE, { lang });
  const state = readJson(STATE, { history: [], cache: {} });
  const warn = msg => console.warn(`  ⚠ ${msg}`);
  // Für .catch(): Fehler melden und mit `fallback` weitermachen – außer bei ungültigem Last.fm-API-Key.
  const warnOr = fallback => e => {
    if (e.fatal) throw e;
    warn(e.message);
    return fallback;
  };
  // Sperrliste: gesperrte Künstler weder als Ausgangspunkt, noch als neuer Song, noch als Favorit.
  const isBlockedArtist = artistBlocker([].concat(cfg.blockedArtists ?? []));
  const blockedOut = new Set();
  const allowed = track => {
    // Songs von Spotify kennen alle Beteiligten, Songs von Last.fm nur den Künstler-Text.
    const names = track.artists?.length ? track.artists : [track.artist];
    if (!names.some(isBlockedArtist)) return true;
    blockedOut.add(trackKey(track.artist, track.name));
    return false;
  };

  console.log(t(lang, 'run.loadingFavorites'));
  const seeds = await loadSeeds(spotify, cfg.seed);
  const seedKeys = new Set(seeds.map(s => trackKey(s.artist, s.name)));
  const favorites = seeds.filter(allowed);
  console.log(t(lang, 'run.songs', { count: seeds.length }));

  // Nicht wiederholen: kürzlich gehört (Last.fm) + in den letzten Läufen schon drin gewesen.
  const lastRuns = history => (cfg.noRepeatRuns > 0 ? history.slice(-cfg.noRepeatRuns) : []);
  const blocked = new Set(lastRuns(state.history).flat());
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
        if (ageDays <= cfg.excludeRecentDays) blocked.add(trackKey(r.artist, r.name));
        if (ageDays <= cfg.currentDays) {
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
    if (seedKeys.has(key) || blocked.has(key)) return;
    const existing = candidates.get(key);
    if (existing) {
      // Von mehreren Favoriten aus gefunden = wahrscheinlich ein guter Treffer.
      existing.match = Math.min(1, Math.max(existing.match, match) + 0.1);
      existing.viaCurrent ||= isCurrent(via);
    } else {
      candidates.set(key, { key, artist: track.artist, name: track.name, match, via: via.artist, viaCurrent: isCurrent(via) });
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
  if (blockedOut.size) console.log(t(lang, blockedOut.size === 1 ? 'run.blockedOne' : 'run.blockedMany', { count: blockedOut.size }));

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
  for (const track of weightedOrder(favorites, seedWeight).map(asFavorite)) {
    if (familiar.length >= familiarTarget) break;
    if (!blocked.has(trackKey(track.artist, track.name)) && fits(track)) take(familiar, track);
  }

  console.log(t(lang, 'run.searchingSpotify'));
  const fresh = [];
  const ordered = weightedOrder(
    [...candidates.values()],
    c => candidateWeight(c.match, cfg.adventure) * (c.viaCurrent ? cfg.currentFactor : 1),
  );
  for (const c of ordered) {
    if (familiar.length + fresh.length >= cfg.size) break;
    const track = { ...c, tags: tagsOf(c.artist, c.via), kind: t(lang, 'run.new', { via: c.via }) + current(c.viaCurrent) };
    if (!fits(track)) continue;
    if (!(c.key in state.cache)) {
      try {
        state.cache[c.key] = await spotify.searchTrack(c.artist, c.name);
      } catch (e) {
        // Fehler nicht als "nicht gefunden" merken, beim nächsten Lauf wird neu gesucht. Bei 403 abbrechen.
        if (e.status === 403) throw e;
        warn(e.message);
        continue;
      }
    }
    track.uri = state.cache[c.key];
    if (track.uri && fits(track)) take(fresh, track);
  }

  // Zu wenig gefunden? Mit weiteren Favoriten auffüllen (dann auch kürzlich gehörte).
  for (const track of shuffle(favorites).map(asFavorite)) {
    if (familiar.length + fresh.length >= cfg.size) break;
    if (fits(track)) take(familiar, track);
  }

  const lineup = arrange([...familiar, ...fresh], { gap: cfg.artistGap, window: cfg.artistWindow, maxPerWindow: cfg.maxPerWindow });
  // Kein einziger Song (z. B. keine Lieblingssongs und kein Hörverlauf): abbrechen, statt die Playlist zu leeren.
  if (!lineup.length) throw new Error(t(lang, 'run.noSongs'));
  const freshCurrent = fresh.filter(c => c.viaCurrent).length;
  const counts = { songs: lineup.length, fresh: fresh.length, freshCurrent, familiar: familiar.length };
  const summary = t(lang, 'run.summary', { name: cfg.playlistName, ...counts });
  console.log(`\n${summary}\n`);
  if (windowViolations(lineup, cfg.artistWindow, cfg.maxPerWindow)) {
    warn(t(lang, 'run.windowRule', { max: cfg.maxPerWindow, window: cfg.artistWindow }));
  }
  lineup.forEach((track, i) => console.log(`${String(i + 1).padStart(3)}. ${track.artist} – ${track.name}  (${track.kind})`));

  if (dry) {
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    console.log(`\n${t(lang, 'run.dry')}`);
    return { ...counts, summary };
  }

  const me = await spotify.me();
  let playlistId = await spotify.findPlaylist(cfg.playlistName, me.id);
  if (!playlistId) {
    playlistId = await spotify.createPlaylist(cfg.playlistName, t(lang, 'run.newPlaylist'));
    console.log(`\n${t(lang, 'run.created', { name: cfg.playlistName })}`);
  }
  await spotify.replacePlaylist(playlistId, lineup.map(track => track.uri));
  const now = new Date();
  const date = now.toLocaleDateString(locale(lang));
  const time = now.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
  await spotify.setDescription(playlistId, t(lang, 'run.description', { date, time, fresh: fresh.length, familiar: familiar.length }))
    .catch(e => warn(t(lang, 'run.descriptionFailed', { message: e.message })));

  state.history = lastRuns([...state.history, lineup.map(track => trackKey(track.artist, track.name))]);
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
  console.log(`\n${t(lang, 'run.done', { url: playlistUrl })}`);
  return { ...counts, summary, playlistUrl };
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
