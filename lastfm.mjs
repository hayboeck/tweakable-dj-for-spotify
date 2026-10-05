import fs from 'node:fs';
import { tError } from './i18n.mjs';

const API = 'https://ws.audioscrobbler.com/2.0/';
const CACHE_MAX_AGE = 7 * 86400_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

// Fehlende oder kaputte Datei = leerer Cache.
function readCache(file) {
  if (!file) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Map(Object.entries(data).filter(([, e]) => Number.isFinite(e?.at)));
  } catch {
    return new Map();
  }
}

// cacheFile: optionaler Datei-Cache für Abfragen, die nicht vom Benutzer abhängen
// (Last.fm verlangt "suitable caching"). Geschrieben wird er erst mit saveCache(). lang = Sprache der Meldungen.
export function createLastfm(apiKey, cacheFile, { lang } = {}) {
  const cache = readCache(cacheFile);
  const stats = { hits: 0, total: 0 };
  let changed = false;

  async function call(method, params) {
    const url = `${API}?${new URLSearchParams({ method, api_key: apiKey, format: 'json', ...params })}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      // 29 = Rate-Limit, 8/16 = temporärer Serverfehler
      if ([29, 8, 16].includes(data.error) && attempt < 3) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      // 6 = Titel/Künstler/Nutzer unbekannt
      if (data.error === 6) return null;
      // 10 = Key ungültig, 26 = Key von Last.fm gesperrt. fatal: weitere Abfragen sind sinnlos,
      // dj.mjs bricht dann ab statt nur zu warnen.
      if (data.error === 10 || data.error === 26) {
        throw tError(lang, data.error === 26 ? 'lastfm.suspendedKey' : 'lastfm.badKey', {}, { fatal: true, errorCode: 'lastfm_key' });
      }
      if (data.error) throw new Error(`Last.fm ${method}: ${data.message}`);
      if (!res.ok) throw new Error(`Last.fm ${method}: HTTP ${res.status}`);
      return data;
    }
  }

  // Wie call(), aber mit Cache; gespeichert wird das bereits umgewandelte Ergebnis (auch "nicht gefunden").
  async function cached(method, params, convert) {
    const key = `${method} ${new URLSearchParams(params)}`;
    const hit = cache.get(key);
    stats.total++;
    if (hit && Date.now() - hit.at < CACHE_MAX_AGE) {
      stats.hits++;
      return hit.value;
    }
    const value = convert(await call(method, params));
    cache.set(key, { at: Date.now(), value });
    changed = true;
    return value;
  }

  return {
    similarTracks(artist, track, limit = 30) {
      return cached('track.getSimilar', { artist, track, limit, autocorrect: 1 }, d =>
        list(d?.similartracks?.track).map(t => ({ artist: t.artist?.name, name: t.name, match: Number(t.match) || 0 })));
    },

    similarArtists(artist, limit = 40) {
      return cached('artist.getSimilar', { artist, limit, autocorrect: 1 }, d =>
        list(d?.similarartists?.artist).map(a => ({ name: a.name, match: Number(a.match) || 0 })));
    },

    artistTopTracks(artist, limit = 10) {
      return cached('artist.getTopTracks', { artist, limit, autocorrect: 1 }, d =>
        list(d?.toptracks?.track).map(t => ({ artist: t.artist?.name ?? artist, name: t.name })));
    },

    // Benutzerbezogene Abfragen gehen immer an Last.fm (kein Cache).
    // userInfo: null = Benutzer gibt es nicht
    async userInfo(user) {
      const d = await call('user.getInfo', { user });
      return d?.user ? { name: d.user.name, playcount: Number(d.user.playcount) || 0 } : null;
    },

    async userTopTracks(user, period = '3month', limit = 50) {
      const d = await call('user.getTopTracks', { user, period, limit });
      return list(d?.toptracks?.track).map(t => ({ artist: t.artist?.name, name: t.name }));
    },

    async recentTracks(user, fromUnix, maxPages = 5) {
      const out = [];
      for (let page = 1; page <= maxPages; page++) {
        const d = await call('user.getRecentTracks', { user, from: fromUnix, limit: 200, page });
        const tracks = list(d?.recenttracks?.track);
        out.push(...tracks.map(t => ({
          artist: t.artist?.['#text'] ?? t.artist?.name,
          name: t.name,
          // "Läuft gerade" hat kein Datum
          playedAt: Number(t.date?.uts) || Math.floor(Date.now() / 1000),
        })));
        const totalPages = Number(d?.recenttracks?.['@attr']?.totalPages) || 1;
        if (page >= totalPages) break;
      }
      return out;
    },

    // Wie viele der Cache-fähigen Abfragen dieses Laufs aus dem Cache kamen.
    cacheStats: () => ({ ...stats }),

    // Einmal pro Lauf, nach der letzten Last.fm-Abfrage: abgelaufene Einträge entfernen, Datei nur bei Änderungen schreiben.
    saveCache() {
      if (!cacheFile) return;
      const now = Date.now();
      for (const [key, e] of cache) {
        if (now - e.at >= CACHE_MAX_AGE) {
          cache.delete(key);
          changed = true;
        }
      }
      if (changed) fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(cache)));
      changed = false;
    },
  };
}
