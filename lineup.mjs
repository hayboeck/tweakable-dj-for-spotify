// Auswahl- und Sortierlogik ohne Netzwerkzugriff.

// Vereinfacht Titel/Künstler, damit "Song (Remastered 2011)" und "Song" als gleich gelten.
export function norm(s) {
  const raw = String(s ?? '');
  const n = raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s(feat|ft)\.?\s.*$/, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return n || raw.toLowerCase().trim();
}

export const trackKey = (artist, name) => `${norm(artist)}|${norm(name)}`;

// Sperrliste für Künstler: liefert eine Prüffunktion artist => true, wenn gesperrt.
// Trifft ganze Wörter auch in Einträgen mit mehreren Künstlern ("Miksu / Macloud", "A feat. B"),
// "Rin" sperrt aber nicht "Karin".
export function artistBlocker(names) {
  const blocked = names.map(norm).filter(Boolean);
  return artist => {
    if (!blocked.length) return false;
    // norm() schneidet Klammern und "feat. …" ab – hier sollen Gastkünstler mitzählen.
    const words = ` ${norm(String(artist ?? '').replace(/[()[\]]|\b(feat|ft)\b\.?/gi, ' / '))} `;
    return blocked.some(b => words.includes(` ${b} `));
  };
}

// Sperrliste für einzelne Songs (blockedTracks: [{ uri, artist, name }]): liefert eine Prüffunktion track => true, wenn
// gesperrt. Trifft dieselbe Spotify-URI oder denselben trackKey(Künstler, Titel) – so auch andere Versionen desselben Songs
// (Remaster, Live, Single statt Album mit eigener URI). Kaputte Einträge (z. B. von Hand geändert) zählen nicht.
export function trackBlocker(entries) {
  const uris = new Set();
  const keys = new Set();
  for (const e of [].concat(entries ?? [])) {
    if (!e || typeof e !== 'object') continue;
    if (typeof e.uri === 'string' && e.uri) uris.add(e.uri);
    if (typeof e.artist === 'string' && typeof e.name === 'string' && e.artist.trim() && e.name.trim()) keys.add(trackKey(e.artist, e.name));
  }
  return track => Boolean(track) && (uris.has(track.uri) || (Boolean(track.artist && track.name) && keys.has(trackKey(track.artist, track.name))));
}

// Spieldauer in Millisekunden (duration_ms von Spotify): nur eine positive Zahl zählt, sonst null (= unbekannt).
export const durationOf = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

// Erscheinungsjahr: aus album.release_date von Spotify ("2024", "2024-03" oder "2024-03-15", je nach Genauigkeit) bzw. als
// Zahl aus dem Such-Cache. Nur ein plausibles Jahr zählt, sonst null (= unbekannt; Spotify liefert z. B. "0000").
export function yearOf(v) {
  const y = typeof v === 'number' ? v : Number(/^(\d{4})(?:-\d\d){0,2}$/.exec(String(v ?? ''))?.[1]);
  return Number.isInteger(y) && y >= 1000 && y <= 9999 ? y : null;
}

// --- Such-Cache in state.json (state.cache: trackKey → Treffer auf Spotify) ---
// Eintrag: { uri, explicit, clean, durationMs, cleanDurationMs, year } bzw. null = auf Spotify nicht gefunden. explicit: laut
// Spotify (true/false); clean: nur bei explicit true – URI einer nicht expliziten Version desselben Songs aus derselben Suche,
// sonst null. durationMs bzw. cleanDurationMs: Spieldauer des Treffers bzw. der nicht expliziten Version (null = unbekannt).
// year: Erscheinungsjahr des Treffers (für preferNewer; gilt auch für die nicht explizite Version, null = unbekannt).
// Bis Version 0.1.1 stand dort nur die URI als Text: Solche Einträge bleiben gültig, explicit ist dann unbekannt (null).
// Nur mit excludeExplicit sucht der DJ sie einmal neu und ersetzt sie (searchAgain); sonst bleiben sie, wie sie sind.
// Einträge bis 0.1.4 haben keine Spieldauer: Sie bleiben gültig, nur wegen der Dauer wird nie neu gesucht. Ebenso Einträge
// ohne Erscheinungsjahr: Sie zählen bei preferNewer neutral (Faktor 1).
// undefined = kein brauchbarer Eintrag (fehlt oder kaputt), dann wird ebenfalls gesucht.
export function cacheEntry(value) {
  if (value === null) return null;
  if (typeof value === 'string') return value ? { uri: value, explicit: null, clean: null, durationMs: null, cleanDurationMs: null, year: null } : undefined;
  if (!value || typeof value !== 'object' || typeof value.uri !== 'string' || !value.uri) return undefined;
  const clean = value.explicit === true && typeof value.clean === 'string' && value.clean ? value.clean : null;
  return {
    uri: value.uri,
    explicit: typeof value.explicit === 'boolean' ? value.explicit : null,
    clean,
    durationMs: durationOf(value.durationMs),
    cleanDurationMs: clean ? durationOf(value.cleanDurationMs) : null,
    year: yearOf(value.year),
  };
}

// Neuer Eintrag aus einem Treffer von spotify.findTrack() ({ uri, explicit, clean, durationMs, releaseYear }) bzw. null.
// Spieldauer und Erscheinungsjahr stehen nur drin, wenn Spotify sie geliefert hat.
export function cacheValue(hit) {
  if (!hit) return null;
  const duration = durationOf(hit.durationMs);
  const cleanDuration = durationOf(hit.clean?.durationMs);
  const year = yearOf(hit.releaseYear);
  return {
    uri: hit.uri, explicit: hit.explicit === true, ...(duration && { durationMs: duration }),
    ...(hit.explicit === true && { clean: hit.clean?.uri ?? null, ...(cleanDuration && { cleanDurationMs: cleanDuration }) }),
    ...(year && { year }),
  };
}

// Muss ein Eintrag (aus cacheEntry) neu gesucht werden?
export const searchAgain = (entry, excludeExplicit) => entry === undefined || Boolean(excludeExplicit && entry?.explicit === null);

// URI für die Playlist: mit excludeExplicit bei einem expliziten Treffer die nicht explizite Version, gibt es keine, null
// (= auslassen). Ohne Treffer null.
export function playableUri(entry, excludeExplicit) {
  if (!entry) return null;
  if (excludeExplicit && entry.explicit !== false) return entry.explicit === true ? entry.clean : null;
  return entry.uri;
}

// Spieldauer zur URI aus playableUri (null = unbekannt bzw. kein Song).
export function playableDurationMs(entry, excludeExplicit) {
  if (!entry) return null;
  if (excludeExplicit && entry.explicit !== false) return entry.explicit === true && entry.clean ? entry.cleanDurationMs ?? null : null;
  return entry.durationMs ?? null;
}

// Gesamtdauer einer Liste aus durationMs der Songs. Fehlt sie bei einzelnen (z. B. alte Einträge im Such-Cache), zählen
// diese mit dem Durchschnitt der bekannten, ohne bekannte mit SONG_MS (3,5 Minuten); durationEstimated sagt dann: geschätzt.
export const SONG_MS = 210_000;
export function lineupDuration(tracks) {
  const known = tracks.map(track => durationOf(track?.durationMs)).filter(d => d !== null);
  const sum = known.reduce((a, b) => a + b, 0);
  const missing = tracks.length - known.length;
  const average = known.length ? sum / known.length : SONG_MS;
  return { durationMs: Math.round(sum + missing * average), durationEstimated: missing > 0 };
}

// Einzelne Namen aus einem Künstler-Text, dazu der ganze Text: "A feat. B", "A (feat. B)", "A / B", "A, B & C", "A x B".
// "Malcolm X" bleibt ganz (x nur mit Leerzeichen auf beiden Seiten).
const NAME_SEPARATORS = /\s*(?:[/,;&+×()[\]]|\s(?:x|feat\.?|ft\.?|featuring)(?=\s))\s*/i;
export function artistNames(artist) {
  const text = String(artist ?? '').trim();
  const parts = text.split(NAME_SEPARATORS).map(p => p.replace(/^(feat\.?|ft\.?|featuring)\s+/i, '').trim());
  return [...new Set([text, ...parts])].filter(Boolean);
}

// Gefolgte Künstler: liefert eine Prüffunktion artists => true, wenn einer davon gefolgt ist (artists = Text oder Liste,
// z. B. alle Beteiligten eines Spotify-Songs). Vergleich über norm(), aber nur ganze Namen: Wer "Queen" folgt,
// trifft "Queen" und "A feat. Queen", nicht aber "Queen Latifah".
export function followedMatcher(names) {
  const followed = new Set([].concat(names ?? []).map(norm).filter(Boolean));
  return artists => followed.size > 0 && [].concat(artists ?? []).some(a => artistNames(a).some(n => followed.has(norm(n))));
}

// Faktor für das Los von Songs gefolgter Künstler (Einstellung followedArtists von −1 bis +1):
// −1 = 0 (gar nicht, harter Filter), 0 = 1 (egal), +1 = FOLLOWED_MAX-fach; dazwischen exponentiell,
// also symmetrisch: −0,5 ≈ ⅓ so oft, +0,5 ≈ 3,2× so oft. Wird wie currentFactor mit dem übrigen Gewicht multipliziert.
export const FOLLOWED_MAX = 10;
export const followedFactor = setting => (setting <= -1 ? 0 : FOLLOWED_MAX ** setting);

// Faktor für das Los nach dem Erscheinungsjahr (Einstellung preferNewer von −1 bis +1, „Neuere / ältere Songs“):
// Neuheit s = 1 − Alter/NEWER_SPAN, begrenzt auf −1 … +1 (Alter = dieses Jahr − Erscheinungsjahr: dieses Jahr = +1,
// vor 10 Jahren = 0, vor 20 und mehr Jahren = −1). Faktor = NEWER_MAX ^ (Einstellung · s): bei +1 hat ein Song von diesem
// Jahr ein 4× größeres Los, einer von vor 20 Jahren ein 4× kleineres, bei −1 umgekehrt, bei ±0,5 jeweils 2×.
// 0 = aus (genau 1), unbekanntes Jahr = 1. Nur Gewichtung, nie ein Ausschluss; wird wie followedFactor multipliziert.
export const NEWER_MAX = 4;
export const NEWER_SPAN = 10;
export function newerFactor(setting, year, thisYear = new Date().getFullYear()) {
  if (!setting || !Number.isInteger(year)) return 1;
  const s = Math.max(-1, Math.min(1, 1 - (thisYear - year) / NEWER_SPAN));
  return NEWER_MAX ** (setting * s);
}

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Gewichtete Zufallsreihenfolge (Efraimidis–Spirakis): höheres Gewicht = eher vorne.
export function weightedOrder(items, weightOf, rng = Math.random) {
  return items
    .map(item => ({ item, k: Math.pow(rng(), 1 / Math.max(weightOf(item), 1e-6)) }))
    .sort((a, b) => b.k - a.k)
    .map(x => x.item);
}

// adventure 0 = sehr ähnliche Songs bevorzugen, 1 = eher entfernte Songs bevorzugen.
export function candidateWeight(match, adventure) {
  return 0.05 + (1 - adventure) * match + adventure * (1 - match);
}

// Legt die Reihenfolge fest. Jeder Song hat `tags` (Interpret + Künstler, über den er gefunden wurde).
// Regeln: In jedem Fenster aus `window` aufeinanderfolgenden Songs höchstens `maxPerWindow` Songs pro Tag;
// derselbe Interpret nicht innerhalb von `gap` Songs. Geht beides nicht, gewinnt die Fensterregel.
export function arrange(tracks, opts, rng = Math.random, attempts = 200) {
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < attempts && bestScore > 0; i++) {
    const out = arrangeOnce(tracks, opts, rng);
    const score = 100 * windowViolations(out, opts.window, opts.maxPerWindow) + gapViolations(out, opts.gap);
    if (score < bestScore) [best, bestScore] = [out, score];
  }
  return best;
}

function arrangeOnce(tracks, { gap, window, maxPerWindow }, rng) {
  const pool = shuffle(tracks, rng);
  const remaining = new Map();
  for (const t of pool) for (const tag of t.tags) remaining.set(tag, (remaining.get(tag) ?? 0) + 1);
  const out = [];
  // Die letzten n Songs; slice(-0) wäre die ganze Liste (z. B. Abstand 0 = aus).
  const last = n => (n > 0 ? out.slice(-n) : []);
  while (pool.length) {
    const recentArtists = new Set(last(gap).map(t => norm(t.artist)));
    const inWindow = new Map();
    for (const t of last(window - 1)) for (const tag of t.tags) inWindow.set(tag, (inWindow.get(tag) ?? 0) + 1);
    const violations = t =>
      2 * t.tags.filter(tag => (inWindow.get(tag) ?? 0) >= maxPerWindow).length + (recentArtists.has(norm(t.artist)) ? 1 : 0);
    const fewest = Math.min(...pool.map(violations));
    // Künstler, von denen noch am meisten übrig ist, zuerst – sonst stauen sie sich am Ende.
    const urgency = t => Math.max(...t.tags.map(tag => remaining.get(tag)));
    const options = pool.filter(t => violations(t) === fewest);
    const most = Math.max(...options.map(urgency));
    const pick = options.find(t => urgency(t) === most);
    pool.splice(pool.indexOf(pick), 1);
    for (const tag of pick.tags) remaining.set(tag, remaining.get(tag) - 1);
    out.push(pick);
  }
  return out;
}

// Wie oft wird die Fensterregel verletzt? (0 = eingehalten)
export function windowViolations(tracks, window, maxPerWindow) {
  let count = 0;
  for (let end = 1; end <= tracks.length; end++) {
    const tags = new Map();
    for (const t of tracks.slice(Math.max(0, end - window), end)) for (const tag of t.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    if ([...tags.values()].some(n => n > maxPerWindow)) count++;
  }
  return count;
}

function gapViolations(tracks, gap) {
  return tracks.filter((t, i) => tracks.slice(Math.max(0, i - gap), i).some(p => norm(p.artist) === norm(t.artist))).length;
}

// Nur ganze Wörter vergleichen: "Rin" steckt in "Miksu Rin", aber nicht in "Karin".
const containsWords = (a, b) => ` ${a} `.includes(` ${b} `);
const startsWithWords = (a, b) => `${a} `.startsWith(`${b} `);

export function sameTrack(spotifyTrack, artist, name) {
  const wantArtist = norm(artist);
  const wantName = norm(name);
  const artistOk = spotifyTrack.artists?.some(a => {
    const got = norm(a.name);
    return got === wantArtist || containsWords(got, wantArtist) || containsWords(wantArtist, got);
  });
  const gotName = norm(spotifyTrack.name);
  const nameOk = startsWithWords(gotName, wantName) || startsWithWords(wantName, gotName);
  return Boolean(artistOk && nameOk);
}
