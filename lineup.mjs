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
