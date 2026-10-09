// Simulierte Spotify-, Last.fm- und GitHub-APIs für die Tests, die dj.mjs bzw. ui.mjs starten (dj, trial, playlist,
// ui, install-update). Laden mit: node --import <file-URL dieser Datei> dj.mjs --dry
// Ersetzt globalThis.fetch; unbekannte Adressen werfen einen Fehler, echte Netzwerkzugriffe gibt es also nie. Schreibzugriffe
// auf Spotify werfen ebenfalls, außer mit MOCK_SPOTIFY_STORE.
//
// Umgebungsvariablen:
//   MOCK_LOG            Datei, in die jede Anfrage als JSON-Zeile geschrieben wird (verb = HTTP-Methode, method = Last.fm-Methode)
//   MOCK_SPOTIFY_STORE  JSON-Datei mit den Playlists des Testbenutzers { playlists: [{ id, name, description, uris }], tracks }:
//                       Damit darf geschrieben werden (Playlist anlegen, Inhalt ersetzen bzw. ergänzen, Beschreibung), und
//                       die Playlists stehen in /me/playlists. tracks merkt sich Titel und Künstler jedes Songs, den der Mock
//                       herausgegeben hat, damit eine Playlist ihn später vollständig zurückgibt. Ohne Datei: kein Schreiben.
//   MOCK_SPOTIFY_403=1  jede Spotify-API-Anfrage liefert 403
//   MOCK_NO_LIKED=1     keine Lieblingssongs auf Spotify
//   MOCK_NO_FOLLOW_SCOPE=1  Anmeldung ohne user-follow-read (ältere Anmeldung): /me/following liefert 403
//                       "Insufficient client scope", das erneuerte Token nennt die Berechtigung nicht
//   MOCK_NO_LIBRARY_SCOPE=1  ebenso ohne user-library-modify: PUT/DELETE /me/library liefern 403. Die Lieblingssongs (♥) stehen
//                       mit MOCK_SPOTIFY_STORE in store.library (anfangs die Lieblingssongs von /me/tracks)
//   MOCK_NODE_VERSION   täuscht eine andere Node-Version vor
//   MOCK_SPOTIFY_OFFLINE=1  Spotify (API und Anmeldung) nicht erreichbar: fetch scheitert wie ohne Internet (ENOTFOUND)
//   MOCK_SPOTIFY_HANG=1     Spotify antwortet nie; die Anfrage endet erst mit ihrem Zeitlimit (signal)
//   MOCK_LASTFM_OFFLINE=1   Last.fm nicht erreichbar (ENOTFOUND)
//   MOCK_SEARCH_DELAY_MS  jede Suche auf Spotify (/v1/search) antwortet erst nach so vielen Millisekunden (Lauf dauert länger)
//   MOCK_GITHUB         JSON-Datei mit der Antwort von GitHub auf die Frage nach dem neuesten Release (update.mjs):
//                       { "status": 200, "body": { "tag_name": "v0.2.0", "assets": […], … } } oder { "offline": true }
//                       (= Netzfehler). Dazu für „Jetzt aktualisieren“ (install-update.mjs) die Dateien des Releases:
//                       "downloads": { "manifest.json": "<Pfad>", "tweakable-dj-v0.2.0.zip": "<Pfad>" }. Wie bei GitHub
//                       leitet https://github.com/<owner>/<repo>/releases/download/<tag>/<name> (302) zum Speicher
//                       release-assets.githubusercontent.com weiter; "redirect": "<URL>" ersetzt dieses Ziel (z. B. ein
//                       fremder Host, den das Update ablehnen muss). tests/mock-release.mjs baut solche Releases.
//                       "list": […] ist die Liste aller Releases (/repos/<owner>/<repo>/releases, z. B. mit Pre-releases);
//                       das Programm fragt sie nie ab – die Tests prüfen das anhand von MOCK_LOG.
//                       Wird bei jeder Anfrage neu gelesen; ohne Datei ist GitHub ebenfalls nicht erreichbar.
//   MOCK_NOTIFY=fail    Systembenachrichtigungen (notify.mjs) scheitern (Exit-Code 1). Echte Benachrichtigungen gibt es nie:
//                       execFile für powershell.exe, osascript und notify-send wird nur als { notify: { file, args, toast } }
//                       in MOCK_LOG geschrieben (toast = XML aus der Umgebungsvariable TWEAKABLE_DJ_TOAST unter Windows).
//                       PowerShell ohne TWEAKABLE_DJ_TOAST (Verknüpfung auf dem Desktop, shortcut.mjs) läuft wirklich,
//                       aber nur mit einem Test-Desktop (TWEAKABLE_DJ_DESKTOP); ohne ihn scheitert es (Testschutz).

import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const ACCESS_TOKEN = 'mock-access-neu';
const REFRESH_TOKEN = 'fake-refresh-token';
const CLIENT_ID = 'test-client-id';
const LASTFM_KEY = 'test-lastfm-key';

if (process.env.MOCK_NODE_VERSION) {
  Object.defineProperty(process, 'versions', { value: { ...process.versions, node: process.env.MOCK_NODE_VERSION } });
}

const log = entry => process.env.MOCK_LOG && fs.appendFileSync(process.env.MOCK_LOG, `${JSON.stringify(entry)}\n`);

// Systembenachrichtigungen abfangen (siehe oben); alle anderen Programme starten wie gewohnt.
const NOTIFIERS = /^(powershell\.exe|osascript|notify-send)$/i;
const realExecFile = childProcess.execFile;
childProcess.execFile = function execFile(file, ...rest) {
  const name = String(file).split(/[\\/]/).pop();
  const options = rest.find(r => r && typeof r === 'object' && !Array.isArray(r)) ?? {};
  // PowerShell nur für Benachrichtigungen (mit TWEAKABLE_DJ_TOAST) abfangen; die Verknüpfung auf dem Desktop (shortcut.mjs)
  // legt es wirklich an – in den Tests immer in einem Testordner (TWEAKABLE_DJ_DESKTOP).
  const toast = !/^powershell\.exe$/i.test(name) || options.env?.TWEAKABLE_DJ_TOAST !== undefined;
  const callback = rest.find(r => typeof r === 'function');
  if (NOTIFIERS.test(name) && !toast && !options.env?.TWEAKABLE_DJ_SC_DESKTOP) {
    // Schutz: PowerShell ohne Test-Desktop würde den echten Desktop des Benutzers nehmen – in Tests nie.
    setImmediate(() => callback?.(Object.assign(new Error('Testschutz'), { code: 1 }), '', 'Testschutz: PowerShell nur mit Test-Desktop (TWEAKABLE_DJ_DESKTOP)'));
    return undefined;
  }
  if (!NOTIFIERS.test(name) || !toast) return realExecFile.call(this, file, ...rest);
  const args = Array.isArray(rest[0]) ? rest[0] : [];
  log({ notify: { file: name, args, toast: options.env?.TWEAKABLE_DJ_TOAST ?? null } });
  setImmediate(() => {
    if (process.env.MOCK_NOTIFY === 'fail') callback?.(Object.assign(new Error('simuliert'), { code: 1 }), '', 'Simulierter Fehler beim Senden');
    else callback?.(null, '', '');
  });
  return undefined;
};
syncBuiltinESMExports();
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
  ['Wellenreiter', 'Brandung'], // explizit
  ['Unbekannt', 'Gibt es nicht'], // Last.fm kennt den Titel nicht (Fehler 6)
  ['Stadtkind', 'Beton'],
  ['Rin', 'Doppelpass'], // gesperrt
  ['Fernweh', 'Horizont'],
];
// Künstler, die Last.fm als ähnlich vorschlägt
const POOL = ['Aurora Nord', 'Blaue Stunde', 'Chromwerk', 'Dünenfeuer', 'Elbsand', 'Flussglas',
  'Gleisdreieck', 'Hafenlicht', 'Inselkind', 'Juniregen', 'Kaltfront', 'Leuchtturm'];

// Explizite Songs: dieser Lieblingssong und bei der Suche alle Titel auf "Echo 4" bzw. "Echo 6"; zu "Echo 6" findet die
// Suche zusätzlich eine nicht explizite Version (variant 'clean', eigene URI).
const EXPLICIT_LIKED = new Set(['Wellenreiter|Brandung']);

// IDs mit 22 Zeichen wie bei Spotify (dann erkennt sie auch der Import aus einer Textdatei). URI wie in mockUri() in
// tests/dj.test.mjs.
const spotifyTrack = (artist, name, { explicit = EXPLICIT_LIKED.has(`${artist}|${name}`), variant = '' } = {}) => ({
  type: 'track',
  uri: `spotify:track:${`mock${hash(`${artist}|${name}${variant ? `|${variant}` : ''}`).toString(36)}`.padEnd(22, '0')}`,
  name,
  artists: artist.split(' / ').map(n => ({ name: n })),
  explicit,
  // Spieldauer 2:30 bis 4:29, fest je Song
  duration_ms: 150_000 + (hash(`${artist}|${name}|${variant}`) % 120) * 1000,
  // Erscheinungsjahr 1975 bis 2026, fest je Song (für „Neuere / ältere Songs“); Genauigkeit wie bei Spotify mal Tag, mal nur Jahr
  album: { release_date: releaseDate(hash(`${artist}|${name}|jahr`)) },
  is_local: false,
});
function releaseDate(h) {
  const year = 1975 + (h % 52);
  return h % 5 === 0 ? String(year) : `${year}-${String(1 + (h % 12)).padStart(2, '0')}-${String(1 + (h % 28)).padStart(2, '0')}`;
}

// --- Playlists des Testbenutzers (MOCK_SPOTIFY_STORE) ---

const STORE = process.env.MOCK_SPOTIFY_STORE;
const readStore = () => {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    return { playlists: [], tracks: {} };
  }
};
const writeStore = store => fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
function remember(tracks) {
  if (!STORE) return;
  const store = readStore();
  store.tracks ??= {};
  for (const t of tracks) if (t?.uri) store.tracks[t.uri] = { name: t.name, artists: t.artists.map(a => a.name) };
  writeStore(store);
}
const fromStore = (store, uri) => {
  const t = store.tracks?.[uri];
  return { type: 'track', uri, name: t?.name ?? 'Unbekannt', artists: (t?.artists ?? []).map(name => ({ name })), is_local: false };
};

function storeWrite(url, method, body) {
  const store = readStore();
  const p = url.pathname;
  if (method === 'POST' && p === '/v1/me/playlists') {
    const playlist = { id: `mockliste${store.playlists.length + 1}`, name: body.name, description: body.description ?? '', public: body.public, uris: [] };
    store.playlists.push(playlist);
    writeStore(store);
    return json({ id: playlist.id, name: playlist.name }, 201);
  }
  const items = p.match(/^\/v1\/playlists\/([^/]+)\/items$/);
  const details = p.match(/^\/v1\/playlists\/([^/]+)$/);
  const playlist = store.playlists.find(x => x.id === (items ?? details)?.[1]);
  if (!playlist) return json({ error: { status: 404, message: 'Not found.' } }, 404);
  if (items && body.uris?.length > 100) return json({ error: { status: 400, message: 'Too many ids requested' } }, 400);
  if (items && method === 'PUT') playlist.uris = [...body.uris];
  else if (items && method === 'POST') playlist.uris.push(...body.uris);
  else if (details && method === 'PUT') playlist.description = body.description;
  else throw new Error(`Mock: unbekannter Schreibzugriff ${method} ${p}`);
  writeStore(store);
  return json({ snapshot_id: `snap${Date.now()}` }, items ? 201 : 200);
}
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
// Künstler, denen der Testbenutzer auf Spotify folgt (zwei Seiten): ein Favorit, zwei Künstler, die Last.fm vorschlägt,
// und "THE STADTKIND" (= Stadtkind über norm()).
const FOLLOWED = ['Nordlicht', 'Aurora Nord', 'Chromwerk', 'THE STADTKIND'];
const SCOPES = 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read';

// --- Spotify ---

let searches = 0;
const searchHits = new Map(); // "Künstler Titel" aus der ersten Suche → für die zweite Suche

function spotifyApi(url, init, headers) {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && !STORE) throw new Error(`Mock: Schreibzugriff auf Spotify im Probelauf (${method} ${url.pathname})`);
  if (process.env.MOCK_SPOTIFY_403 === '1') {
    return json({ error: { status: 403, message: 'Check settings on developer.spotify.com/dashboard, the user may not be registered.' } }, 403);
  }
  if (headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
    return json({ error: { status: 401, message: 'The access token expired' } }, 401);
  }
  const p = url.pathname;
  const q = url.searchParams;
  // Lieblingssongs seit Feb 2026: /me/library mit uris (Spotify-URIs, durch Komma getrennt, höchstens 40)
  if (p === '/v1/me/library' || p === '/v1/me/library/contains') {
    const uris = (q.get('uris') ?? '').split(',').filter(Boolean);
    if (!uris.length || uris.length > 40) return json({ error: { status: 400, message: 'Invalid uris' } }, 400);
    const store = STORE ? readStore() : { tracks: {} };
    const library = new Set(store.library ?? likedItems().filter(t => !t.is_local).map(t => t.uri));
    if (p.endsWith('/contains') && method === 'GET') return json(uris.map(u => library.has(u)));
    if (process.env.MOCK_NO_LIBRARY_SCOPE === '1') return json({ error: { status: 403, message: 'Insufficient client scope' } }, 403);
    if (method === 'PUT') uris.forEach(u => library.add(u));
    else if (method === 'DELETE') uris.forEach(u => library.delete(u));
    else throw new Error(`Mock: ${method} ${p}`);
    writeStore({ ...store, library: [...library] });
    return new Response('', { status: 200 });
  }
  if (method !== 'GET') return storeWrite(url, method, JSON.parse(String(init?.body ?? '{}')));

  if (p === '/v1/me') return json({ id: 'testuser', display_name: 'Test' });
  if (p === '/v1/me/playlists') {
    const lists = STORE ? readStore().playlists : [];
    return json({ items: lists.map(x => ({ id: x.id, name: x.name, owner: { id: 'testuser' }, collaborative: false, items: { total: x.uris.length } })), next: null });
  }
  // Eine Playlist direkt (writePlaylist mit knownId prüft, ob sie noch dir gehört und so heißt)
  const single = p.match(/^\/v1\/playlists\/([^/]+)$/);
  if (single) {
    const found = STORE && readStore().playlists.find(x => x.id === single[1]);
    if (!found) return json({ error: { status: 404, message: 'Not found.' } }, 404);
    return json({ id: found.id, name: found.name, owner: { id: 'testuser' }, collaborative: false, items: { total: found.uris.length } });
  }

  if (p === '/v1/me/following') {
    if (process.env.MOCK_NO_FOLLOW_SCOPE === '1') return json({ error: { status: 403, message: 'Insufficient client scope' } }, 403);
    if (q.get('type') !== 'artist') return json({ error: { status: 400, message: 'type must be artist' } }, 400);
    // Cursor-Paging wie bei Spotify: zwei Seiten, "next" mit after = ID des letzten Künstlers
    const page = q.get('after') ? FOLLOWED.slice(2) : FOLLOWED.slice(0, 2);
    const items = page.map(name => ({ type: 'artist', id: `id${hash(name).toString(36)}`, name }));
    const next = q.get('after') ? null : `https://api.spotify.com/v1/me/following?type=artist&limit=50&after=${items.at(-1).id}`;
    return json({ artists: { items, next, cursors: { after: next ? items.at(-1).id : null }, limit: 50, total: FOLLOWED.length } });
  }

  if (p === '/v1/me/tracks') {
    // zwei Seiten, "next" als volle URL wie bei Spotify
    const items = (process.env.MOCK_NO_LIKED === '1' ? [] : likedItems()).map(track => ({ added_at: '2026-01-01T00:00:00Z', track }));
    remember(items.map(i => i.track).filter(t => !t.is_local));
    const offset = Number(q.get('offset') ?? 0);
    const page = offset === 0 ? items.slice(0, 6) : items.slice(6);
    const next = offset === 0 ? 'https://api.spotify.com/v1/me/tracks?offset=6&limit=50' : null;
    return json({ items: page, next, total: items.length });
  }

  const playlist = p.match(/^\/v1\/playlists\/([^/]+)\/items$/);
  const stored = STORE && playlist && readStore().playlists.find(x => x.id === playlist[1]);
  if (stored) {
    // Seiten zu 50 wie bei Spotify, "next" als volle URL
    const store = readStore();
    const offset = Number(q.get('offset') ?? 0);
    const page = stored.uris.slice(offset, offset + 50).map(uri => ({ item: fromStore(store, uri) }));
    const next = offset + 50 < stored.uris.length ? `https://api.spotify.com/v1/playlists/${stored.id}/items?offset=${offset + 50}&limit=50` : null;
    return json({ items: page, next, total: stored.uris.length });
  }
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
    // Künstler mit Gast ("Hauptkünstler, Gast") findet die genaue Suche nicht, nur die Suche nach dem Hauptkünstler
    if (artist.includes(', ')) return json({ tracks: { items: [] } });
    const hit = spotifyTrack(artist, name.endsWith('Echo 3') ? `${name} - Remastered 2011` : name, { explicit: /Echo [46]$/.test(name) });
    remember([hit]);
    if (name.endsWith('Echo 6')) {
      const clean = spotifyTrack(artist, name, { explicit: false, variant: 'clean' });
      remember([clean]);
      return json({ tracks: { items: [spotifyTrack('Coverband', name), hit, clean] } });
    }
    // "Echo 5": zuerst nur eine Coverversion, der richtige Treffer kommt erst bei der zweiten Suche
    if (name.endsWith('Echo 5')) {
      searchHits.set(`${artist} ${name}`, hit);
      return json({ tracks: { items: [spotifyTrack('Coverband', name)] } });
    }
    // "Langsam …": Spotify antwortet erst nach 700 ms (damit ein Import eine Weile läuft)
    if (name.startsWith('Langsam')) return new Promise(resolve => setTimeout(() => resolve(json({ tracks: { items: [hit] } })), 700));
    // "Duett": der Song hat bei Spotify einen Gastkünstler
    if (name.startsWith('Duett')) {
      const duet = { ...hit, artists: [...hit.artists, { name: 'Gaststar' }] };
      remember([duet]);
      return json({ tracks: { items: [duet] } });
    }
    return json({ tracks: { items: [spotifyTrack('Coverband', name), hit] } });
  }

  throw new Error(`Mock: unbekannte Spotify-Adresse ${url.href}`);
}

function spotifyToken(init) {
  const body = new URLSearchParams(String(init?.body ?? ''));
  if (body.get('grant_type') === 'refresh_token' && body.get('refresh_token') === REFRESH_TOKEN && body.get('client_id') === CLIENT_ID) {
    const scope = [SCOPES, process.env.MOCK_NO_FOLLOW_SCOPE === '1' ? '' : 'user-follow-read',
      process.env.MOCK_NO_LIBRARY_SCOPE === '1' ? '' : 'user-library-modify'].filter(Boolean).join(' ');
    return json({ access_token: ACCESS_TOKEN, token_type: 'Bearer', expires_in: 3600, scope });
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
    { name: 'Leuchtfeuer', match: 0.5, artist: { name: 'Leuchtturm' } }, // für die Sperrliste der Songs (über die URI)
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

// --- GitHub (neuestes Release und dessen Dateien) ---

function githubReply(url) {
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
  return reply;
}

function githubRelease(url) {
  const reply = githubReply(url);
  return json(reply.body ?? {}, reply.status ?? 200);
}

const ASSET_STORE = 'https://release-assets.githubusercontent.com/github-production-release-asset/mock';
const assetName = url => decodeURIComponent(url.pathname.split('/').pop());

// Download-Link einer Release-Datei: Weiterleitung zum Speicher (wie bei GitHub), unbekannte Datei = 404.
function githubDownload(url) {
  const reply = githubReply(url);
  const name = assetName(url);
  if (!reply.downloads?.[name]) return new Response('Not Found', { status: 404 });
  return new Response(null, { status: 302, headers: { location: `${reply.redirect ?? ASSET_STORE}/${encodeURIComponent(name)}?sig=mock` } });
}

function githubAsset(url) {
  const file = githubReply(url).downloads?.[assetName(url)];
  if (!file) return new Response('Not Found', { status: 404 });
  return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
}

const offline = () => new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) });

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const spotify = ['api.spotify.com', 'accounts.spotify.com'].includes(url.hostname);
  if ((spotify && process.env.MOCK_SPOTIFY_OFFLINE === '1') || (url.hostname === 'ws.audioscrobbler.com' && process.env.MOCK_LASTFM_OFFLINE === '1')) {
    log({ host: url.host, path: url.pathname, offline: true });
    throw offline();
  }
  if (spotify && process.env.MOCK_SPOTIFY_HANG === '1') {
    log({ host: url.host, path: url.pathname, hang: true });
    return new Promise((resolve, reject) => {
      if (!init?.signal) return; // ohne Zeitlimit hinge es wirklich
      // Wie eine offene Verbindung: hält den Prozess am Leben (das Zeitlimit von AbortSignal.timeout tut das nicht)
      const keep = setInterval(() => {}, 1000);
      const stop = () => { clearInterval(keep); reject(init.signal.reason); };
      if (init.signal.aborted) stop();
      else init.signal.addEventListener('abort', stop);
    });
  }
  const headers = new Headers(init?.headers);
  let res;
  if (url.origin === 'https://accounts.spotify.com' && url.pathname === '/api/token') res = spotifyToken(init);
  else if (url.origin === 'https://api.spotify.com') {
    if (url.pathname === '/v1/search' && Number(process.env.MOCK_SEARCH_DELAY_MS) > 0) await new Promise(r => setTimeout(r, Number(process.env.MOCK_SEARCH_DELAY_MS)));
    res = await spotifyApi(url, init, headers);
  }
  else if (url.origin === 'https://ws.audioscrobbler.com' && url.pathname === '/2.0/') res = lastfmApi(url);
  else if (url.origin === 'https://api.github.com' && /^\/repos\/[^/]+\/[^/]+\/releases\/latest$/.test(url.pathname)) res = githubRelease(url);
  else if (url.origin === 'https://api.github.com' && /^\/repos\/[^/]+\/[^/]+\/releases$/.test(url.pathname)) res = json(githubReply(url).list ?? []);
  else if (url.origin === 'https://github.com' && /^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+$/.test(url.pathname)) res = githubDownload(url);
  else if (['https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com'].includes(url.origin)) res = githubAsset(url);
  else {
    log({ unknown: url.href });
    throw new Error(`Mock: unerwartete Adresse ${url.href}`);
  }
  log({
    host: url.host,
    path: url.pathname + url.search,
    verb: (init?.method ?? 'GET').toUpperCase(),
    method: url.searchParams.get('method') ?? undefined,
    status: res.status,
  });
  return res;
};
