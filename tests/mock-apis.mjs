// Simulierte Spotify-, Last.fm- und GitHub-APIs für tests/probelauf.test.mjs und tests/ui.test.mjs.
// Laden mit: node --import <file-URL dieser Datei> dj.mjs --dry
// Ersetzt globalThis.fetch; unbekannte Adressen und Schreibzugriffe auf Spotify werfen einen Fehler,
// echte Netzwerkzugriffe gibt es also nie.
//
// Umgebungsvariablen:
//   MOCK_LOG            Datei, in die jede Anfrage als JSON-Zeile geschrieben wird
//   MOCK_SPOTIFY_403=1  jede Spotify-API-Anfrage liefert 403
//   MOCK_NO_LIKED=1     keine Lieblingssongs auf Spotify
//   MOCK_NODE_VERSION   täuscht eine andere Node-Version vor
//   MOCK_GITHUB         JSON-Datei mit der Antwort von GitHub auf die Frage nach dem neuesten Release (update.mjs):
//                       { "status": 200, "body": { "tag_name": "v0.2.0", … } } oder { "offline": true } (= Netzfehler).
//                       Wird bei jeder Anfrage neu gelesen; ohne Datei ist GitHub ebenfalls nicht erreichbar.

import fs from 'node:fs';

const ACCESS_TOKEN = 'mock-access-neu';
const REFRESH_TOKEN = 'fake-refresh-token';
const CLIENT_ID = 'test-client-id';
const LASTFM_KEY = 'test-lastfm-key';

if (process.env.MOCK_NODE_VERSION) {
  Object.defineProperty(process, 'versions', { value: { ...process.versions, node: process.env.MOCK_NODE_VERSION } });
}

const log = entry => process.env.MOCK_LOG && fs.appendFileSync(process.env.MOCK_LOG, `${JSON.stringify(entry)}\n`);
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const DAY = 86400;
const nowUnix = () => Math.floor(Date.now() / 1000);

// --- Testdaten ---

// Lieblingssongs auf Spotify: [Künstler (mehrere mit " / "), Titel]
const LIKED = [
  ['Nordlicht', 'Polarnacht'],
  ['Nordlicht', 'Eisblau'],
  ['Bergfunk', 'Gipfelglück'],
  ['Stadtkind', 'Asphalt'],
  ['Macloud / Miksu', 'Nachtschicht'], // gesperrt (Macloud)
  ['Karin', 'Sommerregen'], // nicht gesperrt, obwohl "Rin" gesperrt ist
  ['Wellenreiter', 'Brandung'],
  ['Unbekannt', 'Gibt es nicht'], // Last.fm kennt den Titel nicht (Fehler 6)
  ['Stadtkind', 'Beton'],
  ['Rin', 'Doppelpass'], // gesperrt
  ['Fernweh', 'Horizont'],
];
// Künstler, die Last.fm als ähnlich vorschlägt
const POOL = ['Aurora Nord', 'Blaue Stunde', 'Chromwerk', 'Dünenfeuer', 'Elbsand', 'Flussglas',
  'Gleisdreieck', 'Hafenlicht', 'Inselkind', 'Juniregen', 'Kaltfront', 'Leuchtturm'];

const spotifyTrack = (artist, name) => ({
  type: 'track',
  uri: `spotify:track:mock${hash(`${artist}|${name}`).toString(36)}`,
  name,
  artists: artist.split(' / ').map(n => ({ name: n })),
  is_local: false,
});
const likedItems = () => [
  ...LIKED.map(([a, n]) => spotifyTrack(a, n)),
  { type: 'track', uri: 'spotify:local:Lokal:Datei', name: 'Lokale Datei', artists: [{ name: 'Lokal' }], is_local: true },
];

const recentTrack = (artist, name, daysAgo) => ({ artist: { '#text': artist }, name, date: { uts: String(nowUnix() - Math.round(daysAgo * DAY)) } });
const RECENT_PAGES = [
  [
    { artist: { '#text': 'Fernweh' }, name: 'Horizont', '@attr': { nowplaying: 'true' } },
    recentTrack('Nordlicht', 'Polarnacht', 1),
    recentTrack('Wellenreiter', 'Neue Welle', 2),
    recentTrack('Miksu / Macloud', 'Nachtschicht', 3), // gesperrt
  ],
  [
    recentTrack('Bergfunk', 'Talfahrt', 10), // kürzlich gehört, aber nicht mehr aktuell
    recentTrack('Stadtkind', 'Beton', 12),
  ],
];
const USERS = { testhoerer: 1234, stillerhoerer: 0 };

// --- Spotify ---

let searches = 0;
const searchHits = new Map(); // "Künstler Titel" aus der ersten Suche → für die zweite Suche

function spotifyApi(url, init, headers) {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') throw new Error(`Mock: Schreibzugriff auf Spotify im Probelauf (${method} ${url.pathname})`);
  if (process.env.MOCK_SPOTIFY_403 === '1') {
    return json({ error: { status: 403, message: 'Check settings on developer.spotify.com/dashboard, the user may not be registered.' } }, 403);
  }
  if (headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
    return json({ error: { status: 401, message: 'The access token expired' } }, 401);
  }
  const p = url.pathname;
  const q = url.searchParams;

  if (p === '/v1/me') return json({ id: 'testuser', display_name: 'Test' });
  if (p === '/v1/me/playlists') return json({ items: [], next: null });

  if (p === '/v1/me/tracks') {
    // zwei Seiten, "next" als volle URL wie bei Spotify
    const items = (process.env.MOCK_NO_LIKED === '1' ? [] : likedItems()).map(track => ({ added_at: '2026-01-01T00:00:00Z', track }));
    const offset = Number(q.get('offset') ?? 0);
    const page = offset === 0 ? items.slice(0, 6) : items.slice(6);
    const next = offset === 0 ? 'https://api.spotify.com/v1/me/tracks?offset=6&limit=50' : null;
    return json({ items: page, next, total: items.length });
  }

  const playlist = p.match(/^\/v1\/playlists\/([^/]+)\/items$/);
  if (playlist) {
    if (playlist[1] !== 'TestListe42') return json({ error: { status: 404, message: 'Not found.' } }, 404);
    // Seit Feb. 2026 heißt das Feld "item"; dazu ein gelöschter Eintrag und eine Podcast-Folge
    const items = [...likedItems(), null, { type: 'episode', uri: 'spotify:episode:x', name: 'Folge', artists: [] }];
    return json({ items: items.map(item => ({ item })), next: null });
  }

  if (p === '/v1/search') {
    // Beim ersten Mal Rate-Limit, dann normal weiter
    if (searches++ === 0) return new Response('', { status: 429, headers: { 'retry-after': '0' } });
    const query = q.get('q');
    const exact = query.match(/^track:"(.*)" artist:"(.*)"$/);
    if (!exact) return json({ tracks: { items: searchHits.has(query) ? [searchHits.get(query)] : [] } });
    const [, name, artist] = exact;
    if (name.startsWith('Nicht auf Spotify')) return json({ tracks: { items: [] } });
    const hit = spotifyTrack(artist, name.endsWith('Echo 3') ? `${name} - Remastered 2011` : name);
    // "Echo 5": zuerst nur eine Coverversion, der richtige Treffer kommt erst bei der zweiten Suche
    if (name.endsWith('Echo 5')) {
      searchHits.set(`${artist} ${name}`, hit);
      return json({ tracks: { items: [spotifyTrack('Coverband', name)] } });
    }
    return json({ tracks: { items: [spotifyTrack('Coverband', name), hit] } });
  }

  throw new Error(`Mock: unbekannte Spotify-Adresse ${url.href}`);
}

function spotifyToken(init) {
  const body = new URLSearchParams(String(init?.body ?? ''));
  if (body.get('grant_type') === 'refresh_token' && body.get('refresh_token') === REFRESH_TOKEN && body.get('client_id') === CLIENT_ID) {
    return json({ access_token: ACCESS_TOKEN, token_type: 'Bearer', expires_in: 3600 });
  }
  return json({ error: 'invalid_grant', error_description: 'Invalid refresh token' }, 400);
}

// --- Last.fm ---

function similarTracks(artist, track) {
  if (track === 'Gibt es nicht') return json({ error: 6, message: 'Track not found', links: [] });
  const h = hash(`${artist}|${track}`);
  const tracks = Array.from({ length: 8 }, (_, j) => ({
    name: `${track} Echo ${j + 1}`,
    match: Number((1 - j * 0.1).toFixed(2)),
    artist: { name: POOL[(h + j) % POOL.length] },
  }));
  tracks.push(
    { name: 'Sperrgut', match: 0.9, artist: { name: 'Miksu / Macloud' } }, // gesperrt
    { name: 'Rinnsal', match: 0.85, artist: { name: 'Rin' } }, // gesperrt
    { name: 'Talfahrt', match: 0.8, artist: { name: 'Bergfunk' } }, // kürzlich gehört
    { name: 'Polarnacht', match: 0.95, artist: { name: 'Nordlicht' } }, // schon Lieblingssong
    { name: `Nicht auf Spotify ${h % 1000}`, match: 0.7, artist: { name: POOL[h % POOL.length] } },
  );
  return json({ similartracks: { track: tracks, '@attr': { artist } } });
}

function lastfmApi(url) {
  const q = url.searchParams;
  if (q.get('api_key') !== LASTFM_KEY) {
    return json({ error: 10, message: 'Invalid API key - You must be granted a valid key by last.fm' }, 403);
  }
  if (q.get('format') !== 'json') throw new Error('Mock: Last.fm-Abfrage ohne format=json');
  const user = q.get('user');
  switch (q.get('method')) {
    case 'user.getInfo':
      if (!(user in USERS)) return json({ error: 6, message: 'User not found' });
      return json({ user: { name: user, playcount: String(USERS[user]), registered: { unixtime: '1600000000' } } });
    case 'user.getRecentTracks': {
      const pages = user === 'testhoerer' ? RECENT_PAGES : [];
      const page = Number(q.get('page') ?? 1);
      return json({ recenttracks: { track: pages[page - 1] ?? [], '@attr': { user, page: String(page), totalPages: String(pages.length) } } });
    }
    case 'user.getTopTracks': {
      const top = user === 'testhoerer' ? [['Stadtkind', 'Asphalt'], ['Sternschnuppe', 'Komet'], ['Rin', 'Laut']] : [];
      return json({ toptracks: { track: top.map(([a, n]) => ({ name: n, artist: { name: a } })) } });
    }
    case 'track.getSimilar':
      return similarTracks(q.get('artist'), q.get('track'));
    case 'artist.getSimilar': {
      const h = hash(q.get('artist'));
      const artists = [{ name: 'Macloud', match: '1' }, ...POOL.map((_, i) => POOL[(h + i) % POOL.length])
        .slice(0, 6).map((name, i) => ({ name, match: String(0.9 - i * 0.1) }))];
      return json({ similarartists: { artist: artists } });
    }
    case 'artist.getTopTracks': {
      const artist = q.get('artist');
      return json({ toptracks: { track: [1, 2, 3, 4, 5].map(k => ({ name: `${artist} Hit ${k}`, artist: { name: artist } })) } });
    }
    default:
      throw new Error(`Mock: unbekannte Last.fm-Methode ${q.get('method')}`);
  }
}

// --- GitHub (neuestes Release) ---

function githubRelease(url) {
  let reply = null;
  try {
    reply = JSON.parse(fs.readFileSync(process.env.MOCK_GITHUB, 'utf8'));
  } catch {
    // keine Datei = nicht erreichbar
  }
  if (!reply || reply.offline) {
    log({ host: url.host, path: url.pathname, offline: true });
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('Mock: GitHub nicht erreichbar'), { code: 'ENOTFOUND' }) });
  }
  return json(reply.body ?? {}, reply.status ?? 200);
}

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const headers = new Headers(init?.headers);
  let res;
  if (url.origin === 'https://accounts.spotify.com' && url.pathname === '/api/token') res = spotifyToken(init);
  else if (url.origin === 'https://api.spotify.com') res = spotifyApi(url, init, headers);
  else if (url.origin === 'https://ws.audioscrobbler.com' && url.pathname === '/2.0/') res = lastfmApi(url);
  else if (url.origin === 'https://api.github.com' && /^\/repos\/[^/]+\/[^/]+\/releases\/latest$/.test(url.pathname)) res = githubRelease(url);
  else {
    log({ unknown: url.href });
    throw new Error(`Mock: unerwartete Adresse ${url.href}`);
  }
  log({
    host: url.host,
    path: url.pathname + url.search,
    method: url.searchParams.get('method') ?? undefined,
    status: res.status,
  });
  return res;
};
