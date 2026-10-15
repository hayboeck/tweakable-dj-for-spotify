// Genre-Mixer (Einstellung genres): zwölf Hauptgenres, je eine Stufe von „nie“ bis „viel mehr“. Das Programm kennt selbst
// keine Genres: Zu jedem Künstler holt dj.mjs die Schlagwörter, die Hörer auf Last.fm vergeben haben (artist.getTopTags in
// lastfm.mjs, im Cache), und ordnet sie hier den Hauptgenres zu (tagGenres). Aus den Stufen wird ein Faktor für das Los
// (genreFactor) – für Ausgangspunkte, neue Songs und Favoriten, wie bei „Neuere / ältere Songs“. Künstler ohne passende
// Schlagwörter bleiben unberührt (Faktor 1).

export const GENRES = ['pop', 'rock', 'indie', 'hiphop', 'electronic', 'rnb', 'metal', 'jazz', 'classical', 'folk', 'latin', 'schlager'];

// Stufen: −3 = nie, −2 = viel weniger, −1 = weniger, 0 = egal, 1 = mehr, 2 = viel mehr. In der config.jsonc stehen nur die
// Genres, die nicht „egal“ sind, z. B. { "electronic": 2, "schlager": -3 }.
export const GENRE_NEVER = -3;
export const GENRE_MAX = 2;
// Faktor für das Los je Stufe: weniger = ⅓, viel weniger = ⅒, mehr = 3×, viel mehr = 10×; nie = 0 (weggelassen).
const FACTORS = { '-3': 0, '-2': 0.1, '-1': 1 / 3, 0: 1, 1: 3, 2: 10 };
export const levelFactor = level => FACTORS[level] ?? 1;

// Ist mindestens ein Genre nicht „egal“? Nur dann fragt dj.mjs die Schlagwörter für die Auswahl ab.
export const genresActive = levels => GENRES.some(g => (levels?.[g] ?? 0) !== 0);

// Schlagwort → Hauptgenre. Reihenfolge = Vorrang: "indie rock" ist Indie, "post-punk" Indie, "punk rock" Metal/Punk,
// "rap metal" Hip-Hop. Was nirgends passt ("seen live", "female vocalists", "german", "80s"), zählt nicht.
const RULES = [
  ['schlager', /schlager|austropop|volksmusik|volkstuemlich|volkstümlich|deutschpop|neue deutsche welle|\bndw\b|oberkrainer/],
  ['hiphop', /hip[\s-]?hop|\brap\b|deutschrap|\btrap\b|\bgrime\b|\bdrill\b|boom bap|gangsta/],
  ['indie', /indie|alternative|post[\s-]?punk|post[\s-]?rock|shoegaze|dream pop|britpop|new wave|lo[\s-]?fi|math rock|garage rock|\bemo\b/],
  ['metal', /metal|punk|hardcore|grindcore|screamo|thrash|djent/],
  ['electronic', /electro|\bedm\b|house|techno|trance|dubstep|drum (and|n|&) bass|\bdnb\b|ambient|\bidm\b|synthwave|synth[\s-]?pop|dance(?!hall)|downtempo|chill[\s-]?out|trip[\s-]?hop|breakbeat|\bgarage\b|hardstyle|big beat/],
  ['rnb', /r&b|\brnb\b|rhythm and blues|soul|funk|motown|disco|gospel/],
  ['jazz', /jazz|blues|swing|bebop|big band/],
  ['classical', /classical|klassik|orchestra|baroque|opera|soundtrack|film score|filmmusik|composer/],
  ['latin', /latin|reggaeton|salsa|bachata|cumbia|reggae|dancehall|\bska\b|afrobeat|\bworld\b|bossa nova|samba|flamenco|tango|merengue/],
  ['folk', /folk|singer[\s-]?songwriter|country|americana|bluegrass|acoustic|liedermacher/],
  ['rock', /rock|grunge/],
  ['pop', /pop/],
];
export const tagGenre = tag => RULES.find(([, re]) => re.test(String(tag ?? '').toLowerCase().trim()))?.[0] ?? null;

// Hauptgenres eines Künstlers aus seinen Schlagwörtern ([{ name, count }], wichtigstes zuerst; count 0–100 wie bei Last.fm):
// die ersten acht zählen, je mit ihrem Gewicht. Höchstens zwei Genres, das zweite nur, wenn es mindestens halb so viel Gewicht
// hat wie das erste. [] = unbekannt.
export function tagGenres(tags) {
  const score = new Map();
  for (const tag of (Array.isArray(tags) ? tags : []).slice(0, 8)) {
    const genre = tagGenre(tag?.name);
    if (genre) score.set(genre, (score.get(genre) ?? 0) + Math.max(Number(tag.count) || 0, 1));
  }
  const ranked = [...score].sort((a, b) => b[1] - a[1]);
  return ranked.filter(([, s], i) => i < 2 && s >= ranked[0][1] / 2).map(([g]) => g);
}

// Faktor für das Los eines Songs mit den Hauptgenres genres (aus tagGenres). Unbekannt = 1. Steht das erste (wichtigste) Genre
// auf „nie“, 0; ein zweites auf „nie“ zählt wie „viel weniger“. Bei zwei Genres das geometrische Mittel: Elektronisch „viel
// mehr“ (10×) und Pop „egal“ ergibt ≈ 3,2×.
export function genreFactor(levels, genres) {
  if (!genres?.length) return 1;
  const level = g => levels?.[g] ?? 0;
  if (level(genres[0]) <= GENRE_NEVER) return 0;
  const factors = genres.map(g => levelFactor(Math.max(level(g), GENRE_NEVER + 1)));
  if (factors.length === 1) return factors[0];
  return Math.exp(factors.reduce((sum, f) => sum + Math.log(f), 0) / factors.length);
}

// Prüft die Einstellung genres und gibt sie gesäubert zurück (Reihenfolge wie GENRES, ohne „egal“); null = ungültig.
export function cleanGenres(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const [g, v] of Object.entries(value)) {
    if (!GENRES.includes(g) || !Number.isInteger(v) || v < GENRE_NEVER || v > GENRE_MAX) return null;
  }
  return Object.fromEntries(GENRES.filter(g => value[g]).map(g => [g, value[g]]));
}

// Anteile der Hauptgenres in einer Liste (je Song zählt sein erstes Genre): { songs, known, counts: { genre: Anzahl } }.
export function genreShare(genreLists) {
  const counts = {};
  let known = 0;
  for (const genres of genreLists) {
    if (!genres?.length) continue;
    known++;
    counts[genres[0]] = (counts[genres[0]] ?? 0) + 1;
  }
  return { songs: genreLists.length, known, counts: Object.fromEntries(GENRES.filter(g => counts[g]).map(g => [g, counts[g]])) };
}
