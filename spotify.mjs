import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { exec } from 'node:child_process';
import { resolveLang, t, tError } from './i18n.mjs';
import { durationOf, sameTrack, yearOf } from './lineup.mjs';

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
// Berechtigungen, um die die Anmeldung bittet. user-follow-read (gefolgte Künstler) und user-library-modify (♥ in der Liste
// eines Probelaufs) kamen später dazu: Ältere Anmeldungen haben sie nicht, dann muss man sich einmal neu anmelden (siehe
// FOLLOW_SCOPE bzw. LIBRARY_SCOPE). Ob ein Song schon gespeichert ist, fragt user-library-read ab – das hatte jede Anmeldung.
export const SCOPE_LIST = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-library-read',
  'user-follow-read',
  'user-library-modify',
];
const SCOPES = SCOPE_LIST.join(' ');
export const FOLLOW_SCOPE = 'user-follow-read';
export const LIBRARY_SCOPE = 'user-library-modify';
// Höchstens so viele URIs pro Anfrage an /me/library (Grenze von Spotify)
export const LIBRARY_BATCH = 40;

// Fehlt der Anmeldung eine Berechtigung? Spotify antwortet dann mit 401/403 bzw. "Insufficient client scope".
export const isScopeError = e => [401, 403].includes(e?.status) || /insufficient[\s_-]*(client[\s_-]*)?scope/i.test(String(e?.message ?? ''));

const sleep = ms => new Promise(r => setTimeout(r, ms));

// authorized_at = Zeitpunkt der Anmeldung. Spotify verlangt nach 180 Tagen eine neue,
// das Erneuern des Access-Tokens verlängert das nicht – deshalb beim Erneuern übernehmen.
// scope = erteilte Berechtigungen (mit Leerzeichen getrennt); fehlt sie in der Antwort, gilt die bisherige.
function storeTokens(file, data, previous = {}, authorizedAt = previous.authorized_at) {
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? previous.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    authorized_at: authorizedAt,
    scope: data.scope ?? previous.scope,
  };
  // Nur für den eigenen Benutzer lesbar (Mac/Linux; gilt beim Anlegen der Datei)
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return tokens;
}

function callbackPage(res, status, lang, title, text) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
  res.end(`<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>Tweakable DJ</title>
<body style="font:16px/1.5 system-ui,sans-serif;margin:48px auto;max-width:560px;padding:0 16px"><h1>${title}</h1><p>${text}</p>`);
}

export function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// Einmalige Anmeldung per PKCE (kein Client Secret nötig). Wartet höchstens timeoutMs auf die Zustimmung;
// signal bricht ab, onUrl bekommt die Adresse der Anmeldeseite (für die Oberfläche), lang = Sprache der Meldungen.
export async function login(clientId, tokenFile, { signal, timeoutMs = 5 * 60_000, onUrl, lang = resolveLang() } = {}) {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(12).toString('base64url');
  const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  })}`;
  const page = (res, status, key) => callbackPage(res, status, lang, t(lang, `login.${key}Title`), t(lang, `login.${key}Text`));

  const code = await new Promise((resolve, reject) => {
    let finished = false;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') {
        res.writeHead(404, { Connection: 'close' }).end();
        return;
      }
      // Fremde oder veraltete Aufrufe (anderer state) ignorieren und weiter auf die richtige Antwort warten.
      if (finished || url.searchParams.get('state') !== state) {
        page(res, 400, 'stale');
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (error || !code) {
        page(res, 200, 'failed');
        finish(error === 'access_denied' ? tError(lang, 'login.denied') : tError(lang, 'login.failed', { detail: error ?? t(lang, 'login.noCode') }));
        return;
      }
      page(res, 200, 'ok');
      finish(null, code);
    });
    // Aufräumen in jedem Fall: Zeitlimit, Abbruch, Fehler oder Erfolg – danach ist Port 8888 wieder frei.
    const finish = (err, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      server.close();
      if (err) reject(err);
      else resolve(value);
    };
    const onAbort = () => finish(tError(lang, 'login.aborted'));
    const minutes = Math.round(timeoutMs / 60_000);
    const timer = setTimeout(() => finish(tError(lang, 'login.timeout', { minutes })), timeoutMs);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);
    server.on('error', e => finish(e.code === 'EADDRINUSE' ? tError(lang, 'login.portBusy') : e));
    server.listen(8888, '127.0.0.1', () => {
      console.log(`${t(lang, 'login.browser')}\n`);
      console.log(authUrl + '\n');
      onUrl?.(authUrl);
      openBrowser(authUrl);
    });
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw tError(lang, 'login.tokenFailed', { detail: data.error_description ?? data.error });
  storeTokens(tokenFile, data, {}, Date.now());
}

// Fehler der API haben die Form "Spotify <METHODE> <pfad>: <status> <text>" und tragen status (z. B. 403);
// abgelaufene oder fehlende Anmeldung haben errorCode 'login_expired' bzw. 'not_logged_in'.
export function createSpotify(clientId, tokenFile, { lang = resolveLang() } = {}) {
  let tokens = fs.existsSync(tokenFile) ? JSON.parse(fs.readFileSync(tokenFile, 'utf8')) : null;
  const again = () => t(lang, 'spotify.loginAgain');

  async function accessToken() {
    if (!tokens) throw tError(lang, 'spotify.notLoggedIn', { again: again() }, { errorCode: 'not_logged_in' });
    if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw tError(lang, 'spotify.expired', { detail: data.error_description ?? data.error, again: again() }, { errorCode: 'login_expired' });
    }
    tokens = storeTokens(tokenFile, data, tokens);
    return tokens.access_token;
  }

  // Vorübergehende Störung bei Spotify (500, 502, 503, 504): Lesen, Ersetzen und Löschen lassen sich gefahrlos wiederholen
  // (nach 2, 5 und 10 Sekunden). POST nicht – ein zweites Anhängen bzw. Anlegen könnte doppelt wirken; createPlaylist prüft
  // stattdessen selbst nach (siehe dort).
  const TRANSIENT = new Set([500, 502, 503, 504]);
  // Nur für Tests kürzer (TWEAKABLE_DJ_FAST_RETRY=1).
  const RETRY_WAIT = process.env.TWEAKABLE_DJ_FAST_RETRY === '1' ? [1, 1, 1] : [2000, 5000, 10000];
  async function api(method, path, body) {
    const url = path.startsWith('http') ? path : API + path;
    let failures = 0;
    for (let attempt = 0; attempt < 5 + RETRY_WAIT.length; attempt++) {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          ...(body && { 'Content-Type': 'application/json' }),
        },
        body: body && JSON.stringify(body),
      });
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after') || 2);
        if (wait > 120) throw tError(lang, 'spotify.rateLimit', { minutes: Math.ceil(wait / 60) }, { rateLimit: true });
        await sleep(wait * 1000);
        continue;
      }
      if (res.status === 401 && attempt === 0) {
        tokens.expires_at = 0;
        continue;
      }
      const text = await res.text();
      if (TRANSIENT.has(res.status) && method !== 'POST' && failures < RETRY_WAIT.length) {
        await sleep(RETRY_WAIT[failures++]);
        continue;
      }
      if (!res.ok) throw Object.assign(new Error(`Spotify ${method} ${path}: ${res.status} ${text}`), { status: res.status });
      return text ? JSON.parse(text) : null;
    }
    throw tError(lang, 'spotify.tooManyAttempts', { method, path });
  }

  async function* pages(path) {
    let next = path;
    while (next) {
      const d = await api('GET', next);
      yield* d.items ?? [];
      next = d.next;
    }
  }

  // artist = Hauptinterpret; artists = alle Beteiligten (für die Sperrliste); explicit = expliziter Text laut Spotify;
  // durationMs = Spieldauer in Millisekunden (null = unbekannt); releaseYear = Erscheinungsjahr des Albums aus
  // album.release_date (je nach Genauigkeit Jahr, Monat oder Tag; null = unbekannt), für „Neuere / ältere Songs“.
  const toTrack = t => ({
    uri: t.uri, name: t.name, artist: t.artists?.[0]?.name, artists: (t.artists ?? []).map(a => a.name).filter(Boolean), explicit: t.explicit === true,
    durationMs: durationOf(t.duration_ms), releaseYear: yearOf(t.album?.release_date),
  });
  const isPlayable = t => t && t.type === 'track' && !t.is_local && t.uri?.startsWith('spotify:track:');

  // Song zu Künstler und Titel als { uri, name, artist, artists, explicit } wie bei den Lieblingssongs, null = nicht gefunden.
  // Ist der Treffer explizit, steht in clean die erste nicht explizite Version aus derselben Suche (oder null) – für
  // „Keine Songs mit expliziten Texten“, ohne eigene Anfrage.
  async function findTrack(artist, name) {
    const strip = s => String(s).replace(/"/g, '');
    const queries = [`track:"${strip(name)}" artist:"${strip(artist)}"`, `${strip(artist)} ${strip(name)}`];
    for (const q of queries) {
      const d = await api('GET', `/search?${new URLSearchParams({ q, type: 'track', limit: '10' })}`);
      const matches = (d?.tracks?.items ?? []).filter(t => t && sameTrack(t, artist, name));
      if (!matches.length) continue;
      const hit = toTrack(matches[0]);
      if (hit.explicit) {
        const clean = matches.find(t => t.explicit !== true);
        hit.clean = clean ? toTrack(clean) : null;
      }
      return hit;
    }
    return null;
  }

  return {
    me: () => api('GET', '/me'),

    async playlistTracks(id) {
      const out = [];
      // Seit Feb 2026 heißt das Feld pro Eintrag "item" (früher "track").
      for await (const entry of pages(`/playlists/${id}/items?limit=50`)) {
        const t = entry.item ?? entry.track;
        if (isPlayable(t)) out.push(toTrack(t));
      }
      return out;
    },

    async likedTracks(max = 1000) {
      const out = [];
      for await (const entry of pages('/me/tracks?limit=50')) {
        if (isPlayable(entry.track)) out.push(toTrack(entry.track));
        if (out.length >= max) break;
      }
      return out;
    },

    // Namen der Künstler, denen man auf Spotify folgt (Seiten zu 50, weiter über "next" mit dem Cursor after).
    // Braucht user-follow-read; ohne diese Berechtigung wirft es (isScopeError).
    async followedArtists() {
      const out = [];
      let next = '/me/following?type=artist&limit=50';
      // Höchstens 200 Seiten (10 000 Künstler), falls Spotify immer wieder dieselbe Seite liefert.
      for (let page = 0; next && page < 200; page++) {
        const d = await api('GET', next);
        for (const a of d?.artists?.items ?? []) if (a?.name) out.push(a.name);
        next = d?.artists?.next ?? null;
      }
      return out;
    },

    likedCount: async () => (await api('GET', '/me/tracks?limit=1'))?.total ?? null,

    // Lieblingssongs (♥) seit Feb 2026 über /me/library mit Spotify-URIs (früher /me/tracks mit IDs), je Anfrage höchstens
    // LIBRARY_BATCH. libraryContains: [true/false, …] in der Reihenfolge von uris (braucht user-library-read).
    async libraryContains(uris) {
      const out = [];
      for (let i = 0; i < uris.length; i += LIBRARY_BATCH) {
        const part = uris.slice(i, i + LIBRARY_BATCH);
        const d = await api('GET', `/me/library/contains?uris=${part.map(encodeURIComponent).join(',')}`);
        out.push(...part.map((_, k) => d?.[k] === true));
      }
      return out;
    },

    // Song zu den Lieblingssongs hinzufügen (saved true) bzw. daraus entfernen. Braucht user-library-modify; ohne diese
    // Berechtigung wirft es (isScopeError).
    setSaved: (uri, saved) => api(saved ? 'PUT' : 'DELETE', `/me/library?uris=${encodeURIComponent(uri)}`),

    // Eigene und gemeinsame Playlists – nur deren Inhalte gibt Spotify seit Feb 2026 heraus.
    async ownPlaylists(userId) {
      const out = [];
      for await (const p of pages('/me/playlists?limit=50')) {
        if (!p?.id || !(p.owner?.id === userId || p.collaborative)) continue;
        out.push({ id: p.id, name: p.name, tracks: p.items?.total ?? p.tracks?.total ?? null, collaborative: Boolean(p.collaborative) });
      }
      return out;
    },

    async findPlaylist(name, userId) {
      for await (const p of pages('/me/playlists?limit=50')) {
        if (p?.name === name && p.owner?.id === userId) return p.id;
      }
      return null;
    },

    // Bei einer vorübergehenden Störung (5xx) kann Spotify die Playlist trotzdem angelegt haben: erst nachsehen, dann höchstens
    // noch einmal anlegen – so entsteht sie nicht doppelt. userId: für die Suche nach dem Namen (ohne: ohne Nachsehen).
    async createPlaylist(name, description, userId = null) {
      for (let attempt = 0; ; attempt++) {
        try {
          return (await api('POST', '/me/playlists', { name, description, public: false })).id;
        } catch (e) {
          if (!TRANSIENT.has(e.status) || attempt >= 2) throw e;
          await sleep(RETRY_WAIT[attempt]);
          const found = userId ? await this.findPlaylist(name, userId) : null;
          if (found) return found;
        }
      }
    },

    async replacePlaylist(id, uris) {
      await api('PUT', `/playlists/${id}/items`, { uris: uris.slice(0, 100) });
      for (let i = 100; i < uris.length; i += 100) {
        await api('POST', `/playlists/${id}/items`, { uris: uris.slice(i, i + 100) });
      }
    },

    setDescription: (id, description) => api('PUT', `/playlists/${id}`, { description }),

    findTrack,

    // Nur die URI des Songs, null = nicht gefunden.
    searchTrack: async (artist, name) => (await findTrack(artist, name))?.uri ?? null,
  };
}
