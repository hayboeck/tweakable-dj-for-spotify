// Genre-Mixer: Schlagwörter → Hauptgenres, Faktor für das Los, Prüfung der Einstellung, Anteile (genres.mjs); Läufe mit
// Genre-Mixer (dj.mjs --dry mit simulierten APIs, tests/mock-apis.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleanGenres, genreFactor, GENRES, genreShare, genresActive, levelFactor, tagGenre, tagGenres } from '../genres.mjs';
import { mockArtistTags } from './mock-tags.mjs';

test('tagGenre: typische Last.fm-Schlagwörter, Vorrang bei Mischformen, Unpassendes zählt nicht', () => {
  const cases = {
    pop: ['pop', 'k-pop', 'art pop', 'power pop'],
    rock: ['rock', 'classic rock', 'Hard Rock', 'grunge', 'progressive rock'],
    indie: ['indie', 'indie rock', 'indie pop', 'alternative', 'alternative rock', 'post-punk', 'shoegaze', 'dream pop', 'britpop', 'emo'],
    hiphop: ['hip-hop', 'Hip Hop', 'rap', 'deutschrap', 'german hip hop', 'trap', 'pop rap', 'rap metal'],
    electronic: ['electronic', 'electropop', 'house', 'deep house', 'techno', 'drum and bass', 'ambient', 'synthpop', 'trip-hop', 'dance'],
    rnb: ['rnb', 'r&b', 'soul', 'neo-soul', 'funk', 'disco'],
    metal: ['metal', 'heavy metal', 'punk', 'punk rock', 'hardcore', 'metalcore'],
    jazz: ['jazz', 'blues', 'swing', 'smooth jazz'],
    classical: ['classical', 'Klassik', 'soundtrack', 'opera', 'baroque'],
    folk: ['folk', 'singer-songwriter', 'country', 'americana', 'acoustic', 'liedermacher'],
    latin: ['latin', 'reggaeton', 'reggae', 'dancehall', 'ska', 'bossa nova'],
    schlager: ['schlager', 'austropop', 'Volksmusik', 'neue deutsche welle', 'deutschpop'],
  };
  assert.deepEqual(Object.keys(cases).sort(), [...GENRES].sort(), 'jedes Genre geprüft');
  for (const [genre, tags] of Object.entries(cases)) for (const tag of tags) assert.equal(tagGenre(tag), genre, tag);
  for (const tag of ['seen live', 'female vocalists', 'german', 'austrian', '80s', 'beautiful', '', null]) assert.equal(tagGenre(tag), null, String(tag));
});

test('tagGenres: höchstens zwei Hauptgenres, das zweite nur mit mindestens halbem Gewicht; nur die ersten acht Schlagwörter', () => {
  const tags = list => list.map(([name, count]) => ({ name, count }));
  // Bilderbuch-artig: indie (100) + alternative (60) = Indie 160, pop 55 + austropop 40 → Pop 55, Schlager 40
  assert.deepEqual(tagGenres(tags([['indie', 100], ['austrian', 80], ['alternative', 60], ['pop', 55], ['austropop', 40]])), ['indie']);
  assert.deepEqual(tagGenres(tags([['electronic', 100], ['pop', 70], ['seen live', 50]])), ['electronic', 'pop']);
  assert.deepEqual(tagGenres(tags([['seen live', 100], ['german', 90]])), [], 'nichts Passendes = unbekannt');
  assert.deepEqual(tagGenres([]), []);
  assert.deepEqual(tagGenres(null), []);
  // Count 0 (bei Last.fm für seltene Schlagwörter) zählt als 1
  assert.deepEqual(tagGenres(tags([['jazz', 0]])), ['jazz']);
  const late = tags([['a', 100], ['b', 90], ['c', 80], ['d', 70], ['e', 60], ['f', 50], ['g', 40], ['h', 30], ['metal', 100]]);
  assert.deepEqual(tagGenres(late), [], 'neuntes Schlagwort zählt nicht');
});

test('genreFactor: Stufen ⅒ … 10×, „nie“ beim ersten Genre = 0, beim zweiten wie „viel weniger“; unbekannt = 1', () => {
  assert.deepEqual([-3, -2, -1, 0, 1, 2].map(levelFactor).map(f => Number(f.toFixed(3))), [0, 0.1, 0.333, 1, 3, 10]);
  const levels = { electronic: 2, pop: 0, schlager: -3, rock: -1 };
  assert.equal(genreFactor(levels, []), 1);
  assert.equal(genreFactor(levels, undefined), 1);
  assert.equal(genreFactor(levels, ['electronic']), 10);
  assert.equal(genreFactor(levels, ['schlager']), 0);
  assert.equal(genreFactor(levels, ['jazz']), 1, 'nicht eingestellt = egal');
  assert.equal(Number(genreFactor(levels, ['electronic', 'pop']).toFixed(2)), 3.16, 'geometrisches Mittel');
  assert.equal(Number(genreFactor(levels, ['pop', 'schlager']).toFixed(3)), Number(Math.sqrt(0.1).toFixed(3)), 'zweites „nie“ = viel weniger');
  assert.equal(genreFactor(levels, ['schlager', 'pop']), 0);
  assert.equal(genreFactor({}, ['rock']), 1);
  assert.equal(genresActive({}), false);
  assert.equal(genresActive({ rock: 0 }), false);
  assert.equal(genresActive({ rock: -1 }), true);
  assert.equal(genresActive(null), false);
});

test('cleanGenres: nur bekannte Genres mit ganzen Stufen −3 … 2; Reihenfolge wie GENRES, ohne „egal“', () => {
  assert.deepEqual(cleanGenres({}), {});
  assert.deepEqual(cleanGenres({ schlager: -3, rock: 0, electronic: 2 }), { electronic: 2, schlager: -3 });
  assert.deepEqual(JSON.stringify(cleanGenres({ schlager: -3, electronic: 2 })), JSON.stringify({ electronic: 2, schlager: -3 }));
  for (const bad of [null, [], 'rock', { rock: 3 }, { rock: -4 }, { rock: 0.5 }, { rock: '1' }, { techno: 1 }, JSON.parse('{"__proto__": 1}')]) {
    assert.equal(cleanGenres(bad), null, JSON.stringify(bad));
  }
});

test('genreShare: je Song das erste Genre; Unbekanntes zählt nur bei songs', () => {
  assert.deepEqual(genreShare([['indie', 'pop'], ['pop'], [], ['indie'], undefined]), { songs: 5, known: 3, counts: { pop: 1, indie: 2 } });
  assert.deepEqual(genreShare([]), { songs: 0, known: 0, counts: {} });
});

// --- End-to-End: "node dj.mjs --dry" mit Genre-Mixer (Schlagwörter vom Mock: tests/mock-tags.mjs) ---

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK = pathToFileURL(path.join(ROOT, 'tests', 'mock-apis.mjs')).href;
const CONFIG = {
  spotify: { clientId: 'test-client-id' }, lastfm: { apiKey: 'test-lastfm-key', user: 'testhoerer' }, seed: 'liked',
  playlistName: 'Test-DJ', size: 20, seedsPerRun: 12, artistWindow: 10, artistGap: 2, blockedArtists: ['Macloud', 'Rin'],
};

function dryRun(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  try {
    for (const f of fs.readdirSync(ROOT)) {
      if (f.endsWith('.mjs') || /^config\.example(\.de)?\.jsonc$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    }
    fs.writeFileSync(path.join(dir, 'config.jsonc'), `${JSON.stringify(config, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ access_token: 'abgelaufen', refresh_token: 'fake-refresh-token', expires_at: 0 }));
    const logFile = path.join(dir, 'mock-log.jsonl');
    const res = spawnSync(process.execPath, ['--import', MOCK, 'dj.mjs', '--dry'], {
      cwd: dir, encoding: 'utf8', timeout: 60_000, env: { ...process.env, MOCK_LOG: logFile, TWEAKABLE_DJ_LANG: 'de' },
    });
    const requests = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
    const state = fs.existsSync(path.join(dir, 'state.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')) : {};
    const lineup = res.stdout.split(/\r?\n/).map(l => /^\s*\d+\. (.+?) – (.+?) {2}\(/.exec(l)).filter(Boolean).map(([, artist, name]) => ({ artist, name }));
    return { code: res.status, out: res.stdout, all: res.stdout + res.stderr, requests, state, lineup };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
const mockGenre = artist => tagGenres(mockArtistTags(artist))[0] ?? null;

test('Lauf mit Genre-Mixer: „nie“ lässt das Genre weg, Anteile in der Ausgabe und in state.genreShare', () => {
  const r = dryRun({ ...CONFIG, genres: { schlager: -3 } });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.lineup.length > 0);
  assert.deepEqual(r.lineup.filter(s => mockGenre(s.artist) === 'schlager'), [], 'kein Schlager');
  assert.ok(r.requests.some(q => q.method === 'artist.getTopTags'));
  const share = r.state.genreShare;
  assert.equal(share.songs, r.lineup.length);
  assert.equal(share.counts.schlager, undefined);
  assert.equal(Object.values(share.counts).reduce((a, b) => a + b, 0), share.known);
  assert.match(r.out, /^Genres: .+ \d+ %/m);
  assert.ok(Number.isFinite(Date.parse(share.at)));
});

test('Lauf mit Genre-Mixer: nur Elektronisch erlaubt → nur elektronische Songs oder solche ohne Genre', () => {
  const genres = Object.fromEntries(GENRES.filter(g => g !== 'electronic').map(g => [g, -3]));
  const r = dryRun({ ...CONFIG, genres: { ...genres, electronic: 2 } });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.lineup.length > 0);
  assert.deepEqual(r.lineup.map(s => mockGenre(s.artist)).filter(g => g !== 'electronic' && g !== null), []);
  assert.ok(r.lineup.some(s => mockGenre(s.artist) === 'electronic'), 'mindestens ein elektronischer Song');
  assert.match(r.out, /^\s+\d+ Songs? wegen „nie“ im Genre-Mixer ausgelassen$/m);
});

test('Ungültige Genre-Stufe von Hand in der config.jsonc: Lauf bricht mit verständlicher Meldung ab', () => {
  const r = dryRun({ ...CONFIG, genres: { techno: 1 } });
  assert.equal(r.code, 1, r.all);
  assert.match(r.all, /genres: erwartet z\. B\. \{ "electronic": 2, "schlager": -3 \} – Genres: pop, rock, indie, hiphop, electronic, rnb, metal, jazz, classical, folk, latin, schlager/);
});

test('Oberfläche (ui.html) und i18n.mjs kennen dieselben Genres und Stufen wie genres.mjs', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  assert.equal(/const GENRE_IDS = (\[[^\]]+\]);/.exec(html)?.[1].replaceAll("'", '"'), JSON.stringify(GENRES).replaceAll(',', ', '));
  assert.match(html, /const GENRE_NEVER = -3;\nconst GENRE_MAX = 2;/);
  const { MESSAGES, LANGS } = await import('../i18n.mjs');
  for (const lang of LANGS) for (const g of [...GENRES, 'unknown']) assert.ok(MESSAGES[lang][`genre.${g}`], `${lang} genre.${g}`);
});
