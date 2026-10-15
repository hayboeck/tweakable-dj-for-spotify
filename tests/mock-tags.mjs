// Schlagwörter, die der Last.fm-Mock (artist.getTopTags in tests/mock-apis.mjs) für einen Künstler liefert – fest nach dem
// Namen, damit die Tests des Genre-Mixers (tests/genres.test.mjs) wissen, welches Genre ein Künstler hat.
const SETS = [
  [['indie', 100], ['seen live', 60], ['alternative', 40]],
  [['electronic', 100], ['house', 70]],
  [['schlager', 100], ['german', 50]],
  [['rock', 100], ['classic rock', 30]],
  [['hip-hop', 100], ['rap', 80]],
  [['seen live', 100], ['german', 40]], // ohne Genre
];
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const mockArtistTags = artist => SETS[hash(artist) % SETS.length].map(([name, count]) => ({ name, count }));
